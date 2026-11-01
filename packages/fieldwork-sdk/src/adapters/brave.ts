import { defineAdapter } from "../adapter.js";
import { FieldworkError } from "../errors.js";
import { createRawClient, requireKey } from "../http.js";
import type { ImageResult, SearchResult } from "../types.js";
import {
  callSettings,
  compact,
  list,
  meta,
  num,
  record,
  text,
} from "../util.js";
import type {
  BraveConfig,
  BraveOperations,
  SearchInput,
} from "./brave/options.js";
import {
  CITATION_TAG,
  USAGE_TAG,
  answerCitations,
  completionText,
  freshness,
  gogglesOf,
  lower,
  modeOf,
  parseContext,
  placeResult,
  provider,
  refuseUnsupported,
  result,
  section,
  tagBodies,
  upper,
  warningsOf,
  withQuery,
} from "./brave/parse.js";

export type {
  BraveAnswerOptions,
  BraveConfig,
  BraveContentSearchOptions,
  BraveImageOptions,
  BraveNewsSearchOptions,
  BraveOperations,
  BraveRecency,
  BraveResultType,
  BraveSafeSearch,
  BraveSearchOptions,
  BraveVideoSearchOptions,
  BraveWebSearchOptions,
} from "./brave/options.js";

export const brave = (config: BraveConfig = {}) => {
  const raw = createRawClient({
    baseUrl: config.baseUrl ?? "https://api.search.brave.com/res/v1",
    fetch: config.fetch,
    headers: {
      "X-Subscription-Token": requireKey(
        provider,
        config.apiKey,
        "BRAVE_API_KEY"
      ),
    },
    provider,
  });

  const operations: BraveOperations = {
    async answer(question, options) {
      const { call, rest: o } = callSettings(options);
      const location = compact({
        city: o.userLocation?.city,
        country: upper(o.userLocation?.country),
        region: o.userLocation?.region,
        timezone: o.userLocation?.timezone,
      });
      const searchOptions = compact({
        search_context_size: o.searchContextSize,
        user_location:
          Object.keys(location).length > 0
            ? { approximate: location, type: "approximate" }
            : undefined,
      });
      // Brave returns citations only on a stream, so the answer is always streamed.
      const response = await raw.request("POST", "/chat/completions", {
        ...call,
        body: compact({
          country: upper(o.country),
          enable_citations: true,
          language: lower(o.language),
          max_completion_tokens: o.maxTokens,
          messages: [{ content: question, role: "user" }],
          model: o.model,
          safesearch: o.safesearch,
          stream: true,
          web_search_options:
            Object.keys(searchOptions).length > 0 ? searchOptions : undefined,
        }),
      });
      const content = completionText(response);
      const answer = content
        .replace(CITATION_TAG, "")
        .replace(USAGE_TAG, "")
        .trim();
      if (answer === "") {
        throw new FieldworkError(
          "ProviderError",
          "brave returned no answer text",
          { cause: response, provider }
        );
      }
      const usage = tagBodies(content, USAGE_TAG).at(-1) ?? {};
      return compact({
        answer,
        citations: answerCitations(content),
        meta: meta({
          costUsd: usage["X-Request-Total-Cost"],
          units: {
            queries: usage["X-Request-Queries"],
            requests: usage["X-Request-Requests"],
            tokensIn: usage["X-Request-Tokens-In"],
            tokensOut: usage["X-Request-Tokens-Out"],
          },
        }),
        raw: response,
      });
    },

    async images(query, options) {
      const { call, rest: o } = callSettings(options);
      const response = record(
        await raw.request(
          "GET",
          withQuery("/images/search", {
            count: o.limit,
            country: upper(o.country),
            q: query,
            safesearch: o.safesearch,
            search_lang: lower(o.language),
            spellcheck: o.spellcheck,
          }),
          call
        )
      );
      const results: ImageResult[] = [];
      let withoutImage = 0;
      for (const item of list(response.results)) {
        const r = record(item);
        const properties = record(r.properties);
        const url = text(properties.url);
        if (url === undefined) {
          withoutImage += 1;
          continue;
        }
        results.push(
          compact({
            height: num(properties.height),
            sourceUrl: text(r.url),
            thumbnailUrl: text(record(r.thumbnail).src),
            title: text(r.title),
            url,
            width: num(properties.width),
          })
        );
      }
      const warnings = [
        ...warningsOf(response.query),
        ...(withoutImage > 0
          ? [`${withoutImage} results had no image URL and were left out`]
          : []),
      ];
      return compact({
        meta: meta({ warnings }),
        raw: response,
        results,
      });
    },

    async search(query, options) {
      const { call, rest } = callSettings(options);
      const o: SearchInput = rest;
      const mode = modeOf(o);
      refuseUnsupported(mode, o);
      const window = freshness(o);
      const goggles = gogglesOf(o.goggles);
      const shared = {
        count: o.limit,
        country: upper(o.country),
        freshness: window,
        goggles,
        operators: o.operators,
        q: query,
        safesearch: o.safesearch,
        search_lang: lower(o.language),
      };

      if (mode === "context") {
        const response = record(
          await raw.request(
            "GET",
            withQuery("/llm/context", {
              ...shared,
              context_threshold_mode: o.relevance,
              enable_source_metadata: o.sourceMetadata,
              maximum_number_of_tokens: o.maxTokens,
              maximum_number_of_tokens_per_url: o.maxTokensPerUrl,
              maximum_number_of_urls: o.limit,
            }),
            call
          )
        );
        return compact({ raw: response, results: parseContext(response) });
      }

      if (mode === "news" || mode === "videos") {
        const response = record(
          await raw.request(
            "GET",
            withQuery(`/${mode}/search`, {
              ...shared,
              extra_snippets: mode === "news" ? o.extraSnippets : undefined,
              offset: o.offset,
              spellcheck: o.spellcheck,
              ui_lang: o.uiLanguage,
            }),
            call
          )
        );
        const kind = mode === "news" ? "news" : "video";
        return compact({
          meta: meta({ warnings: warningsOf(response.query) }),
          raw: response,
          results: list(response.results)
            .map((item) => result(item, kind))
            .filter((item): item is SearchResult => item !== undefined),
        });
      }

      const response = record(
        await raw.request(
          "GET",
          withQuery("/web/search", {
            ...shared,
            extra_snippets: o.extraSnippets,
            offset: o.offset,
            result_filter: o.resultTypes?.join(","),
            spellcheck: o.spellcheck,
            text_decorations: o.textDecorations ?? false,
            ui_lang: o.uiLanguage,
            units: o.units,
          }),
          call
        )
      );
      return compact({
        meta: meta({ warnings: warningsOf(response.query) }),
        raw: response,
        results: [
          ...section(response, "web", (item) => result(item, "web")),
          ...section(response, "news", (item) => result(item, "news")),
          ...section(response, "discussions", (item) =>
            result(item, "discussion")
          ),
          ...section(response, "videos", (item) => result(item, "video")),
          ...section(response, "locations", placeResult),
        ],
      });
    },
  };

  return defineAdapter({ name: provider, operations, raw });
};
