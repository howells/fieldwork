import { FieldworkError } from "../../errors.js";
import type {
  AccountUsage,
  ActResult,
  BrowserSession,
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
} from "../../types.js";
import {
  compact,
  list,
  meta,
  num,
  productImages,
  record,
  requireId,
  scalar,
  strings,
  text,
} from "../../util.js";
import type { Json } from "../../util.js";
import { PAGE_SIZE } from "./request.js";
import { provider, warnings } from "./shared.js";

/** Where each paper source's records live on the web, for results that carry only ids. */
const PAPER_URLS = new Map<string, (id: string) => string>([
  ["arxiv", (id) => `https://arxiv.org/abs/${id}`],
  ["pmid", (id) => `https://pubmed.ncbi.nlm.nih.gov/${id}/`],
  ["pmcid", (id) => `https://pmc.ncbi.nlm.nih.gov/articles/${id}/`],
  ["doi", (id) => `https://doi.org/${id}`],
]);

const LANGUAGE = /^(?<code>[a-z]{2})(?:[-_]|$)/u;

const firstText = (value: unknown): string | undefined =>
  Array.isArray(value)
    ? text(value.find((item) => typeof item === "string" && item !== ""))
    : text(value);

const languageCode = (value: unknown): string | undefined =>
  LANGUAGE.exec(firstText(value)?.toLowerCase() ?? "")?.groups?.code;

const excerptsOf = (data: Json): string[] | undefined => {
  const highlight = text(data.highlights);
  const highlights =
    highlight === undefined ? strings(data.highlights) : [highlight];
  const answer = text(data.answer);
  return highlights ?? (answer === undefined ? undefined : [answer]);
};

export const pageMeta = (top: Json, data: Json) => {
  const metadata = record(data.metadata);
  return meta({
    credits: metadata.creditsUsed,
    requestId: metadata.scrapeId,
    warnings: warnings(data.warning, top.warning),
  });
};

export const toPage = (
  data: Json,
  fallbackUrl: string,
  raw: unknown,
  top: Json = {}
): Page => {
  const metadata = record(data.metadata);
  return compact({
    author: firstText(metadata.author),
    description: firstText(metadata.description),
    excerpts: excerptsOf(data),
    favicon: text(metadata.favicon),
    html: text(data.html),
    image: firstText(metadata.ogImage) ?? firstText(metadata["og:image"]),
    images: strings(data.images),
    language: languageCode(metadata.language),
    links: strings(data.links),
    markdown: text(data.markdown),
    meta: pageMeta(top, data),
    publishedAt:
      text(metadata.publishedTime) ?? text(metadata["article:published_time"]),
    raw,
    rawHtml: text(data.rawHtml),
    screenshot: text(data.screenshot),
    statusCode: num(metadata.statusCode),
    summary: text(data.summary),
    title: firstText(metadata.title),
    url: text(metadata.url) ?? text(metadata.sourceURL) ?? fallbackUrl,
  });
};

const price = (value: unknown): Price | undefined => {
  const item = record(value);
  const result = compact({
    amount: text(item.amount) ?? num(item.amount)?.toString(),
    currency: text(item.currency),
    formatted: text(item.formatted),
  });
  return Object.keys(result).length > 0 ? result : undefined;
};

const gtin = (variant: Json): string | undefined => {
  for (const key of ["gtin", "gtin14", "gtin13", "gtin12", "gtin8"]) {
    const value = scalar(variant[key]);
    if (value !== undefined && value !== "") {
      return value;
    }
  }
  return undefined;
};

const toVariant = (value: unknown): ProductVariant => {
  const variant = record(value);
  const availability = record(variant.availability);
  const values = Object.fromEntries(
    Object.entries(record(variant.values)).flatMap(([key, item]) => {
      const option = scalar(item);
      return option === undefined ? [] : [[key, option]];
    })
  );
  return compact({
    availability: text(availability.text),
    gtin: gtin(variant),
    id: text(variant.id),
    images: productImages(variant.images),
    inStock:
      typeof availability.inStock === "boolean"
        ? availability.inStock
        : undefined,
    originalPrice: price(record(variant.sale).originalPrice),
    price: price(variant.price),
    sku: text(variant.sku),
    title: text(variant.title),
    values: Object.keys(values).length > 0 ? values : undefined,
  });
};

const allImages = (variants: ProductVariant[]): ProductImage[] | undefined => {
  const seen = new Map<string, ProductImage>();
  for (const image of variants.flatMap((variant) => variant.images ?? [])) {
    if (!seen.has(image.url)) {
      seen.set(image.url, image);
    }
  }
  return seen.size > 0 ? [...seen.values()] : undefined;
};

export const toProduct = (url: string, response: Json, data: Json): Product => {
  const product = record(data.product);
  if (product !== data.product) {
    const why = text(data.warning) ?? text(response.warning);
    throw new FieldworkError(
      "NotFound",
      `firecrawl found no product on ${url}${why === undefined ? "" : `: ${why}`}`,
      { cause: response, provider }
    );
  }
  const variants = list(product.variants).map((variant) => toVariant(variant));
  return compact({
    brand: text(product.brand),
    category: text(product.category),
    description: text(product.description),
    images: productImages(product.images) ?? allImages(variants),
    meta: pageMeta(response, data),
    raw: response,
    title: text(product.title),
    url: text(product.url),
    variants,
  });
};

const searchItem = (item: unknown, kind: string): SearchResult => {
  const result = record(item);
  return compact({
    content: text(result.markdown),
    image: text(result.imageUrl),
    kind: text(result.category) ?? kind,
    publishedAt: text(result.date),
    snippet: text(result.description) ?? text(result.snippet),
    title: text(result.title),
    url: text(result.url) ?? "",
  });
};

const paperItem = (item: unknown): SearchResult => {
  const paper = record(item);
  const paperId = text(paper.paperId) ?? "";
  const primary = text(paper.primaryId) ?? paperId;
  const colon = primary.indexOf(":");
  const resolve =
    colon > 0 ? PAPER_URLS.get(primary.slice(0, colon)) : undefined;
  return compact({
    kind: "research",
    score: num(paper.score),
    snippet: text(paper.abstract),
    title: text(paper.title),
    url: paperId.startsWith("web:")
      ? paperId.slice("web:".length)
      : (resolve?.(primary.slice(colon + 1)) ?? primary),
  });
};

const imageItems = (value: unknown): ImageResult[] =>
  list(value).flatMap((item) => {
    const image = record(item);
    const url = text(image.imageUrl);
    return url === undefined
      ? []
      : [
          compact({
            height: num(image.imageHeight),
            sourceUrl: text(image.url),
            title: text(image.title),
            url,
            width: num(image.imageWidth),
          }),
        ];
  });

const searchMeta = (response: Json) =>
  meta({
    credits: response.creditsUsed,
    requestId: response.id,
    warnings: warnings(response.warning, response.warnings),
  });

export const searchResult = (response: Json): SearchResponse => {
  const data = record(response.data);
  return compact({
    images: Array.isArray(data.images) ? imageItems(data.images) : undefined,
    meta: searchMeta(response),
    raw: response,
    results: [
      ...list(data.web).map((item) => searchItem(item, "web")),
      ...list(data.news).map((item) => searchItem(item, "news")),
      ...list(data.research).map((item) => paperItem(item)),
    ],
  });
};

export const imagesResult = (response: Json) =>
  compact({
    meta: searchMeta(response),
    raw: response,
    results: imageItems(record(response.data).images),
  });

export const failedPages = (errors: Json): FailedUrl[] =>
  list(errors.errors).map((item) => {
    const entry = record(item);
    return {
      error: text(entry.error) ?? "unknown error",
      url: text(entry.url) ?? "",
    };
  });

export const researchState = (id: string, status: Json): Json | undefined => {
  const state = text(status.status);
  const hasPartial = status.partial !== undefined && status.partial !== null;
  const done = state === "completed" || (state === "failed" && hasPartial);
  if (!done && (state === "failed" || state === "cancelled")) {
    throw new FieldworkError(
      "JobFailed",
      `firecrawl research run ${id} ${state}: ${text(status.error) ?? text(status.stopReason) ?? "no reason given"}`,
      { cause: status, provider }
    );
  }
  return done ? status : undefined;
};

export const researchResult = <T>(
  id: string,
  started: Json,
  run: Json
): Research<T> => {
  const stopped = run.status === "failed";
  const status: RunStatus = stopped ? "partial" : "completed";
  return compact({
    continuationId: text(run.threadId) ?? text(started.threadId),
    id,
    meta: meta({
      credits: run.creditsUsed,
      requestId: id,
      warnings: stopped
        ? [
            run.message,
            run.partialSchemaValid === false
              ? "the partial output does not match the schema"
              : undefined,
          ]
        : undefined,
    }),
    // SAFETY: the caller's schema describes T; Fieldwork does not validate provider output against it.
    output: (stopped ? run.partial : (run.data ?? run.message)) as T,
    raw: run,
    sources: [],
    status,
    stopReason: stopped
      ? (text(run.stopReason) ?? text(run.error) ?? "failed")
      : undefined,
  });
};

export const actResult = (
  result: Json,
  sessionId: string | undefined,
  closed: Json | null
): ActResult => {
  const stdout = text(result.stdout) ?? "";
  const failure =
    result.success === false
      ? "firecrawl reported that the script did not succeed"
      : undefined;
  // The documented `result` repeats stdout; it is a value only when it differs.
  const repeated =
    result.result === "" || result.result === null || result.result === stdout;
  return compact({
    error: text(result.error) ?? failure,
    exitCode: num(result.exitCode),
    killed: typeof result.killed === "boolean" ? result.killed : undefined,
    meta: meta({ credits: closed?.creditsBilled }),
    raw: result,
    result: repeated ? undefined : result.result,
    sessionId,
    stderr: text(result.stderr) ?? "",
    stdout,
  });
};

export const browserSession = (response: Json): BrowserSession =>
  compact({
    cdpUrl: text(response.cdpUrl),
    expiresAt: text(response.expiresAt),
    id: requireId(provider, response.id),
    liveViewUrl: text(response.liveViewUrl),
    raw: response,
  });

export const parseResult = (response: Json): ParsedDocument => {
  const data = record(response.data);
  const metadata = record(data.metadata);
  return compact({
    markdown: text(data.markdown) ?? "",
    pages: Array.isArray(data.pages)
      ? list(data.pages).map((page) => ({
          markdown: text(record(page).markdown) ?? "",
          pageNumber: Number(record(page).pageNumber),
        }))
      : undefined,
    blocks: Array.isArray(data.blocks) ? data.blocks : undefined,
    // totalPages is the file's own count; numPages stops at maxPages.
    pageCount: num(metadata.totalPages) ?? num(metadata.numPages),
    meta: pageMeta(response, data),
    raw: response,
  });
};

const watching = (monitor: Json): string | undefined => {
  const goal = text(monitor.goal);
  if (goal !== undefined) {
    return goal;
  }
  const targets = list(monitor.targets).map((item) => record(item));
  const watched = targets.flatMap((target) => {
    if (target.type === "scrape") {
      return strings(target.urls) ?? [];
    }
    if (target.type === "crawl") {
      return [text(target.url)];
    }
    return strings(target.queries) ?? [];
  });
  return watched.filter((item) => item !== undefined).join(", ") || undefined;
};

export const monitorInfo = (value: unknown): MonitorInfo => {
  const monitor = record(value);
  const schedule = record(monitor.schedule);
  return compact({
    createdAt: text(monitor.createdAt),
    id: requireId(provider, monitor.id),
    raw: monitor,
    schedule: text(schedule.cron) ?? text(schedule.text),
    status: text(monitor.status),
    watch: watching(monitor),
    webhookUrl: text(record(monitor.webhook).url),
  });
};

const checkEvent = (check: Json): MonitorEvent => {
  const summary = record(check.summary);
  const counts = (["changed", "new", "removed", "error"] as const).flatMap(
    (key) => {
      const count = num(summary[key]);
      return count === undefined ? [] : [`${count} ${key}`];
    }
  );
  const pages = num(summary.totalPages);
  const of = pages === undefined ? "" : ` of ${pages} pages`;
  return compact({
    at:
      text(check.finishedAt) ??
      text(check.startedAt) ??
      text(check.scheduledFor) ??
      text(check.createdAt),
    id: text(check.id),
    raw: check,
    summary: [
      text(check.status),
      counts.length > 0 ? `${counts.join(", ")}${of}` : undefined,
      text(check.error),
    ]
      .filter((part) => part !== undefined)
      .join(": "),
  });
};

export const monitorEvents = (
  response: Json,
  offset: number
): MonitorEvents => {
  const checks = list(response.data).map((item) => record(item));
  return compact({
    events: checks.map((check) => checkEvent(check)),
    next:
      checks.length === PAGE_SIZE ? String(offset + checks.length) : undefined,
    raw: response,
  });
};

export const usageResult = (response: Json): AccountUsage => {
  const data = record(response.data);
  return compact({
    limit: num(data.planCredits),
    periodEnd: text(data.billingPeriodEnd),
    raw: response,
    remaining: num(data.remainingCredits),
  });
};
