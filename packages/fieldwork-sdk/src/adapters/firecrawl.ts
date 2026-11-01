import { defineAdapter } from "../adapter.js";
import { FieldworkError, withJob } from "../errors.js";
import { createRawClient, poll, requireKey } from "../http.js";
import type { CallOptions, MonitorInfo } from "../types.js";
import {
  callSettings,
  compact,
  list,
  meta,
  num,
  presentPage,
  presentPages,
  record,
  requireId,
  strings,
  text,
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
  pageMeta,
  parseResult,
  researchResult,
  researchState,
  searchResult,
  toPage,
  toProduct,
  usageResult,
} from "./firecrawl/response.js";
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
    const response = record(
      await raw.request("POST", "/scrape", {
        ...call,
        body: { formats, url, ...pageBody(settings) },
      })
    );
    return { data: record(response.data), response };
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
    const get = async (to: string) => {
      try {
        return record(await raw.request("GET", to, { signal: call.signal }));
      } catch (error) {
        throw withJob(error, id);
      }
    };
    const first = await poll(
      provider,
      id,
      async () => {
        const status = record(
          await raw.request("GET", path, { signal: call.signal })
        );
        const state = text(status.status);
        if (state === "failed" || state === "cancelled") {
          throw new FieldworkError(
            "JobFailed",
            `firecrawl ${kind} ${id} ended ${state}`,
            { cause: status, provider }
          );
        }
        return state === "completed" ? status : undefined;
      },
      { ...call, interval }
    );
    const batches = [first];
    let next = text(first.next);
    while (next !== undefined) {
      const batch = await get(pathOf(next));
      batches.push(batch);
      next = text(batch.next);
    }
    // Pages that failed show up only here, and robots.txt blocks with them.
    const errors = await get(`${path}/errors`);
    return { batches, errors, failed: failedPages(errors), first };
  };

  const openSession = async (
    o: FirecrawlSessionSettings,
    call: CallOptions
  ) => {
    const response = record(
      await raw.request("POST", "/interact", {
        body: sessionBody(o),
        creates: true,
        signal: call.signal,
      })
    );
    return { id: requireId(provider, response.id), response };
  };

  const closeQuietly = async (id: string, call: CallOptions) => {
    try {
      return record(
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
        const result = record(
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
        const { response } = await openSession(o, call);
        return browserSession(response);
      },
    },

    async crawl(url, options) {
      const { call, rest: o } = callSettings(options);
      const id =
        o.resume ??
        requireId(
          provider,
          record(
            await raw.request("POST", "/crawl", {
              creates: true,
              ...call,
              body: crawlBody(url, o),
            })
          ).id
        );
      const job = await finished("crawl", id, call, o.interval);
      return compact({
        failed: job.failed,
        id,
        meta: meta({ credits: job.first.creditsUsed, requestId: id }),
        pages: job.batches.flatMap((batch) =>
          list(batch.data).map((item) => toPage(record(item), url, item))
        ),
        raw: { batches: job.batches, errors: job.errors },
        robotsBlocked: strings(job.errors.robotsBlocked),
        total: num(job.first.total),
      });
    },

    async extract<T>(url: string, options: FirecrawlExtractOptions) {
      const { call, rest: o } = callSettings(options);
      const { schema, prompt, ...page } = o;
      const { response, data } = await scrape(
        url,
        [compact({ prompt, schema, type: "json" })],
        page,
        call
      );
      if (data.json === undefined) {
        const why = text(data.warning);
        throw new FieldworkError(
          "ProviderError",
          `firecrawl returned no JSON for ${url}${why === undefined ? "" : `: ${why}`}`,
          { cause: response, provider }
        );
      }
      return compact({
        // SAFETY: the caller's schema describes T; Fieldwork does not validate provider output against it.
        data: data.json as T,
        meta: pageMeta(response, data),
        raw: response,
      });
    },

    async images(query, options) {
      const { call, rest: o } = callSettings(options);
      const response = record(
        await raw.request("POST", "/search", {
          ...call,
          body: imagesBody(query, o),
        })
      );
      return imagesResult(response);
    },

    async map(url, options) {
      const { call, rest: o } = callSettings(options);
      const response = record(
        await raw.request("POST", "/map", {
          ...call,
          body: mapBody(url, o),
        })
      );
      return {
        links: list(response.links).map((item) => {
          if (typeof item === "string") {
            return { url: item };
          }
          const link = record(item);
          return compact({
            description: text(link.description),
            title: text(link.title),
            url: text(link.url) ?? "",
          });
        }),
        raw: response,
      };
    },

    monitor: {
      async create(options) {
        const { call, rest: o } = callSettings(options);
        const response = record(
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
        const response = record(
          await raw.request("GET", `/monitor/${segment(id)}/checks`, {
            ...call,
            query: { limit: PAGE_SIZE, offset },
          })
        );
        return monitorEvents(response, offset);
      },

      async get(id, options) {
        const { call } = callSettings(options);
        const response = record(
          await raw.request("GET", `/monitor/${segment(id)}`, call)
        );
        return monitorInfo(response.data);
      },

      async list(options) {
        const { call } = callSettings(options);
        const monitors: MonitorInfo[] = [];
        for (;;) {
          const response = record(
            await raw.request("GET", "/monitor", {
              ...call,
              query: { limit: PAGE_SIZE, offset: monitors.length },
            })
          );
          const page = list(response.data);
          monitors.push(...page.map((item) => monitorInfo(item)));
          if (page.length < PAGE_SIZE) {
            return monitors;
          }
        }
      },
    },

    async parse(document, options) {
      const { call, rest: o } = callSettings(options);
      const form = parseForm(document, o);
      const response = record(
        await raw.request("POST", "/parse", { ...call, form })
      );
      return parseResult(response);
    },

    async product(url, options) {
      const { call, rest: o } = callSettings(options);
      const { response, data } = await scrape(url, ["product"], o, call);
      return toProduct(url, response, data);
    },

    async read(url, options) {
      const { call, rest: o } = callSettings(options);
      const { response, data } = await scrape(url, readFormats(o), o, call);
      return presentPage(provider, toPage(data, url, response, response));
    },

    async readMany(urls, options) {
      const { call, rest: o } = callSettings(options);
      const { interval, resume, maxConcurrency, ignoreInvalidURLs, ...read } =
        o;
      const started =
        resume === undefined
          ? record(
              await raw.request("POST", "/batch/scrape", {
                creates: true,
                ...call,
                body: compact({
                  urls,
                  ...readBody(read),
                  maxConcurrency,
                  ignoreInvalidURLs,
                }),
              })
            )
          : {};
      const id = resume ?? requireId(provider, started.id);
      const job = await finished("batch/scrape", id, call, interval);
      const rejected = (strings(started.invalidURLs) ?? []).map((url) => ({
        error: "invalid URL",
        url,
      }));
      const { pages, gone } = presentPages(
        job.batches.flatMap((batch) =>
          list(batch.data).map((item) => toPage(record(item), "", item))
        )
      );
      return compact({
        failed: [...job.failed, ...rejected, ...gone],
        id,
        meta: meta({ credits: job.first.creditsUsed, requestId: id }),
        pages,
        raw: { batches: job.batches, errors: job.errors, started },
      });
    },

    async research<T>(question: string, options?: FirecrawlResearchOptions) {
      const { call, rest: o } = callSettings(options);
      const started =
        o.resume === undefined
          ? record(
              await raw.request("POST", "/agent", {
                creates: true,
                ...call,
                body: researchBody(question, o),
              })
            )
          : {};
      const id = o.resume ?? requireId(provider, started.id);
      const run = await poll(
        provider,
        id,
        async () =>
          researchState(
            id,
            record(
              await raw.request("GET", `/agent/${segment(id)}`, {
                signal: call.signal,
              })
            )
          ),
        { ...call, interval: o.interval }
      );
      return researchResult<T>(id, started, run);
    },

    async search(query, options) {
      const { call, rest: o } = callSettings(options);
      const response = record(
        await raw.request("POST", "/search", {
          ...call,
          body: searchBody(query, o),
        })
      );
      return searchResult(response);
    },

    async usage(options) {
      const { call } = callSettings(options);
      return usageResult(
        record(await raw.request("GET", "/team/credit-usage", call))
      );
    },
  };

  return defineAdapter({ name: provider, operations, raw });
};
