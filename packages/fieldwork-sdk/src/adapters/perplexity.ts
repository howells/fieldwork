// The Perplexity adapter. `search` calls `/search`; `answer` and `research` call
// the Agent API (`/v1/agent`), `answer` synchronously and `research` as a
// background run that is polled; `decide` calls `/v1/decisions`. The request
// encoders and response readers are in ./perplexity/parse.ts, the option types in
// ./perplexity/options.ts and the response schemas in ./perplexity/response.ts.

import * as z from "zod/mini";

import { defineAdapter } from "../adapter.js";
import { invalidRequest } from "../errors.js";
import { createRawClient, requireKey, segment } from "../http.js";
import type { RawClient } from "../http.js";
import { runJob } from "../job.js";
import { checkOutput } from "../schema.js";
import type {
  Answer,
  CallOptions,
  DecisionAnswer,
  DecisionQuestion,
  Decisions,
  Research,
  SearchResponse,
} from "../types.js";
import {
  callSettings,
  compact,
  meta,
  parseJson,
  requireJobId,
} from "../util.js";
import type {
  PerplexityAnswerOptions,
  PerplexityConfig,
  PerplexityDecideOptions,
  PerplexityOperations,
  PerplexityResearchOptions,
  PerplexitySearchOptions,
} from "./perplexity/options.js";
import {
  MAX_QUERIES,
  TERMINAL,
  decisionAnswer,
  decisionQuestion,
  decisionState,
  filterFields,
  languageCodes,
  provider,
  readResponse,
  researchOutput,
  researchSetup,
  responseError,
  responseFormat,
  responseMeta,
} from "./perplexity/parse.js";
import {
  AgentRun,
  AgentStart,
  DecisionsResponse,
  SearchResponse as SearchBodySchema,
} from "./perplexity/response.js";

export type {
  PerplexityAnswerOptions,
  PerplexityConfig,
  PerplexityDecideOptions,
  PerplexityDeciderModel,
  PerplexityEffort,
  PerplexityOperations,
  PerplexityResearchOptions,
  PerplexitySearchOptions,
} from "./perplexity/options.js";

/**
 * `/search`. The query and any `queries` go in one request and come back as one
 * flat list. Refuses more than five queries in all, and a `limit` over 20, or
 * over 50 when `searchType` is "people".
 */
const search = async (
  raw: RawClient,
  query: string,
  options: PerplexitySearchOptions | undefined
): Promise<SearchResponse> => {
  const { call, rest: o } = callSettings(options);
  const queries = [query, ...(o.queries ?? [])];
  if (queries.length > MAX_QUERIES) {
    throw invalidRequest(
      provider,
      `search takes at most ${MAX_QUERIES} queries in one request, got ${queries.length}`
    );
  }
  const maxResults = o.searchType === "people" ? 50 : 20;
  if (o.limit !== undefined && o.limit > maxResults) {
    throw invalidRequest(
      provider,
      'search returns at most 20 results, or 50 when searchType is "people"'
    );
  }
  const response = await raw.request("POST", "/search", {
    ...call,
    body: compact({
      country: o.country,
      max_results: o.limit,
      max_tokens: o.maxTokens,
      max_tokens_per_page: o.maxTokensPerPage,
      query: queries.length > 1 ? queries : query,
      search_language_filter: languageCodes(o.language),
      search_type: o.searchType,
      ...filterFields(o),
    }),
  });
  const body = z.parse(SearchBodySchema, response);
  return {
    meta: meta({ requestId: body.id }),
    raw: response,
    results: body.results.map((result) =>
      compact({
        lastUpdatedAt: result.last_updated,
        publishedAt: result.date,
        snippet: result.snippet,
        title: result.title,
        url: result.url ?? "",
      })
    ),
  };
};

/**
 * A synchronous Agent API call at the "fast" effort unless `effort` says
 * otherwise. An `incomplete` response returns its text with a warning; a failed or
 * cancelled one, or one with no text, throws.
 */
const answer = async <T>(
  raw: RawClient,
  question: string,
  options: PerplexityAnswerOptions<T> | undefined
): Promise<Answer<T>> => {
  const { call, rest: o } = callSettings(options);
  const run = z.parse(
    AgentRun,
    await raw.request("POST", "/v1/agent", {
      ...call,
      body: compact({
        effort: o.effort ?? "fast",
        input: question,
        instructions: o.instructions,
        previous_response_id: o.continueFrom,
        response_format: responseFormat(o.schema),
      }),
    })
  );
  const read = readResponse(run.value);
  const { status } = run.value;
  if (status === "failed" || status === "cancelled" || !read.text) {
    throw responseError(run);
  }
  return compact({
    answer: read.text,
    citations: read.cited,
    continuationId: run.value.id.first,
    meta: responseMeta(
      run.value,
      status === "incomplete"
        ? "perplexity stopped before finishing the answer"
        : undefined
    ),
    output: o.schema
      ? await checkOutput(o.schema, parseJson(provider, read.text), {
          provider,
        })
      : undefined,
    raw: run.original,
  });
};

/** Starts a background Agent API run and returns its id. */
const startResearch = async (
  raw: RawClient,
  question: string,
  o: PerplexityResearchOptions,
  call: CallOptions
) => {
  const created = z.parse(
    AgentStart,
    await raw.request("POST", "/v1/agent", {
      creates: true,
      ...call,
      body: compact({
        ...researchSetup(o),
        background: true,
        input: question,
        instructions: o.instructions,
        language_preference: o.languagePreference,
        max_output_tokens: o.maxOutputTokens,
        previous_response_id: o.continueFrom,
        response_format: responseFormat(o.schema),
      }),
    })
  );
  return requireJobId(provider, created.id);
};

/**
 * Polls a research run until it reaches a terminal status. A `completed` run
 * returns `completed`. An `incomplete` or `cancelled` one that left text returns
 * `partial` with that status as `stopReason`. A `failed` run, or one with no text,
 * throws `JobFailed`. The run's id is also its `continuationId`.
 */
const research = async <T>(
  raw: RawClient,
  question: string,
  options: PerplexityResearchOptions<T> | undefined
): Promise<Research<T>> => {
  const { call, rest: o } = callSettings(options);
  return await runJob(
    provider,
    {
      check: async (id, request) => {
        const found = z.parse(
          AgentRun,
          await raw.request("GET", `/v1/agent/${segment(id)}`, request)
        );
        return TERMINAL.has(found.value.status ?? "") ? found : undefined;
      },
      finish: async (run, id) => {
        const { status } = run.value;
        const read = readResponse(run.value);
        if (status === "failed" || !read.text) {
          throw responseError(run, id);
        }
        return compact({
          continuationId: id,
          id,
          meta: responseMeta(run.value),
          output: await checkOutput(
            o.schema,
            researchOutput(run, read.text, o.schema),
            { provider }
          ),
          raw: run.original,
          retrieved: read.retrieved.length > 0 ? read.retrieved : undefined,
          sources: read.cited,
          status:
            status === "completed"
              ? ("completed" as const)
              : ("partial" as const),
          stopReason: status === "completed" ? undefined : status,
        });
      },
      start: async () => await startResearch(raw, question, o, call),
    },
    { ...call, interval: o.interval, resume: o.resume }
  );
};

/**
 * `/v1/decisions`. Perplexity returns no citations, so `citations` is always empty.
 * Score answers are keyed by the caller's scale keys.
 */
const decide = async (
  raw: RawClient,
  context: unknown,
  questions: Record<string, DecisionQuestion>,
  options: PerplexityDecideOptions | undefined
): Promise<Decisions> => {
  const { call, rest: o } = callSettings(options);
  const response = await raw.request("POST", "/v1/decisions", {
    ...call,
    body: {
      model: o.model ?? "pplx-decider-latest",
      questions: Object.fromEntries(
        Object.entries(questions).map(([name, question]) => [
          name,
          decisionQuestion(question),
        ])
      ),
      state: decisionState(context),
    },
  });
  const body = z.parse(DecisionsResponse, response);
  const answers: Record<string, DecisionAnswer> = {};
  for (const [name, value] of Object.entries(body.answers)) {
    const question = questions[name];
    answers[name] = decisionAnswer(
      value,
      question?.type === "score" ? Object.keys(question.scale) : undefined
    );
  }
  const { usage } = body;
  return {
    answers,
    citations: [],
    meta: meta({
      units: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
      },
    }),
    raw: response,
  };
};

/**
 * An adapter for Perplexity: search, answer, research and decide. Pass it to `new Fieldwork({ adapter })`.
 *
 * Throws `Unauthorized` when neither `apiKey` nor `PERPLEXITY_API_KEY` is set.
 */
export const perplexity = (config: PerplexityConfig = {}) => {
  const raw = createRawClient({
    baseUrl: config.baseUrl ?? "https://api.perplexity.ai",
    fetch: config.fetch,
    headers: {
      authorization: `Bearer ${requireKey(provider, config.apiKey, "PERPLEXITY_API_KEY")}`,
    },
    provider,
    retries: config.retries,
  });

  const operations: PerplexityOperations = {
    async answer(question, options) {
      return await answer(raw, question, options);
    },
    async decide(context, questions, options) {
      return await decide(raw, context, questions, options);
    },
    async research(question, options) {
      return await research(raw, question, options);
    },
    async search(query, options) {
      return await search(raw, query, options);
    },
  };

  return defineAdapter({ name: provider, operations, raw });
};
