import type {
  AccountUsage,
  Answer,
  CallOptions,
  Crawl,
  ImageSearch,
  JsonSchema,
  Page,
  PageBatch,
  Recency,
  Research,
  SearchResponse,
  SiteMap,
} from "../../types.js";

export interface TavilyConfig {
  /** Defaults to the TAVILY_API_KEY environment variable. */
  apiKey?: string;
  /** Sent as the X-Project-ID header, so Tavily groups usage and logs by project. */
  projectId?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Repeats of a request that can succeed on repeat; 2 unless set. `0` turns retrying off. */
  retries?: number;
}

export type TavilySearchDepth = "ultra-fast" | "fast" | "basic" | "advanced";

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
  /** ISO 3166-1 alpha-2 code such as "GB". Ranks that country higher; general topic only. */
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
  /** Seconds a cached copy may be old; 0 always fetches live, a negative number never does. Tavily counts hours, up to 720. */
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

export interface TavilyImagesOptions extends CallOptions {
  searchDepth?: TavilySearchDepth;
  topic?: "general" | "news" | "finance";
  includeDomains?: string[];
  excludeDomains?: string[];
  safeSearch?: boolean;
  /** Describe each image. Defaults to true. */
  descriptions?: boolean;
}

export interface TavilyAnswerOptions extends Omit<
  TavilySearchOptions,
  "content" | "includeImages" | "imageDescriptions" | "favicon"
> {
  /** `advanced` writes a more detailed answer. Defaults to `basic`. */
  answerDepth?: "basic" | "advanced";
}

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

export type TavilyReadOptions = TavilyExtractOptions;
export type TavilyReadManyOptions = TavilyExtractOptions;

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

export interface TavilyMapOptions extends CallOptions, TavilyTraversal {}

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

export interface TavilyResearchOptions extends CallOptions {
  /** Tavily accepts object, string, integer, number and array types only, and each property needs a description. */
  schema?: JsonSchema;
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
    options?: TavilyResearchOptions
  ) => Promise<Research<T>>;
  usage: (options?: CallOptions) => Promise<AccountUsage>;
}
