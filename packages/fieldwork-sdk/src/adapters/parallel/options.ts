import type {
  Answer,
  CallOptions,
  Condition,
  DecisionQuestion,
  Decisions,
  Discovery,
  Extraction,
  ImageSearch,
  JsonSchema,
  MonitorEvents,
  MonitorInfo,
  MonitorSchedule,
  Page,
  PageBatch,
  Research,
  SearchResponse,
} from "../../types.js";
import { compact, refuseTogether } from "../../util.js";
import type { Json } from "../../util.js";
import { invalid, nonEmpty, provider } from "./parse.js";

export interface ParallelConfig {
  /** Defaults to the PARALLEL_API_KEY environment variable. */
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Repeats of a request that can succeed on repeat; 2 unless set. `0` turns retrying off. */
  retries?: number;
}

/**
 * A Task API processor. Parallel documents `processor` as a free string, so any
 * name it accepts can be passed; the documented names autocomplete.
 */
export type ParallelProcessor =
  | "lite"
  | "base"
  | "core"
  | "core2x"
  | "pro"
  | "ultra"
  | "ultra2x"
  | "ultra4x"
  | "ultra8x"
  | (string & Record<never, never>);

/** Filters on which sources Parallel may use. */
export interface ParallelSources {
  /**
   * Domains, as plain `example.com` (subdomains match), `domain/path` prefixes
   * such as `docs.python.org/3`, or bare extensions such as `.gov`. When set,
   * Parallel ignores `excludeDomains`, so passing both is refused.
   */
  includeDomains?: string[];
  excludeDomains?: string[];
  /** YYYY-MM-DD. */
  publishedAfter?: string;
}

/** Task metadata: keys up to 16 characters, values up to 512. */
export type ParallelMetadata = Record<string, string | number | boolean>;

export interface ParallelSearchOptions extends CallOptions, ParallelSources {
  /** What the search is for, in plain words. Defaults to the query. */
  objective?: string;
  /** Several keyword queries of 3 to 6 words; defaults to the query alone. */
  queries?: string[];
  /**
   * `turbo` (about 200 ms, English and Japanese only), `fast` (about 700 ms),
   * `basic` or `advanced` (the default, richer retrieval).
   */
  mode?: "turbo" | "fast" | "basic" | "advanced";
  limit?: number;
  /** ISO 3166-1 alpha-2 code such as "GB", for geo-targeted results. */
  country?: string;
  /** Seconds a cached copy may be old. Parallel's minimum is 600; lower values are refused. */
  maxAge?: number;
  /** Cap on the characters of excerpts returned for each result. */
  maxCharsPerResult?: number;
  /** Cap on the characters of excerpts returned across all results. */
  maxCharsTotal?: number;
  /** Groups calls made for one larger task; Parallel may use it to improve later results. */
  sessionId?: string;
}

export interface ParallelImagesOptions extends CallOptions {
  /** The images wanted, in plain words, up to 5,000 characters. Defaults to the query. */
  objective?: string;
  /** Up to 5 image queries; defaults to the query alone. */
  queries?: string[];
  mode?: "fast" | "advanced";
  limit?: number;
  country?: string;
  sessionId?: string;
}

export interface ParallelReadOptions extends CallOptions {
  /** Return passages that answer this as `excerpts`. Sent as Parallel's `objective`. */
  query?: string;
  /** Keyword queries that focus the excerpts. */
  queries?: string[];
  /** Seconds a cached copy may be old. Parallel's minimum is 600; lower values are refused. */
  maxAge?: number;
  /** Cap on the characters of the page text returned for each URL. */
  maxContentChars?: number;
  /** Cap on the characters of excerpts returned for each URL. */
  maxCharsPerResult?: number;
  /** Cap on the characters of excerpts returned across all URLs. */
  maxCharsTotal?: number;
  sessionId?: string;
}

export type ParallelReadManyOptions = ParallelReadOptions;

export interface ParallelExtractOptions extends CallOptions {
  /**
   * The values to extract. Without one, Parallel picks the fields itself (its
   * `auto` output schema, which gives deep-research style output on `pro` and
   * above).
   */
  schema?: JsonSchema;
  prompt?: string;
  /** Defaults to "base". */
  processor?: ParallelProcessor;
  /** ISO 3166-1 alpha-2 code for geo-targeted search. */
  country?: string;
  metadata?: ParallelMetadata;
  /** Milliseconds between checks. */
  interval?: number;
  /**
   * The id of a job that timed out or was cancelled, from the error's
   * `jobId`. Waits for that job instead of starting a new one.
   */
  resume?: string;
}

export interface ParallelAnswerOptions extends CallOptions {
  /** The answer in the shape of this schema, in `output`. */
  schema?: JsonSchema;
  /** System instructions for the answer. */
  instructions?: string;
  /** How much research the answer does: `low`, `medium` (the default), `high` or `auto`. */
  effort?: "low" | "medium" | "high" | "auto";
  /** The `continuationId` of an earlier answer. */
  continueFrom?: string;
  /** Only these domains are searched. Parallel allows one of the two lists. */
  includeDomains?: string[];
  excludeDomains?: string[];
  /** Up to 16 keys, keys up to 64 characters, values up to 512. */
  metadata?: Record<string, string>;
}

export interface ParallelResearchOptions extends CallOptions, ParallelSources {
  /** Structured output in the shape of this schema; without one the output is report text. */
  schema?: JsonSchema;
  /** Defaults to "base". */
  processor?: ParallelProcessor;
  /** The `continuationId` of an earlier run. */
  continueFrom?: string;
  metadata?: ParallelMetadata;
  /** ISO 3166-1 alpha-2 code for geo-targeted search. */
  country?: string;
  /** Milliseconds between checks. */
  interval?: number;
  /**
   * The id of a job that timed out or was cancelled, from the error's
   * `jobId`. Waits for that job instead of starting a new one.
   */
  resume?: string;
}

export interface ParallelDiscoverOptions extends CallOptions {
  /** What kind of entity to find, such as "companies" or "people". */
  entityType: string;
  /** Every discovered entity is tested against all of these. */
  conditions: Condition[];
  /** Matches to find, 5 to 1,000. Defaults to 10. */
  limit?: number;
  /** `preview` tests 5 to 10 candidates; `core` and `pro` search deeper. Defaults to "base". */
  generator?: "preview" | "base" | "core" | "pro";
  /** Entities already known, left out of the results. Up to 10,000. */
  exclude?: { name: string; url: string }[];
  /**
   * Fills these fields for every match (Parallel's enrichment, run as a Task
   * after the run starts), returned in each entity's `data`.
   */
  schema?: JsonSchema;
  /** The Task processor that fills `schema`. Parallel defaults to "core". */
  processor?: ParallelProcessor;
  metadata?: ParallelMetadata;
  /** Milliseconds between checks. */
  interval?: number;
  /**
   * The id of a job that timed out or was cancelled, from the error's
   * `jobId`. Waits for that job instead of starting a new one; the request
   * options are ignored.
   */
  resume?: string;
}

export interface ParallelDecideOptions extends CallOptions {
  /** ISO 3166-1 alpha-2 code for geo-targeted search. */
  country?: string;
  /** Keep the passages each citation was taken from. Parallel defaults to true. */
  includeExcerpts?: boolean;
}

export type ParallelWebhookEvent =
  | "monitor.event.detected"
  | "monitor.execution.completed"
  | "monitor.execution.failed";

export interface ParallelMonitorCreateOptions
  extends CallOptions, ParallelSources {
  /**
   * What to watch for, in plain words. Parallel searches the web for it on
   * every run. Pass this or `taskRunId`.
   */
  query?: string;
  /**
   * Watch the output of an earlier Task run for changes instead of a query.
   * Cannot be combined with `query`, `schema`, `includeBackfill`, `country` or
   * the domain filters.
   */
  taskRunId?: string;
  /** Parallel runs at a fixed interval from 1 hour to 30 days; cron is refused. */
  schedule: MonitorSchedule;
  /** Events come back in the shape of this schema. */
  schema?: JsonSchema;
  /** The first run returns a sample of recent events (a preview, not exhaustive). */
  includeBackfill?: boolean;
  country?: string;
  webhookUrl?: string;
  /** Needs `webhookUrl`. Parallel sends every event type when omitted. */
  webhookEvents?: ParallelWebhookEvent[];
  /** Defaults to "lite". */
  processor?: "lite" | "base" | "core";
  /** Keys up to 16 characters, values up to 512. */
  metadata?: Record<string, string>;
}

export interface ParallelMonitorEventsOptions extends CallOptions {
  cursor?: string;
  /** 1 to 100. Parallel defaults to 20. */
  limit?: number;
  /** Also return runs that found no change. */
  includeCompletions?: boolean;
  /** Only the events of one run, from an earlier event's `event_group_id`. */
  eventGroupId?: string;
}

/**
 * A discovery that may have stopped early. `stopReason` is Parallel's
 * `termination_reason` when `status` is "partial".
 */
export type ParallelDiscovery<T> = Discovery<T> & { stopReason?: string };

export interface ParallelOperations {
  search: (
    query: string,
    options?: ParallelSearchOptions
  ) => Promise<SearchResponse>;
  images: (
    query: string,
    options?: ParallelImagesOptions
  ) => Promise<ImageSearch>;
  read: (url: string, options?: ParallelReadOptions) => Promise<Page>;
  readMany: (
    urls: string[],
    options?: ParallelReadManyOptions
  ) => Promise<PageBatch>;
  extract: <T = unknown>(
    url: string,
    options?: ParallelExtractOptions
  ) => Promise<Extraction<T>>;
  answer: <T = unknown>(
    question: string,
    options?: ParallelAnswerOptions
  ) => Promise<Answer<T>>;
  research: <T = unknown>(
    question: string,
    options?: ParallelResearchOptions
  ) => Promise<Research<T>>;
  discover: <T = Record<string, unknown>>(
    objective: string,
    options: ParallelDiscoverOptions
  ) => Promise<ParallelDiscovery<T>>;
  decide: (
    context: unknown,
    questions: Record<string, DecisionQuestion>,
    options?: ParallelDecideOptions
  ) => Promise<Decisions>;
  monitor: {
    create: (options: ParallelMonitorCreateOptions) => Promise<MonitorInfo>;
    get: (id: string, options?: CallOptions) => Promise<MonitorInfo>;
    list: (options?: CallOptions) => Promise<MonitorInfo[]>;
    /** Parallel cancels a monitor for good; it has no delete. */
    delete: (id: string, options?: CallOptions) => Promise<void>;
    events: (
      id: string,
      options?: ParallelMonitorEventsOptions
    ) => Promise<MonitorEvents>;
  };
}

/** Parallel's smallest `fetch_policy.max_age_seconds`. */
export const MIN_MAX_AGE_SECONDS = 600;
/** The most URLs one Extract call takes. */
export const MAX_EXTRACT_URLS = 20;
export const QUESTION_NAME = /^[A-Za-z0-9_-]+$/u;

export const sourcePolicy = (o: ParallelSources) => {
  refuseTogether(provider, o, "includeDomains", "excludeDomains");
  return nonEmpty({
    after_date: o.publishedAfter,
    exclude_domains: o.excludeDomains,
    include_domains: o.includeDomains,
  });
};

export const fetchPolicy = (maxAge: number | undefined) => {
  if (maxAge !== undefined && maxAge < MIN_MAX_AGE_SECONDS) {
    throw invalid(
      `parallel cannot use a cached copy younger than ${MIN_MAX_AGE_SECONDS} seconds (maxAge was ${maxAge}); it has no setting that always fetches fresh`
    );
  }
  return maxAge === undefined
    ? undefined
    : { max_age_seconds: Math.ceil(maxAge) };
};

export const jsonOutput = (schema: JsonSchema) => ({
  json_schema: schema,
  type: "json",
});

export const decisionQuestion = (
  name: string,
  question: DecisionQuestion
): Json => {
  if (question.type === "yesno") {
    return { instructions: question.question, type: "noul" };
  }
  if (question.type === "choice") {
    const choices = [...new Set(question.choices)];
    if (choices.length < 2 || choices.length > 255) {
      throw invalid(
        `parallel decisions take 2 to 255 distinct choices; question "${name}" has ${choices.length}`
      );
    }
    // Parallel wants a description per option; the choice's own text is all there is.
    return {
      criteria: Object.fromEntries(choices.map((choice) => [choice, choice])),
      instructions: question.question,
      type: "choice",
    };
  }
  if (question.type === "score") {
    const levels = Object.values(question.scale);
    if (levels.length < 2 || levels.length > 10) {
      throw invalid(
        `parallel decisions take a score scale of 2 to 10 levels; question "${name}" has ${levels.length}`
      );
    }
    return {
      criteria: levels,
      instructions: question.question,
      type: "score",
    };
  }
  // SAFETY: the checks above leave `question` as never; an untyped caller can
  // still pass another shape, and the message only reads its `type` to name it.
  throw invalid(
    `parallel does not know the question type "${String((question as { type?: unknown }).type)}" for "${name}"`
  );
};

export const NAMED_FREQUENCY = { day: "1d", hour: "1h", week: "1w" } as const;

export const frequency = (schedule: MonitorSchedule): string => {
  if ("cron" in schedule) {
    throw invalid(
      "parallel monitors run at a fixed interval from 1 hour to 30 days and cannot follow a cron expression; pass { every: ... }"
    );
  }
  const named = Object.entries(NAMED_FREQUENCY).find(
    ([name]) => name === schedule.every
  )?.[1];
  if (named) {
    return named;
  }
  const match = /^(?<count>\d+)(?<unit>[hd])$/u.exec(schedule.every);
  const count = Number(match?.groups?.count);
  const limit = match?.groups?.unit === "h" ? 720 : 30;
  if (!match || count < 1 || count > limit) {
    throw invalid(
      `parallel monitors run every 1 hour to 30 days; "${schedule.every}" is outside that`
    );
  }
  return schedule.every;
};

export const extractBody = (urls: string[], o: ParallelReadOptions) =>
  compact({
    advanced_settings: compact({
      excerpt_settings: nonEmpty({
        max_chars_per_result: o.maxCharsPerResult,
      }),
      fetch_policy: fetchPolicy(o.maxAge),
      full_content:
        o.maxContentChars !== undefined && o.maxContentChars !== 0
          ? { max_chars_per_result: o.maxContentChars }
          : true,
    }),
    max_chars_total: o.maxCharsTotal,
    objective: o.query,
    search_queries: o.queries,
    session_id: o.sessionId,
    urls,
  });
