// Maps normalized options to Exa's request bodies and Exa's responses to normalized results.
// ../exa.ts calls these; the shapes of Exa's responses are parsed in response.ts and the option types are in options.ts.

import { FieldworkError, invalidRequest } from "../../errors.js";
import type { FieldworkErrorCode } from "../../errors.js";
import { jobState, requireOutput } from "../../job.js";
import type { JobStates } from "../../job.js";
import type { Original } from "../../parse.js";
import { jsonSchemaOf } from "../../schema.js";
import type {
  FieldSource,
  JsonSchema,
  MonitorEvent,
  MonitorInfo,
  Page,
  Research,
  SearchResult,
} from "../../types.js";
import {
  citationsOf,
  compact,
  hours,
  meta,
  record,
  requireJobId,
  uniqueCitations,
} from "../../util.js";
import type {
  ExaHighlightOptions,
  ExaMonitorCreateOptions,
  ExaReadOptions,
  ExaResearchOptions,
  ExaSearchOptions,
} from "./options.js";
import type {
  MeteredBody,
  MonitorBlock,
  MonitorRunBlock,
  ResultBlock,
  RunBlock,
  RunBody,
  SearchBody,
  UrlStatusBlock,
} from "./response.js";

export const provider = "exa";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;
/** The search types that take `additionalQueries`. */
const DEEP_TYPES = new Set(["deep-lite", "deep", "deep-reasoning"]);
/** The most URLs `readMany` sends in one call. */
export const MAX_READ_URLS = 100;

/**
 * A `YYYY-MM-DD` date as a UTC date-time, at the start of the day or (for an
 * upper bound) its last millisecond, so the filter covers the whole day. Any
 * other value passes through.
 */
export const dateTime = (value: string | undefined, endOfDay: boolean) => {
  if (value === undefined || !DATE_ONLY.test(value)) {
    return value;
  }
  return endOfDay ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`;
};

/** The cost and request id Exa reports, with any warnings. */
export const responseMeta = (body: MeteredBody, warnings?: string[]) =>
  meta({
    costUsd: body.costDollars.total,
    requestId: body.requestId,
    warnings,
  });

/** Exa's `summary` content option. A schema asks for a structured summary and is sent even when `summary` is off. */
const summaryOption = (
  summary: boolean | { query?: string } | undefined,
  schema?: JsonSchema
) => {
  if (summary === undefined || summary === false) {
    return schema ? compact({ schema }) : undefined;
  }
  return compact({
    query: typeof summary === "object" ? summary.query : undefined,
    schema,
  });
};

// --- search --------------------------------------------------------------

/** Refuses option combinations Exa does not accept, before the request is sent. */
export const checkSearch = (o: ExaSearchOptions) => {
  if (o.type === "lite") {
    const unsupported = (
      [
        "additionalQueries",
        "outputSchema",
        "systemPrompt",
        "summary",
        "maxAge",
      ] as const
    ).filter((name) => o[name] !== undefined);
    if (unsupported.length > 0) {
      throw invalidRequest(
        provider,
        `search type "lite" does not accept ${unsupported.join(", ")}`
      );
    }
  }
  if (o.additionalQueries !== undefined && !DEEP_TYPES.has(o.type ?? "")) {
    throw invalidRequest(
      provider,
      'additionalQueries needs search type "deep-lite", "deep" or "deep-reasoning"'
    );
  }
  const dated =
    o.publishedAfter !== undefined || o.publishedBefore !== undefined;
  if ((o.category === "company" || o.category === "people") && dated) {
    throw invalidRequest(
      provider,
      `category "${o.category}" does not accept publishedAfter or publishedBefore`
    );
  }
  if (o.category === "people" && o.excludeDomains !== undefined) {
    throw invalidRequest(
      provider,
      'category "people" does not accept excludeDomains'
    );
  }
};

/** Exa's `highlights` option: `true`, or the query and length limit that steer the passages. */
const highlightsOption = (
  highlights: true | ExaHighlightOptions | undefined
) =>
  typeof highlights === "object"
    ? compact({
        maxCharacters: highlights.maxCharacters,
        query: highlights.query,
      })
    : true;

/**
 * The `contents` of a search request. Highlights are on unless `highlights` is
 * false. Undefined when nothing is asked for.
 */
export const searchContents = (o: ExaSearchOptions) => {
  const contents = compact({
    highlights:
      o.highlights === false ? undefined : highlightsOption(o.highlights),
    maxAgeHours: hours(o.maxAge),
    summary: summaryOption(o.summary),
    text: o.content === true ? true : undefined,
  });
  return Object.keys(contents).length > 0 ? contents : undefined;
};

/**
 * A search result. `snippet` joins the highlights with " … ". Exa's `summary`
 * is not mapped; it stays in `raw`.
 */
export const searchResult = (result: ResultBlock): SearchResult =>
  compact({
    author: result.author,
    content: result.text,
    favicon: result.favicon,
    image: result.image,
    publishedAt: result.publishedDate,
    score: result.score,
    snippet:
      result.highlights.length > 0 ? result.highlights.join(" … ") : undefined,
    title: result.title,
    url: result.url ?? "",
  });

/**
 * The answer Exa generated from the results: text as it is (none when empty),
 * or an object serialized as JSON text. Undefined when Exa sent none; the
 * object itself stays in `raw`.
 */
export const generatedAnswer = (
  output: SearchBody["output"]
): string | undefined => {
  const { text, value } = output.content;
  if (text !== undefined) {
    return text === "" ? undefined : text;
  }
  return value === undefined || value === null
    ? undefined
    : JSON.stringify(value);
};

// --- contents ------------------------------------------------------------

/**
 * The `/contents` options for a read. Page text is always requested (capped
 * when `maxCharacters` is set); `query` asks for highlights; links and image
 * links default to 100 each, and `0` leaves them out.
 */
export const readBody = (o: ExaReadOptions) => {
  const links = o.linkLimit ?? 100;
  const images = o.imageLimit ?? 100;
  const extras = compact({
    imageLinks: images > 0 ? images : undefined,
    links: links > 0 ? links : undefined,
  });
  return compact({
    extras: Object.keys(extras).length > 0 ? extras : undefined,
    highlights:
      o.query === undefined || o.query === "" ? undefined : { query: o.query },
    maxAgeHours: hours(o.maxAge),
    snapshotAsOf: o.snapshotAsOf,
    summary: summaryOption(o.summary),
    text:
      o.maxCharacters === undefined ? true : { maxCharacters: o.maxCharacters },
  });
};

/**
 * The error code for a URL Exa failed to read. Exa reports this per URL in the
 * response, not as an HTTP error: its `tag` decides first, then the HTTP
 * status it saw.
 */
export const failureCode = (
  tag: string | undefined,
  httpStatus: number | undefined
): FieldworkErrorCode => {
  if (tag === "CRAWL_NOT_FOUND" || tag === "CONTENT_NOT_CACHED") {
    return "NotFound";
  }
  if (tag === "CRAWL_TIMEOUT") {
    return "Timeout";
  }
  if (httpStatus === 404 || httpStatus === 410) {
    return "NotFound";
  }
  return httpStatus === 408 || httpStatus === 504 ? "Timeout" : "ProviderError";
};

/** Why a URL failed, for an error message: Exa's tag, else its HTTP status, else the status text. */
export const statusReason = (status: UrlStatusBlock): string => {
  const { httpStatusCode, tag } = status.error;
  return (
    tag ??
    (httpStatusCode === undefined ? undefined : `HTTP ${httpStatusCode}`) ??
    status.status.text ??
    "unknown"
  );
};

/** The URLs Exa reported with a status other than `success`. A status left out is not a failure. */
export const failedStatuses = (
  statuses: readonly UrlStatusBlock[]
): UrlStatusBlock[] =>
  statuses.filter(
    ({ status }) => status.value !== undefined && status.value !== "success"
  );

/** A page from a result; the caller adds `raw`. */
export const pageFrom = (url: string, result: ResultBlock): Omit<Page, "raw"> =>
  compact({
    author: result.author,
    excerpts: result.highlights.length > 0 ? result.highlights : undefined,
    favicon: result.favicon,
    image: result.image,
    images:
      result.extras.imageLinks.length > 0
        ? result.extras.imageLinks
        : undefined,
    links: result.extras.links.length > 0 ? result.extras.links : undefined,
    markdown: result.text,
    publishedAt: result.publishedDate,
    summary: result.summary.text,
    title: result.title,
    url: result.url ?? url,
  });

// --- research ------------------------------------------------------------

/** Whether a run has the output asked for: the structured value, or the text. */
const hasOutput = (run: RunBody, structured: boolean): boolean =>
  structured
    ? run.output.structured !== undefined && run.output.structured !== null
    : run.output.text !== undefined;

const runMeta = (run: RunBody) => {
  const { usage } = run;
  return meta({
    costUsd: run.costDollars.total,
    units: {
      agentComputeUnits: usage.agentComputeUnits,
      emails: usage.emails,
      phoneNumbers: usage.phoneNumbers,
      searches: usage.searches,
    },
  });
};

/** Refuses a budget the chosen `effort` does not take, before the run starts. */
export const checkResearch = (o: ExaResearchOptions) => {
  const effort = o.effort ?? "auto";
  if (
    o.maxCostDollars !== undefined &&
    effort !== "auto" &&
    effort !== "ultra"
  ) {
    throw invalidRequest(
      provider,
      `maxCostDollars needs effort "auto" or "ultra", not "${effort}"`
    );
  }
  if (o.maxDurationSeconds !== undefined && effort !== "ultra") {
    throw invalidRequest(
      provider,
      `maxDurationSeconds needs effort "ultra", not "${effort}"`
    );
  }
};

/** The body that starts an agent run. `continueFrom` is sent as `previousRunId`. */
export const researchBody = (question: string, o: ExaResearchOptions) => {
  const budget = compact({
    maxCostDollars: o.maxCostDollars,
    maxDurationSeconds: o.maxDurationSeconds,
  });
  const input = compact({ data: o.input?.data, exclusion: o.input?.exclusion });
  return compact({
    budget: Object.keys(budget).length > 0 ? budget : undefined,
    effort: o.effort,
    input: Object.keys(input).length > 0 ? input : undefined,
    outputSchema:
      o.schema === undefined ? undefined : jsonSchemaOf(o.schema, "draft-07"),
    previousRunId: o.continueFrom,
    query: question,
    systemPrompt: o.systemPrompt,
  });
};

// Exa's run statuses (exa.ai/docs/reference/agent-api/get-a-run), which always
// include one.
const RUN_STATES: JobStates = {
  done: ["completed"],
  failed: ["failed", "cancelled"],
  running: ["queued", "running"],
};

/** The run once it has stopped, undefined while it runs. A failed or cancelled run can still carry partial output, so `researchResult` decides what it amounts to. */
export const runState = (id: string, entry: RunBlock): RunBlock | undefined =>
  jobState(provider, id, RUN_STATES, {
    original: entry.original,
    value: entry.value.status,
  }) === "running"
    ? undefined
    : entry;

/**
 * The result of a finished run. A run that did not complete and has no output
 * throws `JobFailed` with Exa's error, and so does a completed run without
 * it. Otherwise the result is `completed`
 * only when the run completed and stopped for no reason or with
 * `schema_satisfied`; any other finish is `partial`, with the stop reason.
 * `continuationId` is the run's id once it has completed.
 */
export const researchResult = (
  id: string,
  entry: RunBlock,
  structured: boolean
): Research<unknown> => {
  const run = entry.value;
  const { stopReason } = run;
  const status = run.status ?? "unknown";
  if (status !== "completed" && !hasOutput(run, structured)) {
    const { error } = run;
    const detail =
      error.message === undefined
        ? stopReason
        : `${error.code ?? error.type ?? "error"}: ${error.message}`;
    throw new FieldworkError(
      "JobFailed",
      `exa research run ${id} ended ${status}${detail === undefined ? "" : ` (${detail})`}`,
      { cause: entry.original, provider }
    );
  }
  const { output } = run;
  const fields: FieldSource[] = output.grounding.map((grounding) =>
    compact({
      citations: citationsOf(grounding.citations),
      confidence: grounding.confidence,
      field: grounding.field ?? "",
    })
  );
  const finished =
    status === "completed" &&
    (stopReason === undefined || stopReason === "schema_satisfied");
  return compact({
    continuationId: status === "completed" ? id : undefined,
    fields: fields.length > 0 ? fields : undefined,
    id,
    meta: runMeta(run),
    output: requireOutput(provider, id, {
      original: entry.original,
      value: structured ? output.structured : output.text,
    }),
    raw: entry.original,
    sources: uniqueCitations(fields.flatMap((field) => field.citations)),
    status: finished ? ("completed" as const) : ("partial" as const),
    stopReason: finished ? undefined : (stopReason ?? status),
  });
};

// --- monitors ------------------------------------------------------------

/** Exa's trigger period for an interval schedule: `hour`, `day` and `week` become `1h`, `1d` and `7d`. Exa has no cron. */
const intervalPeriod = (
  schedule: NonNullable<ExaMonitorCreateOptions["schedule"]>
) => {
  const { every } = record(schedule);
  if (typeof every !== "string") {
    throw invalidRequest(
      provider,
      "monitors run on an interval of whole hours or days; Exa has no cron"
    );
  }
  let value = every;
  if (every === "hour") {
    value = "1h";
  } else if (every === "day") {
    value = "1d";
  } else if (every === "week") {
    value = "7d";
  }
  if (!/^[1-9]\d*[hd]$/u.test(value)) {
    throw invalidRequest(
      provider,
      `monitor schedule "${every}" is not whole hours or days, at least 1h`
    );
  }
  return value;
};

/** The trigger period for a monitor's schedule; undefined for a monitor with none. */
export const period = (schedule: ExaMonitorCreateOptions["schedule"]) =>
  schedule === undefined ? undefined : intervalPeriod(schedule);

/** A monitor from Exa's entry; `schedule` is its trigger period and `watch` its search query. */
export const monitorInfo = (entry: MonitorBlock): MonitorInfo => {
  const found = entry.value;
  return compact({
    createdAt: found.createdAt,
    id: requireJobId(provider, found.id),
    raw: entry.original,
    schedule: found.trigger.period,
    status: found.status,
    watch: found.search.query,
    webhookUrl: found.webhook.url,
  });
};

/** What a run found: its generated text, or the failure when it failed. Undefined otherwise. */
const eventSummary = (run: MonitorRunBlock): string | undefined => {
  const { text } = run.output.content;
  if (text !== undefined) {
    return text === "" ? undefined : text;
  }
  if (run.status === "failed") {
    return `Run failed${run.failReason === undefined ? "" : `: ${run.failReason}`}`;
  }
  return undefined;
};

/**
 * One run of a monitor as an event. `output` is set only when the run's
 * content is a structured value rather than text.
 */
export const monitorEvent = (
  entry: Original<MonitorRunBlock>
): MonitorEvent => {
  const run = entry.value;
  const { text, value } = run.output.content;
  const grounded = uniqueCitations(
    run.output.grounding.flatMap((grounding) =>
      citationsOf(grounding.citations)
    )
  );
  const structured =
    text === undefined && value !== undefined && value !== null;
  return compact({
    at: run.completedAt ?? run.createdAt,
    citations: grounded.length > 0 ? grounded : undefined,
    id: run.id,
    output: structured ? value : undefined,
    raw: entry.original,
    summary: eventSummary(run),
  });
};
