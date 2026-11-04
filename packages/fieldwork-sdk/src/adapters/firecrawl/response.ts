// Maps Firecrawl's parsed responses to normalized results.
// The adapter in ../firecrawl.ts calls these; the response schemas are in shapes.ts and the request bodies in request.ts.

import { FieldworkError } from "../../errors.js";
import type {
  ActResult,
  BrowserSession,
  DocumentBlock,
  FailedUrl,
  ImageResult,
  MonitorEvent,
  MonitorEvents,
  MonitorInfo,
  Page,
  ParsedDocument,
  Price,
  Product,
  ProductImage,
  ProductVariant,
  Research,
  RunStatus,
  SearchResponse,
  SearchResult,
  AccountUsage,
} from "../../types.js";
import { compact, meta, requireJobId } from "../../util.js";
import { PAGE_SIZE } from "./request.js";
import type {
  AgentRunBlock,
  BatchErrorsBlock,
  CheckBlock,
  ClosedBlock,
  ExecutionBlock,
  ImageItemBlock,
  MonitorBlock,
  PageDataBlock,
  PaperBlock,
  ParseBody,
  ParsePageBlock,
  PriceBlock,
  RunStartBlock,
  ScrapeBody,
  SearchBody,
  SessionBlock,
  UsageBody,
  VariantBlock,
  WebItemBlock,
} from "./shapes.js";
import { provider } from "./shared.js";

/** Where each paper source's records live on the web, for results that carry only ids. */
const PAPER_URLS = new Map<string, (id: string) => string>([
  ["arxiv", (id) => `https://arxiv.org/abs/${id}`],
  ["pmid", (id) => `https://pubmed.ncbi.nlm.nih.gov/${id}/`],
  ["pmcid", (id) => `https://pmc.ncbi.nlm.nih.gov/articles/${id}/`],
  ["doi", (id) => `https://doi.org/${id}`],
]);

const LANGUAGE = /^(?<code>[a-z]{2})(?:[-_]|$)/u;

/** The list, or undefined when it is empty. */
const some = <T>(items: readonly T[]): T[] | undefined =>
  items.length > 0 ? [...items] : undefined;

/** The two-letter code of a locale such as `en-GB` or `en_GB`. */
const languageCode = (value: string | undefined): string | undefined =>
  LANGUAGE.exec(value?.toLowerCase() ?? "")?.groups?.code;

/** The passages for a page: the `highlights` text, else the highlight list, else the written `answer` of a `question` query. */
const excerptsOf = (data: PageDataBlock): string[] | undefined => {
  const { list, text } = data.highlights;
  const highlights = text === undefined ? some(list) : [text];
  return highlights ?? (data.answer === undefined ? undefined : [data.answer]);
};

/** The credits and scrape id of a page, with its warnings and those of the whole response. */
export const pageMeta = (
  data: Pick<PageDataBlock, "metadata" | "warning">,
  topNotes: readonly string[]
) =>
  meta({
    credits: data.metadata.creditsUsed,
    requestId: data.metadata.scrapeId,
    warnings: [...data.warning.notes, ...topNotes],
  });

/** A page from scraped data; the caller adds `raw`. `topNotes` are the warnings of the whole response. */
export const toPage = (
  data: PageDataBlock,
  fallbackUrl: string,
  topNotes: readonly string[] = []
): Omit<Page, "raw"> => {
  const { metadata } = data;
  return compact({
    author: metadata.author,
    description: metadata.description,
    excerpts: excerptsOf(data),
    favicon: metadata.favicon,
    html: data.html,
    image: metadata.ogImage ?? metadata["og:image"],
    images: some(data.images),
    language: languageCode(metadata.language),
    links: some(data.links),
    markdown: data.markdown,
    meta: pageMeta(data, topNotes),
    publishedAt: metadata.publishedTime ?? metadata["article:published_time"],
    rawHtml: data.rawHtml,
    screenshot: data.screenshot,
    statusCode: metadata.statusCode,
    summary: data.summary,
    title: metadata.title,
    url: metadata.url ?? metadata.sourceURL ?? fallbackUrl,
  });
};

/** A price; undefined when Firecrawl gave none of its fields. */
const price = (item: PriceBlock): Price | undefined => {
  const result = compact({
    amount: item.amount,
    currency: item.currency,
    formatted: item.formatted,
  });
  return Object.keys(result).length > 0 ? result : undefined;
};

/** The first non-empty GTIN, from `gtin` then the 14, 13, 12 and 8 digit forms. */
const gtin = (variant: VariantBlock): string | undefined =>
  [
    variant.gtin,
    variant.gtin14,
    variant.gtin13,
    variant.gtin12,
    variant.gtin8,
  ].find((value) => value !== undefined && value !== "");

const images = (
  found: readonly (ProductImage | undefined)[]
): ProductImage[] | undefined =>
  some(found.filter((image) => image !== undefined));

const toVariant = (variant: VariantBlock): ProductVariant => {
  const values = Object.fromEntries(
    Object.entries(variant.values).flatMap(([key, item]) =>
      item === undefined ? [] : [[key, item]]
    )
  );
  return compact({
    availability: variant.availability.text,
    gtin: gtin(variant),
    id: variant.id,
    images: images(variant.images),
    inStock: variant.availability.inStock,
    originalPrice: price(variant.sale.originalPrice),
    price: price(variant.price),
    sku: variant.sku,
    title: variant.title,
    values: Object.keys(values).length > 0 ? values : undefined,
  });
};

/** The variants' images without repeats, by URL. Used when the product lists none of its own. */
const allImages = (variants: ProductVariant[]): ProductImage[] | undefined => {
  const seen = new Map<string, ProductImage>();
  for (const image of variants.flatMap((variant) => variant.images ?? [])) {
    if (!seen.has(image.url)) {
      seen.set(image.url, image);
    }
  }
  return seen.size > 0 ? [...seen.values()] : undefined;
};

/** The product on a scraped page; the caller adds `raw`. Undefined when the page has none. */
export const toProduct = (
  body: ScrapeBody
): Omit<Product, "raw"> | undefined => {
  const { product } = body.data;
  if (product === undefined) {
    return undefined;
  }
  const variants = product.variants.map((variant) => toVariant(variant));
  return compact({
    brand: product.brand,
    category: product.category,
    description: product.description,
    images: images(product.images) ?? allImages(variants),
    meta: pageMeta(body.data, body.warning.notes),
    title: product.title,
    url: product.url,
    variants,
  });
};

/** Why a page has no product: the warning it carries, if any. */
export const noProductReason = (body: ScrapeBody): string | undefined =>
  body.data.warning.text ?? body.warning.text;

/** A web or news result. `kind` is the result's own category, else its source; `snippet` is its description, else its snippet. */
const searchItem = (result: WebItemBlock, kind: string): SearchResult =>
  compact({
    content: result.markdown,
    image: result.imageUrl,
    kind: result.category ?? kind,
    publishedAt: result.date,
    snippet: result.description ?? result.snippet,
    title: result.title,
    url: result.url ?? "",
  });

/**
 * A research result. Papers carry ids rather than URLs: a `web:` id holds the
 * URL itself, and an `arxiv`, `pmid`, `pmcid` or `doi` id resolves through
 * `PAPER_URLS`. Any other id is used as it is.
 */
const paperItem = (paper: PaperBlock): SearchResult => {
  const paperId = paper.paperId ?? "";
  const primary = paper.primaryId ?? paperId;
  const colon = primary.indexOf(":");
  const resolve =
    colon > 0 ? PAPER_URLS.get(primary.slice(0, colon)) : undefined;
  return compact({
    kind: "research",
    score: paper.score,
    snippet: paper.abstract,
    title: paper.title,
    url: paperId.startsWith("web:")
      ? paperId.slice("web:".length)
      : (resolve?.(primary.slice(colon + 1)) ?? primary),
  });
};

/** Image results. `sourceUrl` is the page the image is on; an item without an image URL is dropped. */
const imageItems = (found: readonly ImageItemBlock[]): ImageResult[] =>
  found.flatMap((image) => {
    const { imageUrl: url } = image;
    return url === undefined
      ? []
      : [
          compact({
            height: image.imageHeight,
            sourceUrl: image.url,
            title: image.title,
            url,
            width: image.imageWidth,
          }),
        ];
  });

/** The credits, request id and warnings of a search. */
const searchMeta = (body: SearchBody) =>
  meta({
    credits: body.creditsUsed,
    requestId: body.id,
    warnings: [...body.warning, ...body.warnings],
  });

/** The results of a search, web then news then research; the caller adds `raw`. Images are kept apart in `images`. */
export const searchResult = (body: SearchBody): Omit<SearchResponse, "raw"> => {
  const { data } = body;
  return compact({
    images: data.images === undefined ? undefined : imageItems(data.images),
    meta: searchMeta(body),
    results: [
      ...data.web.map((item) => searchItem(item, "web")),
      ...data.news.map((item) => searchItem(item, "news")),
      ...data.research.map((item) => paperItem(item)),
    ],
  });
};

/** The image results of a search for images; the caller adds `raw`. */
export const imagesResult = (body: SearchBody) =>
  compact({
    meta: searchMeta(body),
    results: imageItems(body.data.images ?? []),
  });

/** The pages a crawl or batch could not read. */
export const failedPages = (errors: BatchErrorsBlock): FailedUrl[] =>
  errors.value.errors.map((entry) => ({
    error: entry.error ?? "unknown error",
    url: entry.url ?? "",
  }));

/**
 * The run when it has finished, undefined while it runs. A `failed` run that
 * left partial output counts as finished; any other `failed` or `cancelled`
 * run throws `JobFailed`.
 */
export const researchState = (
  id: string,
  entry: AgentRunBlock
): AgentRunBlock | undefined => {
  const status = entry.value;
  const state = status.status;
  const hasPartial = status.partial !== undefined && status.partial !== null;
  const done = state === "completed" || (state === "failed" && hasPartial);
  if (!done && (state === "failed" || state === "cancelled")) {
    throw new FieldworkError(
      "JobFailed",
      `firecrawl research run ${id} ${state}: ${status.error ?? status.stopReason ?? "no reason given"}`,
      { cause: entry.original, provider }
    );
  }
  return done ? entry : undefined;
};

/**
 * The result of a finished run. A `failed` run with partial output is
 * `partial`, with that output and a `stopReason`; any other is `completed`
 * with `data`, else the message. `sources` is always empty. The continuation
 * id is the run's thread.
 */
export const researchResult = (
  id: string,
  started: RunStartBlock,
  entry: AgentRunBlock
): Research<unknown> => {
  const run = entry.value;
  const stopped = run.status === "failed";
  const status: RunStatus = stopped ? "partial" : "completed";
  return compact({
    continuationId: run.threadId ?? started.value.threadId,
    id,
    meta: meta({
      credits: run.creditsUsed,
      requestId: id,
      warnings: stopped
        ? [
            run.message.note,
            run.partialSchemaValid === false
              ? "the partial output does not match the schema"
              : undefined,
          ].filter((note) => note !== undefined)
        : undefined,
    }),
    output: stopped ? run.partial : (run.data ?? run.message.value),
    raw: entry.original,
    sources: [],
    status,
    stopReason: stopped ? (run.stopReason ?? run.error ?? "failed") : undefined,
  });
};

/**
 * The outcome of a script. `sessionId` is set only when the session is still
 * open or could not be closed; `close` is what closing it returned.
 */
export const actResult = (
  entry: ExecutionBlock,
  sessionId: string | undefined,
  close: { closed?: ClosedBlock; failure?: string }
): ActResult => {
  const result = entry.value;
  const stdout = result.stdout ?? "";
  const failure =
    result.success === false
      ? "firecrawl reported that the script did not succeed"
      : undefined;
  // The documented `result` repeats stdout; it is a value only when it differs.
  const repeated =
    result.result === "" || result.result === null || result.result === stdout;
  return compact({
    error: result.error ?? failure,
    exitCode: result.exitCode,
    killed: result.killed,
    meta: meta({
      credits: close.closed?.creditsBilled,
      warnings: close.failure,
    }),
    raw: entry.original,
    result: repeated ? undefined : result.result,
    sessionId,
    stderr: result.stderr ?? "",
    stdout,
  });
};

/** An open browser session. Throws `ProviderError` when Firecrawl returned no id. */
export const browserSession = (entry: SessionBlock): BrowserSession => {
  const session = entry.value;
  return compact({
    cdpUrl: session.cdpUrl,
    expiresAt: session.expiresAt,
    id: requireJobId(provider, session.id),
    liveViewUrl: session.liveViewUrl,
    raw: entry.original,
  });
};

/** Firecrawl's blocks, a page at a time; a page without a number is left out. `box` is set only when `bbox` has four numbers. */
const documentBlocks = (pages: readonly ParsePageBlock[]): DocumentBlock[] =>
  pages.flatMap((entry) => {
    const page = entry.pageNumber;
    if (page === undefined) {
      return [];
    }
    return entry.items.map((item) => {
      const [x0, y0, x1, y1] = item.bbox;
      return compact({
        box:
          item.bbox.length === 4 &&
          x0 !== undefined &&
          y0 !== undefined &&
          x1 !== undefined &&
          y1 !== undefined
            ? { height: y1 - y0, left: x0, top: y0, width: x1 - x0 }
            : undefined,
        page,
        text: item.content ?? "",
        type: item.type ?? "unknown",
      });
    });
  });

/** A parsed document; the caller adds `raw`. */
export const parseResult = (body: ParseBody): Omit<ParsedDocument, "raw"> => {
  const { data } = body;
  return compact({
    markdown: data.markdown ?? "",
    pages: data.pages?.map((page) => ({
      markdown: page.markdown ?? "",
      pageNumber: Number(page.pageNumber),
    })),
    blocks: data.blocks && documentBlocks(data.blocks),
    // totalPages is the file's own count; numPages stops at maxPages.
    pageCount: data.metadata.totalPages ?? data.metadata.numPages,
    meta: pageMeta(data, body.warning.notes),
  });
};

/** What a monitor watches: its goal, else its target URLs or queries joined with commas. */
const watching = (monitor: MonitorBlock["value"]): string | undefined => {
  if (monitor.goal !== undefined) {
    return monitor.goal;
  }
  const watched = monitor.targets.flatMap((target) => {
    if (target.type === "scrape") {
      return target.urls;
    }
    if (target.type === "crawl") {
      return [target.url];
    }
    return target.queries;
  });
  return watched.filter((item) => item !== undefined).join(", ") || undefined;
};

/** A monitor. `schedule` is its cron expression, else Firecrawl's text for it. */
export const monitorInfo = (entry: MonitorBlock): MonitorInfo => {
  const monitor = entry.value;
  return compact({
    createdAt: monitor.createdAt,
    id: requireJobId(provider, monitor.id),
    raw: entry.original,
    schedule: monitor.schedule.cron ?? monitor.schedule.text,
    status: monitor.status,
    watch: watching(monitor),
    webhookUrl: monitor.webhook.url,
  });
};

/**
 * One check of a monitor as an event. The summary reads like
 * `completed: 2 changed, 1 new of 40 pages`, and the time is when the check
 * finished, else started, was scheduled or was created.
 */
const checkEvent = (entry: CheckBlock): MonitorEvent => {
  const check = entry.value;
  const { summary } = check;
  const counts = (["changed", "new", "removed", "error"] as const).flatMap(
    (key) => {
      const count = summary[key];
      return count === undefined ? [] : [`${count} ${key}`];
    }
  );
  const pages = summary.totalPages;
  const of = pages === undefined ? "" : ` of ${pages} pages`;
  return compact({
    at:
      check.finishedAt ??
      check.startedAt ??
      check.scheduledFor ??
      check.createdAt,
    id: check.id,
    raw: entry.original,
    summary: [
      check.status,
      counts.length > 0 ? `${counts.join(", ")}${of}` : undefined,
      check.error,
    ]
      .filter((part) => part !== undefined)
      .join(": "),
  });
};

/**
 * One page of a monitor's checks; the caller adds `raw`. The cursor is the
 * offset of the next page, set only when this page is full. Firecrawl caps a
 * page at 100 and reports no total, so when the checks end exactly on a page
 * boundary the cursor leads to an empty page.
 */
export const monitorEvents = (
  checks: readonly CheckBlock[],
  offset: number
): Omit<MonitorEvents, "raw"> =>
  compact({
    events: checks.map((check) => checkEvent(check)),
    next:
      checks.length === PAGE_SIZE ? String(offset + checks.length) : undefined,
  });

/** The account's credit usage; the caller adds `raw`. */
export const usageResult = (body: UsageBody): Omit<AccountUsage, "raw"> =>
  compact({
    limit: body.data.planCredits,
    periodEnd: body.data.billingPeriodEnd,
    remaining: body.data.remainingCredits,
  });
