import { defineAdapter } from "../adapter.js";
import { FieldworkError } from "../errors.js";
import { createRawClient, poll, requireKey } from "../http.js";
import type {
  CallOptions,
  Extraction,
  FieldSource,
  JsonSchema,
  Page,
  Research,
  SearchResponse,
} from "../types.js";
import {
  callSettings,
  compact,
  list,
  num,
  parseJson,
  record,
  strings,
  text,
  uniqueCitations,
  citations,
  requireId,
} from "../util.js";

export interface ExaConfig {
  /** Defaults to the EXA_API_KEY environment variable. */
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export interface ExaSearchOptions extends CallOptions {
  /** Results to return; Exa allows up to 100. */
  limit?: number;
  type?: "auto" | "lite" | "deep-lite" | "deep";
  category?:
    | "company"
    | "people"
    | "research paper"
    | "news"
    | "pdf"
    | "github"
    | "personal site"
    | "financial report";
  includeDomains?: string[];
  excludeDomains?: string[];
  /** YYYY-MM-DD. */
  publishedAfter?: string;
  /** YYYY-MM-DD. */
  publishedBefore?: string;
  /** YYYY-MM-DD: only pages Exa crawled after this date. */
  crawledAfter?: string;
  crawledBefore?: string;
  includeText?: string[];
  excludeText?: string[];
  /** Two-letter country code. */
  country?: string;
  /** Include each result's page text. */
  content?: boolean;
  additionalQueries?: string[];
}

export interface ExaReadOptions extends CallOptions {
  /** Return passages that answer this query as `excerpts`. */
  query?: string;
  maxCharacters?: number;
  /** 0 forces a live fetch, -1 reads only the cache. */
  maxAgeHours?: number;
  /** Read Exa's stored copy of the page as of this ISO date. */
  snapshotAsOf?: string;
}

export interface ExaExtractOptions extends CallOptions {
  schema: JsonSchema;
  /** What to extract, in plain words. */
  prompt?: string;
  maxAgeHours?: number;
}

export interface ExaResearchOptions extends CallOptions {
  schema?: JsonSchema;
  effort?: "minimal" | "low" | "medium" | "high" | "xhigh" | "auto" | "ultra";
  /** Spend cap in dollars, for auto and ultra effort. */
  maxCostDollars?: number;
  maxDurationSeconds?: number;
  /** Milliseconds between status checks. */
  interval?: number;
  /**
   * The id of a job that timed out or was cancelled, from the error's
   * `jobId`. Waits for that job instead of starting a new one.
   */
  resume?: string;
}

export interface ExaOperations {
  search(query: string, options?: ExaSearchOptions): Promise<SearchResponse>;
  read(url: string, options?: ExaReadOptions): Promise<Page>;
  extract<T = unknown>(
    url: string,
    options: ExaExtractOptions
  ): Promise<Extraction<T>>;
  research<T = unknown>(
    question: string,
    options?: ExaResearchOptions
  ): Promise<Research<T>>;
}

export function exa(config: ExaConfig = {}) {
  const provider = "exa";
  const raw = createRawClient({
    provider,
    baseUrl: config.baseUrl ?? "https://api.exa.ai",
    headers: {
      "x-api-key": requireKey(provider, config.apiKey, "EXA_API_KEY"),
    },
    fetch: config.fetch,
  });

  async function contents(
    url: string,
    body: Record<string, unknown>,
    call: CallOptions
  ) {
    const response = await raw.request("POST", "/contents", {
      ...call,
      body: { urls: [url], ...body },
    });
    const status = record(list(record(response).statuses)[0]);
    if (status.status && status.status !== "success") {
      const reason =
        text(record(status.error).tag) ?? text(status.status) ?? "unknown";
      throw new FieldworkError(
        reason === "CRAWL_NOT_FOUND" ? "NotFound" : "ProviderError",
        `exa could not read ${url}: ${reason}`,
        {
          provider,
          cause: response,
        }
      );
    }
    return { response, result: record(list(record(response).results)[0]) };
  }

  const operations: ExaOperations = {
    async search(query, options) {
      const { call, rest: o } = callSettings(options);
      const response = record(
        await raw.request("POST", "/search", {
          ...call,
          body: compact({
            query,
            numResults: o.limit,
            type: o.type,
            category: o.category,
            includeDomains: o.includeDomains,
            excludeDomains: o.excludeDomains,
            startPublishedDate: o.publishedAfter,
            endPublishedDate: o.publishedBefore,
            startCrawlDate: o.crawledAfter,
            endCrawlDate: o.crawledBefore,
            includeText: o.includeText,
            excludeText: o.excludeText,
            userLocation: o.country ? { country: o.country } : undefined,
            additionalQueries: o.additionalQueries,
            contents: o.content ? { text: true } : undefined,
          }),
        })
      );
      return {
        results: list(response.results).map((item) => {
          const result = record(item);
          return compact({
            url: text(result.url) ?? "",
            title: text(result.title),
            snippet: strings(result.highlights)?.join(" … "),
            content: text(result.text),
            publishedAt: text(result.publishedDate),
            score: num(result.score),
          });
        }),
        raw: response,
      };
    },

    async read(url, options) {
      const { call, rest: o } = callSettings(options);
      const { response, result } = await contents(
        url,
        compact({
          text: compact({ maxCharacters: o.maxCharacters }),
          highlights: o.query ? { query: o.query } : undefined,
          maxAgeHours: o.maxAgeHours,
          snapshotAsOf: o.snapshotAsOf,
          extras: { links: 100, imageLinks: 100 },
        }),
        call
      );
      const extras = record(result.extras);
      return compact({
        url: text(result.url) ?? url,
        title: text(result.title),
        markdown: text(result.text),
        excerpts: strings(result.highlights),
        links: strings(extras.links),
        images: strings(extras.imageLinks),
        raw: response,
      });
    },

    async extract<T>(url: string, options: ExaExtractOptions) {
      const { call, rest: o } = callSettings(options);
      const { response, result } = await contents(
        url,
        compact({
          text: true,
          summary: compact({ query: o.prompt, schema: o.schema }),
          maxAgeHours: o.maxAgeHours,
        }),
        call
      );
      if (result.summary === undefined) {
        throw new FieldworkError(
          "ProviderError",
          `exa returned no structured summary for ${url}`,
          { provider, cause: response }
        );
      }
      return { data: parseJson(provider, result.summary) as T, raw: response };
    },

    async research<T>(question: string, options?: ExaResearchOptions) {
      const { call, rest: o } = callSettings(options);
      const budget = compact({
        maxCostDollars: o.maxCostDollars,
        maxDurationSeconds: o.maxDurationSeconds,
      });
      const id =
        o.resume ??
        requireId(
          provider,
          record(
            await raw.request("POST", "/agent/runs", {
              ...call,
              body: compact({
                query: question,
                outputSchema: o.schema,
                effort: o.effort,
                budget: Object.keys(budget).length > 0 ? budget : undefined,
              }),
            })
          ).id
        );
      const run = await poll(
        provider,
        id,
        async () => {
          const current = record(
            await raw.request("GET", `/agent/runs/${id}`, {
              signal: call.signal,
            })
          );
          if (current.status === "failed" || current.status === "cancelled") {
            throw new FieldworkError(
              "JobFailed",
              `exa research run ${id} ended ${text(current.status) ?? "unknown"}`,
              {
                provider,
                cause: current,
              }
            );
          }
          return current.status === "completed" ? current : undefined;
        },
        { ...call, interval: o.interval }
      );
      const output = record(run.output);
      const fields: FieldSource[] = list(output.grounding).map((item) => {
        const grounding = record(item);
        return compact({
          field: text(grounding.field) ?? "",
          citations: citations(grounding.citations),
          confidence: text(grounding.confidence) ?? num(grounding.confidence),
        });
      });
      return {
        id,
        output: (o.schema ? output.structured : output.text) as T,
        sources: uniqueCitations(fields.flatMap((field) => field.citations)),
        fields,
        raw: run,
      };
    },
  };

  return defineAdapter({ name: provider, operations, raw });
}
