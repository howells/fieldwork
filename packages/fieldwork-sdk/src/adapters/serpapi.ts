import { defineAdapter } from "../adapter.js";
import { createRawClient, requireKey } from "../http.js";
import {
  callSettings,
  compact,
  list,
  num,
  record,
  refuseTogether,
  text,
} from "../util.js";
import type { Json } from "../util.js";
import { ENGINES, IMAGE_OPTIONS, onlyAllowed } from "./serpapi/engines.js";
import type { SerpApiConfig, SerpApiOperations } from "./serpapi/options.js";
import { RECENCY_CODE, compactDate, googleCountry } from "./serpapi/options.js";
import {
  answerText,
  failIfError,
  invalid,
  provider,
  searchMeta,
} from "./serpapi/parse.js";

export type {
  SerpApiBingOptions,
  SerpApiConfig,
  SerpApiDuckDuckGoOptions,
  SerpApiEngine,
  SerpApiGoogleOptions,
  SerpApiImagesOptions,
  SerpApiMapsOptions,
  SerpApiNewsOptions,
  SerpApiOperations,
  SerpApiPatentsOptions,
  SerpApiScholarOptions,
  SerpApiSearchOptions,
  SerpApiShoppingOptions,
} from "./serpapi/options.js";

export const serpapi = (config: SerpApiConfig = {}) => {
  const key = requireKey(provider, config.apiKey, "SERPAPI_API_KEY");
  // SerpApi authenticates with an `api_key` query parameter, so the key is
  // added at the fetch layer. That covers `raw` too.
  const authenticated = (async (input: URL | string, init?: RequestInit) => {
    const url = new URL(input);
    url.searchParams.set("api_key", key);
    return await (config.fetch ?? globalThis.fetch)(url, init);
  }) as typeof fetch;
  const raw = createRawClient({
    baseUrl: config.baseUrl ?? "https://serpapi.com",
    fetch: authenticated,
    headers: {},
    provider,
  });

  const operations: SerpApiOperations = {
    async images(query, options) {
      const { call, rest: o } = callSettings(options);
      onlyAllowed("google_images", o, IMAGE_OPTIONS);
      refuseTogether(provider, o, "recency", "publishedAfter");
      refuseTogether(provider, o, "recency", "publishedBefore");
      const response = record(
        await raw.request("GET", "/search", {
          ...call,
          query: compact({
            device: o.device,
            end_date: compactDate("publishedBefore", o.publishedBefore),
            engine: "google_images",
            gl: googleCountry(o.country),
            hl: o.language,
            ijn: o.page,
            image_color: o.color,
            image_type: o.imageType,
            imgar: o.aspectRatio,
            imgsz: o.size,
            licenses: o.license,
            location: o.location,
            no_cache: o.noCache === true ? true : undefined,
            period_unit:
              o.recency === undefined ? undefined : RECENCY_CODE[o.recency],
            q: query,
            safe: o.safe,
            start_date: compactDate("publishedAfter", o.publishedAfter),
          }),
        })
      );
      failIfError(response);
      const results = list(response.images_results).flatMap((entry) => {
        const item = record(entry);
        const url = text(item.original);
        return url
          ? [
              compact({
                height: num(item.original_height),
                sourceUrl: text(item.link),
                thumbnailUrl: text(item.thumbnail),
                title: text(item.title),
                url,
                width: num(item.original_width),
              }),
            ]
          : [];
      });
      return compact({ meta: searchMeta(response), raw: response, results });
    },

    async search(query, options) {
      const { call, rest } = callSettings(options);
      const { engine = "google", ...chosen } = rest;
      const o: Json = { ...chosen };
      // The type limits `engine`, but callers without types can pass any name.
      if (!Object.hasOwn(ENGINES, engine)) {
        throw invalid(`does not offer the engine "${engine}"`);
      }
      const spec = ENGINES[engine];
      onlyAllowed(engine, o, spec.allowed);
      const response = record(
        await raw.request("GET", "/search", {
          ...call,
          query: compact({
            engine,
            q: query,
            ...spec.params(o),
            no_cache: o.noCache === true ? true : undefined,
          }),
        })
      );
      failIfError(response);
      return compact({
        answer: engine === "google" ? answerText(response) : undefined,
        meta: searchMeta(response),
        raw: response,
        results: spec.results(response),
      });
    },

    async usage(options) {
      const { call } = callSettings(options);
      const response = record(await raw.request("GET", "/account", call));
      // The account response echoes the API key; the result must not carry it.
      const safe = Object.fromEntries(
        Object.entries(response).filter(([name]) => name !== "api_key")
      );
      const breakdown: Record<string, number> = {};
      for (const name of ["this_hour_searches", "last_hour_searches"]) {
        const value = num(response[name]);
        if (value !== undefined) {
          breakdown[name] = value;
        }
      }
      return compact({
        breakdown: Object.keys(breakdown).length > 0 ? breakdown : undefined,
        limit: num(response.searches_per_month),
        periodEnd: text(response.plan_renewal_date),
        raw: safe,
        remaining: num(response.plan_searches_left),
        used: num(response.this_month_usage),
      });
    },
  };

  return defineAdapter({ name: provider, operations, raw });
};
