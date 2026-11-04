// Option and operation types for the Firecrawl adapter, exported from `@howells/fieldwork-sdk/firecrawl`.
// The adapter in ../firecrawl.ts implements them; request.ts turns the options into Firecrawl requests.

import type { OutputSchema } from "../../schema.js";
import type {
  AccountUsage,
  ActResult,
  BrowserSession,
  CallOptions,
  Crawl,
  DocumentInput,
  Extraction,
  ImageSearch,
  MonitorEvents,
  MonitorInfo,
  MonitorSchedule,
  Page,
  PageBatch,
  ParsedDocument,
  Product,
  Recency,
  Research,
  SearchResponse,
  SiteMap,
} from "../../types.js";

/** Settings for the Firecrawl adapter. */
export interface FirecrawlConfig {
  /** Defaults to the FIRECRAWL_API_KEY environment variable. */
  apiKey?: string;
  /** Defaults to https://api.firecrawl.dev/v2. */
  baseUrl?: string;
  /** Sends every request instead of the global `fetch`. */
  fetch?: typeof fetch;
  /** Repeats of a request that can succeed on repeat; 2 unless set. `0` turns retrying off. */
  retries?: number;
}

/** A step Firecrawl runs in the browser before it reads the page. */
export type FirecrawlAction =
  | { type: "wait"; milliseconds: number }
  | { type: "wait"; selector: string }
  | {
      type: "screenshot";
      fullPage?: boolean;
      quality?: number;
      viewport?: { width: number; height: number };
    }
  | { type: "click"; selector: string; all?: boolean }
  /** Click the field first: Firecrawl types into the focused element. */
  | { type: "write"; text: string }
  | { type: "press"; key: string }
  | { type: "scroll"; direction?: "up" | "down"; selector?: string }
  | { type: "scrape" }
  | { type: "executeJavascript"; script: string }
  | {
      type: "pdf";
      format?:
        | "A0"
        | "A1"
        | "A2"
        | "A3"
        | "A4"
        | "A5"
        | "A6"
        | "Letter"
        | "Legal"
        | "Tabloid"
        | "Ledger";
      landscape?: boolean;
      scale?: number;
    };

/** How Firecrawl reads files it meets while scraping. Parsers left out are off. */
export type FirecrawlParser =
  | "pdf"
  | "image"
  | FirecrawlPdfParser
  | { type: "image" };

/** Settings for Firecrawl's PDF parser. */
export interface FirecrawlPdfParser {
  type: "pdf";
  /** "fast" reads embedded text only, "ocr" always runs OCR, "auto" falls back to OCR. */
  mode?: "fast" | "auto" | "ocr";
  maxPages?: number;
  /** Return one Markdown entry per physical page. */
  pages?: boolean;
  /** Return layout blocks with positions. */
  blocks?: boolean;
  /** Mark page breaks in the Markdown. */
  pageMarkers?: boolean;
}

/** Page-fetching settings Firecrawl applies before reading. */
export interface FirecrawlPageSettings {
  onlyMainContent?: boolean;
  includeTags?: string[];
  excludeTags?: string[];
  /** Seconds a cached copy may be old; 0 always fetches fresh. Sent to Firecrawl in milliseconds. */
  maxAge?: number;
  /** Milliseconds to wait for the page before reading it. */
  waitFor?: number;
  mobile?: boolean;
  /**
   * Which proxies fetch the page. `basic` is fast and suits sites with little
   * anti-bot protection; `enhanced` is slower and gets past stronger bot
   * walls; `auto` retries with `enhanced` when `basic` fails. Both cost the
   * same credits.
   */
  proxy?: "basic" | "enhanced" | "auto";
  /** Where the request comes from; `country` is ISO 3166-1 alpha-2. */
  location?: { country?: string; languages?: string[] };
  /** Clicks, scrolls, waits and scripts to run before reading. */
  actions?: FirecrawlAction[];
  parsers?: FirecrawlParser[];
}

/** A format `include` can ask for beside Markdown. */
export type FirecrawlFormat =
  | "html"
  | "rawHtml"
  | "links"
  | "images"
  | "screenshot"
  | "summary";

/** What to read from each page, beside its Markdown. */
export interface FirecrawlReadSettings extends FirecrawlPageSettings {
  /** Extra formats beside Markdown. */
  include?: FirecrawlFormat[];
  /** Return passages that answer this as `excerpts`. */
  query?: string;
  /**
   * How `query` is answered: "highlights" (the default) returns the page's
   * relevant passages, "question" returns one written answer. Each costs
   * 4 extra credits per page.
   */
  queryFormat?: "highlights" | "question";
}

/** Options for `product`, and the page settings `extract` takes. */
export interface FirecrawlPageOptions
  extends CallOptions, FirecrawlPageSettings {}

/** Options for `read`. With `query`, the page has `excerpts`. */
export interface FirecrawlReadOptions
  extends CallOptions, FirecrawlReadSettings {}

/**
 * Options for `readMany`, which runs one Firecrawl batch scrape as an
 * asynchronous job. URLs Firecrawl rejects at the start, and pages that
 * failed or answered 404 or 410, are listed in `failed`.
 */
export interface FirecrawlReadManyOptions extends FirecrawlReadOptions {
  /** Most pages Firecrawl scrapes at the same time. */
  maxConcurrency?: number;
  /** Firecrawl defaults to true: invalid URLs go to `failed` instead of failing the job. */
  ignoreInvalidURLs?: boolean;
  /** Milliseconds between status checks. */
  interval?: number;
  /**
   * The id of a job that timed out or was cancelled, from the error's
   * `jobId`. Waits for that job instead of starting a new one; `urls` is then
   * ignored.
   */
  resume?: string;
}

/**
 * Options for `search`. `tbs` and `recency` cannot be combined with each other
 * or with the published dates, and `includeDomains` cannot be combined with
 * `excludeDomains`; the adapter throws `InvalidRequest` before sending when
 * they are.
 */
export interface FirecrawlSearchOptions extends CallOptions {
  /** Results per source; Firecrawl allows up to 100. */
  limit?: number;
  /** Which result lists to ask for. `images` fills `images` on the response. */
  sources?: ("web" | "news" | "images")[];
  /** "gov" cannot be combined with another category. */
  categories?: ("developer" | "gov" | "research" | "pdf")[];
  /** Hosts only; Firecrawl does not filter by path. Not with `excludeDomains`. */
  includeDomains?: string[];
  excludeDomains?: string[];
  /** YYYY-MM-DD. Firecrawl applies dates and recency to web results only. */
  publishedAfter?: string;
  /** YYYY-MM-DD. */
  publishedBefore?: string;
  /** Not with `publishedAfter` or `publishedBefore`. */
  recency?: Recency;
  /** ISO 3166-1 alpha-2 country code. */
  country?: string;
  /** A place name such as "San Francisco,California,United States". */
  location?: string;
  /** Google time filter such as "sbd:1,qdr:w", for when the named options do not fit. Not with `recency`, `publishedAfter` or `publishedBefore`. */
  tbs?: string;
  /** Include each result's page text as Markdown. */
  content?: boolean;
  /** Filter explicit content (SafeSearch). */
  safe?: boolean;
  ignoreInvalidURLs?: boolean;
}

/** Options for `images`, which searches Firecrawl's image source only. */
export interface FirecrawlImagesOptions extends CallOptions {
  limit?: number;
  country?: string;
  location?: string;
  safe?: boolean;
}

/**
 * Options for `extract`: a scrape that asks Firecrawl for JSON in the shape of
 * `schema`, which is checked on return.
 */
export interface FirecrawlExtractOptions<
  T = unknown,
> extends FirecrawlPageOptions {
  schema: OutputSchema<T>;
  prompt?: string;
}

/** Options for `map`. */
export interface FirecrawlMapOptions extends CallOptions {
  limit?: number;
  /** Order links by relevance to this text. */
  search?: string;
  sitemap?: "skip" | "include" | "only";
  includeSubdomains?: boolean;
  /** Firecrawl defaults to true, which merges URLs that differ only by query. */
  ignoreQueryParameters?: boolean;
  /** Skip the sitemap cache, which can be up to 7 days old. */
  ignoreCache?: boolean;
  location?: { country?: string; languages?: string[] };
}

/**
 * Options for `crawl`, which runs a Firecrawl crawl as an asynchronous job and
 * returns every page. Pages that failed are in `failed` and pages robots.txt
 * blocked in `robotsBlocked`.
 */
export interface FirecrawlCrawlOptions extends CallOptions {
  limit?: number;
  /** Plain-words crawl instructions; the options you set override it. */
  prompt?: string;
  /** Regular expressions on the URL path (not hosts); a page must match one. */
  includePaths?: string[];
  /** Regular expressions on the URL path; a page matching one is skipped. */
  excludePaths?: string[];
  /** Match the two lists above against the full URL instead of the path. */
  regexOnFullURL?: boolean;
  maxDiscoveryDepth?: number;
  sitemap?: "skip" | "include" | "only";
  crawlEntireDomain?: boolean;
  allowSubdomains?: boolean;
  allowExternalLinks?: boolean;
  ignoreQueryParameters?: boolean;
  /** Seconds between page requests; forces one page at a time. */
  delay?: number;
  maxConcurrency?: number;
  /** How each crawled page is read. */
  scrapeOptions?: FirecrawlReadSettings;
  /** Milliseconds between status checks. */
  interval?: number;
  /**
   * The id of a job that timed out or was cancelled, from the error's
   * `jobId`. Waits for that job instead of starting a new one.
   */
  resume?: string;
}

/**
 * Options for `research`, which starts a Firecrawl agent run and waits for it
 * as an asynchronous job. A run that fails but leaves partial output is
 * returned with status `partial` and a `stopReason`.
 */
export interface FirecrawlResearchOptions<T = unknown> extends CallOptions {
  /** Output in the shape of this schema, checked on return. */
  schema?: OutputSchema<T>;
  /** Pages to start from. */
  urls?: string[];
  /** Visit only `urls`. */
  strictConstrainToURLs?: boolean;
  /** Credit cap for the run; Firecrawl defaults to 2500. */
  maxCredits?: number;
  model?: "spark-2";
  effort?: "low" | "medium" | "high";
  /** The `continuationId` of an earlier run: this run is the next turn of its thread. */
  continueFrom?: string;
  /** ISO 3166-1 alpha-2 country the agent browses from. */
  country?: string;
  /** Milliseconds between status checks. */
  interval?: number;
  /**
   * The id of a job that timed out or was cancelled, from the error's
   * `jobId`. Waits for that job instead of starting a new one.
   */
  resume?: string;
}

/** How a new browser session is set up. */
export interface FirecrawlSessionSettings {
  /** Seconds the browser session may live (30 to 3600). */
  ttl?: number;
  /** Seconds the session may sit idle; defaults to `ttl`. */
  activityTtl?: number;
  /** Keeps cookies and storage between sessions that share the name. */
  profile?: { name: string; saveChanges?: boolean };
  /** ISO 3166-1 alpha-2 country the browser connects from. */
  country?: string;
}

/**
 * Options for `act`, which runs a script in a browser session. The call's
 * `timeout` also limits the script, to at most 300 seconds. Session settings
 * (`ttl`, `activityTtl`, `profile`, `country`) are refused together with `session`.
 */
export interface FirecrawlActOptions
  extends CallOptions, FirecrawlSessionSettings {
  /** Defaults to "node". */
  language?: "node" | "python" | "bash";
  /**
   * Run in this open session (from `browser.open` or an earlier `act` with
   * `keepSession`) instead of a new one. Not with the session settings.
   */
  session?: string;
  /**
   * Leave the session open and return its id as `sessionId`. Defaults to true
   * when `session` is given and false otherwise. A session left open bills
   * until it expires or you close it.
   */
  keepSession?: boolean;
}

/** Options for `browser.open`. */
export type FirecrawlBrowserOptions = CallOptions & FirecrawlSessionSettings;

/**
 * Options for `parse`, which reads a local file to Markdown. The adapter sends
 * these as Firecrawl's PDF parser settings, and refuses a file type it does
 * not know, a file over 50 MB, and a `timeout` over 300 seconds.
 */
export interface FirecrawlParseOptions extends CallOptions {
  /** "fast" reads embedded text only, "ocr" always runs OCR, "auto" falls back to OCR. */
  mode?: "auto" | "fast" | "ocr";
  maxPages?: number;
  /** Return one Markdown entry per physical page. */
  pages?: boolean;
  /** Return layout blocks with positions. */
  blocks?: boolean;
  /** Mark page breaks in the Markdown. */
  pageMarkers?: boolean;
}

/**
 * Options for `monitor.create`. A monitor either watches `urls` or runs a
 * search for `query`; one of the two is required. `searchWindow`, `maxResults`
 * and the domain lists apply to search monitors and are refused with `urls`.
 */
export interface FirecrawlMonitorOptions extends CallOptions {
  /** A name for the monitor; defaults to the query or first URL. */
  name?: string;
  /**
   * What counts as a meaningful change, in plain words. With `urls` it judges
   * their changes; without `urls` it is also the search the monitor runs.
   */
  query?: string;
  /** Pages to watch. */
  urls?: string[];
  /** A cron expression (five fields, at least 5 minutes apart) or a named interval. */
  schedule: MonitorSchedule;
  /** IANA time zone for the schedule. Defaults to UTC. */
  timezone?: string;
  webhookUrl?: string;
  /** Days Firecrawl keeps check history, 1 to 365. */
  retentionDays?: number;
  /** Search monitors only: how far back results may be published. */
  searchWindow?: "5m" | "15m" | "1h" | "6h" | "24h" | "7d";
  /** Search monitors only: results to judge per check, 1 to 50. */
  maxResults?: number;
  /** Search monitors only. */
  includeDomains?: string[];
  /** Search monitors only. */
  excludeDomains?: string[];
}

/**
 * What Firecrawl can do: search, images, read, readMany, extract, product,
 * map, crawl, research, act, browser, parse, monitor and usage. `readMany`,
 * `crawl` and `research` are asynchronous jobs and accept `resume`.
 */
export interface FirecrawlOperations {
  search: (
    query: string,
    options?: FirecrawlSearchOptions
  ) => Promise<SearchResponse>;
  images: (
    query: string,
    options?: FirecrawlImagesOptions
  ) => Promise<ImageSearch>;
  read: (url: string, options?: FirecrawlReadOptions) => Promise<Page>;
  /** Reads many pages in one background job. */
  readMany: (
    urls: string[],
    options?: FirecrawlReadManyOptions
  ) => Promise<PageBatch>;
  extract: <T = unknown>(
    url: string,
    options: FirecrawlExtractOptions<T>
  ) => Promise<Extraction<T>>;
  /** Reads product and variant data from the page's structured data, without a model. */
  product: (url: string, options?: FirecrawlPageOptions) => Promise<Product>;
  map: (url: string, options?: FirecrawlMapOptions) => Promise<SiteMap>;
  crawl: (url: string, options?: FirecrawlCrawlOptions) => Promise<Crawl>;
  research: <T = unknown>(
    question: string,
    options?: FirecrawlResearchOptions<T>
  ) => Promise<Research<T>>;
  /** Runs a script in a browser session; closes the session unless `keepSession` is set. */
  act: (code: string, options?: FirecrawlActOptions) => Promise<ActResult>;
  browser: {
    /** Opens a remote browser you drive over CDP; it bills until it expires or you close it. */
    open: (options?: FirecrawlBrowserOptions) => Promise<BrowserSession>;
    close: (id: string, options?: CallOptions) => Promise<void>;
  };
  parse: (
    document: DocumentInput,
    options?: FirecrawlParseOptions
  ) => Promise<ParsedDocument>;
  monitor: {
    create: (options: FirecrawlMonitorOptions) => Promise<MonitorInfo>;
    get: (id: string, options?: CallOptions) => Promise<MonitorInfo>;
    list: (options?: CallOptions) => Promise<MonitorInfo[]>;
    delete: (id: string, options?: CallOptions) => Promise<void>;
    /** One event per check the monitor ran, newest first. */
    events: (
      id: string,
      options?: CallOptions & { cursor?: string }
    ) => Promise<MonitorEvents>;
  };
  usage: (options?: CallOptions) => Promise<AccountUsage>;
}
