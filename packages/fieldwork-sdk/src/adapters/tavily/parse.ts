import { FieldworkError } from "../../errors.js";
import type { FailedUrl, ImageResult, Page } from "../../types.js";
import {
  compact,
  hours,
  list,
  meta,
  num,
  record,
  strings,
  text,
} from "../../util.js";
import type { Json } from "../../util.js";
import { COUNTRIES } from "./countries.js";
import type {
  TavilyExtractOptions,
  TavilySearchOptions,
  TavilyTraversal,
} from "./options.js";

export const RESEARCH_FILE = /\.(?:txt|md|json)$/iu;

export const invalid = (message: string): FieldworkError =>
  new FieldworkError("InvalidRequest", message, { provider: "tavily" });

export const chunks = (value: unknown): string[] | undefined => {
  const content = text(value);
  if (!content) {
    return undefined;
  }
  const parts = content
    .split(/\s*\[\.\.\.\]\s*/u)
    .map((part) => part.trim())
    .filter((part) => part !== "");
  return parts.length > 0 ? parts : undefined;
};

const countryName = (code: string, topic: string | undefined): string => {
  if (topic !== undefined && topic !== "general") {
    throw invalid(
      `tavily country only works with topic "general", not "${topic}"`
    );
  }
  const name = COUNTRIES.get(code.toUpperCase());
  if (!name) {
    throw invalid(
      `tavily has no country for "${code}"; pass an ISO 3166-1 alpha-2 code from its supported list`
    );
  }
  return name;
};

export const imageResults = (value: unknown): ImageResult[] | undefined => {
  const items = list(value)
    .map((item) => {
      if (typeof item === "string") {
        return item === "" ? undefined : { url: item };
      }
      const image = record(item);
      const url = text(image.url);
      return url
        ? compact({ description: text(image.description), url })
        : undefined;
    })
    .filter((item): item is ImageResult => item !== undefined);
  return items.length > 0 ? items : undefined;
};

export const responseMeta = (response: Json) =>
  meta({
    credits: record(response.usage).credits,
    requestId: response.request_id,
    units: { responseTimeSeconds: response.response_time },
  });

const checkSearch = (o: TavilySearchOptions): number | undefined => {
  if (o.includeDomainsMode !== undefined && !o.includeDomains?.length) {
    throw invalid("tavily includeDomainsMode needs includeDomains");
  }
  if (o.filterByLanguage && o.language === undefined) {
    throw invalid("tavily filterByLanguage needs language");
  }
  if (
    o.safeSearch &&
    (o.searchDepth === "fast" || o.searchDepth === "ultra-fast")
  ) {
    throw invalid(
      `tavily safeSearch is not available with searchDepth "${o.searchDepth}"`
    );
  }
  if (o.chunksPerSource !== undefined && o.searchDepth === "ultra-fast") {
    throw invalid(
      'tavily chunksPerSource is not available with searchDepth "ultra-fast"'
    );
  }
  if (o.imageDescriptions && !o.includeImages) {
    throw invalid("tavily imageDescriptions needs includeImages");
  }
  const maxAgeHours = hours(o.maxAge);
  if (maxAgeHours !== undefined && maxAgeHours > 720) {
    throw invalid(
      "tavily keeps cached copies for at most 30 days (2,592,000 seconds)"
    );
  }
  return maxAgeHours;
};

const rawContent = (content: TavilySearchOptions["content"]) => {
  if (content === true) {
    return "markdown";
  }
  return content === false ? undefined : content;
};

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

export const searchResults = (response: Json) =>
  list(response.results).map((item) => {
    const result = record(item);
    return compact({
      content: text(result.raw_content),
      favicon: text(result.favicon),
      publishedAt: text(result.published_date),
      score: num(result.score),
      snippet: text(result.content),
      title: text(result.title),
      url: text(result.url) ?? "",
    });
  });

export const failures = (response: Json): FailedUrl[] =>
  list(response.failed_results).flatMap((item) => {
    const failure = record(item);
    const url = text(failure.url);
    return url
      ? [{ error: text(failure.error) ?? "no content returned", url }]
      : [];
  });

export const page = (item: unknown, query: boolean): Page => {
  const result = record(item);
  const passages = query ? chunks(result.raw_content) : undefined;
  return compact({
    excerpts: passages,
    favicon: text(result.favicon),
    images: strings(result.images),
    markdown: query ? undefined : text(result.raw_content),
    raw: item,
    url: text(result.url) ?? "",
  });
};

export const extractBody = (urls: string[], o: TavilyExtractOptions) => {
  if (o.chunksPerSource !== undefined && o.query === undefined) {
    throw invalid("tavily chunksPerSource needs query");
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

export const base64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x80_00) {
    binary += String.fromCodePoint(...bytes.subarray(index, index + 0x80_00));
  }
  return btoa(binary);
};
