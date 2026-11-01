import type {
  AccountUsage,
  CallOptions,
  ImageSearch,
  Recency,
  SearchResponse,
} from "../../types.js";
import { refuseTogether } from "../../util.js";
import type { Json } from "../../util.js";
import { invalid, provider } from "./parse.js";

export interface SerpApiConfig {
  /** Defaults to the SERPAPI_API_KEY environment variable. */
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

type Device = "desktop" | "tablet" | "mobile";

interface SerpApiBaseOptions extends CallOptions {
  /**
   * Skip SerpApi's one-hour cache and fetch fresh results. Cached searches
   * are free and do not count toward the monthly allowance.
   */
  noCache?: boolean;
}

/** Google web search: `GET /search?engine=google`, organic results and the answer box. */
export interface SerpApiGoogleOptions extends SerpApiBaseOptions {
  engine?: "google";
  /** ISO 3166-1 alpha-2 code such as "GB"; sent as `gl` ("uk" for GB, as SerpApi documents). */
  country?: string;
  /** Sent as `hl`: a language code such as "en", or "en-gb". */
  language?: string;
  /** Where the search originates, as text: "Austin, Texas, United States". */
  location?: string;
  /** Sent as `tbs` `qdr`. Not allowed with `publishedAfter` or `publishedBefore`. */
  recency?: Recency;
  /** YYYY-MM-DD. Sent as `tbs` `cdr`. */
  publishedAfter?: string;
  /** YYYY-MM-DD. Sent as `tbs` `cdr`. */
  publishedBefore?: string;
  safe?: "active" | "off";
  device?: Device;
  /** Result offset: 0 is the first page, 10 the second. */
  start?: number;
}

/** Google News: `engine=google_news`. SerpApi documents `q`, `gl` and `hl` for a news search. */
export interface SerpApiNewsOptions extends SerpApiBaseOptions {
  engine: "google_news";
  country?: string;
  language?: string;
}

/** Google Shopping: `engine=google_shopping`. */
export interface SerpApiShoppingOptions extends SerpApiBaseOptions {
  engine: "google_shopping";
  country?: string;
  language?: string;
  location?: string;
  safe?: "active" | "off";
  device?: Device;
  minPrice?: number;
  maxPrice?: number;
  /** 1 sorts by price, low to high; 2 by price, high to low. */
  sortBy?: 1 | 2;
  freeShipping?: boolean;
  onSale?: boolean;
  smallBusiness?: boolean;
}

/**
 * Google Maps: `engine=google_maps`, `type=search`. Give the search origin as
 * `latitude` and `longitude`, or as `location`, and always with `zoom`.
 */
export interface SerpApiMapsOptions extends SerpApiBaseOptions {
  engine: "google_maps";
  language?: string;
  latitude?: number;
  longitude?: number;
  /** A place name for the search origin. Needs `zoom`. */
  location?: string;
  /** Map zoom, 3 (whole world) to 30. Sent as `z`. */
  zoom?: number;
  /** Result offset in steps of 20. */
  start?: number;
}

/** Google Scholar: `engine=google_scholar`. */
export interface SerpApiScholarOptions extends SerpApiBaseOptions {
  engine: "google_scholar";
  /** Results to return, 1 to 20. Sent as `num`. */
  limit?: number;
  language?: string;
  safe?: "active" | "off";
  /** Leaves out results before this year (`as_ylo`). Scholar filters by year only. */
  yearFrom?: number;
  /** Leaves out results after this year (`as_yhi`). */
  yearTo?: number;
  /** Result offset: 0 is the first page, 10 the second. */
  start?: number;
}

/** Google Patents: `engine=google_patents`. */
export interface SerpApiPatentsOptions extends SerpApiBaseOptions {
  engine: "google_patents";
  /** Results per page, 10 to 100. Sent as `num`. */
  limit?: number;
  /** Page number, starting at 1. */
  page?: number;
  /** "new" and "old" sort by filing date. The default is relevance. */
  sort?: "new" | "old";
  /** YYYY-MM-DD. Sent as `after=publication:YYYYMMDD`. */
  publishedAfter?: string;
  /** YYYY-MM-DD. Sent as `before=publication:YYYYMMDD`. */
  publishedBefore?: string;
  /** Inventor names, separated by commas. */
  inventor?: string;
  /** Assignee names, separated by commas. */
  assignee?: string;
  status?: "GRANT" | "APPLICATION";
}

/** Bing: `engine=bing`. */
export interface SerpApiBingOptions extends SerpApiBaseOptions {
  engine: "bing";
  /** ISO 3166-1 alpha-2 code such as "GB"; sent as `cc`. Not allowed with `market`. */
  country?: string;
  /** Bing market code such as "en-US"; sent as `mkt`. Not allowed with `country`. */
  market?: string;
  location?: string;
  /** Sent as `safeSearch`. */
  safeSearch?: "Off" | "Moderate" | "Strict";
  device?: Device;
  /** Position of the first organic result to return, starting at 1. */
  first?: number;
}

/** DuckDuckGo: `engine=duckduckgo`. */
export interface SerpApiDuckDuckGoOptions extends SerpApiBaseOptions {
  engine: "duckduckgo";
  /** Results to return, 1 to 50. Sent as `m`. */
  limit?: number;
  /** DuckDuckGo region such as "us-en" or "fr-fr"; sent as `kl`. */
  region?: string;
  /** 1 is strict, -1 moderate (the default), -2 off. */
  safe?: 1 | -1 | -2;
  /** Sent as `df`. DuckDuckGo has no hour window. Not allowed with the date options. */
  recency?: Exclude<Recency, "hour">;
  /** YYYY-MM-DD. DuckDuckGo needs both dates for a range. */
  publishedAfter?: string;
  /** YYYY-MM-DD. DuckDuckGo needs both dates for a range. */
  publishedBefore?: string;
  start?: number;
}

export type SerpApiSearchOptions =
  | SerpApiGoogleOptions
  | SerpApiNewsOptions
  | SerpApiShoppingOptions
  | SerpApiMapsOptions
  | SerpApiScholarOptions
  | SerpApiPatentsOptions
  | SerpApiBingOptions
  | SerpApiDuckDuckGoOptions;

export type SerpApiEngine = NonNullable<SerpApiSearchOptions["engine"]>;

/** Google Images: `engine=google_images`. */
export interface SerpApiImagesOptions extends SerpApiBaseOptions {
  country?: string;
  language?: string;
  location?: string;
  /** Sent as `period_unit`. Not allowed with `publishedAfter` or `publishedBefore`. */
  recency?: Recency;
  /** YYYY-MM-DD. Sent as `start_date`. */
  publishedAfter?: string;
  /** YYYY-MM-DD. Sent as `end_date`. */
  publishedBefore?: string;
  safe?: "active" | "off";
  device?: Device;
  /** Page number, 0 to 99. Sent as `ijn`. */
  page?: number;
  /** s square, t tall, w wide, xw panoramic. Sent as `imgar`. */
  aspectRatio?: "s" | "t" | "w" | "xw";
  /** Sent as `imgsz`: l, m, i, or a minimum such as "qsvga" or "2mp". */
  size?:
    | "l"
    | "m"
    | "i"
    | "qsvga"
    | "vga"
    | "svga"
    | "xga"
    | "2mp"
    | "4mp"
    | "6mp"
    | "8mp"
    | "10mp"
    | "12mp"
    | "15mp"
    | "20mp"
    | "40mp"
    | "70mp";
  /** Sent as `image_color`. */
  color?:
    | "bw"
    | "trans"
    | "red"
    | "orange"
    | "yellow"
    | "green"
    | "teal"
    | "blue"
    | "purple"
    | "pink"
    | "white"
    | "gray"
    | "black"
    | "brown";
  /** Sent as `image_type`. */
  imageType?: "face" | "photo" | "clipart" | "lineart" | "animated";
  /** Sent as `licenses`: f, fc, fm, fmc, cl or ol. */
  license?: "f" | "fc" | "fm" | "fmc" | "cl" | "ol";
}

export interface SerpApiOperations {
  search(
    query: string,
    options?: SerpApiSearchOptions
  ): Promise<SearchResponse>;
  images(query: string, options?: SerpApiImagesOptions): Promise<ImageSearch>;
  usage(options?: CallOptions): Promise<AccountUsage>;
}

export const RECENCY_CODE: Record<Recency, string> = {
  day: "d",
  hour: "h",
  month: "m",
  week: "w",
  year: "y",
};

export const str = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

export const count = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

export const googleCountry = (value: unknown): string | undefined => {
  const code = str(value)?.toLowerCase();
  return code === "gb" ? "uk" : code;
};

export const isoDate = (name: string, value: unknown): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw invalid(`${name} must be YYYY-MM-DD`);
  }
  return value;
};

export const compactDate = (name: string, value: unknown): string | undefined =>
  isoDate(name, value)?.replaceAll("-", "");

export const usDate = (name: string, value: unknown): string | undefined => {
  const [year, month, day] = isoDate(name, value)?.split("-") ?? [];
  return year === undefined
    ? undefined
    : `${Number(month)}/${Number(day)}/${year}`;
};

export const bounded = (
  engine: string,
  value: unknown,
  min: number,
  max: number
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw invalid(
      `${engine} limit must be a whole number from ${min} to ${max}`
    );
  }
  return value;
};

export const googleTbs = (o: Json): string | undefined => {
  refuseTogether(provider, o, "recency", "publishedAfter");
  refuseTogether(provider, o, "recency", "publishedBefore");
  if (o.recency !== undefined) {
    return `qdr:${RECENCY_CODE[o.recency as Recency]}`;
  }
  const after = usDate("publishedAfter", o.publishedAfter);
  const before = usDate("publishedBefore", o.publishedBefore);
  if (after === undefined && before === undefined) {
    return undefined;
  }
  return [
    "cdr:1",
    after === undefined ? undefined : `cd_min:${after}`,
    before === undefined ? undefined : `cd_max:${before}`,
  ]
    .filter((part) => part !== undefined)
    .join(",");
};

export const duckDuckGoFilter = (o: Json): string | undefined => {
  refuseTogether(provider, o, "recency", "publishedAfter");
  refuseTogether(provider, o, "recency", "publishedBefore");
  if (o.recency === "hour") {
    throw invalid(
      "duckduckgo has no hour window; use day, week, month or year"
    );
  }
  if (o.recency !== undefined) {
    return RECENCY_CODE[o.recency as Recency];
  }
  if (o.publishedAfter === undefined && o.publishedBefore === undefined) {
    return undefined;
  }
  if (o.publishedAfter === undefined || o.publishedBefore === undefined) {
    throw invalid(
      "duckduckgo filters a date range by both ends: pass publishedAfter and publishedBefore together"
    );
  }
  return `${isoDate("publishedAfter", o.publishedAfter)}..${isoDate("publishedBefore", o.publishedBefore)}`;
};

export const patentDate = (name: string, value: unknown) => {
  const date = compactDate(name, value);
  return date === undefined ? undefined : `publication:${date}`;
};

export const mapsOrigin = (o: Json) => {
  refuseTogether(provider, o, "location", "latitude");
  refuseTogether(provider, o, "location", "longitude");
  const coordinates = o.latitude !== undefined || o.longitude !== undefined;
  if (coordinates && (o.latitude === undefined || o.longitude === undefined)) {
    throw invalid("google_maps needs latitude and longitude together");
  }
  const origin = coordinates || o.location !== undefined;
  if (origin && o.zoom === undefined) {
    throw invalid(
      "google_maps needs zoom with location or latitude and longitude"
    );
  }
  if (!origin && o.zoom !== undefined) {
    throw invalid("google_maps zoom needs location or latitude and longitude");
  }
  return {
    lat: count(o.latitude),
    location: str(o.location),
    lon: count(o.longitude),
    z: count(o.zoom),
  };
};
