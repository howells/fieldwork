import { defineAdapter } from "../../src/adapter.js";
import { createRawClient } from "../../src/http.js";
import type { FieldSchema } from "../../src/tool-specs/schema.js";
import { isJsonObject, isList } from "../../src/tools/json.js";
import type { JsonValue } from "../../src/tools/json.js";
import type {
  AccountUsage,
  ActResult,
  Answer,
  BrowserSession,
  Citation,
  Crawl,
  Decisions,
  Discovery,
  Extraction,
  FieldSource,
  ImageSearch,
  Meta,
  MonitorEvents,
  MonitorInfo,
  Page,
  PageBatch,
  ParsedDocument,
  Product,
  Research,
  SearchResponse,
  SiteMap,
} from "../../src/types.js";
import { fakeFetch } from "../helpers.js";

/**
 * An adapter that answers every capability with a result that sets every field
 * of its type, including a provider response in `raw` that contains the word
 * "secret". It shows that each output schema declares every field a tool can
 * return, and that tools never pass `raw` on.
 */

const raw = { secret: "the provider's response" };

const meta: Meta = {
  requestId: "req_1",
  usage: { costUsd: 0.01, credits: 2, units: { tokens: 10 } },
  warnings: ["a page was cut short"],
};

const citation: Citation = {
  excerpts: ["a passage"],
  title: "A source",
  url: "https://a.test/source",
};

const fieldSource: FieldSource = {
  citations: [citation],
  confidence: "high",
  field: "width",
  reasoning: "stated on the page",
};

const page: Page = {
  author: "A. Writer",
  description: "A page",
  excerpts: ["a passage"],
  favicon: "https://a.test/favicon.ico",
  html: "<p>text</p>",
  image: "https://a.test/og.png",
  images: ["https://a.test/1.png"],
  language: "en",
  links: ["https://a.test/next"],
  markdown: "text",
  meta,
  publishedAt: "2026-01-01",
  raw,
  rawHtml: "<html></html>",
  screenshot: "https://a.test/shot.png",
  statusCode: 200,
  summary: "short",
  title: "Page",
  url: "https://a.test/p",
};

const search: SearchResponse = {
  answer: "An answer",
  images: [{ title: "Image", url: "https://a.test/i.png" }],
  meta,
  raw,
  results: [
    {
      author: "A. Writer",
      content: "text",
      favicon: "https://a.test/favicon.ico",
      image: "https://a.test/og.png",
      kind: "shopping",
      lastUpdatedAt: "2026-02-01",
      place: { address: "1 Main St", latitude: 1, longitude: 2 },
      price: { amount: "12.50", currency: "USD", formatted: "$12.50" },
      publishedAt: "2026-01-01",
      rating: 4.5,
      reviewCount: 10,
      score: 0.9,
      snippet: "a passage",
      title: "Result",
      url: "https://a.test/r",
    },
  ],
};

const images: ImageSearch = {
  meta,
  raw,
  results: [
    {
      description: "An image",
      height: 20,
      sourceUrl: "https://a.test/p",
      thumbnailUrl: "https://a.test/t.png",
      title: "Image",
      url: "https://a.test/i.png",
      width: 10,
    },
  ],
};

const batch: PageBatch = {
  failed: [{ error: "not found", url: "https://a.test/gone" }],
  id: "batch_1",
  meta,
  pages: [page],
  raw,
};

const extraction: Extraction<{ raw: string; width: string }> = {
  data: { raw: "kept: this is a value", width: "30 cm" },
  fields: [fieldSource],
  meta,
  raw,
};

const product: Product = {
  brand: "Portmore",
  category: "Tile",
  description: "A tile",
  images: [{ alt: "front", url: "https://a.test/t.png" }],
  meta,
  raw,
  title: "Aqua",
  url: "https://a.test/p",
  variants: [
    {
      availability: "Ships in 2 weeks",
      gtin: "0123456789012",
      id: "v1",
      images: [{ alt: "front", url: "https://a.test/t.png" }],
      inStock: true,
      originalPrice: { amount: "15.00", currency: "USD" },
      price: { amount: "12.50", currency: "USD", formatted: "$12.50" },
      sku: "AQ-1",
      title: "3x8",
      values: { color: "Aqua" },
    },
  ],
};

const siteMap: SiteMap = {
  links: [{ description: "d", title: "t", url: "https://a.test/x" }],
  meta,
  raw,
};

const crawl: Crawl = {
  failed: [{ error: "blocked", url: "https://a.test/b" }],
  id: "crawl_1",
  meta,
  pages: [page],
  raw,
  robotsBlocked: ["https://a.test/private"],
  total: 12,
};

const answer: Answer<{ width: string }> = {
  answer: "30 cm",
  citations: [citation],
  continuationId: "cont_1",
  fields: [fieldSource],
  meta,
  output: { width: "30 cm" },
  raw,
};

const research: Research<string> = {
  continuationId: "cont_2",
  fields: [fieldSource],
  id: "run_1",
  meta,
  output: "A report",
  raw,
  retrieved: [citation],
  sources: [citation],
  status: "partial",
  stopReason: "step limit",
};

const discovery: Discovery<{ raw: string }> & { stopReason: string } = {
  entities: [
    {
      citations: [citation],
      data: { raw: "kept: this is a value" },
      description: "Makes tile",
      fields: [fieldSource],
      matched: true,
      name: "Portmore",
      url: "https://portmore.test",
    },
  ],
  id: "find_1",
  meta,
  raw,
  status: "partial",
  stopReason: "budget",
};

const decisions: Decisions = {
  answers: {
    fit: {
      choice: "yes",
      confidence: "high",
      probabilities: { no: 0.1, yes: 0.9 },
      probability: 0.9,
      refusal: "no basis for part of it",
    },
  },
  citations: [citation],
  meta,
  raw,
};

const act: ActResult = {
  error: "boom",
  exitCode: 1,
  killed: true,
  meta,
  raw,
  result: { raw: "kept: the script returned this" },
  sessionId: "sess_1",
  stderr: "e",
  stdout: "o",
};

const session: BrowserSession = {
  cdpUrl: "wss://b.test/cdp",
  expiresAt: "2026-01-01T00:00:00Z",
  id: "sess_1",
  liveViewUrl: "https://b.test/live",
  meta,
  raw,
};

const parsed: ParsedDocument = {
  blocks: [{ type: "text" }],
  markdown: "text",
  meta,
  pageCount: 1,
  pages: [{ markdown: "text", pageNumber: 1 }],
  raw,
};

const monitor: MonitorInfo = {
  createdAt: "2026-01-01T00:00:00Z",
  id: "mon_1",
  raw,
  schedule: "1d",
  status: "active",
  watch: "tile news",
  webhookUrl: "https://hook.test/in",
};

const events: MonitorEvents = {
  events: [
    {
      at: "2026-01-02T00:00:00Z",
      citations: [citation],
      id: "ev_1",
      output: { raw: "kept: an event value" },
      raw,
      summary: "a new line",
      url: "https://a.test/new",
    },
  ],
  next: "c2",
  raw,
};

const usage: AccountUsage = {
  breakdown: { search: 3 },
  limit: 100,
  periodEnd: "2026-02-01T00:00:00Z",
  raw,
  remaining: 90,
  used: 10,
};

export const rich = defineAdapter({
  name: "rich",
  operations: {
    act: async () => act,
    answer: async () => answer,
    browser: {
      close: async () => {
        // closing returns nothing
      },
      open: async () => session,
    },
    crawl: async () => crawl,
    decide: async () => decisions,
    discover: async () => discovery,
    extract: async () => extraction,
    images: async () => images,
    map: async () => siteMap,
    monitor: {
      create: async () => monitor,
      delete: async () => {
        // deleting returns nothing
      },
      events: async () => events,
      get: async () => monitor,
      list: async () => [monitor],
    },
    parse: async () => parsed,
    product: async () => product,
    read: async () => page,
    readMany: async () => batch,
    research: async () => research,
    search: async () => search,
    usage: async () => usage,
  },
  raw: createRawClient({
    baseUrl: "https://rich.test",
    fetch: fakeFetch().fetch,
    headers: {},
    provider: "rich",
  }),
});

/**
 * The paths in `value` that `schema` does not declare, so a field a tool
 * returns but its output schema never mentions is found.
 */
export const undeclared = (
  schema: FieldSchema,
  value: JsonValue | undefined,
  path: string
): string[] => {
  if (isList(value)) {
    return value.flatMap((item, index) =>
      undeclared(schema.items ?? {}, item, `${path}[${index}]`)
    );
  }
  if (!isJsonObject(value) || schema.type !== "object") {
    return [];
  }
  return Object.entries(value).flatMap(([key, item]) => {
    const declared = schema.properties?.[key] ?? schema.additionalProperties;
    if (declared === undefined || declared === false) {
      return [`${path}.${key}`];
    }
    return declared === true
      ? []
      : undeclared(declared, item, `${path}.${key}`);
  });
};
