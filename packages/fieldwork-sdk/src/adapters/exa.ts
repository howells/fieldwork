import { defineAdapter } from "../adapter.js";
import { FieldworkError } from "../errors.js";
import { createRawClient, poll, requireKey } from "../http.js";
import { checkOutput, jsonSchemaOf } from "../schema.js";
import type { CallOptions, FailedUrl, MonitorInfo } from "../types.js";
import {
  callSettings,
  hours,
  list,
  num,
  parseJson,
  record,
  requireId,
  text,
  uniqueCitations,
  citations,
  compact,
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
  invalid,
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

  const fetchContents = async (
    urls: string[],
    body: Record<string, unknown>,
    call: CallOptions
  ) =>
    record(
      await raw.request("POST", "/contents", {
        ...call,
        body: { urls, ...body },
      })
    );

  const readOne = async (
    url: string,
    body: Record<string, unknown>,
    call: CallOptions
  ) => {
    const response = await fetchContents([url], body, call);
    const [failed] = failedStatuses(response);
    if (failed) {
      const error = record(failed.error);
      throw new FieldworkError(
        failureCode(text(error.tag), num(error.httpStatusCode)),
        `exa could not read ${url}: ${statusReason(failed)}`,
        { cause: response, provider, status: num(error.httpStatusCode) }
      );
    }
    const [result] = list(response.results);
    if (result === undefined) {
      throw new FieldworkError(
        "ProviderError",
        `exa returned no content for ${url}`,
        { cause: response, provider }
      );
    }
    return { response, result };
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
        await raw.request("POST", "/monitors", { creates: true, ...call, body })
      );
    },

    async delete(id, options) {
      const { call } = callSettings(options);
      await raw.request("DELETE", `/monitors/${encodeURIComponent(id)}`, call);
    },

    async events(id, options) {
      const { call, rest: o } = callSettings(options);
      const response = record(
        await raw.request("GET", `/monitors/${encodeURIComponent(id)}/runs`, {
          ...call,
          query: { cursor: o.cursor, limit: o.limit },
        })
      );
      return compact({
        events: list(response.data).map((item) => monitorEvent(item)),
        next: response.hasMore === true ? text(response.nextCursor) : undefined,
        raw: response,
      });
    },

    async get(id, options) {
      const { call } = callSettings(options);
      return monitorInfo(
        await raw.request("GET", `/monitors/${encodeURIComponent(id)}`, call)
      );
    },

    async list(options) {
      const { call } = callSettings(options);
      const monitors: MonitorInfo[] = [];
      const seen = new Set<string>();
      let cursor: string | undefined;
      for (;;) {
        const page = record(
          await raw.request("GET", "/monitors", {
            ...call,
            query: { cursor, limit: 100 },
          })
        );
        monitors.push(...list(page.data).map((item) => monitorInfo(item)));
        cursor = text(page.nextCursor);
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
      const response = record(
        await raw.request("POST", "/answer", {
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
        })
      );
      const { answer: value } = response;
      const structured = typeof value === "object" && value !== null;
      return compact({
        answer: structured ? JSON.stringify(value) : (text(value) ?? ""),
        citations: uniqueCitations(citations(response.citations)),
        meta: responseMeta(response),
        output: structured
          ? await checkOutput(o.schema, value, { provider })
          : undefined,
        raw: response,
      });
    },

    async extract<T>(url: string, options: ExaExtractOptions<T>) {
      const { call, rest: o } = callSettings(options);
      const { response, result } = await readOne(
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
      const { summary } = record(result);
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
        meta: responseMeta(response),
        raw: response,
      });
    },

    monitor,

    async read(url, options) {
      const { call, rest: o } = callSettings(options);
      const { response, result } = await readOne(url, readBody(o), call);
      return compact({
        ...pageFrom(url, result, response),
        meta: responseMeta(response),
      });
    },

    async readMany(urls, options) {
      const { call, rest: o } = callSettings(options);
      if (urls.length === 0) {
        invalid("readMany needs at least one URL");
      }
      if (urls.length > MAX_READ_URLS) {
        invalid(`readMany reads at most ${MAX_READ_URLS} URLs per call`);
      }
      const response = await fetchContents(urls, readBody(o), call);
      const failed: FailedUrl[] = failedStatuses(response).map((status) => ({
        error: statusReason(status),
        url: text(status.id) ?? "",
      }));
      return {
        failed,
        meta: responseMeta(response),
        pages: list(response.results).map((item) => pageFrom("", item, item)),
        raw: response,
      };
    },

    async research<T>(question: string, options?: ExaResearchOptions<T>) {
      const { call, rest: o } = callSettings(options);
      checkResearch(o);
      const id =
        o.resume ??
        requireId(
          provider,
          record(
            await raw.request("POST", "/agent/runs", {
              creates: true,
              ...call,
              body: researchBody(question, o),
            })
          ).id
        );
      const run = await poll(
        provider,
        id,
        async () => {
          const current = record(
            await raw.request("GET", `/agent/runs/${encodeURIComponent(id)}`, {
              signal: call.signal,
            })
          );
          return current.status === "completed" ||
            current.status === "failed" ||
            current.status === "cancelled"
            ? current
            : undefined;
        },
        { ...call, interval: o.interval }
      );
      // A resumed run echoes the request it was started with.
      const { outputSchema } = record(run.request);
      const structured =
        o.schema !== undefined ||
        (outputSchema !== undefined && outputSchema !== null);
      const result = researchResult(id, run, structured);
      return {
        ...result,
        output: await checkOutput(o.schema, result.output, {
          jobId: id,
          provider,
        }),
      };
    },

    async search(query, options) {
      const { call, rest: o } = callSettings(options);
      checkSearch(o);
      const response = record(
        await raw.request("POST", "/search", {
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
        })
      );
      return compact({
        answer: generatedAnswer(record(response.output)),
        meta: responseMeta(response, [
          ...list(response.warnings),
          ...list(response.notices),
        ]),
        raw: response,
        results: list(response.results).map((item) => searchResult(item)),
      });
    },
  };

  return defineAdapter({ name: provider, operations, raw });
};
