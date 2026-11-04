import {
  anything,
  choice,
  flag,
  keyed,
  list,
  number,
  object,
  str,
  texts,
  whole,
} from "./schema.js";
import type { FieldSchema } from "./schema.js";

// What each tool returns, faithful to the result types in types.ts. The
// provider's `raw` response is never part of it: tools drop it.

const usage = object({
  costUsd: number(),
  credits: number(),
  units: keyed(number()),
});

const meta = object(
  { requestId: str, usage, warnings: texts() },
  [],
  "Request details from the provider: its request id, what it charged and any warnings."
);

const citation = object({ excerpts: texts(), title: str, url: str }, ["url"]);

const citations = list(citation);

const fieldSources = list(
  object(
    {
      citations,
      confidence: anything("The provider's own confidence label or score."),
      field: str,
      reasoning: str,
    },
    ["field", "citations"]
  ),
  "The sources the provider gave for each field."
);

const price = object({ amount: str, currency: str, formatted: str });

const searchResult = object(
  {
    author: str,
    content: str,
    favicon: str,
    image: str,
    kind: str,
    lastUpdatedAt: str,
    place: object({
      address: str,
      latitude: number(),
      longitude: number(),
    }),
    price,
    publishedAt: str,
    rating: number(),
    reviewCount: number(),
    score: number(),
    snippet: str,
    title: str,
    url: str,
  },
  ["url"]
);

const imageResult = object(
  {
    description: str,
    height: number(),
    sourceUrl: str,
    thumbnailUrl: str,
    title: str,
    url: str,
    width: number(),
  },
  ["url"]
);

const page = object(
  {
    author: str,
    description: str,
    excerpts: texts(),
    favicon: str,
    html: str,
    image: str,
    images: texts(),
    language: str,
    links: texts(),
    markdown: str,
    meta,
    publishedAt: str,
    rawHtml: str,
    screenshot: str,
    statusCode: number(),
    summary: str,
    title: str,
    url: str,
  },
  ["url"]
);

const failedUrls = list(object({ error: str, url: str }, ["url", "error"]));

const productImages = list(object({ alt: str, url: str }, ["url"]));

const variant = object({
  availability: str,
  gtin: str,
  id: str,
  images: productImages,
  inStock: flag(),
  originalPrice: price,
  price,
  sku: str,
  title: str,
  values: keyed(str),
});

const runStatus = choice(
  "completed for a finished run; partial for a run that stopped early (see stopReason) and still has output.",
  ["completed", "partial"]
);

const entity = object(
  {
    citations,
    data: anything("Values the run filled for the entity."),
    description: str,
    fields: fieldSources,
    matched: flag("Whether the entity met every condition."),
    name: str,
    url: str,
  },
  ["name"]
);

const decisionAnswer = object({
  choice: str,
  confidence: anything(),
  probabilities: keyed(number()),
  probability: number(),
  refusal: str,
});

const monitorInfo = object(
  {
    createdAt: str,
    id: str,
    schedule: str,
    status: str,
    watch: str,
    webhookUrl: str,
  },
  ["id"]
);

/** The result of `search_web`, a `SearchResponse`. */
export const SEARCH_OUTPUT: FieldSchema = object(
  {
    answer: str,
    images: list(imageResult),
    meta,
    results: list(searchResult),
  },
  ["results"]
);

/** The result of `search_images`, an `ImageSearch`. */
export const IMAGES_OUTPUT: FieldSchema = object(
  { meta, results: list(imageResult) },
  ["results"]
);

/** The result of `read_page`, a `Page`. */
export const PAGE_OUTPUT: FieldSchema = page;

/** The result of `read_pages`, a `PageBatch`: the pages read, and `failed` for URLs that could not be. */
export const PAGES_OUTPUT: FieldSchema = object(
  { failed: failedUrls, id: str, meta, pages: list(page) },
  ["pages", "failed"]
);

/** The result of `extract_values`, an `Extraction`. */
export const EXTRACT_OUTPUT: FieldSchema = object(
  {
    data: anything("The values, in the shape of the schema."),
    fields: fieldSources,
    meta,
  },
  ["data"]
);

/** The result of `read_product`, a `Product`. */
export const PRODUCT_OUTPUT: FieldSchema = object(
  {
    brand: str,
    category: str,
    description: str,
    images: productImages,
    meta,
    title: str,
    url: str,
    variants: list(variant),
  },
  ["variants"]
);

/** The result of `map_site`, a `SiteMap`. */
export const MAP_OUTPUT: FieldSchema = object(
  {
    links: list(object({ description: str, title: str, url: str }, ["url"])),
    meta,
  },
  ["links"]
);

/** The result of `crawl_site`, a `Crawl`. */
export const CRAWL_OUTPUT: FieldSchema = object(
  {
    failed: failedUrls,
    id: str,
    meta,
    pages: list(page),
    robotsBlocked: texts("URLs the site's robots.txt kept the crawl from."),
    total: number("Pages found to crawl, when the provider reports it."),
  },
  ["pages"]
);

/** The result of `answer_question`, an `Answer`. */
export const ANSWER_OUTPUT: FieldSchema = object(
  {
    answer: str,
    citations,
    continuationId: str,
    fields: fieldSources,
    meta,
    output: anything(
      "The answer in the shape of the schema, when one was given."
    ),
  },
  ["answer", "citations"]
);

/** The result of `research_question`, a `Research`. */
export const RESEARCH_OUTPUT: FieldSchema = object(
  {
    continuationId: str,
    fields: fieldSources,
    id: str,
    meta,
    output: anything("Values in the shape of the schema, or the report text."),
    retrieved: list(
      citation,
      "Every source the run looked at, when the provider lists them apart from what it cited."
    ),
    sources: list(citation, "The sources the output cites."),
    status: runStatus,
    stopReason: str,
  },
  ["id", "status", "output", "sources"]
);

/** The result of `find_entities`, a `Discovery`. */
export const DISCOVER_OUTPUT: FieldSchema = object(
  {
    entities: list(entity),
    id: str,
    meta,
    status: runStatus,
    stopReason: str,
  },
  ["id", "status", "entities"]
);

/** The result of `make_decisions`, a `Decisions`. */
export const DECIDE_OUTPUT: FieldSchema = object(
  {
    answers: keyed(
      decisionAnswer,
      "One answer per question, under the question's name."
    ),
    citations,
    meta,
  },
  ["answers", "citations"]
);

/** The result of `run_browser_script`, an `ActResult`. */
export const ACT_OUTPUT: FieldSchema = object(
  {
    error: str,
    exitCode: number(),
    killed: flag(),
    meta,
    result: anything("The value the script returned."),
    sessionId: str,
    stderr: str,
    stdout: str,
  },
  ["stdout", "stderr"]
);

/** The result of `open_browser`, a `BrowserSession`. */
export const OPEN_BROWSER_OUTPUT: FieldSchema = object(
  {
    cdpUrl: str,
    expiresAt: str,
    id: str,
    liveViewUrl: str,
    meta,
  },
  ["id"]
);

/** The result of `close_browser`: a confirmation, `{ closed: true, id }`. */
export const CLOSE_BROWSER_OUTPUT: FieldSchema = object(
  { closed: flag(), id: str },
  ["closed", "id"]
);

const box = object(
  { height: number(), left: number(), top: number(), width: number() },
  ["left", "top", "width", "height"],
  "Where it sits on the page, as fractions of the page's width and height from its top-left corner."
);

const documentBlock = object(
  {
    box,
    cells: list(
      object(
        {
          box,
          column: whole("The column, from 0.", 0),
          columnSpan: whole("Columns the cell spans.", 1),
          row: whole("The row, from 0.", 0),
          rowSpan: whole("Rows the cell spans.", 1),
          text: str,
        },
        ["row", "column", "text"]
      )
    ),
    page: whole("The physical page number, starting at 1.", 1),
    text: str,
    type: str,
    words: list(object({ box, text: str }, ["text", "box"])),
  },
  ["page", "type", "text"]
);

/** The result of `parse_document`, a `ParsedDocument`. */
export const PARSE_OUTPUT: FieldSchema = object(
  {
    blocks: list(documentBlock),
    id: str,
    markdown: str,
    meta,
    pageCount: whole("Pages in the file.", 0),
    pages: list(
      object(
        {
          markdown: str,
          pageNumber: whole("The physical page number, starting at 1.", 1),
        },
        ["pageNumber", "markdown"]
      )
    ),
  },
  ["markdown"]
);

/** The result of `create_monitor` and `get_monitor`, a `MonitorInfo`. */
export const MONITOR_OUTPUT: FieldSchema = monitorInfo;

/** The result of `list_monitors`: the `MonitorInfo`s, wrapped as `monitors`. */
export const MONITORS_OUTPUT: FieldSchema = object(
  { monitors: list(monitorInfo) },
  ["monitors"]
);

/** The result of `delete_monitor`: a confirmation, `{ deleted: true, id }`. */
export const DELETE_MONITOR_OUTPUT: FieldSchema = object(
  { deleted: flag(), id: str },
  ["deleted", "id"]
);

/** The result of `list_monitor_events`, a `MonitorEvents`. */
export const MONITOR_EVENTS_OUTPUT: FieldSchema = object(
  {
    events: list(
      object({
        at: str,
        citations,
        id: str,
        output: anything(),
        summary: str,
        url: str,
      })
    ),
    next: str,
  },
  ["events"]
);

/** The result of `check_usage`, an `AccountUsage`. */
export const USAGE_OUTPUT: FieldSchema = object({
  breakdown: keyed(number()),
  limit: number(),
  periodEnd: str,
  remaining: number(),
  used: number(),
});
