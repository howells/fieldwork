// The Parallel adapter. Each operation builds its request here and reads the
// response with the helpers in ./parallel/parse.ts. ./parallel/options.ts holds
// the option types and request encoders, ./parallel/jobs.ts the Task and FindAll
// polling, and ./parallel/response.ts the response schemas.

import * as z from "zod/mini";

import { defineAdapter } from "../adapter.js";
import { FieldworkError, invalidRequest } from "../errors.js";
import { createRawClient, requireKey, segment } from "../http.js";
import { runJob } from "../job.js";
import { checkOutput, jsonSchemaOf } from "../schema.js";
import type {
  DecisionAnswer,
  Entity,
  ImageResult,
  MonitorInfo,
} from "../types.js";
import {
  callSettings,
  citationsOf,
  compact,
  meta,
  parseJson,
  refuseTogether,
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
  monitorEvent,
  monitorInfo,
  nonEmpty,
  pageFrom,
  provider,
  responseMessages,
  taskMeta,
  usageUnits,
} from "./parallel/parse.js";
import {
  AnswerResponse,
  DecisionsResponse,
  EventsPage,
  ExtractResponse,
  ImagesResponse,
  MonitorEntry,
  MonitorsPage,
  SearchResponse,
} from "./parallel/response.js";

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

/**
 * An adapter for Parallel: search, images, read, readMany, extract, answer, research, discover, decide and monitor. Pass it to `new Fieldwork({ adapter })`.
 *
 * Throws `Unauthorized` when neither `apiKey` nor `PARALLEL_API_KEY` is set.
 */
export const parallel = (config: ParallelConfig = {}) => {
  const raw = createRawClient({
    baseUrl: config.baseUrl ?? "https://api.parallel.ai",
    fetch: config.fetch,
    headers: {
      "x-api-key": requireKey(provider, config.apiKey, "PARALLEL_API_KEY"),
    },
    provider,
    retries: config.retries,
  });

  const operations: ParallelOperations = {
    async answer<T>(question: string, options?: ParallelAnswerOptions<T>) {
      const { call, rest: o } = callSettings(options);
      refuseTogether(provider, o, "includeDomains", "excludeDomains");
      const filters = nonEmpty({
        allowed_domains: o.includeDomains,
        blocked_domains: o.excludeDomains,
      });
      const response = await raw.request("POST", "/v1/responses", {
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
                  schema: jsonSchemaOf(o.schema),
                  type: "json_schema",
                },
              }
            : undefined,
          tools: filters ? [{ filters, type: "web_search" }] : undefined,
        }),
      });
      const body = z.parse(AnswerResponse, response);
      const failure = body.error.message;
      if (body.status === "failed" || failure !== undefined) {
        throw new FieldworkError(
          "ProviderError",
          `parallel could not answer: ${failure ?? "the response failed"}`,
          { cause: response, provider }
        );
      }
      const parts = responseMessages(body).flatMap((message) =>
        message.content.filter((part) => part.type === "output_text")
      );
      const answer = parts
        .map((part) => part.text)
        .filter((part): part is string => part !== undefined)
        .join("\n\n");
      if (answer === "") {
        throw new FieldworkError(
          "ProviderError",
          `parallel returned no answer text (status ${body.status ?? "unknown"})`,
          { cause: response, provider }
        );
      }
      const { usage } = body;
      const incomplete = body.incomplete_details.reason;
      return compact({
        answer,
        citations: uniqueCitations(
          citationsOf(
            parts
              .flatMap((part) => part.annotations)
              .filter((item) => item.type === "url_citation")
          )
        ),
        continuationId: body.id.text,
        meta: meta({
          requestId: body.id.request,
          units: {
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            total_tokens: usage.total_tokens,
          },
          warnings:
            incomplete === undefined
              ? undefined
              : [`the answer is incomplete: ${incomplete}`],
        }),
        output: o.schema
          ? await checkOutput(o.schema, parseJson(provider, answer), {
              provider,
            })
          : undefined,
        raw: response,
      });
    },

    async decide(context, questions, options) {
      const { call, rest: o } = callSettings(options);
      const entries = Object.entries(questions);
      const names = entries.map(([name]) => name);
      if (names.length < 1 || names.length > 100) {
        throw invalidRequest(
          provider,
          `decisions take 1 to 100 questions; got ${names.length}`
        );
      }
      const badName = names.find((name) => !QUESTION_NAME.test(name));
      if (badName !== undefined) {
        throw invalidRequest(
          provider,
          `question names use only letters, numbers, underscores and hyphens; "${badName}" does not`
        );
      }
      const response = await raw.request("POST", "/v1/decisions", {
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
      });
      const body = z.parse(DecisionsResponse, response);
      const result: Record<string, DecisionAnswer> = {};
      const unanswered: string[] = [];
      for (const [name, question] of entries) {
        // Own keys only, so a question named like an Object method is not answered by it.
        const found = Object.hasOwn(body.answers, name)
          ? body.answers[name]
          : undefined;
        const answer = found && decisionAnswer(question, found);
        if (answer === undefined) {
          unanswered.push(name);
        } else {
          result[name] = answer;
        }
      }
      if (unanswered.length > 0) {
        throw new FieldworkError(
          "ProviderError",
          `parallel returned no complete answer for ${unanswered.join(", ")}`,
          { cause: response, provider }
        );
      }
      return compact({
        answers: result,
        citations: citationsOf(body.citations),
        meta: meta({
          requestId: body.decision_id,
          units: { input_tokens: body.usage.input_tokens },
        }),
        raw: response,
      });
    },

    async discover<T>(objective: string, options: ParallelDiscoverOptions<T>) {
      const { call, rest: o } = callSettings(options);
      return await runJob(
        provider,
        {
          check: async (id, request) => await findAllResult(raw, id, request),
          finish: async (result, id) => {
            const found = discovery(id, result);
            const entities = await Promise.all(
              found.entities.map(
                async ({ data, ...entity }): Promise<Entity<T>> =>
                  data === undefined
                    ? entity
                    : {
                        ...entity,
                        data: await checkOutput(o.schema, data, { provider }),
                      }
              )
            );
            return { ...found, entities };
          },
          start: async () => await startFindAll(raw, objective, o, call),
        },
        { ...call, interval: o.interval, resume: o.resume }
      );
    },

    async extract<T>(url: string, options?: ParallelExtractOptions<T>) {
      const { call, rest: o } = callSettings(options);
      // Checked before anything is sent: new URL would throw a bare TypeError.
      if (!URL.canParse(url)) {
        throw invalidRequest(
          provider,
          `cannot extract ${url}: it is not a URL`
        );
      }
      const target = new URL(url);
      return await runTask(
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
          // Scopes the Task's sources by hostname and path; scheme, port, query and fragment are dropped.
          source_policy: {
            include_domains: [
              `${target.hostname}${target.pathname}`.replace(/\/$/u, ""),
            ],
          },
          task_spec: {
            output_schema: o.schema ? jsonOutput(o.schema) : { type: "auto" },
          },
        }),
        { ...call, interval: o.interval, resume: o.resume },
        async (result) => {
          const { output } = result.value;
          return compact({
            data: await checkOutput(o.schema, output.content, { provider }),
            fields: basis(output.basis),
            meta: taskMeta(result),
            raw: result.original,
          });
        }
      );
    },

    async images(query, options) {
      const { call, rest: o } = callSettings(options);
      const response = await raw.request("POST", "/v1/images/search", {
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
      });
      const body = z.parse(ImagesResponse, response);
      return compact({
        meta: meta({
          requestId: body.search_id,
          units: usageUnits(body.usage),
          warnings: body.warnings,
        }),
        raw: response,
        results: body.results.map((image): ImageResult =>
          compact({
            height: image.height,
            sourceUrl: image.source_page_url,
            title: image.title,
            url: image.image_url ?? "",
            width: image.width,
          })
        ),
      });
    },

    monitor: {
      async create(options) {
        const { call, rest: o } = callSettings(options);
        // Untyped callers can pass `urls`, which the options type leaves out.
        if (
          Object.entries(o).some(
            ([name, value]) => name === "urls" && value !== undefined
          )
        ) {
          throw invalidRequest(
            provider,
            "monitors search the web for a query and cannot watch a list of URLs; restrict a query with includeDomains, which accepts domain/path prefixes"
          );
        }
        if (o.taskRunId === undefined && o.query === undefined) {
          throw invalidRequest(
            provider,
            "a parallel monitor needs a query or a taskRunId"
          );
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
          ] as const) {
            refuseTogether(provider, o, "taskRunId", name);
          }
        }
        if (
          o.webhookEvents &&
          (o.webhookUrl === undefined || o.webhookUrl === "")
        ) {
          throw invalidRequest(provider, "webhookEvents needs a webhookUrl");
        }
        const response = await raw.request("POST", "/v1/monitors", {
          creates: true,
          ...call,
          body: compact({
            frequency: frequency(o.schedule),
            metadata: o.metadata,
            processor: o.processor,
            settings:
              o.taskRunId === undefined
                ? compact({
                    advanced_settings: nonEmpty({
                      location: o.country,
                      source_policy: sourcePolicy(o),
                    }),
                    include_backfill: o.includeBackfill,
                    output_schema: o.schema ? jsonOutput(o.schema) : undefined,
                    query: o.query,
                  })
                : { task_run_id: o.taskRunId },
            type: o.taskRunId === undefined ? "event_stream" : "snapshot",
            webhook:
              o.webhookUrl === undefined || o.webhookUrl === ""
                ? undefined
                : compact({
                    event_types: o.webhookEvents,
                    url: o.webhookUrl,
                  }),
          }),
        });
        return monitorInfo(z.parse(MonitorEntry, response));
      },

      async delete(id, options) {
        await raw.request(
          "POST",
          `/v1/monitors/${segment(id)}/cancel`,
          options
        );
      },

      async events(id, options) {
        const { call, rest: o } = callSettings(options);
        const response = await raw.request(
          "GET",
          `/v1/monitors/${segment(id)}/events`,
          {
            ...call,
            query: {
              cursor: o.cursor,
              event_group_id: o.eventGroupId,
              include_completions: o.includeCompletions,
              limit: o.limit,
            },
          }
        );
        const page = z.parse(EventsPage, response);
        return compact({
          events: page.events.map((entry) => monitorEvent(entry)),
          next: page.next_cursor,
          raw: response,
        });
      },

      async get(id, options) {
        return monitorInfo(
          z.parse(
            MonitorEntry,
            await raw.request("GET", `/v1/monitors/${segment(id)}`, options)
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
            await raw.request("GET", "/v1/monitors", {
              ...call,
              query: { cursor, limit: 100 },
            })
          );
          monitors.push(...page.monitors.map((entry) => monitorInfo(entry)));
          cursor = page.next_cursor;
          // A cursor seen before would page forever.
          if (cursor === undefined || seen.has(cursor)) {
            return monitors;
          }
          seen.add(cursor);
        }
      },
    },

    async read(url, options) {
      const { call, rest: o } = callSettings(options);
      const response = await raw.request("POST", "/v1/extract", {
        ...call,
        body: extractBody([url], o),
      });
      const body = z.parse(ExtractResponse, response);
      const [result] = body.results;
      if (result?.value.url === undefined) {
        const [failure] = body.errors;
        throw new FieldworkError(
          "ProviderError",
          `parallel could not read ${url}: ${
            failure !== undefined && Object.keys(failure).length > 0
              ? extractFailure(failure)
              : "no content returned"
          }`,
          { cause: response, provider }
        );
      }
      return pageFrom(result, { meta: extractMeta(body), raw: response });
    },

    async readMany(urls, options) {
      const { call, rest: o } = callSettings(options);
      if (urls.length > MAX_EXTRACT_URLS) {
        throw invalidRequest(
          provider,
          `reads up to ${MAX_EXTRACT_URLS} URLs in one call; got ${urls.length}`
        );
      }
      const response = await raw.request("POST", "/v1/extract", {
        ...call,
        body: extractBody(urls, o),
      });
      const body = z.parse(ExtractResponse, response);
      return compact({
        failed: body.errors.map((failure) => ({
          error: extractFailure(failure),
          url: failure.url ?? "",
        })),
        id: body.extract_id.text,
        meta: extractMeta(body),
        pages: body.results.map((entry) => pageFrom(entry)),
        raw: response,
      });
    },

    async research<T>(question: string, options?: ParallelResearchOptions<T>) {
      const { call, rest: o } = callSettings(options);
      return await runTask(
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
        { ...call, interval: o.interval, resume: o.resume },
        async (result, id) => {
          const { output, run } = result.value;
          const fields = basis(output.basis);
          return compact({
            continuationId: run.interaction_id,
            fields,
            id,
            meta: taskMeta(result),
            output: await checkOutput(o.schema, output.content, { provider }),
            raw: result.original,
            sources: citedBy(fields),
            status: "completed" as const,
          });
        }
      );
    },

    async search(query, options) {
      const { call, rest: o } = callSettings(options);
      const response = await raw.request("POST", "/v1/search", {
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
      });
      const body = z.parse(SearchResponse, response);
      return compact({
        meta: meta({
          requestId: body.search_id,
          units: usageUnits(body.usage),
          warnings: body.warnings,
        }),
        raw: response,
        results: body.results.map((result) =>
          compact({
            publishedAt: result.publish_date,
            // Parallel returns excerpts rather than one snippet, so they are joined.
            snippet:
              result.excerpts.length > 0
                ? result.excerpts.join(" … ")
                : undefined,
            title: result.title,
            url: result.url ?? "",
          })
        ),
      });
    },
  };

  return defineAdapter({ name: provider, operations, raw });
};
