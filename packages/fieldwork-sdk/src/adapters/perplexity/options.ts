// Perplexity's option types, as exported from `@howells/fieldwork-sdk/perplexity`.
// ../perplexity.ts sends them; ./parse.ts encodes the filters and research setup.

import type { OutputSchema } from "../../schema.js";
import type {
  Answer,
  CallOptions,
  DecisionQuestion,
  Decisions,
  Recency,
  Research,
  SearchResponse,
} from "../../types.js";

/** Settings for `perplexity()`. */
export interface PerplexityConfig {
  /** Defaults to the PERPLEXITY_API_KEY environment variable. */
  apiKey?: string;
  /** Defaults to https://api.perplexity.ai. */
  baseUrl?: string;
  /** Used in place of the global `fetch`. */
  fetch?: typeof fetch;
  /** Repeats of a request that can succeed on repeat; 2 unless set. `0` turns retrying off. */
  retries?: number;
}

/**
 * The filters Perplexity applies to web search, on `/search` and inside the
 * Agent API's `web_search` tool. Dates are given as YYYY-MM-DD and sent as
 * MM/DD/YYYY, which Perplexity requires. Perplexity has one domain list, so
 * `excludeDomains` entries are sent with a leading `-`.
 */
export interface PerplexityFilters {
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

/**
 * Options for `search` (`POST /search`). Refused before sending: both domain lists,
 * more than five queries in all, a `limit` over 20 without `searchType: "people"`,
 * and a date that is not YYYY-MM-DD.
 */
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
  /** ISO 639-1 codes, at most 20, lower-cased before sending. Several codes match any of them. */
  language?: string | string[];
  /** Page-content tokens across all results. */
  maxTokens?: number;
  /** Page-content tokens for each result. */
  maxTokensPerPage?: number;
}

/** An effort level, or a name pinned to a version such as `fast@2026-10-16.0`. */
type Pinned<Name extends string> = Name | `${Name}@${string}`;

/** Options for `answer`: a synchronous Agent API call. It takes no search filters. */
export interface PerplexityAnswerOptions<T = unknown> extends CallOptions {
  /** Defaults to "fast". Answers are synchronous, so only the quicker levels are offered. */
  effort?: Pinned<"fast" | "low" | "medium">;
  /** System instructions for the answer. */
  instructions?: string;
  /** A JSON Schema, or a Zod, Valibot or ArkType schema that types and checks `output`. */
  schema?: OutputSchema<T>;
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

/**
 * Options for `research`: a background Agent API run, polled until it ends. The
 * search filters go on the run's `web_search` tool, and both domain lists are
 * refused together. A run that ends `incomplete` or `cancelled` with output returns
 * `status: "partial"`.
 */
export interface PerplexityResearchOptions<T = unknown>
  extends CallOptions, PerplexityFilters {
  schema?: OutputSchema<T>;
  /**
   * The configuration to run: a model, tools, system prompt and step budget in
   * one name. Defaults to "high" when neither `effort`, `model` nor `models` is
   * given.
   */
  effort?: PerplexityEffort;
  /** A model in `provider/model` form, such as `openai/gpt-6-luna`. Overrides the effort's model. */
  model?: string;
  /**
   * Models to try in order, one to five (more is refused); the first that works
   * answers. Takes precedence over `model`. With `model` or `models` and no
   * `effort`, the run gets the `web_search` and `fetch_url` tools.
   */
  models?: string[];
  /**
   * Caps steps of the research loop (1 to 500), not money. With `model` or
   * `models` and no `effort`, Perplexity defaults to 1 step, so this adapter
   * sends 10 unless you set it.
   */
  maxSteps?: number;
  maxOutputTokens?: number;
  /** System instructions for the run. */
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

/** Perplexity's decider models. The type is open so newer names are accepted. */
export type PerplexityDeciderModel =
  | "pplx-decider-v1.2"
  | "pplx-decider-flash-v1.2"
  | "pplx-decider-latest"
  | "pplx-decider-flash-latest"
  // oxlint-disable-next-line typescript/ban-types -- an open string keeps autocomplete for the known names
  | (string & {});

/** Options for `decide` (`POST /v1/decisions`). The result never has citations. */
export interface PerplexityDecideOptions extends CallOptions {
  /** Defaults to "pplx-decider-latest". The flash models are smaller and cheaper. */
  model?: PerplexityDeciderModel;
}

/**
 * What Perplexity offers: search, answer, research and decide. `research` runs as a
 * job and accepts `resume`.
 */
export interface PerplexityOperations {
  search: (
    query: string,
    options?: PerplexitySearchOptions
  ) => Promise<SearchResponse>;
  answer: <T = unknown>(
    question: string,
    options?: PerplexityAnswerOptions<T>
  ) => Promise<Answer<T>>;
  research: <T = unknown>(
    question: string,
    options?: PerplexityResearchOptions<T>
  ) => Promise<Research<T>>;
  decide: (
    context: unknown,
    questions: Record<string, DecisionQuestion>,
    options?: PerplexityDecideOptions
  ) => Promise<Decisions>;
}
