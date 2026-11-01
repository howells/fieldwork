import * as z from "zod/mini";

import { defineAdapter } from "../adapter.js";
import { FieldworkError } from "../errors.js";
import { createRawClient, requireKey } from "../http.js";
import { callSettings, compact, refuseTogether } from "../util.js";
import type { Json } from "../util.js";
import { ENGINES, IMAGE_OPTIONS, onlyAllowed } from "./serpapi/engines.js";
import type { Query } from "./serpapi/engines.js";
import type { SerpApiConfig, SerpApiOperations } from "./serpapi/options.js";
import { RECENCY_CODE, compactDate, googleCountry } from "./serpapi/options.js";
import {
  answerText,
  imageResults,
  invalid,
  provider,
  searchFailure,
  searchMeta,
} from "./serpapi/parse.js";
import { AccountResponse, SearchResponse } from "./serpapi/response.js";

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
  const authenticated: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    url.searchParams.set("api_key", key);
    return await (config.fetch ?? globalThis.fetch)(url, init);
  };
  const raw = createRawClient({
    baseUrl: config.baseUrl ?? "https://serpapi.com",
    fetch: authenticated,
    headers: {},
    provider,
    retries: config.retries,
  });

  /** One `/search` call: the response as received, and its parsed body. A failed search throws. */
  const searchCall = async (
    call: ReturnType<typeof callSettings>["call"],
    query: Query
  ) => {
    const response = await raw.request("GET", "/search", { ...call, query });
    const body = z.parse(SearchResponse, response);
    const failure = searchFailure(body);
    if (failure !== undefined) {
      throw new FieldworkError("ProviderError", failure, {
        cause: response,
        provider,
        retryable: true,
      });
    }
    return { body, response };
  };

  const operations: SerpApiOperations = {
    async images(query, options) {
      const { call, rest: o } = callSettings(options);
      onlyAllowed("google_images", o, IMAGE_OPTIONS);
      refuseTogether(provider, o, "recency", "publishedAfter");
      refuseTogether(provider, o, "recency", "publishedBefore");
      const { body, response } = await searchCall(
        call,
        compact({
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
        })
      );
      return compact({
        meta: searchMeta(body),
        raw: response,
        results: imageResults(body),
      });
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
      const { body, response } = await searchCall(
        call,
        compact({
          engine,
          q: query,
          ...spec.params(o),
          no_cache: o.noCache === true ? true : undefined,
        })
      );
      return compact({
        answer: engine === "google" ? answerText(body) : undefined,
        meta: searchMeta(body),
        raw: response,
        results: spec.results(body),
      });
    },

    async usage(options) {
      const { call } = callSettings(options);
      const response = await raw.request("GET", "/account", call);
      const body = z.parse(AccountResponse, response);
      // The account response echoes the API key; the result must not carry it.
      const fields = z.safeParse(z.record(z.string(), z.unknown()), response);
      const safe = fields.success
        ? Object.fromEntries(
            Object.entries(fields.data).filter(([name]) => name !== "api_key")
          )
        : response;
      const breakdown: Record<string, number> = {};
      if (body.this_hour_searches !== undefined) {
        breakdown.this_hour_searches = body.this_hour_searches;
      }
      if (body.last_hour_searches !== undefined) {
        breakdown.last_hour_searches = body.last_hour_searches;
      }
      return compact({
        breakdown: Object.keys(breakdown).length > 0 ? breakdown : undefined,
        limit: body.searches_per_month,
        periodEnd: body.plan_renewal_date,
        raw: safe,
        remaining: body.plan_searches_left,
        used: body.this_month_usage,
      });
    },
  };

  return defineAdapter({ name: provider, operations, raw });
};
