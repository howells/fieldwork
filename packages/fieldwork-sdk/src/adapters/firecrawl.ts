import { defineAdapter } from "../adapter.js";
import { FieldworkError } from "../errors.js";
import { createRawClient, poll, requireKey } from "../http.js";
import type {
  ActResult,
  CallOptions,
  Crawl,
  DocumentInput,
  Extraction,
  JsonSchema,
  Page,
  ParsedDocument,
  Product,
  ProductVariant,
  Research,
  SearchResponse,
  SearchResult,
  SiteMap,
} from "../types.js";
import {
  callSettings,
  compact,
  list,
  num,
  record,
  requireId,
  scalar,
  strings,
  text,
} from "../util.js";
import type { Json } from "../util.js";

export interface FirecrawlConfig {
  /** Defaults to the FIRECRAWL_API_KEY environment variable. */
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

/** Page-fetching settings Firecrawl applies before reading. */
export interface FirecrawlPageOptions extends CallOptions {
  onlyMainContent?: boolean;
  includeTags?: string[];
  excludeTags?: string[];
  /** Milliseconds of cache Firecrawl may use; 0 forces a live fetch. */
  maxAge?: number;
  /** Milliseconds to wait for the page before reading it. */
  waitFor?: number;
  mobile?: boolean;
  proxy?: "basic" | "enhanced" | "auto";
  location?: { country?: string; languages?: string[] };
  /** Clicks, scrolls, waits and scripts to run before reading. */
  actions?: Json[];
}

export interface FirecrawlSearchOptions extends CallOptions {
  /** Results per source; Firecrawl allows up to 100. */
  limit?: number;
  sources?: ("web" | "news" | "images")[];
  categories?: ("github" | "research" | "pdf")[];
  /** Hosts only; Firecrawl does not filter by path. */
  includeDomains?: string[];
  excludeDomains?: string[];
  country?: string;
  location?: string;
  /** Google time filter, such as "qdr:w" for the past week. */
  tbs?: string;
  /** Include each result's page text as Markdown. */
  content?: boolean;
}

export interface FirecrawlReadOptions extends FirecrawlPageOptions {
  /** Extra formats beside Markdown. */
  include?: (
    | "html"
    | "rawHtml"
    | "links"
    | "images"
    | "screenshot"
    | "summary"
  )[];
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
}

export interface FirecrawlCrawlOptions extends CallOptions {
  limit?: number;
  /** Plain-words crawl instructions. */
  prompt?: string;
  includePaths?: string[];
  excludePaths?: string[];
  maxDiscoveryDepth?: number;
  sitemap?: "skip" | "include" | "only";
  crawlEntireDomain?: boolean;
  allowSubdomains?: boolean;
  allowExternalLinks?: boolean;
  ignoreQueryParameters?: boolean;
  delay?: number;
  maxConcurrency?: number;
  scrapeOptions?: Json;
  /** Milliseconds between status checks. */
  interval?: number;
}

export interface FirecrawlResearchOptions extends CallOptions {
  schema?: JsonSchema;
  /** Pages to start from. */
  urls?: string[];
  /** Visit only `urls`. */
  strictConstrainToURLs?: boolean;
  /** Credit cap for the run. */
  maxCredits?: number;
  model?: "spark-2" | "spark-1-mini" | "spark-1-pro";
  effort?: "low" | "medium" | "high";
  interval?: number;
}

export interface FirecrawlActOptions extends CallOptions {
  language?: "node" | "python" | "bash";
  /** Seconds the browser session may live. */
  ttl?: number;
  profile?: { name: string; saveChanges?: boolean };
}

export interface FirecrawlParseOptions extends CallOptions {
  /** "fast" reads embedded text only, "ocr" always runs OCR, "auto" falls back to OCR. */
  mode?: "auto" | "fast" | "ocr";
  maxPages?: number;
  /** Return one Markdown entry per physical page. */
  pages?: boolean;
  /** Return layout blocks with positions. */
  blocks?: boolean;
}

export interface FirecrawlOperations {
  search(
    query: string,
    options?: FirecrawlSearchOptions
  ): Promise<SearchResponse>;
  read(url: string, options?: FirecrawlReadOptions): Promise<Page>;
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
  /** Runs a script in a fresh browser session, then closes it. */
  act(code: string, options?: FirecrawlActOptions): Promise<ActResult>;
  parse(
    document: DocumentInput,
    options?: FirecrawlParseOptions
  ): Promise<ParsedDocument>;
}

function pageBody(o: Omit<FirecrawlPageOptions, keyof CallOptions>) {
  return compact({
    onlyMainContent: o.onlyMainContent,
    includeTags: o.includeTags,
    excludeTags: o.excludeTags,
    maxAge: o.maxAge,
    waitFor: o.waitFor,
    mobile: o.mobile,
    proxy: o.proxy,
    location: o.location,
    actions: o.actions,
  });
}

function toPage(data: Json, fallbackUrl: string, raw: unknown): Page {
  const metadata = record(data.metadata);
  return compact({
    url: text(metadata.url) ?? text(metadata.sourceURL) ?? fallbackUrl,
    title: text(metadata.title),
    markdown: text(data.markdown),
    html: text(data.html),
    rawHtml: text(data.rawHtml),
    links: strings(data.links),
    images: strings(data.images),
    raw,
  });
}

function toVariant(value: unknown): ProductVariant {
  const variant = record(value);
  const price = record(variant.price);
  const values = record(variant.values);
  return compact({
    id: text(variant.id),
    sku: text(variant.sku),
    title: text(variant.title),
    values:
      Object.keys(values).length > 0
        ? (Object.fromEntries(
            Object.entries(values).map(([k, v]) => [k, scalar(v) ?? ""])
          ) as Record<string, string>)
        : undefined,
    price: variant.price
      ? compact({
          amount: text(price.amount) ?? num(price.amount)?.toString(),
          currency: text(price.currency),
        })
      : undefined,
    inStock:
      typeof record(variant.availability).inStock === "boolean"
        ? (record(variant.availability).inStock as boolean)
        : undefined,
    images: strings(variant.images),
  });
}

const MEDIA_TYPES = new Map<string, string>(
  Object.entries({
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    html: "text/html",
    csv: "text/csv",
    rtf: "application/rtf",
    epub: "application/epub+zip",
  })
);

function toBlob(data: DocumentInput["data"], name: string): Blob {
  if (data instanceof Blob) {
    return data;
  }
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return new Blob([data as ArrayBuffer], {
    type: MEDIA_TYPES.get(extension) ?? "application/octet-stream",
  });
}

export function firecrawl(config: FirecrawlConfig = {}) {
  const provider = "firecrawl";
  const baseUrl = config.baseUrl ?? "https://api.firecrawl.dev/v2";
  const raw = createRawClient({
    provider,
    baseUrl,
    headers: {
      authorization: `Bearer ${requireKey(provider, config.apiKey, "FIRECRAWL_API_KEY")}`,
    },
    fetch: config.fetch,
  });

  async function scrape(
    url: string,
    formats: unknown[],
    o: Omit<FirecrawlPageOptions, keyof CallOptions>,
    call: CallOptions
  ) {
    const response = record(
      await raw.request("POST", "/scrape", {
        ...call,
        body: { url, formats, ...pageBody(o) },
      })
    );
    return { response, data: record(response.data) };
  }

  const operations: FirecrawlOperations = {
    async search(query, options) {
      const { call, rest: o } = callSettings(options);
      const response = record(
        await raw.request("POST", "/search", {
          ...call,
          body: compact({
            query,
            limit: o.limit,
            sources: o.sources,
            categories: o.categories,
            includeDomains: o.includeDomains,
            excludeDomains: o.excludeDomains,
            country: o.country,
            location: o.location,
            tbs: o.tbs,
            scrapeOptions: o.content ? { formats: ["markdown"] } : undefined,
          }),
        })
      );
      const data = record(response.data);
      const results: SearchResult[] = [
        ...list(data.web),
        ...list(data.news),
      ].map((item) => {
        const result = record(item);
        return compact({
          url: text(result.url) ?? "",
          title: text(result.title),
          snippet: text(result.description) ?? text(result.snippet),
          content: text(result.markdown),
          publishedAt: text(result.date),
        });
      });
      return { results, raw: response };
    },

    async read(url, options) {
      const { call, rest: o } = callSettings(options);
      const { include, ...page } = o;
      const { response, data } = await scrape(
        url,
        ["markdown", ...(include ?? [])],
        page,
        call
      );
      return toPage(data, url, response);
    },

    async extract<T>(url: string, options: FirecrawlExtractOptions) {
      const { call, rest: o } = callSettings(options);
      const { schema, prompt, ...page } = o;
      const { response, data } = await scrape(
        url,
        [compact({ type: "json", schema, prompt })],
        page,
        call
      );
      if (data.json === undefined) {
        throw new FieldworkError(
          "ProviderError",
          `firecrawl returned no JSON for ${url}`,
          { provider, cause: response }
        );
      }
      return { data: data.json as T, raw: response };
    },

    async product(url, options) {
      const { call, rest: o } = callSettings(options);
      const { response, data } = await scrape(url, ["product"], o, call);
      if (!data.product) {
        throw new FieldworkError(
          "NotFound",
          `firecrawl found no product on ${url}`,
          { provider, cause: response }
        );
      }
      const product = record(data.product);
      return compact({
        title: text(product.title),
        brand: text(product.brand),
        category: text(product.category),
        description: text(product.description),
        url: text(product.url),
        variants: list(product.variants).map((variant) => toVariant(variant)),
        raw: response,
      });
    },

    async map(url, options) {
      const { call, rest: o } = callSettings(options);
      const response = record(
        await raw.request("POST", "/map", {
          ...call,
          body: compact({ url, ...o }),
        })
      );
      return {
        links: list(response.links).map((item) => {
          if (typeof item === "string") {
            return { url: item };
          }
          const link = record(item);
          return compact({
            url: text(link.url) ?? "",
            title: text(link.title),
            description: text(link.description),
          });
        }),
        raw: response,
      };
    },

    async crawl(url, options) {
      const { call, rest: o } = callSettings(options);
      const { interval, ...body } = o;
      const started = record(
        await raw.request("POST", "/crawl", {
          ...call,
          body: compact({ url, ...body }),
        })
      );
      const id = requireId(provider, started.id);
      const first = await poll(
        provider,
        async () => {
          const status = record(
            await raw.request("GET", `/crawl/${id}`, { signal: call.signal })
          );
          if (status.status === "failed" || status.status === "cancelled") {
            throw new FieldworkError(
              "JobFailed",
              `firecrawl crawl ${id} ended ${text(status.status) ?? "unknown"}`,
              { provider, cause: status }
            );
          }
          return status.status === "completed" ? status : undefined;
        },
        { ...call, interval }
      );
      const batches = [first];
      let next = text(first.next);
      while (next) {
        const nextUrl = new URL(next);
        const path =
          nextUrl.pathname.slice(
            new URL(baseUrl).pathname.replace(/\/$/u, "").length
          ) + nextUrl.search;
        const batch = record(
          await raw.request("GET", path, { signal: call.signal })
        );
        batches.push(batch);
        next = text(batch.next);
      }
      return {
        pages: batches.flatMap((batch) =>
          list(batch.data).map((item) => toPage(record(item), url, item))
        ),
        raw: batches,
      };
    },

    async research<T>(question: string, options?: FirecrawlResearchOptions) {
      const { call, rest: o } = callSettings(options);
      const { interval, ...body } = o;
      const started = record(
        await raw.request("POST", "/agent", {
          ...call,
          body: compact({ prompt: question, ...body }),
        })
      );
      const id = requireId(provider, started.id);
      const run = await poll(
        provider,
        async () => {
          const status = record(
            await raw.request("GET", `/agent/${id}`, { signal: call.signal })
          );
          if (status.status === "failed") {
            throw new FieldworkError(
              "JobFailed",
              `firecrawl research run ${id} failed: ${text(status.error) ?? "no reason given"}`,
              {
                provider,
                cause: status,
              }
            );
          }
          return status.status === "completed" ? status : undefined;
        },
        { ...call, interval }
      );
      return { id, output: run.data as T, sources: [], raw: run };
    },

    async act(code, options) {
      const { call, rest: o } = callSettings(options);
      const session = record(
        await raw.request("POST", "/interact", {
          ...call,
          body: compact({ ttl: o.ttl, activityTtl: o.ttl, profile: o.profile }),
        })
      );
      const id = requireId(provider, session.id);
      try {
        const result = record(
          await raw.request("POST", `/interact/${id}/execute`, {
            ...call,
            body: compact({
              code,
              language: o.language ?? "node",
              timeout: call.timeout
                ? Math.ceil(call.timeout / 1000)
                : undefined,
            }),
          })
        );
        return compact({
          stdout: text(result.stdout) ?? "",
          stderr: text(result.stderr) ?? "",
          result: result.result === "" ? undefined : result.result,
          exitCode: num(result.exitCode),
          raw: result,
        });
      } finally {
        // Closing is best effort: the session also expires on its own TTL, and a
        // failed close must not hide the script's result or error.
        await raw
          .request("DELETE", `/interact/${id}`)
          .catch((error: unknown) => error);
      }
    },

    async parse(document, options) {
      const { call, rest: o } = callSettings(options);
      const parser = compact({
        type: "pdf",
        mode: o.mode,
        maxPages: o.maxPages,
        pages: o.pages,
        blocks: o.blocks,
      });
      // Options go first, as a plain field: Firecrawl reads the parts in
      // order and rejects a second part that carries a filename.
      const form = new FormData();
      form.set(
        "options",
        JSON.stringify({ formats: ["markdown"], parsers: [parser] })
      );
      form.set("file", toBlob(document.data, document.name), document.name);
      const response = record(
        await raw.request("POST", "/parse", { ...call, form })
      );
      const data = record(response.data);
      return compact({
        markdown: text(data.markdown) ?? "",
        pages: Array.isArray(data.pages)
          ? list(data.pages).map((page) => ({
              pageNumber: Number(record(page).pageNumber),
              markdown: text(record(page).markdown) ?? "",
            }))
          : undefined,
        blocks: Array.isArray(data.blocks) ? data.blocks : undefined,
        raw: response,
      });
    },
  };

  return defineAdapter({ name: provider, operations, raw });
}
