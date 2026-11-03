/**
 * The shapes every adapter returns. Each result keeps the provider's own
 * response in `raw`, so nothing the provider sent is lost by normalizing it.
 */

/** A JSON Schema object describing the values to extract. */
export type JsonSchema = Record<string, unknown>;

/** Every capability Fieldwork knows. An adapter implements a subset. */
export const CAPABILITIES = [
  "search",
  "images",
  "read",
  "readMany",
  "extract",
  "product",
  "map",
  "crawl",
  "answer",
  "research",
  "discover",
  "decide",
  "act",
  "browser",
  "parse",
  "monitor",
  "usage",
] as const;

/** A capability's name, such as `search` or `monitor`. */
export type Capability = (typeof CAPABILITIES)[number];

/**
 * Capabilities whose operation is a group of methods rather than one method:
 * `web.monitor.create(...)`, `web.browser.open(...)`.
 */
export const GROUP_CAPABILITIES: readonly Capability[] = ["monitor", "browser"];

/** Settings every call accepts, whatever the provider. */
export interface CallOptions {
  /** Cancels the call, including any polling for an asynchronous job. */
  signal?: AbortSignal;
  /** Milliseconds before the call gives up, across every attempt. */
  timeout?: number;
  /**
   * How many times to repeat a request that failed in a way that can succeed
   * on repeat: a rate limit, a 5xx, or a failed connection. Waits as long as
   * the provider asks, or backs off exponentially. Overrides the adapter's
   * `retries`; `0` turns retrying off.
   */
  retries?: number;
}

/** How recent results must be, where a provider filters by a named window. */
export type Recency = "hour" | "day" | "week" | "month" | "year";

/** What the provider charged or counted for a call, in its own units. */
export interface Usage {
  /** Provider credits, for providers that bill in credits. */
  credits?: number;
  /** The cost in US dollars, when the provider reports it. */
  costUsd?: number;
  /** Other counted units, such as tokens or billed SKUs, by name. */
  units?: Record<string, number>;
}

/** Details every result can carry besides its content. */
export interface Meta {
  /** The provider's id for the request, for support tickets and feedback. */
  requestId?: string;
  usage?: Usage;
  /**
   * Warnings the provider returned, such as an ignored option or a page it
   * could not fully read.
   */
  warnings?: string[];
}

/** A source a provider cited. */
export interface Citation {
  url: string;
  title?: string;
  /** Passages the provider quoted from the source, when it returned any. */
  excerpts?: string[];
}

/** The sources a provider gave for one field of a structured result. */
export interface FieldSource {
  /** The field's name or path, as the provider reports it. */
  field: string;
  citations: Citation[];
  /** The provider's own confidence label or score, unchanged. */
  confidence?: string | number;
  reasoning?: string;
}

/** An amount of money as the provider stated it. */
export interface Price {
  /** The amount as text, so no precision is lost: "12.50". */
  amount?: string;
  /** ISO 4217 code, such as "USD". */
  currency?: string;
  /** The price as the page showed it: "$12.50". */
  formatted?: string;
}

/** Where a place result is. */
export interface Place {
  address?: string;
  latitude?: number;
  longitude?: number;
}

/** One result of `search`. Fields a provider does not return are absent. */
export interface SearchResult {
  url: string;
  title?: string;
  /** Text from the page that matched the query. */
  snippet?: string;
  /** Page text, when the search was asked to include it. */
  content?: string;
  /** When the page was published, as the provider reports it. */
  publishedAt?: string;
  /** When the page last changed, where the provider tracks it separately. */
  lastUpdatedAt?: string;
  score?: number;
  author?: string;
  /** An image that represents the page. */
  image?: string;
  favicon?: string;
  /**
   * The kind of result, when a search mixes or picks kinds: "web", "news",
   * "research", "shopping", "place", "scholar", "patent", "person" and so on.
   */
  kind?: string;
  /** Shopping results. */
  price?: Price;
  rating?: number;
  reviewCount?: number;
  /** Place results. */
  place?: Place;
}

/** One image from `images`, or from a search asked for images. */
export interface ImageResult {
  /** The image itself. */
  url: string;
  thumbnailUrl?: string;
  /** The page the image appears on. */
  sourceUrl?: string;
  title?: string;
  description?: string;
  width?: number;
  height?: number;
}

/** What `search` returns. */
export interface SearchResponse {
  results: SearchResult[];
  /** A generated answer, when the provider was asked for one. */
  answer?: string;
  /** Images found alongside the results, when the search was asked for them. */
  images?: ImageResult[];
  meta?: Meta;
  raw: unknown;
}

/** What `images` returns. */
export interface ImageSearch {
  results: ImageResult[];
  meta?: Meta;
  raw: unknown;
}

/** What `read` returns: one page, in the formats the call asked for. */
export interface Page {
  url: string;
  title?: string;
  description?: string;
  /** The page as Markdown. */
  markdown?: string;
  /** Cleaned HTML. */
  html?: string;
  /** The HTML exactly as the provider received it. */
  rawHtml?: string;
  links?: string[];
  images?: string[];
  /** The page's main image as the page declares it, such as its og:image. */
  image?: string;
  /** Passages that answer the query, when the read was given one. */
  excerpts?: string[];
  /** A short summary, when the read asked for one. */
  summary?: string;
  publishedAt?: string;
  author?: string;
  favicon?: string;
  /** ISO 639-1 language code. */
  language?: string;
  /** The HTTP status the page returned to the provider. */
  statusCode?: number;
  /** A URL of a screenshot of the page; providers expire these. */
  screenshot?: string;
  meta?: Meta;
  raw: unknown;
}

/** A URL a multi-page call could not read, and why. */
export interface FailedUrl {
  url: string;
  error: string;
}

/** What `readMany` returns. A URL that fails goes in `failed` rather than failing the call. */
export interface PageBatch {
  /** The provider's job id, for providers that read in a background job. */
  id?: string;
  pages: Page[];
  failed: FailedUrl[];
  meta?: Meta;
  raw: unknown;
}

/** What `extract` returns: values in the shape of the schema. */
export interface Extraction<T> {
  /** The values, in the shape of the schema. */
  data: T;
  /** Per-field sources, when the provider returns them. */
  fields?: FieldSource[];
  meta?: Meta;
  raw: unknown;
}

/** A product photo. */
export interface ProductImage {
  url: string;
  alt?: string;
}

/** One purchasable version of a product, such as a size or colour. */
export interface ProductVariant {
  id?: string;
  sku?: string;
  title?: string;
  /** Option values that pick this variant, such as color or size. */
  values?: Record<string, string>;
  price?: Price;
  /** The price before a sale, when the variant is on sale. */
  originalPrice?: Price;
  inStock?: boolean;
  /** The availability as the page stated it: "Ships in 2-3 weeks". */
  availability?: string;
  images?: ProductImage[];
  /** Barcode: GTIN, EAN or UPC. */
  gtin?: string;
}

/** What `product` returns: a product page read into its variants and prices. */
export interface Product {
  title?: string;
  brand?: string;
  category?: string;
  description?: string;
  url?: string;
  images?: ProductImage[];
  variants: ProductVariant[];
  meta?: Meta;
  raw: unknown;
}

/** One URL `map` found. */
export interface SiteLink {
  url: string;
  title?: string;
  description?: string;
}

/** What `map` returns: a site's URLs, without their content. */
export interface SiteMap {
  links: SiteLink[];
  meta?: Meta;
  raw: unknown;
}

/** What `crawl` returns: the pages reached by following links from the start URL. */
export interface Crawl {
  /** The provider's job id, for providers that crawl in a background job. */
  id?: string;
  pages: Page[];
  /** Pages the provider tried and could not read. */
  failed?: FailedUrl[];
  /** URLs the site's robots.txt kept the provider from reading. */
  robotsBlocked?: string[];
  /** Pages the provider found to crawl, when it reports it. */
  total?: number;
  meta?: Meta;
  raw: unknown;
}

/**
 * A finished run is `completed`. A run that stopped early, on a budget, a time
 * limit or a step limit, and still returned output is `partial`; `stopReason`
 * says why. A run with no output throws `JobFailed`.
 */
export type RunStatus = "completed" | "partial";

/** What `answer` returns: a cited answer to a question. */
export interface Answer<T> {
  /** The answer text. */
  answer: string;
  /** The answer in the shape of the schema, when one was given. */
  output?: T;
  /** The sources the answer cites. */
  citations: Citation[];
  fields?: FieldSource[];
  /** Pass as `continueFrom` to ask a follow-up in the same thread. */
  continuationId?: string;
  meta?: Meta;
  raw: unknown;
}

/**
 * What `research` returns once the run ends.
 *
 * A run that fails or ends without output throws `JobFailed` with its `jobId`.
 */
export interface Research<T> {
  /** The provider's id for the run. */
  id: string;
  status: RunStatus;
  /** Why the run stopped, as the provider reports it. */
  stopReason?: string;
  /** Structured output when a schema was given, otherwise the report text. */
  output: T;
  /** The sources the output cites. */
  sources: Citation[];
  /** Every source the run looked at, where the provider lists them apart from what it cited. */
  retrieved?: Citation[];
  fields?: FieldSource[];
  /** Pass as `continueFrom` to build on this run. */
  continuationId?: string;
  meta?: Meta;
  raw: unknown;
}

/** One entity a discovery run found. */
export interface Entity<T = Record<string, unknown>> {
  name: string;
  url?: string;
  description?: string;
  /** Whether the entity met every condition, when the provider judged it. */
  matched?: boolean;
  /** Values the run filled for the entity, such as enrichment fields. */
  data?: T;
  citations?: Citation[];
  fields?: FieldSource[];
}

/** What `discover` returns: the entities a run found. */
export interface Discovery<T = Record<string, unknown>> {
  /** The provider's id for the run. */
  id: string;
  status: RunStatus;
  entities: Entity<T>[];
  meta?: Meta;
  raw: unknown;
}

/** A condition every discovered entity must meet. */
export interface Condition {
  name: string;
  /** The condition in plain words. */
  description: string;
}

/**
 * A closed question for `decide`. `yesno` returns a probability that the
 * answer is yes; `choice` returns a probability for each choice; `score`
 * returns a probability for each point of a rubric.
 */
export type DecisionQuestion =
  | { type: "yesno"; question: string }
  | { type: "choice"; question: string; choices: string[] }
  | {
      type: "score";
      question: string;
      /** The rubric: each score and what it means. */
      scale: Record<string, string>;
    };

/** The answer to one `DecisionQuestion`. Which fields are set follows the question's `type`. */
export interface DecisionAnswer {
  /** For `yesno`: the probability that the answer is yes, 0 to 1. */
  probability?: number;
  /** For `choice` and `score`: the most likely option. */
  choice?: string;
  /** For `choice` and `score`: the probability of each option. */
  probabilities?: Record<string, number>;
  confidence?: string | number;
  /** Set when the provider declined to answer, with its reason. */
  refusal?: string;
}

/** What `decide` returns. */
export interface Decisions {
  /** Answers keyed by the question names given. */
  answers: Record<string, DecisionAnswer>;
  /** Sources behind the answers, for providers that ground them on the web. */
  citations: Citation[];
  meta?: Meta;
  raw: unknown;
}

/** What `act` returns: the outcome of a script run in a remote browser. */
export interface ActResult {
  /** What the script printed. */
  stdout: string;
  stderr: string;
  /** The value the script returned, as the provider reports it. */
  result?: unknown;
  exitCode?: number;
  /** Set when the script failed, with the provider's message. */
  error?: string;
  /** Whether the provider stopped the script, for example on its time limit. */
  killed?: boolean;
  /** The browser session the script ran in, when it was kept open. */
  sessionId?: string;
  meta?: Meta;
  raw: unknown;
}

/** A remote browser kept open for your own automation over CDP. */
export interface BrowserSession {
  id: string;
  /** Chrome DevTools Protocol WebSocket URL for Playwright or Puppeteer. */
  cdpUrl?: string;
  /** A URL where a person can watch the session. */
  liveViewUrl?: string;
  /** ISO time the provider will close the session. */
  expiresAt?: string;
  meta?: Meta;
  raw: unknown;
}

/** One page of a parsed document, as Markdown. */
export interface DocumentPage {
  /** The physical page number, starting at 1. */
  pageNumber: number;
  markdown: string;
  /** An address for a picture of the page, when the parse asked for page images. It expires. */
  image?: string;
}

/**
 * Where something sits on its page, as fractions of the page's width and
 * height measured from its top-left corner, whatever units the provider used.
 */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A word and where it sits. */
export interface WordBox {
  text: string;
  box: Box;
}

/** A table cell and where it sits. Rows and columns count from 0. */
export interface TableCell {
  row: number;
  column: number;
  /** Rows the cell spans, when more than one. */
  rowSpan?: number;
  /** Columns the cell spans, when more than one. */
  columnSpan?: number;
  text: string;
  box?: Box;
}

/** One piece of a page's layout: a heading, a paragraph, a table, a figure. */
export interface DocumentBlock {
  /** The physical page number, starting at 1. */
  page: number;
  /** The kind of block in the provider's own words, such as "Table", "heading" or "page_header". */
  type: string;
  /** The block's content as the provider gave it: Markdown, or HTML for some tables. */
  text: string;
  box?: Box;
  /** Where each word sits, when the parse asked for word boxes. */
  words?: WordBox[];
  /** A table's cells, when the parse asked for word boxes. */
  cells?: TableCell[];
}

/** What `parse` returns: a document as Markdown, with pages and layout when asked for. */
export interface ParsedDocument {
  /** The provider's job id, for providers that parse in a background job. */
  id?: string;
  markdown: string;
  pages?: DocumentPage[];
  /** The layout, in reading order, when the parse asked for blocks. */
  blocks?: DocumentBlock[];
  /** Pages in the file; more than `pages.length` means the parse was cut short. */
  pageCount?: number;
  meta?: Meta;
  raw: unknown;
}

/** A file to parse: its bytes and its name, which tells the provider the type. */
export interface DocumentInput {
  data: Blob | Uint8Array | ArrayBuffer;
  name: string;
}

/** How often a monitor checks: a cron expression or a named interval. */
export type MonitorSchedule =
  | { cron: string }
  | { every: "hour" | "day" | "week" | `${number}h` | `${number}d` };

/** A monitor, as `monitor.create`, `monitor.get` and `monitor.list` return it. */
export interface MonitorInfo {
  id: string;
  /** What the monitor watches: a query, a URL list or a goal. */
  watch?: string;
  status?: string;
  schedule?: string;
  webhookUrl?: string;
  createdAt?: string;
  raw: unknown;
}

/** Something a monitor noticed. */
export interface MonitorEvent {
  id?: string;
  /** When the provider recorded the event. */
  at?: string;
  /** What changed, in the provider's words. */
  summary?: string;
  url?: string;
  /** Structured output, when the monitor was given a schema. */
  output?: unknown;
  citations?: Citation[];
  raw: unknown;
}

/** What `monitor.events` returns: one page of events. */
export interface MonitorEvents {
  events: MonitorEvent[];
  /** Pass as `cursor` for the next page. */
  next?: string;
  raw: unknown;
}

/** The account's spend and remaining allowance, as the provider reports it. */
export interface AccountUsage {
  /** Credits used in the current period. */
  used?: number;
  /** Credits left in the current period. */
  remaining?: number;
  /** The period's credit allowance. */
  limit?: number;
  /** Usage by endpoint or product, in the provider's own names. */
  breakdown?: Record<string, number>;
  /** ISO time the current period ends. */
  periodEnd?: string;
  raw: unknown;
}
