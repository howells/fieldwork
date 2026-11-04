// Request bodies and result mapping for the Tavily adapter: options in, Tavily's JSON out, normalized results back.
// ../tavily.ts calls these; the shapes of Tavily's responses are in response.ts and the option types in options.ts.

import { invalidRequest } from "../../errors.js";
import type { FailedUrl, ImageResult, Page } from "../../types.js";
import { compact, hours, meta } from "../../util.js";
import { COUNTRIES } from "./countries.js";
import type {
  TavilyExtractOptions,
  TavilySearchOptions,
  TavilyTraversal,
} from "./options.js";
import type {
  FailedBlock,
  MeteredBody,
  PageEntry,
  SearchBody,
} from "./response.js";

export const provider = "tavily";

/** The file names `research` takes. */
export const RESEARCH_FILE = /\.(?:txt|md|json)$/iu;

/** The passages in Tavily's text, which arrives as one string joined with `[...]`. Undefined when there are none. */
export const chunks = (content: string | undefined): string[] | undefined => {
  if (content === undefined) {
    return undefined;
  }
  const parts = content
    .split(/\s*\[\.\.\.\]\s*/u)
    .map((part) => part.trim())
    .filter((part) => part !== "");
  return parts.length > 0 ? parts : undefined;
};

/** Tavily's name for a country code, since Tavily takes names. Throws for a topic other than `general` and for a code Tavily does not list. */
const countryName = (code: string, topic: string | undefined): string => {
  if (topic !== undefined && topic !== "general") {
    throw invalidRequest(
      provider,
      `country only works with topic "general", not "${topic}"`
    );
  }
  const name = COUNTRIES.get(code.toUpperCase());
  if (name === undefined) {
    throw invalidRequest(
      provider,
      `has no country for "${code}"; pass an ISO 3166-1 alpha-2 code from its supported list`
    );
  }
  return name;
};

/** The images that parsed; undefined when there are none. */
export const imageResults = (
  images: SearchBody["images"]
): ImageResult[] | undefined => {
  const items = images.filter((item) => item !== undefined);
  return items.length > 0 ? items : undefined;
};

/** The credits, request id and response time Tavily reports. */
export const responseMeta = (body: MeteredBody) =>
  meta({
    credits: body.usage.credits,
    requestId: body.request_id,
    units: { responseTimeSeconds: body.response_time },
  });

/** Refuses filters that need another option, or a depth that lacks them. */
const checkFilters = (o: TavilySearchOptions): void => {
  if (
    o.includeDomainsMode !== undefined &&
    (o.includeDomains?.length ?? 0) === 0
  ) {
    throw invalidRequest(provider, "includeDomainsMode needs includeDomains");
  }
  if (o.filterByLanguage === true && o.language === undefined) {
    throw invalidRequest(provider, "filterByLanguage needs language");
  }
  if (
    o.safeSearch === true &&
    (o.searchDepth === "fast" || o.searchDepth === "ultra-fast")
  ) {
    throw invalidRequest(
      provider,
      `safeSearch is not available with searchDepth "${o.searchDepth}"`
    );
  }
};

/** Refuses option combinations Tavily does not accept, and returns `maxAge` in whole hours. */
const checkSearch = (o: TavilySearchOptions): number | undefined => {
  checkFilters(o);
  if (o.chunksPerSource !== undefined && o.searchDepth === "ultra-fast") {
    throw invalidRequest(
      provider,
      'chunksPerSource is not available with searchDepth "ultra-fast"'
    );
  }
  if (o.imageDescriptions === true && o.includeImages !== true) {
    throw invalidRequest(provider, "imageDescriptions needs includeImages");
  }
  const maxAgeHours = hours(o.maxAge);
  if (maxAgeHours !== undefined && maxAgeHours > 720) {
    throw invalidRequest(
      provider,
      "keeps cached copies for at most 30 days (2,592,000 seconds)"
    );
  }
  return maxAgeHours;
};

/** Tavily's `include_raw_content`: `true` asks for Markdown, `false` for none. */
const rawContent = (content: TavilySearchOptions["content"]) => {
  if (content === true) {
    return "markdown";
  }
  return content === false ? undefined : content;
};

/**
 * The `/search` body. It always asks for usage, so credits are reported, and
 * asks for each result's published date whenever a date window or `recency` is set.
 */
export const searchBody = (query: string, o: TavilySearchOptions) => {
  const maxAgeHours = checkSearch(o);
  const dated =
    o.recency !== undefined ||
    o.publishedAfter !== undefined ||
    o.publishedBefore !== undefined;
  return compact({
    auto_parameters: o.autoParameters,
    chunks_per_source: o.chunksPerSource,
    country:
      o.country === undefined ? undefined : countryName(o.country, o.topic),
    end_date: o.publishedBefore,
    exact_match: o.exactMatch,
    exclude_domains: o.excludeDomains,
    filter_by_language: o.filterByLanguage,
    filter_by_published_date: o.filterByPublishedDate,
    include_domains: o.includeDomains,
    include_domains_mode: o.includeDomainsMode,
    include_favicon: o.favicon,
    include_image_descriptions: o.imageDescriptions,
    include_images: o.includeImages,
    include_published_date: dated ? true : undefined,
    include_raw_content: rawContent(o.content),
    include_usage: true,
    language: o.language,
    max_age_hours: maxAgeHours,
    max_results: o.limit,
    query,
    safe_search: o.safeSearch,
    search_depth: o.searchDepth,
    start_date: o.publishedAfter,
    time_range: o.recency,
    topic: o.topic,
  });
};

/** Search results: Tavily's `content` (passages) is the `snippet`, its `raw_content` (page text) the `content`. */
export const searchResults = (body: SearchBody) =>
  body.results.map((result) =>
    compact({
      content: result.raw_content,
      favicon: result.favicon,
      publishedAt: result.published_date,
      score: result.score,
      snippet: result.content,
      title: result.title,
      url: result.url ?? "",
    })
  );

/** The URLs Tavily could not read. An entry without a URL is dropped. */
export const failures = (failed: readonly FailedBlock[]): FailedUrl[] =>
  failed.flatMap((failure) =>
    failure.url === undefined
      ? []
      : [{ error: failure.error ?? "no content returned", url: failure.url }]
  );

/**
 * A page from `/extract` or `/crawl`. When `query` is true, passages were asked
 * for (a `query` on read, `instructions` on crawl) and the text goes to
 * `excerpts`; otherwise it is the page's `markdown`.
 */
export const page = (entry: PageEntry, query: boolean): Page => {
  const result = entry.value;
  return compact({
    excerpts: query ? chunks(result.raw_content) : undefined,
    favicon: result.favicon,
    images: result.images.length > 0 ? result.images : undefined,
    markdown: query ? undefined : result.raw_content,
    raw: entry.original,
    url: result.url ?? "",
  });
};

/** The `/extract` body for one or more URLs. `chunksPerSource` needs a `query`. */
export const extractBody = (urls: string[], o: TavilyExtractOptions) => {
  if (o.chunksPerSource !== undefined && o.query === undefined) {
    throw invalidRequest(provider, "chunksPerSource needs query");
  }
  return compact({
    chunks_per_source: o.chunksPerSource,
    extract_depth: o.extractDepth,
    format: o.format,
    include_favicon: o.favicon,
    include_images: o.includeImages,
    include_usage: true,
    query: o.query,
    timeout: o.serverTimeout,
    urls,
  });
};

/** The body fields `map` and `crawl` share. */
export const traversal = (o: TavilyTraversal) =>
  compact({
    allow_external: o.allowExternal,
    exclude_domains: o.excludeDomainPatterns,
    exclude_paths: o.excludePathPatterns,
    include_usage: true,
    instructions: o.instructions,
    limit: o.limit,
    max_breadth: o.maxBreadth,
    max_depth: o.maxDepth,
    select_domains: o.selectDomainPatterns,
    select_paths: o.selectPathPatterns,
    timeout: o.serverTimeout,
  });

/** Base64 of the bytes, encoded in 32 KiB steps so a large file does not exceed the argument limit of `fromCodePoint`. */
export const base64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x80_00) {
    binary += String.fromCodePoint(...bytes.subarray(index, index + 0x80_00));
  }
  return btoa(binary);
};
