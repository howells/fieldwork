import { defineAdapter } from "../adapter.js";
import { FieldworkError } from "../errors.js";
import { createRawClient, poll, requireKey } from "../http.js";
import type {
  CallOptions,
  Crawl,
  JsonSchema,
  Page,
  Research,
  SearchResponse,
  SiteMap,
} from "../types.js";
import {
  callSettings,
  citations,
  compact,
  list,
  num,
  record,
  strings,
  text,
  requireId,
} from "../util.js";

export interface TavilyConfig {
  /** Defaults to the TAVILY_API_KEY environment variable. */
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export interface TavilySearchOptions extends CallOptions {
  /** Results to return; Tavily allows up to 20. */
  limit?: number;
  depth?: "ultra-fast" | "fast" | "basic" | "advanced";
  topic?: "general" | "news" | "finance";
  timeRange?: "day" | "week" | "month" | "year";
  /** YYYY-MM-DD. */
  publishedAfter?: string;
  /** YYYY-MM-DD. */
  publishedBefore?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  /** "restrict" keeps to includeDomains; "prefer" only ranks them higher. */
  includeDomainsMode?: "restrict" | "prefer";
  /** A country name in lower case, such as "united states". */
  country?: string;
  /** Add a generated answer above the results. */
  answer?: boolean | "basic" | "advanced";
  /** Include each result's page text. */
  content?: boolean;
  exactMatch?: boolean;
  /** Hours of cache Tavily may use; 0 forces live results. */
  maxAgeHours?: number;
}

export interface TavilyReadOptions extends CallOptions {
  /** "advanced" handles JavaScript, tables and embedded content. */
  depth?: "basic" | "advanced";
  /** Return only the passages that answer this query, not the whole page. */
  query?: string;
  chunksPerSource?: number;
  format?: "markdown" | "text";
  includeImages?: boolean;
}

interface TavilyTraversal {
  /** Plain-words instructions that focus the walk. */
  instructions?: string;
  maxDepth?: number;
  maxBreadth?: number;
  limit?: number;
  selectPaths?: string[];
  excludePaths?: string[];
  selectDomains?: string[];
  excludeDomains?: string[];
  /** Tavily defaults to true. */
  allowExternal?: boolean;
}

export interface TavilyMapOptions extends CallOptions, TavilyTraversal {}

export interface TavilyCrawlOptions extends CallOptions, TavilyTraversal {
  extractDepth?: "basic" | "advanced";
  format?: "markdown" | "text";
  includeImages?: boolean;
}

export interface TavilyResearchOptions extends CallOptions {
  /** Tavily accepts object, string, integer, number and array types only. */
  schema?: JsonSchema;
  model?: "mini" | "pro" | "auto";
  citationFormat?: "numbered" | "mla" | "apa" | "chicago";
  outputLength?: "short" | "standard" | "long";
  /** A preference, not a restriction. */
  includeDomains?: string[];
  excludeDomains?: string[];
  interval?: number;
}

export interface TavilyOperations {
  search(query: string, options?: TavilySearchOptions): Promise<SearchResponse>;
  read(url: string, options?: TavilyReadOptions): Promise<Page>;
  map(url: string, options?: TavilyMapOptions): Promise<SiteMap>;
  crawl(url: string, options?: TavilyCrawlOptions): Promise<Crawl>;
  research<T = unknown>(
    question: string,
    options?: TavilyResearchOptions
  ): Promise<Research<T>>;
}

function traversal(o: TavilyTraversal) {
  return compact({
    instructions: o.instructions,
    max_depth: o.maxDepth,
    max_breadth: o.maxBreadth,
    limit: o.limit,
    select_paths: o.selectPaths,
    exclude_paths: o.excludePaths,
    select_domains: o.selectDomains,
    exclude_domains: o.excludeDomains,
    allow_external: o.allowExternal,
  });
}

export function tavily(config: TavilyConfig = {}) {
  const provider = "tavily";
  const raw = createRawClient({
    provider,
    baseUrl: config.baseUrl ?? "https://api.tavily.com",
    headers: {
      authorization: `Bearer ${requireKey(provider, config.apiKey, "TAVILY_API_KEY")}`,
    },
    fetch: config.fetch,
  });

  const operations: TavilyOperations = {
    async search(query, options) {
      const { call, rest: o } = callSettings(options);
      const response = record(
        await raw.request("POST", "/search", {
          ...call,
          body: compact({
            query,
            max_results: o.limit,
            search_depth: o.depth,
            topic: o.topic,
            time_range: o.timeRange,
            start_date: o.publishedAfter,
            end_date: o.publishedBefore,
            include_domains: o.includeDomains,
            exclude_domains: o.excludeDomains,
            include_domains_mode: o.includeDomainsMode,
            country: o.country,
            include_answer: o.answer,
            include_raw_content: o.content ? "markdown" : undefined,
            exact_match: o.exactMatch,
            max_age_hours: o.maxAgeHours,
          }),
        })
      );
      return compact({
        results: list(response.results).map((item) => {
          const result = record(item);
          return compact({
            url: text(result.url) ?? "",
            title: text(result.title),
            snippet: text(result.content),
            content: text(result.raw_content),
            publishedAt: text(result.published_date),
            score: num(result.score),
          });
        }),
        answer: text(response.answer),
        raw: response,
      });
    },

    async read(url, options) {
      const { call, rest: o } = callSettings(options);
      const response = record(
        await raw.request("POST", "/extract", {
          ...call,
          body: compact({
            urls: [url],
            extract_depth: o.depth,
            query: o.query,
            chunks_per_source: o.chunksPerSource,
            format: o.format,
            include_images: o.includeImages,
          }),
        })
      );
      const result = record(list(response.results)[0]);
      if (!result.url) {
        const failure = record(list(response.failed_results)[0]);
        throw new FieldworkError(
          "ProviderError",
          `tavily could not read ${url}: ${text(failure.error) ?? "no content returned"}`,
          {
            provider,
            cause: response,
          }
        );
      }
      return compact({
        url: text(result.url) ?? "",
        title: text(result.title),
        markdown: text(result.raw_content),
        images: strings(result.images),
        raw: response,
      });
    },

    async map(url, options) {
      const { call, rest: o } = callSettings(options);
      const response = record(
        await raw.request("POST", "/map", {
          ...call,
          body: { url, ...traversal(o) },
        })
      );
      return {
        links: list(response.results).flatMap((item) =>
          typeof item === "string" ? [{ url: item }] : []
        ),
        raw: response,
      };
    },

    async crawl(url, options) {
      const { call, rest: o } = callSettings(options);
      const response = record(
        await raw.request("POST", "/crawl", {
          ...call,
          body: compact({
            url,
            ...traversal(o),
            extract_depth: o.extractDepth,
            format: o.format,
            include_images: o.includeImages,
          }),
        })
      );
      return {
        pages: list(response.results).map((item) => {
          const page = record(item);
          return compact({
            url: text(page.url) ?? "",
            markdown: text(page.raw_content),
            images: strings(page.images),
            raw: item,
          });
        }),
        raw: response,
      };
    },

    async research<T>(question: string, options?: TavilyResearchOptions) {
      const { call, rest: o } = callSettings(options);
      const created = record(
        await raw.request("POST", "/research", {
          ...call,
          body: compact({
            input: question,
            model: o.model,
            output_schema: o.schema,
            citation_format: o.citationFormat,
            output_length: o.outputLength,
            include_domains: o.includeDomains,
            exclude_domains: o.excludeDomains,
            stream: false,
          }),
        })
      );
      const id = requireId(provider, created.request_id);
      const run = await poll(
        provider,
        async () => {
          const current = record(
            await raw.request("GET", `/research/${id}`, { signal: call.signal })
          );
          if (current.status === "failed") {
            throw new FieldworkError(
              "JobFailed",
              `tavily research ${id} failed`,
              { provider, cause: current }
            );
          }
          return current.status === "completed" ? current : undefined;
        },
        { ...call, interval: o.interval }
      );
      return {
        id,
        output: run.content as T,
        sources: citations(run.sources),
        raw: run,
      };
    },
  };

  return defineAdapter({ name: provider, operations, raw });
}
