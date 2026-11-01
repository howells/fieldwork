import type {
  AccountUsage,
  ActResult,
  BrowserSession,
  CallOptions,
  Crawl,
  DocumentInput,
  Extraction,
  ImageSearch,
  JsonSchema,
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

export interface FirecrawlConfig {
  /** Defaults to the FIRECRAWL_API_KEY environment variable. */
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
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
  /** Seconds a cached copy may be old; 0 always fetches fresh. */
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

export interface FirecrawlPageOptions
  extends CallOptions, FirecrawlPageSettings {}

export interface FirecrawlReadOptions
  extends CallOptions, FirecrawlReadSettings {}

export interface FirecrawlReadManyOptions extends FirecrawlReadOptions {
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

export interface FirecrawlSearchOptions extends CallOptions {
  /** Results per source; Firecrawl allows up to 100. */
  limit?: number;
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
  /** Google time filter such as "sbd:1,qdr:w", for when the named options do not fit. */
  tbs?: string;
  /** Include each result's page text as Markdown. */
  content?: boolean;
  /** Filter explicit content (SafeSearch). */
  safe?: boolean;
  ignoreInvalidURLs?: boolean;
}

export interface FirecrawlImagesOptions extends CallOptions {
  limit?: number;
  country?: string;
  location?: string;
  safe?: boolean;
}

export interface FirecrawlExtractOptions extends FirecrawlPageOptions {
  schema: JsonSchema;
  prompt?: string;
}

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

export interface FirecrawlResearchOptions extends CallOptions {
  schema?: JsonSchema;
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

export interface FirecrawlActOptions
  extends CallOptions, FirecrawlSessionSettings {
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

export type FirecrawlBrowserOptions = CallOptions & FirecrawlSessionSettings;

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

export interface FirecrawlOperations {
  search(
    query: string,
    options?: FirecrawlSearchOptions
  ): Promise<SearchResponse>;
  images(query: string, options?: FirecrawlImagesOptions): Promise<ImageSearch>;
  read(url: string, options?: FirecrawlReadOptions): Promise<Page>;
  /** Reads many pages in one background job. */
  readMany(
    urls: string[],
    options?: FirecrawlReadManyOptions
  ): Promise<PageBatch>;
  extract<T = unknown>(
    url: string,
    options: FirecrawlExtractOptions
  ): Promise<Extraction<T>>;
  /** Reads product and variant data from the page's structured data, without a model. */
  product(url: string, options?: FirecrawlPageOptions): Promise<Product>;
  map(url: string, options?: FirecrawlMapOptions): Promise<SiteMap>;
  crawl(url: string, options?: FirecrawlCrawlOptions): Promise<Crawl>;
  research<T = unknown>(
    question: string,
    options?: FirecrawlResearchOptions
  ): Promise<Research<T>>;
  /** Runs a script in a browser session; closes the session unless `keepSession` is set. */
  act(code: string, options?: FirecrawlActOptions): Promise<ActResult>;
  browser: {
    /** Opens a remote browser you drive over CDP; it bills until it expires or you close it. */
    open(options?: FirecrawlBrowserOptions): Promise<BrowserSession>;
    close(id: string, options?: CallOptions): Promise<void>;
  };
  parse(
    document: DocumentInput,
    options?: FirecrawlParseOptions
  ): Promise<ParsedDocument>;
  monitor: {
    create(options: FirecrawlMonitorOptions): Promise<MonitorInfo>;
    get(id: string, options?: CallOptions): Promise<MonitorInfo>;
    list(options?: CallOptions): Promise<MonitorInfo[]>;
    delete(id: string, options?: CallOptions): Promise<void>;
    /** One event per check the monitor ran, newest first. */
    events(
      id: string,
      options?: CallOptions & { cursor?: string }
    ): Promise<MonitorEvents>;
  };
  usage(options?: CallOptions): Promise<AccountUsage>;
}
