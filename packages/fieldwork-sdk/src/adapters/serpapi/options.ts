// SerpApi's option types, as exported from `@howells/fieldwork-sdk/serpapi`, and the
// encoders for the values that differ per engine: country codes, date formats and
// recency codes. ./engines.ts uses the encoders to build each engine's parameters.

import { invalidRequest } from "../../errors.js";
import type {
  AccountUsage,
  CallOptions,
  ImageSearch,
  Recency,
  SearchResponse,
} from "../../types.js";
import { refuseTogether } from "../../util.js";
import type { Json } from "../../util.js";
import { provider } from "./parse.js";

/** Settings for `serpapi()`. */
export interface SerpApiConfig {
  /** Defaults to the SERPAPI_API_KEY environment variable. */
  apiKey?: string;
  /** Defaults to https://serpapi.com. */
  baseUrl?: string;
  /**
   * Used in place of the global `fetch`. The API key is added to each request's URL
   * before it is called.
   */
  fetch?: typeof fetch;
  /** Repeats of a request that can succeed on repeat; 2 unless set. `0` turns retrying off. */
  retries?: number;
}

type Device = "desktop" | "tablet" | "mobile";

interface SerpApiBaseOptions extends CallOptions {
  /**
   * Skip SerpApi's one-hour cache and fetch fresh results. Cached searches
   * are free and do not count toward the monthly allowance.
   */
  noCache?: boolean;
}

/**
 * Google web search: `GET /search?engine=google`, organic results and the answer
 * box. This is the default engine. `limit` is refused: SerpApi documents no
 * result count for Google.
 */
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
  /** YYYY-MM-DD. Sent as `tbs` `cdr`; either end may be given alone. */
  publishedAfter?: string;
  /** YYYY-MM-DD. Sent as `tbs` `cdr`; either end may be given alone. */
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

/**
 * The options of `search`, chosen by `engine` (Google when it is left out). Each
 * engine takes only the options it documents; any other set option is refused
 * before sending. The per-engine mapping is in `ENGINES`.
 */
export type SerpApiSearchOptions =
  | SerpApiGoogleOptions
  | SerpApiNewsOptions
  | SerpApiShoppingOptions
  | SerpApiMapsOptions
  | SerpApiScholarOptions
  | SerpApiPatentsOptions
  | SerpApiBingOptions
  | SerpApiDuckDuckGoOptions;

/** The engine names `search` accepts. */
export type SerpApiEngine = NonNullable<SerpApiSearchOptions["engine"]>;

/**
 * Options for `images`, which always uses `engine=google_images`. `limit` is
 * refused: SerpApi documents no result count for it.
 */
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

/** What SerpApi offers: search, images and usage. */
export interface SerpApiOperations {
  search: (
    query: string,
    options?: SerpApiSearchOptions
  ) => Promise<SearchResponse>;
  images: (
    query: string,
    options?: SerpApiImagesOptions
  ) => Promise<ImageSearch>;
  usage: (options?: CallOptions) => Promise<AccountUsage>;
}

/**
 * SerpApi's single-letter codes for the recency windows, as Google's `qdr` and
 * `period_unit` and DuckDuckGo's `df` take them.
 */
export const RECENCY_CODE: Record<Recency, string> = {
  day: "d",
  hour: "h",
  month: "m",
  week: "w",
  year: "y",
};

/** The value if it is a string, else undefined. Engine specs read options as `Json`. */
export const str = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/** The value if it is a number, else undefined. */
export const count = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

/**
 * Google's `gl` code for a country: lower case, and "uk" for "gb", as SerpApi
 * documents.
 */
export const googleCountry = (value: unknown): string | undefined => {
  const code = str(value)?.toLowerCase();
  return code === "gb" ? "uk" : code;
};

/**
 * The value if it is shaped YYYY-MM-DD; refuses anything else. It does not check
 * that the date exists.
 */
export const isoDate = (name: string, value: unknown): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw invalidRequest(provider, `${name} must be YYYY-MM-DD`);
  }
  return value;
};

/** A YYYY-MM-DD date as YYYYMMDD. */
export const compactDate = (name: string, value: unknown): string | undefined =>
  isoDate(name, value)?.replaceAll("-", "");

/**
 * A YYYY-MM-DD date as M/D/YYYY with no leading zeros, the form of Google's custom
 * date range.
 */
export const usDate = (name: string, value: unknown): string | undefined => {
  const [year, month, day] = isoDate(name, value)?.split("-") ?? [];
  return year === undefined
    ? undefined
    : `${Number(month)}/${Number(day)}/${year}`;
};

/** A result count that is a whole number from `min` to `max`; refuses any other. */
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
    throw invalidRequest(
      provider,
      `${engine} limit must be a whole number from ${min} to ${max}`
    );
  }
  return value;
};

/** The code for the recency window the caller set; undefined when it names none. */
const recencyCode = (o: Json): string | undefined =>
  Object.entries(RECENCY_CODE).find(([name]) => name === o.recency)?.[1];

/**
 * Google's `tbs`: `qdr:<code>` for `recency`, or a custom range
 * `cdr:1,cd_min:<M/D/YYYY>,cd_max:<M/D/YYYY>` with either end optional. Refuses
 * `recency` with either date.
 */
export const googleTbs = (o: Json): string | undefined => {
  refuseTogether(provider, o, "recency", "publishedAfter");
  refuseTogether(provider, o, "recency", "publishedBefore");
  if (o.recency !== undefined) {
    return `qdr:${recencyCode(o)}`;
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

/**
 * DuckDuckGo's `df`: a window code, or `YYYY-MM-DD..YYYY-MM-DD`. Refuses "hour",
 * `recency` with either date, and one date without the other.
 */
export const duckDuckGoFilter = (o: Json): string | undefined => {
  refuseTogether(provider, o, "recency", "publishedAfter");
  refuseTogether(provider, o, "recency", "publishedBefore");
  if (o.recency === "hour") {
    throw invalidRequest(
      provider,
      "duckduckgo has no hour window; use day, week, month or year"
    );
  }
  if (o.recency !== undefined) {
    return recencyCode(o);
  }
  if (o.publishedAfter === undefined && o.publishedBefore === undefined) {
    return undefined;
  }
  if (o.publishedAfter === undefined || o.publishedBefore === undefined) {
    throw invalidRequest(
      provider,
      "duckduckgo filters a date range by both ends: pass publishedAfter and publishedBefore together"
    );
  }
  return `${isoDate("publishedAfter", o.publishedAfter)}..${isoDate("publishedBefore", o.publishedBefore)}`;
};

/** Google Patents' `after` or `before` value: `publication:YYYYMMDD`. */
export const patentDate = (name: string, value: unknown) => {
  const date = compactDate(name, value);
  return date === undefined ? undefined : `publication:${date}`;
};

/**
 * Google Maps' search origin: `lat` and `lon`, or `location`, with the zoom `z`.
 * Refuses `location` with coordinates, a latitude or longitude without the other,
 * an origin without `zoom`, and `zoom` without an origin.
 */
export const mapsOrigin = (o: Json) => {
  refuseTogether(provider, o, "location", "latitude");
  refuseTogether(provider, o, "location", "longitude");
  const coordinates = o.latitude !== undefined || o.longitude !== undefined;
  if (coordinates && (o.latitude === undefined || o.longitude === undefined)) {
    throw invalidRequest(
      provider,
      "google_maps needs latitude and longitude together"
    );
  }
  const origin = coordinates || o.location !== undefined;
  if (origin && o.zoom === undefined) {
    throw invalidRequest(
      provider,
      "google_maps needs zoom with location or latitude and longitude"
    );
  }
  if (!origin && o.zoom !== undefined) {
    throw invalidRequest(
      provider,
      "google_maps zoom needs location or latitude and longitude"
    );
  }
  return {
    lat: count(o.latitude),
    location: str(o.location),
    lon: count(o.longitude),
    z: count(o.zoom),
  };
};
