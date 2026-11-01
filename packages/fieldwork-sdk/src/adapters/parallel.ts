import { defineAdapter } from "../adapter.js";
import { FieldworkError } from "../errors.js";
import { createRawClient, requireKey } from "../http.js";
import type { RawClient } from "../http.js";
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
  citations,
  compact,
  list,
  record,
  strings,
  text,
  uniqueCitations,
  requireId,
} from "../util.js";

export interface ParallelConfig {
  /** Defaults to the PARALLEL_API_KEY environment variable. */
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export type ParallelProcessor =
  | "lite"
  | "base"
  | "core"
  | "core2x"
  | "pro"
  | "ultra"
  | "ultra2x"
  | "ultra4x"
  | "ultra8x";

interface ParallelSourcePolicy {
  /** Domains or domain/path prefixes, without a scheme. */
  includeDomains?: string[];
  excludeDomains?: string[];
  /** YYYY-MM-DD. */
  publishedAfter?: string;
}

export interface ParallelSearchOptions
  extends CallOptions, ParallelSourcePolicy {
  /** What the search is for, in plain words. Defaults to the query. */
  objective?: string;
  /** Several keyword queries; defaults to the query alone. */
  queries?: string[];
  mode?: "turbo" | "fast" | "basic" | "advanced";
  limit?: number;
  /** Cap on the total characters of excerpts returned. */
  maxCharsTotal?: number;
}

export interface ParallelReadOptions extends CallOptions {
  /** Return passages for this objective as `excerpts`. */
  objective?: string;
  queries?: string[];
  /** Seconds of cache Parallel may use; the minimum is 600. */
  maxAgeSeconds?: number;
}

export interface ParallelExtractOptions extends CallOptions {
  schema: JsonSchema;
  prompt?: string;
  /** Defaults to "base". */
  processor?: ParallelProcessor;
}

export interface ParallelResearchOptions
  extends CallOptions, ParallelSourcePolicy {
  schema?: JsonSchema;
  /** Defaults to "base". */
  processor?: ParallelProcessor;
}

export interface ParallelOperations {
  search(
    query: string,
    options?: ParallelSearchOptions
  ): Promise<SearchResponse>;
  read(url: string, options?: ParallelReadOptions): Promise<Page>;
  extract<T = unknown>(
    url: string,
    options: ParallelExtractOptions
  ): Promise<Extraction<T>>;
  research<T = unknown>(
    question: string,
    options?: ParallelResearchOptions
  ): Promise<Research<T>>;
}

function sourcePolicy(o: ParallelSourcePolicy) {
  const policy = compact({
    include_domains: o.includeDomains,
    exclude_domains: o.excludeDomains,
    after_date: o.publishedAfter,
  });
  return Object.keys(policy).length > 0 ? policy : undefined;
}

function outputSchema(schema: JsonSchema | undefined) {
  return schema ? { type: "json", json_schema: schema } : { type: "text" };
}

/** Creates a Task run and waits for its result. */
async function runTask(
  raw: RawClient,
  body: Record<string, unknown>,
  call: CallOptions
) {
  const created = record(
    await raw.request("POST", "/v1/tasks/runs", { ...call, body })
  );
  const id = requireId(raw.provider, created.run_id);
  const deadline = Date.now() + (call.timeout ?? 600_000);
  for (;;) {
    const wait = Math.max(
      1,
      Math.min(600, Math.floor((deadline - Date.now()) / 1000))
    );
    try {
      // The result endpoint holds the request open until the run finishes or
      // `timeout` seconds pass.
      return {
        id,
        result: record(
          await raw.request("GET", `/v1/tasks/runs/${id}/result`, {
            query: { timeout: wait },
            signal: call.signal,
          })
        ),
      };
    } catch (error) {
      const stillRunning =
        error instanceof FieldworkError && error.code === "Timeout";
      if (!stillRunning || Date.now() >= deadline) {
        throw error;
      }
    }
  }
}

function basis(output: Record<string, unknown>): FieldSource[] {
  return list(output.basis).map((item) => {
    const entry = record(item);
    return compact({
      field: text(entry.field) ?? "",
      citations: citations(entry.citations),
      confidence: text(entry.confidence),
      reasoning: text(entry.reasoning),
    });
  });
}

export function parallel(config: ParallelConfig = {}) {
  const provider = "parallel";
  const raw = createRawClient({
    provider,
    baseUrl: config.baseUrl ?? "https://api.parallel.ai",
    headers: {
      "x-api-key": requireKey(provider, config.apiKey, "PARALLEL_API_KEY"),
    },
    fetch: config.fetch,
  });

  const operations: ParallelOperations = {
    async search(query, options) {
      const { call, rest: o } = callSettings(options);
      const response = record(
        await raw.request("POST", "/v1/search", {
          ...call,
          body: compact({
            objective: o.objective ?? query,
            search_queries: o.queries ?? [query],
            mode: o.mode,
            max_chars_total: o.maxCharsTotal,
            advanced_settings: compact({
              max_results: o.limit,
              source_policy: sourcePolicy(o),
            }),
          }),
        })
      );
      return {
        results: list(response.results).map((item) => {
          const result = record(item);
          return compact({
            url: text(result.url) ?? "",
            title: text(result.title),
            snippet: strings(result.excerpts)?.join(" … "),
            publishedAt: text(result.publish_date),
          });
        }),
        raw: response,
      };
    },

    async read(url, options) {
      const { call, rest: o } = callSettings(options);
      const response = record(
        await raw.request("POST", "/v1/extract", {
          ...call,
          body: compact({
            urls: [url],
            objective: o.objective,
            search_queries: o.queries,
            advanced_settings: compact({
              full_content: true,
              fetch_policy:
                o.maxAgeSeconds === undefined
                  ? undefined
                  : { max_age_seconds: o.maxAgeSeconds },
            }),
          }),
        })
      );
      const result = record(list(response.results)[0]);
      if (!result.url) {
        const failure = record(list(response.errors)[0]);
        throw new FieldworkError(
          "ProviderError",
          `parallel could not read ${url}: ${text(failure.content) ?? text(failure.error_type) ?? "no content returned"}`,
          {
            provider,
            cause: response,
          }
        );
      }
      return compact({
        url: text(result.url) ?? "",
        title: text(result.title),
        markdown: text(result.full_content),
        excerpts: strings(result.excerpts),
        raw: response,
      });
    },

    async extract<T>(url: string, options: ParallelExtractOptions) {
      const { call, rest: o } = callSettings(options);
      const target = new URL(url);
      const { id, result } = await runTask(
        raw,
        {
          processor: o.processor ?? "base",
          input: {
            url,
            instructions:
              o.prompt ??
              "Extract the values in the output schema from this page only.",
          },
          source_policy: {
            include_domains: [
              `${target.hostname}${target.pathname}`.replace(/\/$/u, ""),
            ],
          },
          task_spec: { output_schema: outputSchema(o.schema) },
        },
        call
      );
      const output = record(result.output);
      return {
        data: output.content as T,
        fields: basis(output),
        raw: { id, ...result },
      };
    },

    async research<T>(question: string, options?: ParallelResearchOptions) {
      const { call, rest: o } = callSettings(options);
      const { id, result } = await runTask(
        raw,
        compact({
          processor: o.processor ?? "base",
          input: question,
          source_policy: sourcePolicy(o),
          task_spec: { output_schema: outputSchema(o.schema) },
        }),
        call
      );
      const output = record(result.output);
      const fields = basis(output);
      return {
        id,
        output: output.content as T,
        sources: uniqueCitations(fields.flatMap((field) => field.citations)),
        fields,
        raw: result,
      };
    },
  };

  return defineAdapter({ name: provider, operations, raw });
}
