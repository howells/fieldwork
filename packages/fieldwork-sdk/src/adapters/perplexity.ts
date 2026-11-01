import { defineAdapter } from "../adapter.js";
import { FieldworkError } from "../errors.js";
import { createRawClient, poll, requireKey } from "../http.js";
import type { RawClient } from "../http.js";
import type {
  Answer,
  CallOptions,
  Citation,
  DecisionAnswer,
  DecisionQuestion,
  Decisions,
  JsonSchema,
  Recency,
  Research,
  SearchResponse,
} from "../types.js";
import {
  callSettings,
  citation,
  compact,
  list,
  meta,
  num,
  parseJson,
  record,
  refuseTogether,
  requireId,
  text,
  uniqueCitations,
} from "../util.js";
import type { Json } from "../util.js";

export interface PerplexityConfig {
  /** Defaults to the PERPLEXITY_API_KEY environment variable. */
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

/** The filters Perplexity applies to web search, on `/search` and inside the Agent API's `web_search` tool. */
interface PerplexityFilters {
  /** Plain domains such as `nature.com`; Perplexity also accepts a path (`nature.com/articles`) or a top-level domain (`.gov`). At most 20. Not with `excludeDomains`. */
  includeDomains?: string[];
  /** Same forms as `includeDomains`. At most 20. Not with `includeDomains`. */
  excludeDomains?: string[];
  /** YYYY-MM-DD; when the page was published. Inclusive. */
  publishedAfter?: string;
  /** YYYY-MM-DD; when the page was published. */
  publishedBefore?: string;
  /** YYYY-MM-DD; when the page last changed. */
  lastUpdatedAfter?: string;
  /** YYYY-MM-DD; when the page last changed. */
  lastUpdatedBefore?: string;
  recency?: Recency;
}

export interface PerplexitySearchOptions
  extends CallOptions, PerplexityFilters {
  /** Results to return: up to 20, or up to 50 with `searchType: "people"`. */
  limit?: number;
  /**
   * More queries, searched together with the first in one request. Perplexity
   * allows five queries in all, and returns one flat list of results.
   */
  queries?: string[];
  /** `web` (default), `fast` (lower latency and cost) or `people` (an index of professionals). */
  searchType?: "web" | "fast" | "people";
  /** ISO 3166-1 alpha-2 code such as "GB". */
  country?: string;
  /** ISO 639-1 codes, at most 20. Several codes match any of them. */
  language?: string | string[];
  /** Page-content tokens across all results. */
  maxTokens?: number;
  /** Page-content tokens for each result. */
  maxTokensPerPage?: number;
}

/** An effort level, or a name pinned to a version such as `fast@2026-10-16.0`. */
type Pinned<Name extends string> = Name | `${Name}@${string}`;

export interface PerplexityAnswerOptions extends CallOptions {
  /** Defaults to "fast". Answers are synchronous, so only the quicker levels are offered. */
  effort?: Pinned<"fast" | "low" | "medium">;
  instructions?: string;
  schema?: JsonSchema;
  /** The `continuationId` of an earlier answer or research result. */
  continueFrom?: string;
}

/**
 * Perplexity's effort levels. The names change slowly, so the type is open:
 * `ultra-preview` and version pins (`high@2026-10-28.0`) are accepted too.
 */
export type PerplexityEffort =
  | "fast"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "ultra-preview"
  // oxlint-disable-next-line typescript/ban-types -- an open string keeps autocomplete for the known names
  | (string & {});

export interface PerplexityResearchOptions
  extends CallOptions, PerplexityFilters {
  schema?: JsonSchema;
  /**
   * The configuration to run: a model, tools, system prompt and step budget in
   * one name. Defaults to "high" when neither `effort`, `model` nor `models` is
   * given.
   */
  effort?: PerplexityEffort;
  /** A model in `provider/model` form, such as `openai/gpt-6-luna`. Overrides the effort's model. */
  model?: string;
  /** Models to try in order, one to five; the first that works answers. Takes precedence over `model`. */
  models?: string[];
  /**
   * Caps steps of the research loop (1 to 500), not money. With `model` or
   * `models` and no `effort`, Perplexity defaults to 1 step, so this adapter
   * sends 10 unless you set it.
   */
  maxSteps?: number;
  maxOutputTokens?: number;
  instructions?: string;
  /** ISO 639-1 code for the language of the report. */
  languagePreference?: string;
  /** ISO 3166-1 alpha-2 code such as "GB", sent as the search location. */
  country?: string;
  /** The `continuationId` of an earlier answer or research result. */
  continueFrom?: string;
  /** The id of a run from an error's `jobId`; waits for it instead of starting another. */
  resume?: string;
  /** Milliseconds between checks. Defaults to 2000. */
  interval?: number;
}

export type PerplexityDeciderModel =
  | "pplx-decider-v1.2"
  | "pplx-decider-flash-v1.2"
  | "pplx-decider-latest"
  | "pplx-decider-flash-latest"
  // oxlint-disable-next-line typescript/ban-types -- an open string keeps autocomplete for the known names
  | (string & {});

export interface PerplexityDecideOptions extends CallOptions {
  /** Defaults to "pplx-decider-latest". The flash models are smaller and cheaper. */
  model?: PerplexityDeciderModel;
}

export interface PerplexityOperations {
  search(
    query: string,
    options?: PerplexitySearchOptions
  ): Promise<SearchResponse>;
  answer<T = unknown>(
    question: string,
    options?: PerplexityAnswerOptions
  ): Promise<Answer<T>>;
  research<T = unknown>(
    question: string,
    options?: PerplexityResearchOptions
  ): Promise<Research<T>>;
  decide(
    context: unknown,
    questions: Record<string, DecisionQuestion>,
    options?: PerplexityDecideOptions
  ): Promise<Decisions>;
}

const provider = "perplexity";
const MAX_QUERIES = 5;
const TERMINAL = new Set(["completed", "failed", "incomplete", "cancelled"]);

function invalid(message: string): FieldworkError {
  return new FieldworkError("InvalidRequest", message, { provider });
}

/** Perplexity takes dates as MM/DD/YYYY. */
function usDate(name: string, date: string | undefined) {
  if (date === undefined) {
    return date;
  }
  const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u.exec(date);
  if (!match?.groups) {
    throw invalid(`${name} must be YYYY-MM-DD, got "${date}"`);
  }
  const { year, month, day } = match.groups;
  return `${month}/${day}/${year}`;
}

/** The filter fields shared by `/search` and the agent's `web_search` tool. */
function filterFields(o: PerplexityFilters) {
  refuseTogether(provider, { ...o }, "includeDomains", "excludeDomains");
  const domains = o.includeDomains ?? o.excludeDomains?.map((d) => `-${d}`);
  return compact({
    last_updated_after_filter: usDate("lastUpdatedAfter", o.lastUpdatedAfter),
    last_updated_before_filter: usDate(
      "lastUpdatedBefore",
      o.lastUpdatedBefore
    ),
    search_after_date_filter: usDate("publishedAfter", o.publishedAfter),
    search_before_date_filter: usDate("publishedBefore", o.publishedBefore),
    search_domain_filter: domains && domains.length > 0 ? domains : undefined,
    search_recency_filter: o.recency,
  });
}

/** A `web_search` tool entry carrying the caller's filters, or undefined when there are none. */
function webSearchTool(o: PerplexityFilters & { country?: string }) {
  const filters = filterFields(o);
  const tool = compact({
    filters: Object.keys(filters).length > 0 ? filters : undefined,
    type: "web_search",
    user_location: o.country ? { country: o.country } : undefined,
  });
  return Object.keys(tool).length > 1 ? tool : undefined;
}

function languageCodes(language: string | string[] | undefined) {
  const codes = [language ?? []].flat().map((code) => code.toLowerCase());
  return codes.length > 0 ? codes : undefined;
}

function errorCode(jobId: string | undefined, rateLimited: boolean) {
  if (jobId) {
    return "JobFailed";
  }
  return rateLimited ? "RateLimited" : "ProviderError";
}

/** The error an Agent API response carries, as a Fieldwork error. */
function responseError(response: Json, jobId?: string) {
  const error = record(response.error);
  const message =
    text(error.message) ?? `ended ${text(response.status) ?? "unknown"}`;
  const type = text(error.type);
  const rateLimited =
    type === "request_rate_limit_exceeded" ||
    type === "token_rate_limit_exceeded";
  return new FieldworkError(
    errorCode(jobId, rateLimited),
    `perplexity ${message}`,
    {
      cause: response,
      jobId,
      provider,
      retryable: rateLimited || type === "overloaded",
    }
  );
}

/** The sources a tool-result output item lists: search results or fetched pages. */
function retrievedBy(entry: Json): unknown[] {
  if (entry.type === "search_results") {
    return list(entry.results);
  }
  return entry.type === "fetch_url_results" ? list(entry.contents) : [];
}

/** The URL citations in a message part's annotations. */
function annotated(part: Json): Citation[] {
  return list(part.annotations)
    .map((annotation) => record(annotation))
    .filter(
      (found) => found.type === undefined || found.type === "url_citation"
    )
    .map((found) => citation(found))
    .filter((source): source is Citation => source !== undefined);
}

/** What an Agent API response says: its text, the sources the text cites and everything retrieved. */
function readResponse(response: Json) {
  const parts: string[] = [];
  const cited: Citation[] = [];
  const retrieved: Citation[] = [];
  for (const item of list(response.output)) {
    const entry = record(item);
    if (entry.type === "message") {
      for (const content of list(entry.content)) {
        const part = record(content);
        parts.push(text(part.text) ?? "");
        cited.push(...annotated(part));
      }
    }
    for (const found of retrievedBy(entry)) {
      const source = citation(found);
      if (source) {
        retrieved.push(compact({ title: source.title, url: source.url }));
      }
    }
  }
  return {
    cited: uniqueCitations(cited),
    retrieved: uniqueCitations(retrieved),
    text: parts.join(""),
  };
}

function responseMeta(response: Json, warnings?: string) {
  const usage = record(response.usage);
  const input = record(usage.input_tokens_details);
  return meta({
    costUsd: record(usage.cost).total_cost,
    requestId: response.id,
    units: {
      cacheCreationInputTokens: input.cache_creation_input_tokens,
      cacheReadInputTokens: input.cache_read_input_tokens,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      reasoningTokens: record(usage.output_tokens_details).reasoning_tokens,
      totalTokens: usage.total_tokens,
    },
    warnings,
  });
}

function responseFormat(schema: JsonSchema | undefined) {
  return schema
    ? { json_schema: { name: "output", schema }, type: "json_schema" }
    : undefined;
}

function numbers(value: unknown): Record<string, number> {
  return Object.fromEntries(
    Object.entries(record(value)).filter(
      (entry): entry is [string, number] => num(entry[1]) !== undefined
    )
  );
}

function decisionState(context: unknown) {
  if (typeof context === "string" || (typeof context === "object" && context)) {
    return context;
  }
  if (typeof context === "number" || typeof context === "boolean") {
    return String(context);
  }
  throw invalid("perplexity decide needs a context: a string, object or array");
}

async function search(
  raw: RawClient,
  query: string,
  options: PerplexitySearchOptions | undefined
): Promise<SearchResponse> {
  const { call, rest: o } = callSettings(options);
  const queries = [query, ...(o.queries ?? [])];
  if (queries.length > MAX_QUERIES) {
    throw invalid(
      `perplexity search takes at most ${MAX_QUERIES} queries in one request, got ${queries.length}`
    );
  }
  if (o.limit !== undefined && o.limit > 20 && o.searchType !== "people") {
    throw invalid(
      'perplexity search returns at most 20 results unless searchType is "people"'
    );
  }
  const response = record(
    await raw.request("POST", "/search", {
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
    })
  );
  return {
    meta: meta({ requestId: response.id }),
    raw: response,
    results: list(response.results).map((item) => {
      const result = record(item);
      return compact({
        lastUpdatedAt: text(result.last_updated),
        publishedAt: text(result.date),
        snippet: text(result.snippet),
        title: text(result.title),
        url: text(result.url) ?? "",
      });
    }),
  };
}

async function answer<T>(
  raw: RawClient,
  question: string,
  options: PerplexityAnswerOptions | undefined
): Promise<Answer<T>> {
  const { call, rest: o } = callSettings(options);
  const response = record(
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
  const read = readResponse(response);
  const status = text(response.status);
  if (status === "failed" || status === "cancelled" || !read.text) {
    throw responseError(response);
  }
  return compact({
    answer: read.text,
    citations: read.cited,
    continuationId: text(response.id),
    meta: responseMeta(
      response,
      status === "incomplete"
        ? "perplexity stopped before finishing the answer"
        : undefined
    ),
    output: o.schema ? parseJson(provider, read.text) : undefined,
    raw: response,
  }) as Answer<T>;
}

/** The model-and-tools part of a research request. */
function researchSetup(o: PerplexityResearchOptions) {
  if (o.models && (o.models.length < 1 || o.models.length > 5)) {
    throw invalid("perplexity models takes one to five models");
  }
  const searchTool = webSearchTool(o);
  // Without an effort level the run has no tools or step budget of its own.
  const direct =
    o.effort === undefined && (o.model !== undefined || o.models !== undefined);
  if (direct) {
    return {
      max_steps: o.maxSteps ?? 10,
      model: o.model,
      models: o.models,
      tools: [searchTool ?? { type: "web_search" }, { type: "fetch_url" }],
    };
  }
  return {
    effort: o.effort ?? "high",
    max_steps: o.maxSteps,
    model: o.model,
    models: o.models,
    tools: searchTool ? [searchTool] : undefined,
  };
}

/** Starts a background run, or picks up `resume`, and returns its id. */
async function startResearch(
  raw: RawClient,
  question: string,
  o: PerplexityResearchOptions,
  call: CallOptions
) {
  if (o.resume) {
    return o.resume;
  }
  const created = record(
    await raw.request("POST", "/v1/agent", {
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
  return requireId(provider, created.id);
}

/** The run's output, parsed against the schema when there is one. */
function researchOutput(
  response: Json,
  reply: string,
  schema: JsonSchema | undefined,
  id: string
) {
  if (!schema) {
    return reply;
  }
  const status = text(response.status);
  try {
    return parseJson(provider, reply);
  } catch (error) {
    if (status === "completed") {
      throw error;
    }
    // A run cut short can leave JSON that stops mid-value: no usable output.
    throw new FieldworkError(
      "JobFailed",
      `perplexity research ended ${status} with output that is not valid JSON`,
      { cause: response, jobId: id, provider }
    );
  }
}

async function research<T>(
  raw: RawClient,
  question: string,
  options: PerplexityResearchOptions | undefined
): Promise<Research<T>> {
  const { call, rest: o } = callSettings(options);
  const id = await startResearch(raw, question, o, call);
  const response = await poll(
    provider,
    id,
    async () => {
      const found = record(
        await raw.request("GET", `/v1/agent/${encodeURIComponent(id)}`, {
          signal: call.signal,
        })
      );
      return TERMINAL.has(text(found.status) ?? "") ? found : undefined;
    },
    { interval: o.interval, signal: call.signal, timeout: call.timeout }
  );
  const status = text(response.status);
  const read = readResponse(response);
  if (status === "failed" || !read.text) {
    throw responseError(response, id);
  }
  return compact({
    continuationId: id,
    id,
    meta: responseMeta(response),
    output: researchOutput(response, read.text, o.schema, id) as T,
    raw: response,
    retrieved: read.retrieved.length > 0 ? read.retrieved : undefined,
    sources: read.cited,
    status: status === "completed" ? "completed" : "partial",
    stopReason: status === "completed" ? undefined : status,
  }) as Research<T>;
}

/** The question in Perplexity's form. A score scale's keys are its scores; Perplexity numbers levels from 0. */
function decisionQuestion(question: DecisionQuestion) {
  if (question.type === "yesno") {
    return { instructions: question.question, type: "noul" };
  }
  if (question.type === "choice") {
    return {
      criteria: Object.fromEntries(
        question.choices.map((choice) => [choice, null])
      ),
      instructions: question.question,
      type: "choice",
    };
  }
  return {
    criteria: Object.values(question.scale),
    instructions: question.question,
    type: "score",
  };
}

/** The most likely option and its probability map, with score levels renamed to the scale's keys. */
function decisionAnswer(value: unknown, scores: string[] | undefined) {
  const found = record(value);
  if (found.type === "noul") {
    return compact({ probability: num(found.noul) });
  }
  let probabilities = numbers(found.probabilities);
  if (found.type === "score") {
    probabilities = Object.fromEntries(
      Object.entries(probabilities).map(([index, probability]) => [
        scores?.[Number(index)] ?? index,
        probability,
      ])
    );
  }
  const top = Object.entries(probabilities).toSorted(
    (a, b) => b[1] - a[1]
  )[0]?.[0];
  return compact({
    choice: text(found.choice) ?? top,
    confidence: num(found.confidence),
    probabilities,
  });
}

async function decide(
  raw: RawClient,
  context: unknown,
  questions: Record<string, DecisionQuestion>,
  options: PerplexityDecideOptions | undefined
): Promise<Decisions> {
  const { call, rest: o } = callSettings(options);
  const response = record(
    await raw.request("POST", "/v1/decisions", {
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
    })
  );
  const answers: Record<string, DecisionAnswer> = {};
  for (const [name, value] of Object.entries(record(response.answers))) {
    const question = questions[name];
    answers[name] = decisionAnswer(
      value,
      question?.type === "score" ? Object.keys(question.scale) : undefined
    );
  }
  const usage = record(response.usage);
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
}

export function perplexity(config: PerplexityConfig = {}) {
  const raw = createRawClient({
    baseUrl: config.baseUrl ?? "https://api.perplexity.ai",
    fetch: config.fetch,
    headers: {
      authorization: `Bearer ${requireKey(provider, config.apiKey, "PERPLEXITY_API_KEY")}`,
    },
    provider,
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
}
