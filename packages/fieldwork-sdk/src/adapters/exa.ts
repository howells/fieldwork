// The Exa adapter: calls Exa's REST API with `fetch` and returns normalized results.
// Options and operation types are in exa/options.ts, request and result mapping in exa/parse.ts, response schemas in exa/response.ts.

import * as z from "zod/mini";

import { defineAdapter } from "../adapter.js";
import { FieldworkError, invalidRequest } from "../errors.js";
import { createRawClient, requireKey, segment } from "../http.js";
import { runJob } from "../job.js";
import { checkOutput, jsonSchemaOf } from "../schema.js";
import type { CallOptions, FailedUrl, MonitorInfo } from "../types.js";
import {
  callSettings,
  citationsOf,
  compact,
  hours,
  parseJson,
  requireJobId,
  uniqueCitations,
} from "../util.js";
import type {
  ExaAnswerOptions,
  ExaConfig,
  ExaExtractOptions,
  ExaMonitor,
  ExaOperations,
  ExaResearchOptions,
} from "./exa/options.js";
import {
  MAX_READ_URLS,
  checkResearch,
  checkSearch,
  dateTime,
  failedStatuses,
  failureCode,
  generatedAnswer,
  monitorEvent,
  monitorInfo,
  pageFrom,
  period,
  provider,
  readBody,
  researchBody,
  researchResult,
  responseMeta,
  searchContents,
  searchResult,
  statusReason,
} from "./exa/parse.js";
import {
  AnswerResponse,
  ContentsResponse,
  MonitorEntry,
  MonitorsPage,
  RunEntry,
  RunStart,
  RunsPage,
  SearchResponse,
} from "./exa/response.js";

export type {
  ExaAnswerOptions,
  ExaConfig,
  ExaExtractOptions,
  ExaHighlightOptions,
  ExaMonitor,
  ExaMonitorCreateOptions,
  ExaMonitorEventsOptions,
  ExaOperations,
  ExaOutputSchema,
  ExaReadManyOptions,
  ExaReadOptions,
  ExaResearchOptions,
  ExaSearchOptions,
  ExaWebhookEvent,
} from "./exa/options.js";

/**
 * An adapter for Exa: search, read, readMany, extract, answer, research and monitor. Pass it to `new Fieldwork({ adapter })`.
 *
 * Throws `Unauthorized` when neither `apiKey` nor `EXA_API_KEY` is set.
 */
export const exa = (config: ExaConfig = {}) => {
  const raw = createRawClient({
    baseUrl: config.baseUrl ?? "https://api.exa.ai",
    fetch: config.fetch,
    headers: {
      "x-api-key": requireKey(provider, config.apiKey, "EXA_API_KEY"),
    },
    provider,
    retries: config.retries,
  });

  /** Calls `/contents` for these URLs. A URL Exa could not read is in `statuses`, not an error. */
  const fetchContents = async (
    urls: string[],
    body: Record<string, unknown>,
    call: CallOptions
  ) => {
    const response = await raw.request("POST", "/contents", {
      ...call,
      body: { urls, ...body },
    });
    return { body: z.parse(ContentsResponse, response), response };
  };

  /** Reads one URL. Throws when Exa reports a failure for it or returns no result. */
  const readOne = async (
    url: string,
    body: Record<string, unknown>,
    call: CallOptions
  ) => {
    const { body: parsed, response } = await fetchContents([url], body, call);
    const [failed] = failedStatuses(parsed.statuses);
    if (failed) {
      const { httpStatusCode, tag } = failed.error;
      throw new FieldworkError(
        failureCode(tag, httpStatusCode),
        `exa could not read ${url}: ${statusReason(failed)}`,
        { cause: response, provider, status: httpStatusCode }
      );
    }
    const [result] = parsed.results;
    if (result === undefined) {
      throw new FieldworkError(
        "ProviderError",
        `exa returned no content for ${url}`,
        { cause: response, provider }
      );
    }
    return { body: parsed, response, result: result.value };
  };

  const monitor: ExaMonitor = {
    async create(options) {
      const { call, rest: o } = callSettings(options);
      const every = period(o.schedule);
      const body = compact({
        metadata: o.metadata,
        name: o.name,
        outputSchema: o.outputSchema,
        search: compact({
          contents: o.content === true ? { text: true } : undefined,
          excludeDomains: o.excludeDomains,
          includeDomains: o.includeDomains,
          numResults: o.limit,
          query: o.query,
        }),
        trigger:
          every === undefined ? undefined : { period: every, type: "interval" },
        webhook: compact({ events: o.webhookEvents, url: o.webhookUrl }),
      });
      return monitorInfo(
        z.parse(
          MonitorEntry,
          await raw.request("POST", "/monitors", {
            creates: true,
            ...call,
            body,
          })
        )
      );
    },

    async delete(id, options) {
      const { call } = callSettings(options);
      await raw.request("DELETE", `/monitors/${segment(id)}`, call);
    },

    async events(id, options) {
      const { call, rest: o } = callSettings(options);
      const response = await raw.request(
        "GET",
        `/monitors/${segment(id)}/runs`,
        { ...call, query: { cursor: o.cursor, limit: o.limit } }
      );
      const page = z.parse(RunsPage, response);
      return compact({
        events: page.data.map((entry) => monitorEvent(entry)),
        next: page.hasMore === true ? page.nextCursor : undefined,
        raw: response,
      });
    },

    async get(id, options) {
      const { call } = callSettings(options);
      return monitorInfo(
        z.parse(
          MonitorEntry,
          await raw.request("GET", `/monitors/${segment(id)}`, call)
        )
      );
    },

    async list(options) {
      const { call } = callSettings(options);
      const monitors: MonitorInfo[] = [];
      const seen = new Set<string>();
      let cursor: string | undefined;
      for (;;) {
        const page = z.parse(
          MonitorsPage,
          await raw.request("GET", "/monitors", {
            ...call,
            query: { cursor, limit: 100 },
          })
        );
        monitors.push(...page.data.map((entry) => monitorInfo(entry)));
        cursor = page.nextCursor;
        if (page.hasMore !== true || cursor === undefined || seen.has(cursor)) {
          return monitors;
        }
        seen.add(cursor);
      }
    },
  };

  const operations: ExaOperations = {
    async answer<T>(question: string, options?: ExaAnswerOptions<T>) {
      const { call, rest: o } = callSettings(options);
      const response = await raw.request("POST", "/answer", {
        ...call,
        body: compact({
          model: o.model,
          outputSchema:
            o.schema === undefined
              ? undefined
              : jsonSchemaOf(o.schema, "draft-07"),
          query: question,
          systemPrompt: o.systemPrompt,
          userLocation:
            o.country === undefined || o.country === ""
              ? undefined
              : { country: o.country },
        }),
      });
      const body = z.parse(AnswerResponse, response);
      const { structure, text } = body.answer;
      const answer = structure === undefined ? text : JSON.stringify(structure);
      if (answer === undefined || answer === "") {
        throw new FieldworkError(
          "ProviderError",
          "exa returned no answer text",
          {
            cause: response,
            provider,
          }
        );
      }
      return compact({
        answer,
        citations: uniqueCitations(citationsOf(body.citations)),
        meta: responseMeta(body),
        output:
          structure === undefined
            ? undefined
            : await checkOutput(o.schema, structure, { provider }),
        raw: response,
      });
    },

    async extract<T>(url: string, options: ExaExtractOptions<T>) {
      const { call, rest: o } = callSettings(options);
      const { body, response, result } = await readOne(
        url,
        compact({
          maxAgeHours: hours(o.maxAge),
          summary: compact({
            query: o.prompt,
            schema: jsonSchemaOf(o.schema, "draft-07"),
          }),
        }),
        call
      );
      const { value: summary } = result.summary;
      if (summary === undefined) {
        throw new FieldworkError(
          "ProviderError",
          `exa returned no structured summary for ${url}`,
          { cause: response, provider }
        );
      }
      return compact({
        data: await checkOutput(o.schema, parseJson(provider, summary), {
          provider,
        }),
        meta: responseMeta(body),
        raw: response,
      });
    },

    monitor,

    async read(url, options) {
      const { call, rest: o } = callSettings(options);
      const { body, response, result } = await readOne(url, readBody(o), call);
      return compact({
        ...pageFrom(url, result),
        meta: responseMeta(body),
        raw: response,
      });
    },

    async readMany(urls, options) {
      const { call, rest: o } = callSettings(options);
      if (urls.length === 0) {
        throw invalidRequest(provider, "readMany needs at least one URL");
      }
      if (urls.length > MAX_READ_URLS) {
        throw invalidRequest(
          provider,
          `readMany reads at most ${MAX_READ_URLS} URLs per call`
        );
      }
      const { body, response } = await fetchContents(urls, readBody(o), call);
      const failed: FailedUrl[] = failedStatuses(body.statuses).map(
        (status) => ({
          error: statusReason(status),
          url: status.id ?? "",
        })
      );
      return {
        failed,
        meta: responseMeta(body),
        pages: body.results.map((entry) => ({
          ...pageFrom("", entry.value),
          raw: entry.original,
        })),
        raw: response,
      };
    },

    async research<T>(question: string, options?: ExaResearchOptions<T>) {
      const { call, rest: o } = callSettings(options);
      checkResearch(o);
      return await runJob(
        provider,
        {
          check: async (id, request) => {
            const current = z.parse(
              RunEntry,
              await raw.request("GET", `/agent/runs/${segment(id)}`, request)
            );
            const { status } = current.value;
            return status === "completed" ||
              status === "failed" ||
              status === "cancelled"
              ? current
              : undefined;
          },
          finish: async (run, id) => {
            // A resumed run echoes the request it was started with.
            const { outputSchema } = run.value.request;
            const structured =
              o.schema !== undefined ||
              (outputSchema !== undefined && outputSchema !== null);
            const result = researchResult(id, run, structured);
            return {
              ...result,
              output: await checkOutput(o.schema, result.output, { provider }),
            };
          },
          start: async () =>
            requireJobId(
              provider,
              z.parse(
                RunStart,
                await raw.request("POST", "/agent/runs", {
                  creates: true,
                  ...call,
                  body: researchBody(question, o),
                })
              ).id
            ),
        },
        { ...call, interval: o.interval, resume: o.resume }
      );
    },

    async search(query, options) {
      const { call, rest: o } = callSettings(options);
      checkSearch(o);
      const response = await raw.request("POST", "/search", {
        ...call,
        body: compact({
          additionalQueries: o.additionalQueries,
          category: o.category,
          contents: searchContents(o),
          endPublishedDate: dateTime(o.publishedBefore, true),
          excludeDomains: o.excludeDomains,
          includeDomains: o.includeDomains,
          moderation: o.moderation,
          numResults: o.limit,
          outputSchema: o.outputSchema,
          query,
          startPublishedDate: dateTime(o.publishedAfter, false),
          systemPrompt: o.systemPrompt,
          type: o.type,
          userLocation:
            o.country === undefined || o.country === ""
              ? undefined
              : { country: o.country },
        }),
      });
      const body = z.parse(SearchResponse, response);
      return compact({
        answer: generatedAnswer(body.output),
        meta: responseMeta(
          body,
          [...body.warnings, ...body.notices].filter(
            (note) => note !== undefined
          )
        ),
        raw: response,
        results: body.results.map((item) => searchResult(item)),
      });
    },
  };

  return defineAdapter({ name: provider, operations, raw });
};
