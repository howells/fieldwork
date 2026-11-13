// Option and operation types for the Tavily adapter, exported from `@howells/fieldwork-sdk/tavily`.
// The adapter in ../tavily.ts implements them; parse.ts turns the options into Tavily requests.

import type { OutputSchema } from "../../schema.js";
import type {
  AccountUsage,
  Answer,
  CallOptions,
  Crawl,
  ImageSearch,
  Page,
  PageBatch,
  Recency,
  Research,
  SearchResponse,
  SiteMap,
} from "../../types.js";

/** Settings for the Tavily adapter. */
export interface TavilyConfig {
  /** Defaults to the TAVILY_API_KEY environment variable. */
  apiKey?: string;
  /** Sent as the X-Project-ID header, so Tavily groups usage and logs by project. */
  projectId?: string;
  /** Defaults to https://api.tavily.com. */
  baseUrl?: string;
  /** Sends every request instead of the global `fetch`. */
  fetch?: typeof fetch;
  /** Repeats of a request that can succeed on repeat; 2 unless set. `0` turns retrying off. */
  retries?: number;
}

/**
 * How deep a search goes. `advanced` costs 2 credits; `fast` and `ultra-fast`
 * refuse `safeSearch`, and `ultra-fast` refuses `chunksPerSource`.
 */
export type TavilySearchDepth = "ultra-fast" | "fast" | "basic" | "advanced";

/**
 * Options for `search`. The adapter throws `InvalidRequest` before sending
 * when `includeDomainsMode` has no `includeDomains`, `filterByLanguage` has no
 * `language`, `imageDescriptions` has no `includeImages`, `safeSearch` or
 * `chunksPerSource` meets a depth that lacks it, `maxAge` is over 30 days, or
 * `country` is not in Tavily's list or `topic` is not `general`.
 *
 * A result's `snippet` is Tavily's passages and its `content` is the page text.
 */
export interface TavilySearchOptions extends CallOptions {
  /** Results to return; Tavily allows 0 to 20. */
  limit?: number;
  /**
   * `advanced` costs 2 credits and is the most relevant. `ultra-fast` returns
   * one summary per page instead of several passages.
   */
  searchDepth?: TavilySearchDepth;
  topic?: "general" | "news" | "finance";
  /** Only results from this far back. Tavily has no `hour` window. */
  recency?: Exclude<Recency, "hour">;
  /** YYYY-MM-DD. */
  publishedAfter?: string;
  /** YYYY-MM-DD. */
  publishedBefore?: string;
  /**
   * Drop results outside the date window, and results with no detectable date.
   * Without it Tavily keeps undated results when a window is set.
   */
  filterByPublishedDate?: boolean;
  /** Passages to return per page, 1 to 3. Not available with `ultra-fast`. */
  chunksPerSource?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  /** "restrict" keeps to includeDomains; "prefer" only ranks them higher. */
  includeDomainsMode?: "restrict" | "prefer";
  /** ISO 3166-1 alpha-2 code such as "GB". Ranks that country higher; general topic only. Tavily takes country names, so the adapter sends the name for the code. */
  country?: string;
  /** ISO 639-1 code. Ranks pages in that language higher. */
  language?: string;
  /** Remove pages that are not in `language`, instead of only ranking them lower. */
  filterByLanguage?: boolean;
  /** Remove adult and unsafe pages. Not available with `fast` or `ultra-fast`. */
  safeSearch?: boolean;
  /** Let Tavily choose parameters from the query; it may switch to `advanced` (2 credits). */
  autoParameters?: boolean;
  /** Only pages containing the quoted phrases in the query. */
  exactMatch?: boolean;
  /** Seconds a cached copy may be old; 0 always fetches live, a negative number never does. Tavily counts hours, so this is rounded up to whole hours, up to 720. */
  maxAge?: number;
  /** Include each result's page text; `true` means Markdown. */
  content?: boolean | "markdown" | "text";
  /** Return images found for the query in `images`. */
  includeImages?: boolean;
  /** Add a description to each image. Needs `includeImages`. */
  imageDescriptions?: boolean;
  /** Return each result's favicon. */
  favicon?: boolean;
}

/** Options for `images`, which runs a Tavily search and returns the images it finds. */
export interface TavilyImagesOptions extends CallOptions {
  searchDepth?: TavilySearchDepth;
  topic?: "general" | "news" | "finance";
  includeDomains?: string[];
  excludeDomains?: string[];
  safeSearch?: boolean;
  /** Describe each image. Defaults to true. */
  descriptions?: boolean;
}

/**
 * Options for `answer`, which is a Tavily search with a written answer. It
 * takes the search options except those for page text, images and favicons.
 * The citations are the search results.
 */
export interface TavilyAnswerOptions extends Omit<
  TavilySearchOptions,
  "content" | "includeImages" | "imageDescriptions" | "favicon"
> {
  /** `advanced` writes a more detailed answer. Defaults to `basic`. */
  answerDepth?: "basic" | "advanced";
}

/** Options for `read`, through Tavily's extract endpoint. */
export interface TavilyExtractOptions extends CallOptions {
  /** `advanced` also reads tables and embedded content, and costs 2 credits per 5 pages. */
  extractDepth?: "basic" | "advanced";
  /** Return only the passages that answer this, as `excerpts`, instead of the whole page. */
  query?: string;
  /** Passages to return per page, 1 to 5. Needs `query`. */
  chunksPerSource?: number;
  /** `text` returns plain text, in `markdown`. */
  format?: "markdown" | "text";
  includeImages?: boolean;
  favicon?: boolean;
  /** Seconds Tavily waits for the page, 1 to 60. Not the same as `timeout`, which is milliseconds on our side. */
  serverTimeout?: number;
}

/** Options for `read`. The same as `TavilyExtractOptions`. */
export type TavilyReadOptions = TavilyExtractOptions;
/** Options for `readMany`, which reads 1 to 20 URLs in one call. The same as `TavilyExtractOptions`. */
export type TavilyReadManyOptions = TavilyExtractOptions;

/** How Tavily walks a site, shared by `map` and `crawl`. */
export interface TavilyTraversal {
  /** Plain-words instructions that focus the walk. Raises the cost. */
  instructions?: string;
  maxDepth?: number;
  maxBreadth?: number;
  /** Links to process before stopping. */
  limit?: number;
  /** Regular expressions; a URL's path must match one. */
  selectPathPatterns?: string[];
  /** Regular expressions; a URL whose path matches one is skipped. */
  excludePathPatterns?: string[];
  /** Regular expressions such as `^docs\\.example\\.com$`; a URL's host must match one. */
  selectDomainPatterns?: string[];
  /** Regular expressions; a URL whose host matches one is skipped. */
  excludeDomainPatterns?: string[];
  /** Include links to other domains. Tavily defaults to true. */
  allowExternal?: boolean;
  /** Seconds Tavily works before stopping, 10 to 150. Not the same as `timeout`, which is milliseconds on our side. */
  serverTimeout?: number;
}

/** Options for `map`. */
export interface TavilyMapOptions extends CallOptions, TavilyTraversal {}

/**
 * Options for `crawl`. With `instructions`, each page comes back as `excerpts`
 * instead of `markdown`.
 */
export interface TavilyCrawlOptions extends CallOptions, TavilyTraversal {
  extractDepth?: "basic" | "advanced";
  format?: "markdown" | "text";
  /** Passages to return per page, 1 to 5. Needs `instructions`. */
  chunksPerSource?: number;
  includeImages?: boolean;
  favicon?: boolean;
}

/** A file the research agent reads as a source and cites. */
export interface TavilyResearchFile {
  /** With an extension of `.txt`, `.md` or `.json`. */
  name: string;
  /** The file's text, or its bytes. Sent base64-encoded. */
  data: string | Uint8Array;
}

/**
 * Options for `research`, which starts a Tavily research task and waits for it
 * as an asynchronous job. The adapter refuses more than 5 files, and file
 * names that do not end in `.txt`, `.md` or `.json`.
 */
export interface TavilyResearchOptions<T = unknown> extends CallOptions {
  /** Tavily accepts object, string, integer, number and array types only, and each property needs a description. Type arrays, including nullable unions, throw `InvalidRequest` before sending. */
  schema?: OutputSchema<T>;
  model?: "mini" | "pro" | "auto";
  citationFormat?: "numbered" | "mla" | "apa" | "chicago";
  outputLength?: "short" | "standard" | "long";
  /** A preference, not a restriction. Up to 20. */
  includeDomains?: string[];
  /** Never cited, subdomains included. Up to 20. */
  excludeDomains?: string[];
  /** Up to 5 files, 80,000 words in all. */
  files?: TavilyResearchFile[];
  /** Milliseconds between checks. */
  interval?: number;
  /**
   * The id of a job that timed out or was cancelled, from the error's
   * `jobId`. Waits for that job instead of starting a new one.
   */
  resume?: string;
}

/**
 * What Tavily can do: search, images, read, readMany, map, crawl, answer,
 * research and usage. `research` is an asynchronous job and accepts `resume`.
 */
export interface TavilyOperations {
  search: (
    query: string,
    options?: TavilySearchOptions
  ) => Promise<SearchResponse>;
  images: (
    query: string,
    options?: TavilyImagesOptions
  ) => Promise<ImageSearch>;
  read: (url: string, options?: TavilyReadOptions) => Promise<Page>;
  readMany: (
    urls: string[],
    options?: TavilyReadManyOptions
  ) => Promise<PageBatch>;
  map: (url: string, options?: TavilyMapOptions) => Promise<SiteMap>;
  crawl: (url: string, options?: TavilyCrawlOptions) => Promise<Crawl>;
  answer: (
    question: string,
    options?: TavilyAnswerOptions
  ) => Promise<Answer<unknown>>;
  research: <T = unknown>(
    question: string,
    options?: TavilyResearchOptions<T>
  ) => Promise<Research<T>>;
  usage: (options?: CallOptions) => Promise<AccountUsage>;
}
