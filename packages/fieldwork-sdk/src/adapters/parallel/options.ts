// Parallel's option types, as exported from `@howells/fieldwork-sdk/parallel`, and
// the encoders that turn them into Parallel request fields. The adapter in
// ../parallel.ts calls the encoders; they refuse what Parallel rejects or ignores
// before anything is sent.

import { invalidRequest } from "../../errors.js";
import { jsonSchemaOf } from "../../schema.js";
import type { OutputSchema } from "../../schema.js";
import type {
  Answer,
  CallOptions,
  Condition,
  DecisionQuestion,
  Decisions,
  Discovery,
  Extraction,
  ImageSearch,
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
import { nonEmpty, provider } from "./parse.js";

/** Settings for `parallel()`. */
export interface ParallelConfig {
  /** Defaults to the PARALLEL_API_KEY environment variable. */
  apiKey?: string;
  /** Defaults to https://api.parallel.ai. */
  baseUrl?: string;
  /** Used in place of the global `fetch`. */
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
  /** Same forms as `includeDomains`. Not combinable with it. */
  excludeDomains?: string[];
  /** YYYY-MM-DD. Sent as `after_date`; there is no `publishedBefore`. */
  publishedAfter?: string;
}

/** Task metadata: keys up to 16 characters, values up to 512. */
export type ParallelMetadata = Record<string, string | number | boolean>;

/**
 * Options for `search` (`POST /v1/search`). A `maxAge` under 600 is refused. There
 * is no `recency` or `publishedBefore`; use `publishedAfter`.
 */
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
  /** Sent as `max_results`. */
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

/** Options for `images` (`POST /v1/images/search`). */
export interface ParallelImagesOptions extends CallOptions {
  /** The images wanted, in plain words, up to 5,000 characters. Defaults to the query. */
  objective?: string;
  /** Up to 5 image queries; defaults to the query alone. */
  queries?: string[];
  mode?: "fast" | "advanced";
  /** Sent as `max_results`. */
  limit?: number;
  /** ISO 3166-1 alpha-2 code such as "GB", for geo-targeted results. */
  country?: string;
  sessionId?: string;
}

/**
 * Options for `read` (`POST /v1/extract`). The page text comes back as `markdown`;
 * `query` and `queries` add focused `excerpts`. A `maxAge` under 600 is refused.
 */
export interface ParallelReadOptions extends CallOptions {
  /** Return passages that answer this as `excerpts`. Sent as Parallel's `objective`. */
  query?: string;
  /** Keyword queries that focus the excerpts. */
  queries?: string[];
  /** Seconds a cached copy may be old. Parallel's minimum is 600; lower values are refused. */
  maxAge?: number;
  /**
   * Cap on the characters of the page text returned for each URL. Without it,
   * or at 0, the full content is requested with no cap.
   */
  maxContentChars?: number;
  /** Cap on the characters of excerpts returned for each URL. */
  maxCharsPerResult?: number;
  /** Cap on the characters of excerpts returned across all URLs. */
  maxCharsTotal?: number;
  sessionId?: string;
}

/**
 * Options for `readMany`: the same as `read`, applied to every URL. Parallel takes
 * at most 20 URLs in one call.
 */
export type ParallelReadManyOptions = ParallelReadOptions;

/**
 * Options for `extract`: a Task run, polled to completion, whose input names
 * the URL and whose `source_policy.include_domains` holds one entry, the URL's
 * hostname and path with any trailing slash dropped. The scheme, credentials,
 * port, query string and fragment are not sent there, so the run is scoped by
 * hostname and path, not by the exact URL. `resume` waits for an earlier run
 * instead of starting another.
 */
export interface ParallelExtractOptions<T = unknown> extends CallOptions {
  /**
   * The values to extract. Without one, Parallel picks the fields itself (its
   * `auto` output schema, which gives deep-research style output on `pro` and
   * above). A JSON Schema, or a Zod, Valibot or ArkType schema that types and
   * checks `data`.
   */
  schema?: OutputSchema<T>;
  /**
   * Instructions for the run. Defaults to one that asks for the values in `schema`
   * from this page only, or for the page's main facts when there is no schema.
   */
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

/**
 * Options for `answer` (`POST /v1/responses`, synchronous). `includeDomains` and
 * `excludeDomains` are refused together.
 */
export interface ParallelAnswerOptions<T = unknown> extends CallOptions {
  /** The answer in the shape of this schema, in `output`. */
  schema?: OutputSchema<T>;
  /** System instructions for the answer. */
  instructions?: string;
  /** How much research the answer does: `low`, `medium` (the default), `high` or `auto`. */
  effort?: "low" | "medium" | "high" | "auto";
  /** The `continuationId` of an earlier answer. */
  continueFrom?: string;
  /** Only these domains are searched. Parallel allows one of the two lists. */
  includeDomains?: string[];
  /** These domains are not searched. Not combinable with `includeDomains`. */
  excludeDomains?: string[];
  /** Up to 16 keys, keys up to 64 characters, values up to 512. */
  metadata?: Record<string, string>;
}

/**
 * Options for `research`: a Task run polled to completion. `includeDomains` and
 * `excludeDomains` are refused together.
 */
export interface ParallelResearchOptions<T = unknown>
  extends CallOptions, ParallelSources {
  /** Structured output in the shape of this schema; without one the output is report text. */
  schema?: OutputSchema<T>;
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

/**
 * Options for `discover`: a FindAll run (`/v1beta/findall`) that finds entities
 * matching every condition, polled to completion. A run that stops early with at
 * least one match returns `status: "partial"`; one that ends with no match throws
 * `JobFailed`.
 */
export interface ParallelDiscoverOptions<T = unknown> extends CallOptions {
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
  schema?: OutputSchema<T>;
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

/**
 * Options for `decide` (`POST /v1/decisions`, synchronous). Parallel takes 1 to 100
 * questions named with letters, numbers, underscores and hyphens. A choice
 * question needs 2 to 255 distinct choices and a score scale 2 to 10 levels. All
 * three are refused before sending.
 */
export interface ParallelDecideOptions extends CallOptions {
  /** ISO 3166-1 alpha-2 code for geo-targeted search. */
  country?: string;
  /** Keep the passages each citation was taken from. Parallel defaults to true. */
  includeExcerpts?: boolean;
}

/** The event types a monitor webhook can subscribe to. */
export type ParallelWebhookEvent =
  | "monitor.event.detected"
  | "monitor.execution.completed"
  | "monitor.execution.failed";

/**
 * Options for `monitor.create`. A `query` makes an event-stream monitor that
 * searches the web on each run; a `taskRunId` makes a snapshot monitor of that
 * Task run's output. Pass one of the two. `webhookEvents` needs a `webhookUrl`.
 */
export interface ParallelMonitorCreateOptions
  extends CallOptions, ParallelSources {
  /**
   * What to watch for, in plain words. Parallel searches the web for it on
   * every run. Pass this or `taskRunId`.
   */
  query?: string;
  /**
   * Watch the output of an earlier Task run for changes instead of a query.
   * Cannot be combined with `query`, `schema`, `includeBackfill`, `country`,
   * `includeDomains`, `excludeDomains` or `publishedAfter`.
   */
  taskRunId?: string;
  /**
   * Parallel runs at a fixed interval from 1 hour to 30 days; cron is refused.
   * `every` is "hour", "day", "week", or a count such as "6h" (up to 720h) or
   * "3d" (up to 30d).
   */
  schedule: MonitorSchedule;
  /** Events come back in the shape of this schema. Events are not checked against a Standard Schema. */
  schema?: OutputSchema<unknown>;
  /** The first run returns a sample of recent events (a preview, not exhaustive). */
  includeBackfill?: boolean;
  country?: string;
  /** Where Parallel sends webhook events. */
  webhookUrl?: string;
  /** Needs `webhookUrl`. Parallel sends every event type when omitted. */
  webhookEvents?: ParallelWebhookEvent[];
  /** Defaults to "lite". */
  processor?: "lite" | "base" | "core";
  /** Keys up to 16 characters, values up to 512. */
  metadata?: Record<string, string>;
}

/**
 * Options for `monitor.events`: one page of a monitor's events. Pass the result's
 * `next` as `cursor` for the following page.
 */
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

/**
 * What Parallel offers: search, images, read, readMany, extract, answer, research,
 * discover, decide and monitor. `extract`, `research` and `discover` run as jobs
 * and accept `resume`.
 */
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
    options?: ParallelExtractOptions<T>
  ) => Promise<Extraction<T>>;
  answer: <T = unknown>(
    question: string,
    options?: ParallelAnswerOptions<T>
  ) => Promise<Answer<T>>;
  research: <T = unknown>(
    question: string,
    options?: ParallelResearchOptions<T>
  ) => Promise<Research<T>>;
  discover: <T = Record<string, unknown>>(
    objective: string,
    options: ParallelDiscoverOptions<T>
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
/** The characters Parallel allows in a decision question's name. */
export const QUESTION_NAME = /^[A-Za-z0-9_-]+$/u;

/**
 * Parallel's `source_policy`, or undefined when no filter is set. Refuses both
 * domain lists together, since Parallel ignores the exclude list when an include
 * list is present.
 */
export const sourcePolicy = (o: ParallelSources) => {
  refuseTogether(provider, o, "includeDomains", "excludeDomains");
  return nonEmpty({
    after_date: o.publishedAfter,
    exclude_domains: o.excludeDomains,
    include_domains: o.includeDomains,
  });
};

/**
 * Parallel's `fetch_policy` for a `maxAge`, rounded up to whole seconds. Refuses a
 * value under the minimum: Parallel has no setting that always fetches fresh.
 */
export const fetchPolicy = (maxAge: number | undefined) => {
  if (maxAge !== undefined && maxAge < MIN_MAX_AGE_SECONDS) {
    throw invalidRequest(
      provider,
      `cannot use a cached copy younger than ${MIN_MAX_AGE_SECONDS} seconds (maxAge was ${maxAge}); it has no setting that always fetches fresh`
    );
  }
  return maxAge === undefined
    ? undefined
    : { max_age_seconds: Math.ceil(maxAge) };
};

/**
 * Parallel's JSON output spec (`type: "json"`) for a schema, as Tasks and monitors
 * take it.
 */
export const jsonOutput = (schema: OutputSchema<unknown>) => ({
  json_schema: jsonSchemaOf(schema),
  type: "json",
});

/**
 * Parallel's form of a normalized decision question: `yesno` is `noul`, `choice`
 * keeps its type and `score` takes the scale's labels, in order, as criteria.
 * Refuses a choice or score count outside Parallel's limits.
 */
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
      throw invalidRequest(
        provider,
        `decisions take 2 to 255 distinct choices; question "${name}" has ${choices.length}`
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
      throw invalidRequest(
        provider,
        `decisions take a score scale of 2 to 10 levels; question "${name}" has ${levels.length}`
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
  throw invalidRequest(
    provider,
    `does not know the question type "${String((question as { type?: unknown }).type)}" for "${name}"`
  );
};

/** Parallel's short form of each named schedule. */
export const NAMED_FREQUENCY = { day: "1d", hour: "1h", week: "1w" } as const;

/**
 * Parallel's `frequency` string for a schedule: a named interval, or `<n>h` up to
 * 720 or `<n>d` up to 30. Refuses cron and anything outside 1 hour to 30 days.
 */
export const frequency = (schedule: MonitorSchedule): string => {
  if ("cron" in schedule) {
    throw invalidRequest(
      provider,
      "monitors run at a fixed interval from 1 hour to 30 days and cannot follow a cron expression; pass { every: ... }"
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
    throw invalidRequest(
      provider,
      `monitors run every 1 hour to 30 days; "${schedule.every}" is outside that`
    );
  }
  return schedule.every;
};

/**
 * The `/v1/extract` body that `read` and `readMany` share. It always asks for
 * `full_content`, capped only when `maxContentChars` is a non-zero number.
 */
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
