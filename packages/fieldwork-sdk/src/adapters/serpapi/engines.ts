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

export type Query = Record<string, string | number | boolean | undefined>;

export interface EngineSpec {
  /** The option names the engine documents; any other set option is refused. */
  allowed: readonly string[];
  params: (o: Json) => Query;
  results: (body: SearchBody) => SearchResult[];
}

export const ENGINES: Record<SerpApiEngine, EngineSpec> = {
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
  google_news: {
    allowed: ["country", "language", "noCache"],
    params: (o) => ({
      gl: googleCountry(o.country),
      hl: str(o.language),
    }),
    results: newsResults,
  },
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
