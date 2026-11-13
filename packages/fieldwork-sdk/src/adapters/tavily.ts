// The Tavily adapter: calls Tavily's REST API with `fetch` and returns normalized results.
// Options and operation types are in tavily/options.ts, request and result mapping in tavily/parse.ts, response schemas in tavily/response.ts.

import * as z from "zod/mini";

import { defineAdapter } from "../adapter.js";
import { FieldworkError, invalidRequest } from "../errors.js";
import { createRawClient, requireKey, segment } from "../http.js";
import { jobState, requireOutput, runJob, startJob } from "../job.js";
import type { JobStates } from "../job.js";
import { checkOutput, jsonSchemaOf } from "../schema.js";
import type { Citation } from "../types.js";
import { callSettings, compact } from "../util.js";
import type {
  TavilyConfig,
  TavilyOperations,
  TavilyResearchOptions,
} from "./tavily/options.js";
import {
  chunks,
  extractBody,
  failures,
  imageResults,
  page,
  provider,
  researchFiles,
  responseMeta,
  searchBody,
  searchResults,
  traversal,
} from "./tavily/parse.js";
import {
  MapResponse,
  PagesResponse,
  ResearchRun,
  ResearchStart,
  SearchResponse,
  UsageResponse,
} from "./tavily/response.js";

export type {
  TavilyAnswerOptions,
  TavilyConfig,
  TavilyCrawlOptions,
  TavilyImagesOptions,
  TavilyMapOptions,
  TavilyOperations,
  TavilyReadManyOptions,
  TavilyReadOptions,
  TavilyResearchFile,
  TavilyResearchOptions,
  TavilySearchDepth,
  TavilySearchOptions,
} from "./tavily/options.js";

// Tavily's research statuses, always sent
// (docs.tavily.com/documentation/api-reference/endpoint/research-get).
const RESEARCH_STATES: JobStates = {
  done: ["completed"],
  failed: ["failed"],
  running: ["pending", "in_progress"],
};

/**
 * An adapter for Tavily: search, images, read, readMany, map, crawl, answer, research and usage. Pass it to `new Fieldwork({ adapter })`.
 *
 * Throws `Unauthorized` when neither `apiKey` nor `TAVILY_API_KEY` is set.
 */
export const tavily = (config: TavilyConfig = {}) => {
  const raw = createRawClient({
    baseUrl: config.baseUrl ?? "https://api.tavily.com",
    fetch: config.fetch,
    headers: Object.fromEntries(
      Object.entries({
        authorization: `Bearer ${requireKey(provider, config.apiKey, "TAVILY_API_KEY")}`,
        "x-project-id": config.projectId,
      }).filter((entry): entry is [string, string] => entry[1] !== undefined)
    ),
    provider,
    retries: config.retries,
  });

  const operations: TavilyOperations = {
    async answer(question, options) {
      const { call, rest } = callSettings(options);
      const { answerDepth, ...o } = rest;
      const response = await raw.request("POST", "/search", {
        ...call,
        body: {
          ...searchBody(question, o),
          include_answer: answerDepth ?? "basic",
        },
      });
      const body = z.parse(SearchResponse, response);
      const { answer } = body;
      if (answer === undefined) {
        throw new FieldworkError("ProviderError", "tavily returned no answer", {
          cause: response,
          provider,
        });
      }
      const sources: Citation[] = searchResults(body)
        .filter((result) => result.url !== "")
        .map((result) =>
          compact({
            excerpts: chunks(result.snippet),
            title: result.title,
            url: result.url,
          })
        );
      return compact({
        answer,
        citations: sources,
        meta: responseMeta(body),
        raw: response,
      });
    },

    async crawl(url, options) {
      const { call, rest: o } = callSettings(options);
      if (o.chunksPerSource !== undefined && o.instructions === undefined) {
        throw invalidRequest(provider, "chunksPerSource needs instructions");
      }
      const response = await raw.request("POST", "/crawl", {
        ...call,
        body: compact({
          url,
          ...traversal(o),
          chunks_per_source: o.chunksPerSource,
          extract_depth: o.extractDepth,
          format: o.format,
          include_images: o.includeImages,
          include_favicon: o.favicon,
        }),
      });
      const body = z.parse(PagesResponse, response);
      return compact({
        meta: responseMeta(body),
        pages: body.results.map((entry) =>
          page(entry, o.instructions !== undefined)
        ),
        raw: response,
      });
    },

    async images(query, options) {
      const { call, rest: o } = callSettings(options);
      const response = await raw.request("POST", "/search", {
        ...call,
        body: searchBody(query, {
          excludeDomains: o.excludeDomains,
          imageDescriptions: o.descriptions ?? true,
          includeDomains: o.includeDomains,
          includeImages: true,
          safeSearch: o.safeSearch,
          searchDepth: o.searchDepth,
          topic: o.topic,
        }),
      });
      const body = z.parse(SearchResponse, response);
      return compact({
        meta: responseMeta(body),
        raw: response,
        results: imageResults(body.images) ?? [],
      });
    },

    async map(url, options) {
      const { call, rest: o } = callSettings(options);
      const response = await raw.request("POST", "/map", {
        ...call,
        body: { url, ...traversal(o) },
      });
      const body = z.parse(MapResponse, response);
      return compact({
        links: body.results.map((link) => ({ url: link })),
        meta: responseMeta(body),
        raw: response,
      });
    },

    async read(url, options) {
      const { call, rest: o } = callSettings(options);
      const response = await raw.request("POST", "/extract", {
        ...call,
        body: extractBody([url], o),
      });
      const body = z.parse(PagesResponse, response);
      const [result] = body.results;
      if (result?.value.url === undefined) {
        const [failure] = failures(body.failed_results);
        const reason = failure?.error ?? "no content returned";
        throw new FieldworkError(
          /\b404\b|not found/iu.test(reason) ? "NotFound" : "ProviderError",
          `tavily could not read ${url}: ${reason}`,
          { cause: response, provider }
        );
      }
      return compact({
        ...page(result, o.query !== undefined),
        meta: responseMeta(body),
        raw: response,
      });
    },

    async readMany(urls, options) {
      const { call, rest: o } = callSettings(options);
      if (urls.length === 0 || urls.length > 20) {
        throw invalidRequest(provider, "reads 1 to 20 URLs in one call");
      }
      const response = await raw.request("POST", "/extract", {
        ...call,
        body: extractBody(urls, o),
      });
      const body = z.parse(PagesResponse, response);
      return compact({
        failed: failures(body.failed_results),
        meta: responseMeta(body),
        pages: body.results.map((entry) => page(entry, o.query !== undefined)),
        raw: response,
      });
    },

    async research<T>(question: string, options?: TavilyResearchOptions<T>) {
      const { call, rest: o } = callSettings(options);
      const files = researchFiles(o.files);
      return await runJob(
        provider,
        {
          check: async (id, request) => {
            const current = await raw.request(
              "GET",
              `/research/${segment(id)}`,
              { ...request, query: { include_usage: true } }
            );
            const parsed = z.parse(ResearchRun, current);
            const state = jobState(provider, id, RESEARCH_STATES, {
              original: current,
              value: parsed.status,
            });
            if (state === "failed") {
              throw new FieldworkError(
                "JobFailed",
                `tavily research ${id} failed`,
                { cause: current, provider }
              );
            }
            return state === "done"
              ? { body: parsed, response: current }
              : undefined;
          },
          finish: async ({ body: run, response }, id) => {
            const content = requireOutput(provider, id, {
              original: response,
              value: run.content,
            });
            return compact({
              id,
              meta: responseMeta(run),
              output: await checkOutput(o.schema, content, { provider }),
              raw: response,
              sources: run.sources.flatMap((source) =>
                source.url === undefined
                  ? []
                  : [compact({ title: source.title, url: source.url })]
              ),
              status: "completed" as const,
            });
          },
          start: async () =>
            await startJob(
              raw,
              "/research",
              {
                ...call,
                body: compact({
                  citation_format: o.citationFormat,
                  exclude_domains: o.excludeDomains,
                  files,
                  include_domains: o.includeDomains,
                  input: question,
                  model: o.model,
                  output_length: o.outputLength,
                  output_schema:
                    o.schema === undefined
                      ? undefined
                      : jsonSchemaOf(o.schema, "draft-2020-12", "tavily"),
                  stream: false,
                }),
              },
              ResearchStart,
              (reply) => reply.request_id
            ),
        },
        { ...call, interval: o.interval, resume: o.resume }
      );
    },

    async search(query, options) {
      const { call, rest: o } = callSettings(options);
      const response = await raw.request("POST", "/search", {
        ...call,
        body: searchBody(query, o),
      });
      const body = z.parse(SearchResponse, response);
      return compact({
        answer: body.answer,
        images: imageResults(body.images),
        meta: responseMeta(body),
        raw: response,
        results: searchResults(body),
      });
    },

    async usage(options) {
      const { call } = callSettings(options);
      const response = await raw.request("GET", "/usage", call);
      const { account, key } = z.parse(UsageResponse, response);
      const breakdown = Object.fromEntries(
        Object.entries({
          crawl: account.crawl_usage,
          extract: account.extract_usage,
          keyTotal: key.usage,
          map: account.map_usage,
          paygo: account.paygo_usage,
          research: account.research_usage,
          search: account.search_usage,
        }).filter((entry): entry is [string, number] => entry[1] !== undefined)
      );
      return compact({
        breakdown: Object.keys(breakdown).length > 0 ? breakdown : undefined,
        limit: account.plan_limit,
        raw: response,
        used: account.plan_usage,
      });
    },
  };

  return defineAdapter({ name: provider, operations, raw });
};
