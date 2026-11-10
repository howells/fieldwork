// The Firecrawl adapter: calls Firecrawl's v2 REST API with `fetch` and returns normalized results.
// Options and operation types are in firecrawl/options.ts, request bodies in firecrawl/request.ts, result mapping in firecrawl/response.ts, response schemas in firecrawl/shapes.ts.

import * as z from "zod/mini";

import { defineAdapter } from "../adapter.js";
import { FieldworkError, invalidRequest } from "../errors.js";
import { createRawClient, requireKey, segment } from "../http.js";
import { runJob, startJob } from "../job.js";
import type { JobSettings } from "../job.js";
import { checkOutput, jsonSchemaOf } from "../schema.js";
import type { CallOptions, FailedUrl, MonitorInfo } from "../types.js";
import {
  callSettings,
  compact,
  meta,
  presentPage,
  presentPages,
  requireJobId,
} from "../util.js";
import type {
  FirecrawlConfig,
  FirecrawlExtractOptions,
  FirecrawlOperations,
  FirecrawlPageSettings,
  FirecrawlResearchOptions,
  FirecrawlSessionSettings,
} from "./firecrawl/options.js";
import {
  PAGE_SIZE,
  checkAct,
  crawlBody,
  imagesBody,
  mapBody,
  monitorBody,
  pageBody,
  parseForm,
  REPORT_GRACE_MS,
  readBody,
  readFormats,
  researchBody,
  scriptRequest,
  searchBody,
  sessionBody,
} from "./firecrawl/request.js";
import {
  actResult,
  batchState,
  browserSession,
  failedPages,
  imagesResult,
  monitorEvents,
  monitorInfo,
  noProductReason,
  pageMeta,
  parseResult,
  researchResult,
  researchState,
  searchResult,
  toPage,
  toProduct,
  usageResult,
} from "./firecrawl/response.js";
import {
  AgentRun,
  Batch,
  BatchErrors,
  ChecksResponse,
  Closed,
  CrawlStart,
  Execution,
  MapResponse,
  MonitorResponse,
  MonitorsResponse,
  ParseResponse,
  RunStart,
  ScrapeResponse,
  SearchResponse,
  Session,
  UsageResponse,
} from "./firecrawl/shapes.js";
import type { BatchBlock, BatchErrorsBlock } from "./firecrawl/shapes.js";
import { provider } from "./firecrawl/shared.js";

export type {
  FirecrawlAction,
  FirecrawlActOptions,
  FirecrawlBrowserOptions,
  FirecrawlConfig,
  FirecrawlCrawlOptions,
  FirecrawlExtractOptions,
  FirecrawlFormat,
  FirecrawlImagesOptions,
  FirecrawlMapOptions,
  FirecrawlMonitorOptions,
  FirecrawlOperations,
  FirecrawlPageOptions,
  FirecrawlPageSettings,
  FirecrawlParseOptions,
  FirecrawlParser,
  FirecrawlPdfParser,
  FirecrawlReadManyOptions,
  FirecrawlReadOptions,
  FirecrawlReadSettings,
  FirecrawlResearchOptions,
  FirecrawlSearchOptions,
  FirecrawlSessionSettings,
} from "./firecrawl/options.js";

/** A finished crawl or batch scrape: every page of results and the pages that failed. */
interface BatchJob {
  batches: BatchBlock[];
  errors: BatchErrorsBlock;
  failed: FailedUrl[];
  first: BatchBlock;
}

/** How long closing a session may take, apart from the call's own deadline. */
const CLOSE_TIMEOUT = 15_000;

/**
 * An adapter for Firecrawl: search, images, read, readMany, extract, product, map, crawl, research, act, browser, parse, monitor and usage. Pass it to `new Fieldwork({ adapter })`.
 *
 * Throws `Unauthorized` when neither `apiKey` nor `FIRECRAWL_API_KEY` is set.
 */
export const firecrawl = (config: FirecrawlConfig = {}) => {
  const baseUrl = config.baseUrl ?? "https://api.firecrawl.dev/v2";
  const raw = createRawClient({
    baseUrl,
    fetch: config.fetch,
    headers: {
      authorization: `Bearer ${requireKey(provider, config.apiKey, "FIRECRAWL_API_KEY")}`,
    },
    provider,
    retries: config.retries,
  });

  /** Scrapes one URL with the formats and page settings given. */
  const scrape = async (
    url: string,
    formats: unknown[],
    settings: FirecrawlPageSettings,
    call: CallOptions
  ) => {
    const response = await raw.request("POST", "/scrape", {
      ...call,
      body: { formats, url, ...pageBody(settings) },
    });
    const body = z.parse(ScrapeResponse, response);
    return { body, data: body.data, response };
  };

  /** The path of a `next` link, absolute or relative to the base URL, so the next page of results goes through the same client. */
  const pathOf = (link: string): string => {
    const base = new URL(`${baseUrl.replace(/\/$/u, "")}/`);
    const next = new URL(link, base);
    return next.pathname.slice(base.pathname.length - 1) + next.search;
  };

  /**
   * Runs a crawl or batch scrape: waits for it, then reads every page of its
   * results and the pages that failed.
   */
  const batchJob = async <Result>(
    kind: "crawl" | "batch/scrape",
    start: () => Promise<string>,
    settings: JobSettings,
    finish: (job: BatchJob, id: string) => Result
  ): Promise<Result> =>
    await runJob(
      provider,
      {
        check: async (id, request) =>
          batchState(
            kind,
            id,
            z.parse(
              Batch,
              await raw.request("GET", `/${kind}/${segment(id)}`, request)
            )
          ),
        finish: async (first, id) => {
          const path = `/${kind}/${segment(id)}`;
          const request = {
            retries: settings.retries,
            signal: settings.signal,
          };
          const batches = [first];
          let { next } = first.value;
          while (next !== undefined) {
            const batch = z.parse(
              Batch,
              await raw.request("GET", pathOf(next), request)
            );
            batches.push(batch);
            ({ next } = batch.value);
          }
          // Pages that failed show up only here, and robots.txt blocks with them.
          const errors = z.parse(
            BatchErrors,
            await raw.request("GET", `${path}/errors`, request)
          );
          return finish(
            { batches, errors, failed: failedPages(errors), first },
            id
          );
        },
        start,
      },
      settings
    );

  /** Opens a browser session. Only a rate limit is retried, since after any other failure the session may already be open and billing. */
  const openSession = async (
    o: FirecrawlSessionSettings,
    call: CallOptions
  ) => {
    const session = z.parse(
      Session,
      await raw.request("POST", "/interact", {
        body: sessionBody(o),
        creates: true,
        retries: call.retries,
        signal: call.signal,
      })
    );
    return { id: requireJobId(provider, session.value.id), session };
  };

  /**
   * Closes a session so it stops billing. It runs on its own deadline, so a
   * call that was cancelled or timed out still closes what it opened. A
   * failure is returned rather than thrown: the caller reports it with the
   * session id, so the session can still be closed by hand.
   */
  const closeSession = async (id: string, call: CallOptions) => {
    try {
      const closed = z.parse(
        Closed,
        await raw.request("DELETE", `/interact/${segment(id)}`, {
          retries: call.retries,
          signal: AbortSignal.timeout(CLOSE_TIMEOUT),
        })
      );
      return { closed, failure: undefined };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        closed: undefined,
        failure: `firecrawl could not close session ${id}, which may still bill: ${reason}. Close it with DELETE /interact/${id}`,
      };
    }
  };

  const operations: FirecrawlOperations = {
    async act(code, options) {
      // The script's limit goes to Firecrawl, which needs a moment more to report it.
      const { call, rest: o } = callSettings(options, REPORT_GRACE_MS);
      const seconds = checkAct(o, call.timeout);
      const created = o.session === undefined;
      const keep = o.keepSession ?? !created;
      const { id } =
        o.session === undefined
          ? await openSession(o, call)
          : { id: o.session };
      try {
        const result = z.parse(
          Execution,
          await raw.request(
            "POST",
            `/interact/${segment(id)}/execute`,
            // A script can act on the page, so running it twice is not safe.
            {
              ...scriptRequest(code, o.language, call, seconds),
              creates: true,
            }
          )
        );
        if (keep) {
          return actResult(result, id, {});
        }
        const close = await closeSession(id, call);
        // A session that would not close is reported with its id, so it can be closed by hand.
        return actResult(
          result,
          close.failure === undefined ? undefined : id,
          close
        );
      } catch (error) {
        // A session the caller owns and wants kept stays; any other would bill with no way to find it.
        if (!created && keep) {
          throw error;
        }
        const close = await closeSession(id, call);
        if (close.failure === undefined || !(error instanceof FieldworkError)) {
          throw error;
        }
        throw new FieldworkError(
          error.code,
          `${error.message}; ${close.failure}`,
          {
            cause: error,
            provider,
            status: error.status,
          }
        );
      }
    },

    browser: {
      async close(id, options) {
        const { call } = callSettings(options);
        await raw.request("DELETE", `/interact/${segment(id)}`, call);
      },

      async open(options) {
        const { call, rest: o } = callSettings(options);
        const { session } = await openSession(o, call);
        return browserSession(session);
      },
    },

    async crawl(url, options) {
      const { call, rest: o } = callSettings(options);
      return await batchJob(
        "crawl",
        async () =>
          await startJob(
            raw,
            "/crawl",
            { ...call, body: crawlBody(url, o) },
            CrawlStart,
            (reply) => reply.id
          ),
        { ...call, interval: o.interval, resume: o.resume },
        (job, id) => {
          const { robotsBlocked } = job.errors.value;
          const { pages, gone } = presentPages(
            job.batches.flatMap((batch) =>
              batch.value.data.map((item) => ({
                ...toPage(item.value, url),
                raw: item.original,
              }))
            )
          );
          return compact({
            failed: [...job.failed, ...gone],
            id,
            meta: meta({ credits: job.first.value.creditsUsed, requestId: id }),
            pages,
            raw: {
              batches: job.batches.map((batch) => batch.original),
              errors: job.errors.original,
            },
            robotsBlocked: robotsBlocked.length > 0 ? robotsBlocked : undefined,
            total: job.first.value.total,
          });
        }
      );
    },

    async extract<T>(url: string, options: FirecrawlExtractOptions<T>) {
      const { call, rest: o } = callSettings(options);
      const { schema, prompt, ...page } = o;
      const { body, response, data } = await scrape(
        url,
        [compact({ prompt, schema: jsonSchemaOf(schema), type: "json" })],
        page,
        call
      );
      // A 404 or 410 page's text would yield invented values, so it fails as read does.
      presentPage(provider, { ...toPage(data, url), raw: response });
      if (data.json === undefined) {
        const why = data.warning.text;
        throw new FieldworkError(
          "ProviderError",
          `firecrawl returned no JSON for ${url}${why === undefined ? "" : `: ${why}`}`,
          { cause: response, provider }
        );
      }
      return compact({
        data: await checkOutput(schema, data.json, { provider }),
        meta: pageMeta(data, body.warning.notes),
        raw: response,
      });
    },

    async images(query, options) {
      const { call, rest: o } = callSettings(options);
      const response = await raw.request("POST", "/search", {
        ...call,
        body: imagesBody(query, o),
      });
      return {
        ...imagesResult(z.parse(SearchResponse, response)),
        raw: response,
      };
    },

    async map(url, options) {
      const { call, rest: o } = callSettings(options);
      const response = await raw.request("POST", "/map", {
        ...call,
        body: mapBody(url, o),
      });
      return { links: z.parse(MapResponse, response).links, raw: response };
    },

    monitor: {
      async create(options) {
        const { call, rest: o } = callSettings(options);
        const response = z.parse(
          MonitorResponse,
          await raw.request("POST", "/monitor", {
            creates: true,
            ...call,
            body: monitorBody(o),
          })
        );
        return monitorInfo(response.data);
      },

      async delete(id, options) {
        const { call } = callSettings(options);
        await raw.request("DELETE", `/monitor/${segment(id)}`, call);
      },

      async events(id, options) {
        const { call, rest: o } = callSettings(options);
        const offset = Number(o.cursor ?? 0);
        if (!Number.isInteger(offset) || offset < 0) {
          throw invalidRequest(
            provider,
            `events cursor "${o.cursor}" is not valid`
          );
        }
        const response = await raw.request(
          "GET",
          `/monitor/${segment(id)}/checks`,
          { ...call, query: { limit: PAGE_SIZE, offset } }
        );
        return {
          ...monitorEvents(z.parse(ChecksResponse, response).data, offset),
          raw: response,
        };
      },

      async get(id, options) {
        const { call } = callSettings(options);
        const response = z.parse(
          MonitorResponse,
          await raw.request("GET", `/monitor/${segment(id)}`, call)
        );
        return monitorInfo(response.data);
      },

      async list(options) {
        const { call } = callSettings(options);
        const monitors: MonitorInfo[] = [];
        for (;;) {
          const response = z.parse(
            MonitorsResponse,
            await raw.request("GET", "/monitor", {
              ...call,
              query: { limit: PAGE_SIZE, offset: monitors.length },
            })
          );
          const page = response.data;
          monitors.push(...page.map((entry) => monitorInfo(entry)));
          if (page.length < PAGE_SIZE) {
            return monitors;
          }
        }
      },
    },

    async parse(document, options) {
      const { call, rest: o } = callSettings(options, REPORT_GRACE_MS);
      const form = parseForm(document, o, call.timeout);
      const response = await raw.request("POST", "/parse", {
        ...call,
        form,
        timeout:
          call.timeout === undefined
            ? undefined
            : call.timeout + REPORT_GRACE_MS,
      });
      return {
        ...parseResult(z.parse(ParseResponse, response)),
        raw: response,
      };
    },

    async product(url, options) {
      const { call, rest: o } = callSettings(options);
      const { body, response } = await scrape(url, ["product"], o, call);
      const product = toProduct(body);
      if (product === undefined) {
        const why = noProductReason(body);
        throw new FieldworkError(
          "NotFound",
          `firecrawl found no product on ${url}${why === undefined ? "" : `: ${why}`}`,
          { cause: response, provider }
        );
      }
      return { ...product, raw: response };
    },

    async read(url, options) {
      const { call, rest: o } = callSettings(options);
      const { body, data, response } = await scrape(
        url,
        readFormats(o),
        o,
        call
      );
      return presentPage(provider, {
        ...toPage(data, url, body.warning.notes),
        raw: response,
      });
    },

    async readMany(urls, options) {
      const { call, rest: o } = callSettings(options);
      const { interval, resume, maxConcurrency, ignoreInvalidURLs, ...read } =
        o;
      // A resumed batch has no start response: no URLs were rejected at the start.
      let started = z.parse(RunStart, {});
      return await batchJob(
        "batch/scrape",
        async () =>
          await startJob(
            raw,
            "/batch/scrape",
            {
              ...call,
              body: compact({
                urls,
                ...readBody(read),
                maxConcurrency,
                ignoreInvalidURLs,
              }),
            },
            RunStart,
            (reply) => {
              started = reply;
              return reply.value.id;
            }
          ),
        { ...call, interval, resume },
        (job, id) => {
          const rejected = started.value.invalidURLs.map((url) => ({
            error: "invalid URL",
            url,
          }));
          const { pages, gone } = presentPages(
            job.batches.flatMap((batch) =>
              batch.value.data.map((item) => ({
                ...toPage(item.value, ""),
                raw: item.original,
              }))
            )
          );
          return compact({
            failed: [...job.failed, ...rejected, ...gone],
            id,
            meta: meta({ credits: job.first.value.creditsUsed, requestId: id }),
            pages,
            raw: {
              batches: job.batches.map((batch) => batch.original),
              errors: job.errors.original,
              started: started.original,
            },
          });
        }
      );
    },

    async research<T>(question: string, options?: FirecrawlResearchOptions<T>) {
      const { call, rest: o } = callSettings(options);
      // A resumed run has no start response.
      let started = z.parse(RunStart, {});
      return await runJob(
        provider,
        {
          check: async (id, request) =>
            researchState(
              id,
              z.parse(
                AgentRun,
                await raw.request("GET", `/agent/${segment(id)}`, request)
              )
            ),
          finish: async (run, id) => {
            const result = researchResult(id, started, run);
            return {
              ...result,
              output: await checkOutput(o.schema, result.output, { provider }),
            };
          },
          start: async () =>
            await startJob(
              raw,
              "/agent",
              { ...call, body: researchBody(question, o) },
              RunStart,
              (reply) => {
                started = reply;
                return reply.value.id;
              }
            ),
        },
        { ...call, interval: o.interval, resume: o.resume }
      );
    },

    async search(query, options) {
      const { call, rest: o } = callSettings(options);
      const response = await raw.request("POST", "/search", {
        ...call,
        body: searchBody(query, o),
      });
      return {
        ...searchResult(z.parse(SearchResponse, response)),
        raw: response,
      };
    },

    async usage(options) {
      const { call } = callSettings(options);
      const response = await raw.request("GET", "/team/credit-usage", call);
      return {
        ...usageResult(z.parse(UsageResponse, response)),
        raw: response,
      };
    },
  };

  return defineAdapter({ name: provider, operations, raw });
};
