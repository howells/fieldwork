import { defineAdapter } from "../adapter.js";
import { FieldworkError } from "../errors.js";
import { createRawClient, poll, requireKey } from "../http.js";
import type { DecisionAnswer, ImageResult, MonitorInfo } from "../types.js";
import {
  callSettings,
  citations,
  compact,
  list,
  meta,
  num,
  parseJson,
  record,
  refuseTogether,
  strings,
  text,
  uniqueCitations,
} from "../util.js";
import { findAllResult, runTask, startFindAll } from "./parallel/jobs.js";
import type {
  ParallelAnswerOptions,
  ParallelConfig,
  ParallelDiscoverOptions,
  ParallelExtractOptions,
  ParallelOperations,
  ParallelResearchOptions,
} from "./parallel/options.js";
import {
  MAX_EXTRACT_URLS,
  QUESTION_NAME,
  decisionQuestion,
  extractBody,
  fetchPolicy,
  frequency,
  jsonOutput,
  sourcePolicy,
} from "./parallel/options.js";
import {
  basis,
  citedBy,
  decisionAnswer,
  discovery,
  extractFailure,
  extractMeta,
  invalid,
  monitorEvent,
  monitorInfo,
  nonEmpty,
  pageFrom,
  provider,
  responseMessages,
  taskMeta,
  usageUnits,
} from "./parallel/parse.js";

export type {
  ParallelAnswerOptions,
  ParallelConfig,
  ParallelDecideOptions,
  ParallelDiscoverOptions,
  ParallelDiscovery,
  ParallelExtractOptions,
  ParallelImagesOptions,
  ParallelMetadata,
  ParallelMonitorCreateOptions,
  ParallelMonitorEventsOptions,
  ParallelOperations,
  ParallelProcessor,
  ParallelReadManyOptions,
  ParallelReadOptions,
  ParallelResearchOptions,
  ParallelSearchOptions,
  ParallelSources,
  ParallelWebhookEvent,
} from "./parallel/options.js";

export function parallel(config: ParallelConfig = {}) {
  const raw = createRawClient({
    baseUrl: config.baseUrl ?? "https://api.parallel.ai",
    fetch: config.fetch,
    headers: {
      "x-api-key": requireKey(provider, config.apiKey, "PARALLEL_API_KEY"),
    },
    provider,
  });

  const operations: ParallelOperations = {
    async answer<T>(question: string, options?: ParallelAnswerOptions) {
      const { call, rest: o } = callSettings(options);
      refuseTogether(provider, o, "includeDomains", "excludeDomains");
      const filters = nonEmpty({
        allowed_domains: o.includeDomains,
        blocked_domains: o.excludeDomains,
      });
      const response = record(
        await raw.request("POST", "/v1/responses", {
          ...call,
          body: compact({
            input: question,
            instructions: o.instructions,
            metadata: o.metadata,
            model: "parallel",
            previous_response_id: o.continueFrom,
            reasoning: o.effort ? { effort: o.effort } : undefined,
            text: o.schema
              ? {
                  format: {
                    name: "answer",
                    schema: o.schema,
                    type: "json_schema",
                  },
                }
              : undefined,
            tools: filters ? [{ filters, type: "web_search" }] : undefined,
          }),
        })
      );
      const failure = record(response.error);
      if (response.status === "failed" || text(failure.message)) {
        throw new FieldworkError(
          "ProviderError",
          `parallel could not answer: ${text(failure.message) ?? "the response failed"}`,
          { cause: response, provider }
        );
      }
      const parts = responseMessages(response).flatMap((message) =>
        list(message.content)
          .map((part) => record(part))
          .filter((part) => part.type === "output_text")
      );
      const answer = parts
        .map((part) => text(part.text))
        .filter((part): part is string => part !== undefined)
        .join("\n\n");
      if (answer === "") {
        throw new FieldworkError(
          "ProviderError",
          `parallel returned no answer text (status ${text(response.status) ?? "unknown"})`,
          { cause: response, provider }
        );
      }
      const usage = record(response.usage);
      const incomplete = text(record(response.incomplete_details).reason);
      return compact({
        answer,
        citations: uniqueCitations(
          citations(
            parts
              .flatMap((part) => list(part.annotations))
              .filter((item) => record(item).type === "url_citation")
          )
        ),
        continuationId: text(response.id),
        meta: meta({
          requestId: response.id,
          units: {
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            total_tokens: usage.total_tokens,
          },
          warnings: incomplete
            ? [`the answer is incomplete: ${incomplete}`]
            : undefined,
        }),
        output: o.schema ? (parseJson(provider, answer) as T) : undefined,
        raw: response,
      });
    },

    async decide(context, questions, options) {
      const { call, rest: o } = callSettings(options);
      const entries = Object.entries(questions);
      const names = entries.map(([name]) => name);
      if (names.length < 1 || names.length > 100) {
        throw invalid(
          `parallel decisions take 1 to 100 questions; got ${names.length}`
        );
      }
      const badName = names.find((name) => !QUESTION_NAME.test(name));
      if (badName !== undefined) {
        throw invalid(
          `parallel question names use only letters, numbers, underscores and hyphens; "${badName}" does not`
        );
      }
      const response = record(
        await raw.request("POST", "/v1/decisions", {
          ...call,
          body: compact({
            advanced_settings: nonEmpty({
              include_excerpts: o.includeExcerpts,
              location: o.country,
            }),
            questions: Object.fromEntries(
              entries.map(([name, question]) => [
                name,
                decisionQuestion(name, question),
              ])
            ),
            state: context ?? null,
          }),
        })
      );
      const answers = record(response.answers);
      const result: Record<string, DecisionAnswer> = {};
      for (const [name, question] of entries) {
        if (answers[name] !== undefined) {
          result[name] = decisionAnswer(question, answers[name]);
        }
      }
      return compact({
        answers: result,
        citations: citations(response.citations),
        meta: meta({
          requestId: response.decision_id,
          units: { input_tokens: record(response.usage).input_tokens },
        }),
        raw: response,
      });
    },

    async discover<T>(objective: string, options: ParallelDiscoverOptions) {
      const { call, rest: o } = callSettings(options);
      const id = o.resume ?? (await startFindAll(raw, objective, o, call));
      const result = await poll(
        provider,
        id,
        async () => await findAllResult(raw, id, call.signal),
        { ...call, interval: o.interval }
      );
      return discovery<T>(id, result);
    },

    async extract<T>(url: string, options?: ParallelExtractOptions) {
      const { call, rest: o } = callSettings(options);
      const target = new URL(url);
      const { result } = await runTask(
        raw,
        compact({
          advanced_settings: nonEmpty({ location: o.country }),
          input: {
            instructions:
              o.prompt ??
              (o.schema
                ? "Extract the values in the output schema from this page only."
                : "Extract the main facts this page states."),
            url,
          },
          metadata: o.metadata,
          processor: o.processor ?? "base",
          source_policy: {
            include_domains: [
              `${target.hostname}${target.pathname}`.replace(/\/$/u, ""),
            ],
          },
          task_spec: {
            output_schema: o.schema ? jsonOutput(o.schema) : { type: "auto" },
          },
        }),
        { ...call, interval: o.interval, resume: o.resume }
      );
      const output = record(result.output);
      return compact({
        data: output.content as T,
        fields: basis(output.basis),
        meta: taskMeta(result),
        raw: result,
      });
    },

    async images(query, options) {
      const { call, rest: o } = callSettings(options);
      const response = record(
        await raw.request("POST", "/v1/images/search", {
          ...call,
          body: compact({
            advanced_settings: nonEmpty({
              location: o.country,
              max_results: o.limit,
            }),
            mode: o.mode,
            objective: o.objective ?? query,
            search_queries: o.queries ?? [query],
            session_id: o.sessionId,
          }),
        })
      );
      return compact({
        meta: meta({
          requestId: response.search_id,
          units: usageUnits(response.usage),
          warnings: response.warnings,
        }),
        raw: response,
        results: list(response.results).map((item): ImageResult => {
          const image = record(item);
          return compact({
            height: num(image.height),
            sourceUrl: text(image.source_page_url),
            title: text(image.title),
            url: text(image.image_url) ?? "",
            width: num(image.width),
          });
        }),
      });
    },

    monitor: {
      async create(options) {
        const { call, rest: o } = callSettings(options);
        const { urls } = o as { urls?: unknown };
        if (urls !== undefined) {
          throw invalid(
            "parallel monitors search the web for a query and cannot watch a list of URLs; restrict a query with includeDomains, which accepts domain/path prefixes"
          );
        }
        if (o.taskRunId === undefined && o.query === undefined) {
          throw invalid("a parallel monitor needs a query or a taskRunId");
        }
        if (o.taskRunId !== undefined) {
          for (const name of [
            "query",
            "schema",
            "includeBackfill",
            "country",
            "includeDomains",
            "excludeDomains",
            "publishedAfter",
          ]) {
            refuseTogether(provider, o, "taskRunId", name);
          }
        }
        if (o.webhookEvents && !o.webhookUrl) {
          throw invalid("webhookEvents needs a webhookUrl");
        }
        const response = await raw.request("POST", "/v1/monitors", {
          ...call,
          body: compact({
            frequency: frequency(o.schedule),
            metadata: o.metadata,
            processor: o.processor,
            settings:
              o.taskRunId === undefined
                ? compact({
                    advanced_settings: nonEmpty({
                      source_policy: sourcePolicy(o),
                      location: o.country,
                    }),
                    include_backfill: o.includeBackfill,
                    output_schema: o.schema ? jsonOutput(o.schema) : undefined,
                    query: o.query,
                  })
                : { task_run_id: o.taskRunId },
            type: o.taskRunId === undefined ? "event_stream" : "snapshot",
            webhook: o.webhookUrl
              ? compact({ event_types: o.webhookEvents, url: o.webhookUrl })
              : undefined,
          }),
        });
        return monitorInfo(response);
      },

      async delete(id, options) {
        await raw.request(
          "POST",
          `/v1/monitors/${encodeURIComponent(id)}/cancel`,
          options
        );
      },

      async events(id, options) {
        const { call, rest: o } = callSettings(options);
        const response = record(
          await raw.request(
            "GET",
            `/v1/monitors/${encodeURIComponent(id)}/events`,
            {
              ...call,
              query: {
                cursor: o.cursor,
                event_group_id: o.eventGroupId,
                include_completions: o.includeCompletions,
                limit: o.limit,
              },
            }
          )
        );
        return compact({
          events: list(response.events).map((item) => monitorEvent(item)),
          next: text(response.next_cursor),
          raw: response,
        });
      },

      async get(id, options) {
        return monitorInfo(
          await raw.request(
            "GET",
            `/v1/monitors/${encodeURIComponent(id)}`,
            options
          )
        );
      },

      async list(options) {
        const monitors: MonitorInfo[] = [];
        let cursor: string | undefined;
        do {
          const page = record(
            await raw.request("GET", "/v1/monitors", {
              ...options,
              query: { cursor, limit: 100 },
            })
          );
          monitors.push(
            ...list(page.monitors).map((item) => monitorInfo(item))
          );
          cursor = text(page.next_cursor);
        } while (cursor !== undefined);
        return monitors;
      },
    },

    async read(url, options) {
      const { call, rest: o } = callSettings(options);
      const response = record(
        await raw.request("POST", "/v1/extract", {
          ...call,
          body: extractBody([url], o),
        })
      );
      const result = record(list(response.results)[0]);
      if (!result.url) {
        const failure = record(list(response.errors)[0]);
        throw new FieldworkError(
          "ProviderError",
          `parallel could not read ${url}: ${
            Object.keys(failure).length > 0
              ? extractFailure(failure)
              : "no content returned"
          }`,
          { cause: response, provider }
        );
      }
      return pageFrom(result, { meta: extractMeta(response), raw: response });
    },

    async readMany(urls, options) {
      const { call, rest: o } = callSettings(options);
      if (urls.length > MAX_EXTRACT_URLS) {
        throw invalid(
          `parallel reads up to ${MAX_EXTRACT_URLS} URLs in one call; got ${urls.length}`
        );
      }
      const response = record(
        await raw.request("POST", "/v1/extract", {
          ...call,
          body: extractBody(urls, o),
        })
      );
      return compact({
        failed: list(response.errors).map((item) => {
          const failure = record(item);
          return {
            error: extractFailure(failure),
            url: text(failure.url) ?? "",
          };
        }),
        id: text(response.extract_id),
        meta: extractMeta(response),
        pages: list(response.results).map((item) => pageFrom(record(item))),
        raw: response,
      });
    },

    async research<T>(question: string, options?: ParallelResearchOptions) {
      const { call, rest: o } = callSettings(options);
      const { id, result } = await runTask(
        raw,
        compact({
          advanced_settings: nonEmpty({ location: o.country }),
          input: question,
          metadata: o.metadata,
          previous_interaction_id: o.continueFrom,
          processor: o.processor ?? "base",
          source_policy: sourcePolicy(o),
          task_spec: {
            output_schema: o.schema ? jsonOutput(o.schema) : { type: "text" },
          },
        }),
        { ...call, interval: o.interval, resume: o.resume }
      );
      const output = record(result.output);
      const fields = basis(output.basis);
      return compact({
        continuationId: text(record(result.run).interaction_id),
        fields,
        id,
        meta: taskMeta(result),
        output: output.content as T,
        raw: result,
        sources: citedBy(fields),
        status: "completed" as const,
      });
    },

    async search(query, options) {
      const { call, rest: o } = callSettings(options);
      const response = record(
        await raw.request("POST", "/v1/search", {
          ...call,
          body: compact({
            advanced_settings: nonEmpty({
              excerpt_settings: nonEmpty({
                max_chars_per_result: o.maxCharsPerResult,
              }),
              fetch_policy: fetchPolicy(o.maxAge),
              location: o.country,
              max_results: o.limit,
              source_policy: sourcePolicy(o),
            }),
            max_chars_total: o.maxCharsTotal,
            mode: o.mode,
            objective: o.objective ?? query,
            search_queries: o.queries ?? [query],
            session_id: o.sessionId,
          }),
        })
      );
      return compact({
        meta: meta({
          requestId: response.search_id,
          units: usageUnits(response.usage),
          warnings: response.warnings,
        }),
        raw: response,
        results: list(response.results).map((item) => {
          const result = record(item);
          return compact({
            publishedAt: text(result.publish_date),
            snippet: strings(result.excerpts)?.join(" … "),
            title: text(result.title),
            url: text(result.url) ?? "",
          });
        }),
      });
    },
  };

  return defineAdapter({ name: provider, operations, raw });
}
