// The engine table at the heart of the SerpApi adapter. Each `EngineSpec` says which
// normalized options an engine takes, how they become its SerpApi parameters, and
// how its response becomes results. ../serpapi.ts looks the spec up by `engine`.

import { invalidRequest } from "../../errors.js";
import type { ImageMatch, SearchResult } from "../../types.js";
import { refuseTogether } from "../../util.js";
import type { Json } from "../../util.js";
import type { SerpApiEngine, SerpApiReverseImageEngine } from "./options.js";
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
  bingMatches,
  googleReverseMatches,
  lensMatches,
  newsResults,
  patentResults,
  placeResults,
  provider,
  scholarResults,
  shoppingResults,
  webResults,
  yandexMatches,
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

/**
 * How one reverse image engine takes its image and options and reads its response,
 * as `EngineSpec` does for `search`.
 */
export interface ReverseEngineSpec {
  /** The option names the engine documents; any other set option is refused. */
  allowed: readonly string[];
  /** The query parameter that carries the image's URL. */
  imageParam: "image_url" | "url";
  /** The engine's SerpApi parameters from the allowed options. */
  params: (o: Json) => Query;
  /** The response's matches. A match with no page URL is left out. */
  results: (body: SearchBody) => ImageMatch[];
}

/**
 * Lens's `type` for `match`, or undefined when it is left out. Refuses a value
 * other than "exact" or "visual", and `query` with "exact", which Lens ignores:
 * `q` applies only to `all` and `visual_matches`.
 */
const lensType = (o: Json): string | undefined => {
  if (o.match === undefined) {
    return undefined;
  }
  if (o.match === "visual") {
    return "visual_matches";
  }
  if (o.match !== "exact") {
    throw invalidRequest(provider, 'match must be "exact" or "visual"');
  }
  if (o.query !== undefined) {
    throw invalidRequest(
      provider,
      'google_lens does not accept query with match "exact"; Lens applies q only to all and visual matches'
    );
  }
  return "exact_matches";
};

/** One spec per `SerpApiReverseImageEngine`. None has a result count except Bing's `count`. */
export const REVERSE_ENGINES: Record<
  SerpApiReverseImageEngine,
  ReverseEngineSpec
> = {
  /** `limit` is `count`, 0 to 150 as SerpApi documents it, and is only a suggestion. */
  bing_reverse_image: {
    allowed: ["limit", "market", "noCache"],
    imageParam: "image_url",
    params: (o) => ({
      count: bounded("bing_reverse_image", o.limit, 1, 150),
      mkt: str(o.market),
    }),
    results: bingMatches,
  },
  google_lens: {
    allowed: ["country", "language", "query", "match", "noCache"],
    imageParam: "url",
    params: (o) => ({
      country: str(o.country)?.toLowerCase(),
      hl: str(o.language),
      q: str(o.query),
      type: lensType(o),
    }),
    results: lensMatches,
  },
  google_reverse_image: {
    allowed: ["country", "language", "query", "noCache"],
    imageParam: "image_url",
    params: (o) => ({
      gl: googleCountry(o.country),
      hl: str(o.language),
      q: str(o.query),
    }),
    results: googleReverseMatches,
  },
  yandex_images: {
    allowed: ["noCache"],
    imageParam: "url",
    params: () => ({}),
    results: yandexMatches,
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
