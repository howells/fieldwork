import { defineAdapter } from "../adapter.js";
import { FieldworkError } from "../errors.js";
import { createRawClient, requireKey } from "../http.js";
import type {
  CallOptions,
  Citation,
  JsonSchema,
  Research,
  SearchResponse,
} from "../types.js";
import {
  callSettings,
  citation,
  compact,
  list,
  parseJson,
  record,
  requireId,
  text,
  uniqueCitations,
} from "../util.js";
import type { Json } from "../util.js";

export interface PerplexityConfig {
  /** Defaults to the PERPLEXITY_API_KEY environment variable. */
  apiKey?: string;
  /** The model research runs on, unless a call names another. */
  model?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export interface PerplexitySearchOptions extends CallOptions {
  /** Results to return; Perplexity allows up to 20. */
  limit?: number;
  /** Up to five queries in one request. */
  queries?: string[];
  type?: "web" | "fast" | "people";
  includeDomains?: string[];
  excludeDomains?: string[];
  /** YYYY-MM-DD. */
  publishedAfter?: string;
  /** YYYY-MM-DD. */
  publishedBefore?: string;
  recency?: "hour" | "day" | "week" | "month" | "year";
  country?: string;
  /** ISO 639-1 language codes. */
  languages?: string[];
  maxTokensPerPage?: number;
}

export interface PerplexityResearchOptions extends CallOptions {
  schema?: JsonSchema;
  /** Overrides the adapter's model. */
  model?: string;
  effort?: "fast" | "low" | "medium" | "high" | "xhigh";
  /** Caps tool and reasoning steps, not money. */
  maxSteps?: number;
  maxOutputTokens?: number;
  instructions?: string;
  /** Defaults to web search and URL fetching. */
  tools?: Json[];
}

export interface PerplexityOperations {
  search(
    query: string,
    options?: PerplexitySearchOptions
  ): Promise<SearchResponse>;
  research<T = unknown>(
    question: string,
    options?: PerplexityResearchOptions
  ): Promise<Research<T>>;
}

/** Perplexity takes dates as MM/DD/YYYY. */
function usDate(date: string | undefined) {
  const [year, month, day] = date?.split("-") ?? [];
  return date === undefined ? undefined : `${month}/${day}/${year}`;
}

function domainFilter(
  include: string[] | undefined,
  exclude: string[] | undefined
) {
  const filter = [
    ...(include ?? []),
    ...(exclude ?? []).map((domain) => `-${domain}`),
  ];
  return filter.length > 0 ? filter : undefined;
}

export function perplexity(config: PerplexityConfig = {}) {
  const provider = "perplexity";
  const raw = createRawClient({
    provider,
    baseUrl: config.baseUrl ?? "https://api.perplexity.ai",
    headers: {
      authorization: `Bearer ${requireKey(provider, config.apiKey, "PERPLEXITY_API_KEY")}`,
    },
    fetch: config.fetch,
  });

  const operations: PerplexityOperations = {
    async search(query, options) {
      const { call, rest: o } = callSettings(options);
      const response = record(
        await raw.request("POST", "/search", {
          ...call,
          body: compact({
            query: o.queries ? [query, ...o.queries] : query,
            max_results: o.limit,
            search_type: o.type,
            search_domain_filter: domainFilter(
              o.includeDomains,
              o.excludeDomains
            ),
            search_after_date_filter: usDate(o.publishedAfter),
            search_before_date_filter: usDate(o.publishedBefore),
            search_recency_filter: o.recency,
            country: o.country,
            search_language_filter: o.languages,
            max_tokens_per_page: o.maxTokensPerPage,
          }),
        })
      );
      return {
        results: list(response.results).map((item) => {
          const result = record(item);
          return compact({
            url: text(result.url) ?? "",
            title: text(result.title),
            snippet: text(result.snippet),
            publishedAt: text(result.date) ?? text(result.last_updated),
          });
        }),
        raw: response,
      };
    },

    async research<T>(question: string, options?: PerplexityResearchOptions) {
      const { call, rest: o } = callSettings(options);
      const model = o.model ?? config.model;
      if (!model) {
        throw new FieldworkError(
          "InvalidRequest",
          "perplexity research needs a model: pass model to perplexity() or to the call",
          {
            provider,
          }
        );
      }
      const response = record(
        await raw.request("POST", "/v1/agent", {
          ...call,
          body: compact({
            model,
            input: question,
            instructions: o.instructions,
            effort: o.effort,
            max_steps: o.maxSteps,
            max_output_tokens: o.maxOutputTokens,
            tools: o.tools ?? [{ type: "web_search" }, { type: "fetch_url" }],
            response_format: o.schema
              ? {
                  type: "json_schema",
                  json_schema: { name: "output", schema: o.schema },
                }
              : undefined,
          }),
        })
      );
      if (response.status && response.status !== "completed") {
        throw new FieldworkError(
          "JobFailed",
          `perplexity research ended ${text(response.status) ?? "unknown"}`,
          { provider, cause: response }
        );
      }
      const sources: Citation[] = [];
      const parts: string[] = [];
      for (const item of list(response.output)) {
        const entry = record(item);
        if (entry.type === "message") {
          for (const content of list(entry.content)) {
            const value = text(record(content).text);
            if (value) {
              parts.push(value);
            }
          }
        }
        for (const found of [...list(entry.results), ...list(entry.contents)]) {
          const source = citation(found);
          if (source) {
            sources.push(source);
          }
        }
      }
      const reply = parts.join("");
      return {
        id: requireId(provider, response.id),
        output: (o.schema ? parseJson(provider, reply) : reply) as T,
        sources: uniqueCitations(sources),
        raw: response,
      };
    },
  };

  return defineAdapter({ name: provider, operations, raw });
}
