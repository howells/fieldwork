// Option and operation types for the Exa adapter, exported from `@howells/fieldwork-sdk/exa`.
// The adapter in ../exa.ts implements them; parse.ts turns the options into Exa requests.

import type { OutputSchema } from "../../schema.js";
import type {
  Answer,
  CallOptions,
  Extraction,
  MonitorEvents,
  MonitorInfo,
  MonitorSchedule,
  Page,
  PageBatch,
  Research,
  SearchResponse,
} from "../../types.js";

/** Settings for the Exa adapter. */
export interface ExaConfig {
  /** Defaults to the EXA_API_KEY environment variable. */
  apiKey?: string;
  /** Defaults to https://api.exa.ai. */
  baseUrl?: string;
  /** Sends every request instead of the global `fetch`. */
  fetch?: typeof fetch;
  /** Repeats of a request that can succeed on repeat; 2 unless set. `0` turns retrying off. */
  retries?: number;
}

/**
 * Exa's `outputSchema` for generated output: free text, or an object schema.
 * Exa limits an object schema to 10 properties in total (nested ones count),
 * 2 levels of nesting, and an `items` entry on every array.
 */
export type ExaOutputSchema =
  | { type: "text"; description?: string }
  | {
      type: "object";
      description?: string;
      properties?: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };

/** Steers the passages `search` returns as `snippet`. */
export interface ExaHighlightOptions {
  /** Guides which passages Exa picks. Defaults to the search query. */
  query?: string;
  /** Total highlight length per page, in characters. */
  maxCharacters?: number;
}

/**
 * Options for `search`. Combinations Exa does not accept (`lite` with the
 * options it lacks, `additionalQueries` without a deep type, the `category`
 * limits below) throw `InvalidRequest` before the request is sent.
 *
 * A result's `snippet` is its highlights and its `content` is the page text.
 */
export interface ExaSearchOptions extends CallOptions {
  /** Results to return; Exa allows 1 to 100, fewer for some types. */
  limit?: number;
  /**
   * `lite`, `auto`, `deep-lite` and `deep` are current. `instant`, `fast` and
   * `deep-reasoning` are legacy: Exa still accepts them and names `lite` (for
   * the first two) and `deep` as their replacements. `lite` accepts only
   * `limit`, `category`, `includeDomains`, `excludeDomains`, `publishedAfter`,
   * `publishedBefore`, `country`, `moderation`, `content` and `highlights`.
   */
  type?:
    | "auto"
    | "lite"
    | "deep-lite"
    | "deep"
    | "instant"
    | "fast"
    | "deep-reasoning";
  /**
   * `company` and `people` refuse `publishedAfter` and `publishedBefore`, and
   * `people` also refuses `excludeDomains`.
   */
  category?:
    | "company"
    | "publication"
    | "news"
    | "personal site"
    | "financial report"
    | "people";
  /** Hostnames, hostname plus path prefix, or `*.` wildcards; up to 1,200. */
  includeDomains?: string[];
  /** Refused with `category: "people"`. */
  excludeDomains?: string[];
  /** YYYY-MM-DD, from the start of that day (UTC). */
  publishedAfter?: string;
  /** YYYY-MM-DD, to the end of that day (UTC). */
  publishedBefore?: string;
  /** Two-letter country code that localizes results; sent as Exa's `userLocation`. */
  country?: string;
  /** Filter unsafe content from the results. */
  moderation?: boolean;
  /** Include each result's page text. */
  content?: boolean;
  /**
   * Passages from each page, returned as `snippet`. On by default; pass
   * `false` to skip them, or options to steer them. Exa bills highlights per
   * page.
   */
  highlights?: boolean | ExaHighlightOptions;
  /**
   * A generated summary of each page, kept in `raw` (the normalized result has
   * no summary field). Not available on `lite`.
   */
  summary?: boolean | { query?: string };
  /** Seconds a cached copy of a page may be old; 0 fetches fresh. Not available on `lite`. */
  maxAge?: number;
  /** Extra query variations. Only the deep types accept them. */
  additionalQueries?: string[];
  /**
   * Ask Exa for a generated answer from the results, returned as `answer`
   * (an object schema is returned as JSON text; the object itself and its
   * grounding stay in `raw.output`). Not available on `lite`.
   */
  outputSchema?: ExaOutputSchema;
  /** Guides the generated answer. */
  systemPrompt?: string;
}

/**
 * Options for `read`. Exa reports a URL it could not read in its response
 * rather than as an HTTP error; `read` throws for it (`NotFound`, `Timeout` or
 * `ProviderError`, by Exa's reason) and `readMany` lists it in `failed`.
 */
export interface ExaReadOptions extends CallOptions {
  /** Return passages that answer this query as `excerpts`. */
  query?: string;
  /** Limit the page text, in characters. */
  maxCharacters?: number;
  /** Seconds a cached copy may be old; 0 fetches fresh, a negative value reads only the cache. */
  maxAge?: number;
  /** Read Exa's stored copy of the page as of this ISO date or date-time. */
  snapshotAsOf?: string;
  /** Add a generated summary of the page as `summary`. */
  summary?: boolean | { query?: string };
  /** Links to return per page, 0 to 1,000. Defaults to 100; 0 returns none. */
  linkLimit?: number;
  /** Image URLs to return per page, 0 to 1,000. Defaults to 100; 0 returns none. */
  imageLimit?: number;
}

/** Options for `readMany`, which reads 1 to 100 URLs in one call. The same as `ExaReadOptions`. */
export type ExaReadManyOptions = ExaReadOptions;

/**
 * Options for `extract`. Exa has no extraction endpoint, so the adapter asks
 * for a summary of the page in the shape of `schema` and returns it as `data`.
 */
export interface ExaExtractOptions<T = unknown> extends CallOptions {
  /** A JSON Schema, or a Zod, Valibot or ArkType schema that types and checks `data`. Type arrays, including nullable unions, throw `InvalidRequest` before sending. */
  schema: OutputSchema<T>;
  /** What to extract, in plain words. */
  prompt?: string;
  /** Seconds a cached copy may be old; 0 fetches fresh. */
  maxAge?: number;
}

/** Options for `answer`. */
export interface ExaAnswerOptions<T = unknown> extends CallOptions {
  /**
   * JSON Schema (draft 7) or a Standard Schema for the answer. The checked
   * object comes back as `output`, and `answer` holds it as JSON text.
   */
  schema?: OutputSchema<T>;
  systemPrompt?: string;
  /** Two-letter country code that localizes the search. */
  country?: string;
  model?: "exa" | "exa-pro" | "exa-research" | "exa-fast";
}

/**
 * Options for `research`, which starts an Exa agent run and waits for it as an
 * asynchronous job. A run that stops early with output is returned with status
 * `partial`.
 */
export interface ExaResearchOptions<T = unknown> extends CallOptions {
  /** Output in the shape of this schema, sent as JSON Schema draft 7. Without one the output is text. */
  schema?: OutputSchema<T>;
  /** Cost and reasoning preference. Defaults to `auto`. */
  effort?: "minimal" | "low" | "medium" | "high" | "xhigh" | "auto" | "ultra";
  /** Spend cap in dollars, 1 to 100. Only `auto` and `ultra` accept it; other efforts are refused. */
  maxCostDollars?: number;
  /** Soft time limit in seconds, 300 to 10,800. Only `ultra` accepts it; other efforts are refused. */
  maxDurationSeconds?: number;
  systemPrompt?: string;
  /** Records for the run to enrich, and records it must not return. */
  input?: {
    data?: Record<string, unknown>[];
    exclusion?: Record<string, unknown>[];
  };
  /** The `continuationId` of an earlier completed run, which this run builds on. */
  continueFrom?: string;
  /** Milliseconds between status checks. */
  interval?: number;
  /**
   * The id of a job that timed out or was cancelled, from the error's
   * `jobId`. Waits for that job instead of starting a new one.
   */
  resume?: string;
}

/** An event Exa can send to a monitor's webhook. */
export type ExaWebhookEvent =
  | "monitor.created"
  | "monitor.updated"
  | "monitor.deleted"
  | "monitor.run.created"
  | "monitor.run.completed";

/** Options for `monitor.create`. */
export interface ExaMonitorCreateOptions extends CallOptions {
  /** What to search for on every run, in plain words. */
  query: string;
  /** Exa calls this over HTTPS with each event, signed with the monitor's `webhookSecret`. */
  webhookUrl: string;
  /**
   * How often the monitor runs: whole hours or days, at least one hour. Exa
   * has no cron. `week` is sent as `7d`. Leave it out for a monitor that runs
   * only when triggered.
   */
  schedule?: Extract<MonitorSchedule, { every: unknown }>;
  name?: string;
  /** Results per run, 1 to 100. */
  limit?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  /** Include each result's page text. */
  content?: boolean;
  /** A generated report of each run; same limits as on `search`. */
  outputSchema?: ExaOutputSchema;
  /** Echoed back in every webhook delivery. */
  metadata?: Record<string, string>;
  /** Defaults to what Exa chooses. */
  webhookEvents?: ExaWebhookEvent[];
}

/** Options for `monitor.events`. Each event is one run of the monitor. */
export interface ExaMonitorEventsOptions extends CallOptions {
  /** The `next` cursor of an earlier page. */
  cursor?: string;
  /** Runs per page, 1 to 100. */
  limit?: number;
}

/** The `monitor` group: create, get, list, delete and events. `list` reads every page. */
// A type alias, not an interface: an adapter's operation group must be assignable to a string-keyed record.
// oxlint-disable-next-line typescript/consistent-type-definitions -- an interface has no implicit index signature
export type ExaMonitor = {
  create: (options: ExaMonitorCreateOptions) => Promise<MonitorInfo>;
  get: (id: string, options?: CallOptions) => Promise<MonitorInfo>;
  list: (options?: CallOptions) => Promise<MonitorInfo[]>;
  delete: (id: string, options?: CallOptions) => Promise<void>;
  events: (
    id: string,
    options?: ExaMonitorEventsOptions
  ) => Promise<MonitorEvents>;
};

/**
 * What Exa can do: search, read, readMany, extract, answer, research and
 * monitor. `research` is an asynchronous job and accepts `resume`.
 */
export interface ExaOperations {
  search: (
    query: string,
    options?: ExaSearchOptions
  ) => Promise<SearchResponse>;
  read: (url: string, options?: ExaReadOptions) => Promise<Page>;
  readMany: (
    urls: string[],
    options?: ExaReadManyOptions
  ) => Promise<PageBatch>;
  extract: <T = unknown>(
    url: string,
    options: ExaExtractOptions<T>
  ) => Promise<Extraction<T>>;
  answer: <T = unknown>(
    question: string,
    options?: ExaAnswerOptions<T>
  ) => Promise<Answer<T>>;
  research: <T = unknown>(
    question: string,
    options?: ExaResearchOptions<T>
  ) => Promise<Research<T>>;
  monitor: ExaMonitor;
}
