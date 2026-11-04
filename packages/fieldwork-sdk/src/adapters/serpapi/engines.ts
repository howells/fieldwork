// The engine table at the heart of the SerpApi adapter. Each `EngineSpec` says which
// normalized options an engine takes, how they become its SerpApi parameters, and
// how its response becomes results. ../serpapi.ts looks the spec up by `engine`.

import { invalidRequest } from "../../errors.js";
import type { SearchResult } from "../../types.js";
import { refuseTogether } from "../../util.js";
import type { Json } from "../../util.js";
import type { SerpApiEngine } from "./options.js";
import {
  bounded,
  count,
  duckDuckGoFilter,
  googleCountry,
  googleTbs,
  mapsOrigin,
  patentDate,
  str,
} from "./options.js";
import {
  newsResults,
  patentResults,
  placeResults,
  provider,
  scholarResults,
  shoppingResults,
  webResults,
} from "./parse.js";
import type { SearchBody } from "./response.js";

/** The query parameters of a SerpApi call. */
export type Query = Record<string, string | number | boolean | undefined>;

/**
 * How one engine turns normalized options into SerpApi parameters and reads the
 * response. `search` refuses any set option outside `allowed`, then sends `engine`,
 * `q`, `params(options)` and `no_cache`, and reads the response with `results`.
 */
export interface EngineSpec {
  /** The option names the engine documents; any other set option is refused. */
  allowed: readonly string[];
  /**
   * The engine's SerpApi parameters from the allowed options. Undefined values are
   * dropped, and a combination the engine rejects throws.
   */
  params: (o: Json) => Query;
  /** The response's results. An item with no usable URL is left out. */
  results: (body: SearchBody) => SearchResult[];
}

/**
 * One spec per `SerpApiEngine`. The public types already limit the options, so
 * specs read them untyped, and `allowed` is the runtime check for callers without
 * types. An engine whose `allowed` has no `limit` (Google, Bing, news, maps and
 * shopping) refuses it, because SerpApi documents no result count for it.
 */
export const ENGINES: Record<SerpApiEngine, EngineSpec> = {
  /** `country` (sent as lower-case `cc`) and `market` (`mkt`) are alternatives. */
  bing: {
    allowed: [
      "country",
      "market",
      "location",
      "safeSearch",
      "device",
      "first",
      "noCache",
    ],
    params: (o) => {
      refuseTogether(provider, o, "country", "market");
      return {
        cc: str(o.country)?.toLowerCase(),
        device: str(o.device),
        first: count(o.first),
        location: str(o.location),
        mkt: str(o.market),
        safeSearch: str(o.safeSearch),
      };
    },
    results: webResults,
  },
  /** `limit` is `m`, 1 to 50; `region` is `kl`; the recency or date filter is `df`. */
  duckduckgo: {
    allowed: [
      "limit",
      "region",
      "safe",
      "recency",
      "publishedAfter",
      "publishedBefore",
      "start",
      "noCache",
    ],
    params: (o) => ({
      df: duckDuckGoFilter(o),
      kl: str(o.region),
      m: bounded("duckduckgo", o.limit, 1, 50),
      safe: count(o.safe),
      start: count(o.start),
    }),
    results: webResults,
  },
  /**
   * The only engine whose response also gives the search an `answer`, from the answer
   * box.
   */
  google: {
    allowed: [
      "country",
      "language",
      "location",
      "recency",
      "publishedAfter",
      "publishedBefore",
      "safe",
      "device",
      "start",
      "noCache",
    ],
    params: (o) => ({
      device: str(o.device),
      gl: googleCountry(o.country),
      hl: str(o.language),
      location: str(o.location),
      safe: str(o.safe),
      start: count(o.start),
      tbs: googleTbs(o),
    }),
    results: webResults,
  },
  /**
   * `type=search` lists places. The origin is `lat` and `lon`, or `location`, with
   * the zoom `z`.
   */
  google_maps: {
    allowed: [
      "language",
      "latitude",
      "longitude",
      "location",
      "zoom",
      "start",
      "noCache",
    ],
    params: (o) => ({
      type: "search",
      hl: str(o.language),
      ...mapsOrigin(o),
      start: count(o.start),
    }),
    results: placeResults,
  },
  /** Takes `gl` and `hl` only. */
  google_news: {
    allowed: ["country", "language", "noCache"],
    params: (o) => ({
      gl: googleCountry(o.country),
      hl: str(o.language),
    }),
    results: newsResults,
  },
  /** `limit` is `num`, 10 to 100. The dates become `publication:YYYYMMDD`. */
  google_patents: {
    allowed: [
      "limit",
      "page",
      "sort",
      "publishedAfter",
      "publishedBefore",
      "inventor",
      "assignee",
      "status",
      "noCache",
    ],
    params: (o) => ({
      after: patentDate("publishedAfter", o.publishedAfter),
      assignee: str(o.assignee),
      before: patentDate("publishedBefore", o.publishedBefore),
      inventor: str(o.inventor),
      num: bounded("google_patents", o.limit, 10, 100),
      page: count(o.page),
      sort: str(o.sort),
      status: str(o.status),
    }),
    results: patentResults,
  },
  /** `limit` is `num`, 1 to 20. `yearFrom` and `yearTo` are `as_ylo` and `as_yhi`. */
  google_scholar: {
    allowed: [
      "limit",
      "language",
      "safe",
      "yearFrom",
      "yearTo",
      "start",
      "noCache",
    ],
    params: (o) => ({
      as_yhi: count(o.yearTo),
      as_ylo: count(o.yearFrom),
      hl: str(o.language),
      num: bounded("google_scholar", o.limit, 1, 20),
      safe: str(o.safe),
      start: count(o.start),
    }),
    results: scholarResults,
  },
  /** The boolean filters are sent only when true. `sortBy` is `sort_by`. */
  google_shopping: {
    allowed: [
      "country",
      "language",
      "location",
      "safe",
      "device",
      "minPrice",
      "maxPrice",
      "sortBy",
      "freeShipping",
      "onSale",
      "smallBusiness",
      "noCache",
    ],
    params: (o) => ({
      device: str(o.device),
      free_shipping: o.freeShipping === true ? true : undefined,
      gl: googleCountry(o.country),
      hl: str(o.language),
      location: str(o.location),
      max_price: count(o.maxPrice),
      min_price: count(o.minPrice),
      on_sale: o.onSale === true ? true : undefined,
      safe: str(o.safe),
      small_business: o.smallBusiness === true ? true : undefined,
      sort_by: count(o.sortBy),
    }),
    results: shoppingResults,
  },
};

/** The options `images` takes. Google Images has no `limit`. */
export const IMAGE_OPTIONS = [
  "country",
  "language",
  "location",
  "recency",
  "publishedAfter",
  "publishedBefore",
  "safe",
  "device",
  "page",
  "aspectRatio",
  "size",
  "color",
  "imageType",
  "license",
  "noCache",
] as const;

/**
 * Refuses every set option outside `allowed`, naming all of them. An option set to
 * undefined passes.
 */
export const onlyAllowed = (
  engine: string,
  options: Json,
  allowed: readonly string[]
) => {
  const refused = Object.keys(options).filter(
    (name) => options[name] !== undefined && !allowed.includes(name)
  );
  if (refused.length > 0) {
    throw invalidRequest(
      provider,
      `${engine} does not accept ${refused.join(", ")}`
    );
  }
};
