import * as z from "zod/mini";

import { defineAdapter } from "../adapter.js";
import { FieldworkError, withJob } from "../errors.js";
import { createRawClient, poll, requireKey } from "../http.js";
import { checkOutput, jsonSchemaOf } from "../schema.js";
import type { CallOptions, MonitorInfo } from "../types.js";
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
import { invalid, provider, segment } from "./firecrawl/shared.js";

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

  const pathOf = (link: string): string => {
    const next = new URL(link);
    const base = new URL(baseUrl).pathname.replace(/\/$/u, "");
    return next.pathname.slice(base.length) + next.search;
  };

  const finished = async (
    kind: "crawl" | "batch/scrape",
    id: string,
    call: CallOptions,
    interval: number | undefined
  ) => {
    const path = `/${kind}/${segment(id)}`;
    const get = async <Schema extends z.ZodMiniType>(
      schema: Schema,
      to: string
    ) => {
      try {
        return z.parse(
          schema,
          await raw.request("GET", to, { signal: call.signal })
        );
      } catch (error) {
        throw withJob(error, id);
      }
    };
    const first = await poll(
      provider,
      id,
      async () => {
        const status = z.parse(
          Batch,
          await raw.request("GET", path, { signal: call.signal })
        );
        const state = status.value.status;
        if (state === "failed" || state === "cancelled") {
          throw new FieldworkError(
            "JobFailed",
            `firecrawl ${kind} ${id} ended ${state}`,
            { cause: status.original, provider }
          );
        }
        return state === "completed" ? status : undefined;
      },
      { ...call, interval }
    );
    const batches = [first];
    let { next } = first.value;
    while (next !== undefined) {
      const batch = await get(Batch, pathOf(next));
      batches.push(batch);
      ({ next } = batch.value);
    }
    // Pages that failed show up only here, and robots.txt blocks with them.
    const errors = await get(BatchErrors, `${path}/errors`);
    return { batches, errors, failed: failedPages(errors), first };
  };

  const openSession = async (
    o: FirecrawlSessionSettings,
    call: CallOptions
  ) => {
    const session = z.parse(
      Session,
      await raw.request("POST", "/interact", {
        body: sessionBody(o),
        creates: true,
        signal: call.signal,
      })
    );
    return { id: requireJobId(provider, session.value.id), session };
  };

  const closeQuietly = async (id: string, call: CallOptions) => {
    try {
      return z.parse(
        Closed,
        await raw.request("DELETE", `/interact/${segment(id)}`, {
          signal: call.signal,
        })
      );
    } catch {
      return null;
    }
  };

  const operations: FirecrawlOperations = {
    async act(code, options) {
      const { call, rest: o } = callSettings(options);
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
        const closed = keep ? null : await closeQuietly(id, call);
        return actResult(result, keep ? id : undefined, closed);
      } catch (error) {
        // A session the caller owns and wants kept stays; any other would bill with no way to find it.
        if (created || !keep) {
          await closeQuietly(id, call);
        }
        throw error;
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
      const id =
        o.resume ??
        requireJobId(
          provider,
          z.parse(
            CrawlStart,
            await raw.request("POST", "/crawl", {
              creates: true,
              ...call,
              body: crawlBody(url, o),
            })
          ).id
        );
      const job = await finished("crawl", id, call, o.interval);
      const { robotsBlocked } = job.errors.value;
      return compact({
        failed: job.failed,
        id,
        meta: meta({ credits: job.first.value.creditsUsed, requestId: id }),
        pages: job.batches.flatMap((batch) =>
          batch.value.data.map((item) => ({
            ...toPage(item.value, url),
            raw: item.original,
          }))
        ),
        raw: {
          batches: job.batches.map((batch) => batch.original),
          errors: job.errors.original,
        },
        robotsBlocked: robotsBlocked.length > 0 ? robotsBlocked : undefined,
        total: job.first.value.total,
      });
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
          throw invalid(`firecrawl events cursor "${o.cursor}" is not valid`);
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
      const { call, rest: o } = callSettings(options);
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
      const started = z.parse(
        RunStart,
        resume === undefined
          ? await raw.request("POST", "/batch/scrape", {
              creates: true,
              ...call,
              body: compact({
                urls,
                ...readBody(read),
                maxConcurrency,
                ignoreInvalidURLs,
              }),
            })
          : {}
      );
      const id = resume ?? requireJobId(provider, started.value.id);
      const job = await finished("batch/scrape", id, call, interval);
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
    },

    async research<T>(question: string, options?: FirecrawlResearchOptions<T>) {
      const { call, rest: o } = callSettings(options);
      const started = z.parse(
        RunStart,
        o.resume === undefined
          ? await raw.request("POST", "/agent", {
              creates: true,
              ...call,
              body: researchBody(question, o),
            })
          : {}
      );
      const id = o.resume ?? requireJobId(provider, started.value.id);
      const run = await poll(
        provider,
        id,
        async () =>
          researchState(
            id,
            z.parse(
              AgentRun,
              await raw.request("GET", `/agent/${segment(id)}`, {
                signal: call.signal,
              })
            )
          ),
        { ...call, interval: o.interval }
      );
      const result = researchResult(id, started, run);
      return {
        ...result,
        output: await checkOutput(o.schema, result.output, {
          jobId: id,
          provider,
        }),
      };
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
