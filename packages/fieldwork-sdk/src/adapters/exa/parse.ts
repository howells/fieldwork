import { FieldworkError } from "../../errors.js";
import type { FieldworkErrorCode } from "../../errors.js";
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
  citations,
  compact,
  hours,
  list,
  meta,
  num,
  record,
  requireId,
  strings,
  text,
  uniqueCitations,
} from "../../util.js";
import type { Json } from "../../util.js";
import type {
  ExaHighlightOptions,
  ExaMonitorCreateOptions,
  ExaReadOptions,
  ExaResearchOptions,
  ExaSearchOptions,
} from "./options.js";

export const provider = "exa";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;
const DEEP_TYPES = new Set(["deep-lite", "deep", "deep-reasoning"]);
export const MAX_READ_URLS = 100;

export const invalid: (message: string) => never = (message) => {
  throw new FieldworkError("InvalidRequest", `exa ${message}`, { provider });
};

export const dateTime = (value: string | undefined, endOfDay: boolean) => {
  if (value === undefined || !DATE_ONLY.test(value)) {
    return value;
  }
  return endOfDay ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`;
};

const costOf = (response: Json) => num(record(response.costDollars).total);

export const responseMeta = (response: Json, warnings?: unknown) =>
  meta({
    costUsd: costOf(response),
    requestId: response.requestId,
    warnings,
  });

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
      invalid(`search type "lite" does not accept ${unsupported.join(", ")}`);
    }
  }
  if (o.additionalQueries !== undefined && !DEEP_TYPES.has(o.type ?? "")) {
    invalid(
      'additionalQueries needs search type "deep-lite", "deep" or "deep-reasoning"'
    );
  }
  const dated =
    o.publishedAfter !== undefined || o.publishedBefore !== undefined;
  if ((o.category === "company" || o.category === "people") && dated) {
    invalid(
      `category "${o.category}" does not accept publishedAfter or publishedBefore`
    );
  }
  if (o.category === "people" && o.excludeDomains !== undefined) {
    invalid('category "people" does not accept excludeDomains');
  }
};

const highlightsOption = (
  highlights: true | ExaHighlightOptions | undefined
) =>
  typeof highlights === "object"
    ? compact({
        maxCharacters: highlights.maxCharacters,
        query: highlights.query,
      })
    : true;

export const searchContents = (o: ExaSearchOptions) => {
  const contents = compact({
    highlights:
      o.highlights === false ? undefined : highlightsOption(o.highlights),
    maxAgeHours: hours(o.maxAge),
    summary: summaryOption(o.summary),
    text: o.content ? true : undefined,
  });
  return Object.keys(contents).length > 0 ? contents : undefined;
};

export const searchResult = (item: unknown): SearchResult => {
  const result = record(item);
  return compact({
    author: text(result.author),
    content: text(result.text),
    favicon: text(result.favicon),
    image: text(result.image),
    publishedAt: text(result.publishedDate),
    score: num(result.score),
    snippet: strings(result.highlights)?.join(" … "),
    title: text(result.title),
    url: text(result.url) ?? "",
  });
};

export const generatedAnswer = (output: Json): string | undefined => {
  const { content } = output;
  if (typeof content === "string") {
    return text(content);
  }
  return content === undefined || content === null
    ? undefined
    : JSON.stringify(content);
};

// --- contents ------------------------------------------------------------

export const readBody = (o: ExaReadOptions) => {
  const links = o.linkLimit ?? 100;
  const images = o.imageLimit ?? 100;
  const extras = compact({
    imageLinks: images > 0 ? images : undefined,
    links: links > 0 ? links : undefined,
  });
  return compact({
    extras: Object.keys(extras).length > 0 ? extras : undefined,
    highlights: o.query ? { query: o.query } : undefined,
    maxAgeHours: hours(o.maxAge),
    snapshotAsOf: o.snapshotAsOf,
    summary: summaryOption(o.summary),
    text:
      o.maxCharacters === undefined ? true : { maxCharacters: o.maxCharacters },
  });
};

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

export const statusReason = (status: Json): string => {
  const error = record(status.error);
  const httpStatus = num(error.httpStatusCode);
  return (
    text(error.tag) ??
    (httpStatus === undefined ? undefined : `HTTP ${httpStatus}`) ??
    text(status.status) ??
    "unknown"
  );
};

export const failedStatuses = (response: Json): Json[] =>
  list(response.statuses)
    .map((item) => record(item))
    .filter(
      (status) => status.status !== undefined && status.status !== "success"
    );

export const pageFrom = (
  url: string,
  item: unknown,
  rawValue: unknown
): Page => {
  const result = record(item);
  const extras = record(result.extras);
  return compact({
    author: text(result.author),
    excerpts: strings(result.highlights),
    favicon: text(result.favicon),
    image: text(result.image),
    images: strings(extras.imageLinks),
    links: strings(extras.links),
    markdown: text(result.text),
    publishedAt: text(result.publishedDate),
    raw: rawValue,
    summary: text(result.summary),
    title: text(result.title),
    url: text(result.url) ?? url,
  });
};

// --- research ------------------------------------------------------------

const hasOutput = (run: Json, structured: boolean): boolean => {
  const output = record(run.output);
  return structured
    ? output.structured !== undefined && output.structured !== null
    : text(output.text) !== undefined;
};

const runMeta = (run: Json) => {
  const usage = record(run.usage);
  return meta({
    costUsd: costOf(run),
    units: {
      agentComputeUnits: usage.agentComputeUnits,
      emails: usage.emails,
      phoneNumbers: usage.phoneNumbers,
      searches: usage.searches,
    },
  });
};

export const checkResearch = (o: ExaResearchOptions) => {
  const effort = o.effort ?? "auto";
  if (
    o.maxCostDollars !== undefined &&
    effort !== "auto" &&
    effort !== "ultra"
  ) {
    invalid(`maxCostDollars needs effort "auto" or "ultra", not "${effort}"`);
  }
  if (o.maxDurationSeconds !== undefined && effort !== "ultra") {
    invalid(`maxDurationSeconds needs effort "ultra", not "${effort}"`);
  }
};

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
    outputSchema: o.schema,
    previousRunId: o.continueFrom,
    query: question,
    systemPrompt: o.systemPrompt,
  });
};

export const researchResult = <T>(
  id: string,
  run: Json,
  structured: boolean
): Research<T> => {
  const stopReason = text(run.stopReason);
  const status = text(run.status) ?? "unknown";
  if (status !== "completed" && !hasOutput(run, structured)) {
    const error = record(run.error);
    const message = text(error.message);
    const detail = message
      ? `${text(error.code) ?? text(error.type) ?? "error"}: ${message}`
      : stopReason;
    throw new FieldworkError(
      "JobFailed",
      `exa research run ${id} ended ${status}${detail ? ` (${detail})` : ""}`,
      { cause: run, jobId: id, provider }
    );
  }
  const output = record(run.output);
  const fields: FieldSource[] = list(output.grounding).map((item) => {
    const grounding = record(item);
    return compact({
      citations: citations(grounding.citations),
      confidence: text(grounding.confidence) ?? num(grounding.confidence),
      field: text(grounding.field) ?? "",
    });
  });
  const finished =
    status === "completed" &&
    (stopReason === undefined || stopReason === "schema_satisfied");
  return compact({
    continuationId: status === "completed" ? id : undefined,
    fields: fields.length > 0 ? fields : undefined,
    id,
    meta: runMeta(run),
    output: (structured ? output.structured : output.text) as T,
    raw: run,
    sources: uniqueCitations(fields.flatMap((field) => field.citations)),
    status: finished ? ("completed" as const) : ("partial" as const),
    stopReason: finished ? undefined : (stopReason ?? status),
  });
};

// --- monitors ------------------------------------------------------------

const intervalPeriod = (schedule: unknown) => {
  const { every } = schedule as { every?: unknown };
  if (typeof every !== "string") {
    return invalid(
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
    return invalid(
      `monitor schedule "${every}" is not whole hours or days, at least 1h`
    );
  }
  return value;
};

export const period = (schedule: ExaMonitorCreateOptions["schedule"]) =>
  schedule === undefined ? undefined : intervalPeriod(schedule);

export const monitorInfo = (value: unknown): MonitorInfo => {
  const found = record(value);
  return compact({
    createdAt: text(found.createdAt),
    id: requireId(provider, found.id),
    raw: value,
    schedule: text(record(found.trigger).period),
    status: text(found.status),
    watch: text(record(found.search).query),
    webhookUrl: text(record(found.webhook).url),
  });
};

const eventSummary = (run: Json, content: unknown): string | undefined => {
  if (typeof content === "string") {
    return text(content);
  }
  if (run.status === "failed") {
    const reason = text(run.failReason);
    return `Run failed${reason ? `: ${reason}` : ""}`;
  }
  return undefined;
};

export const monitorEvent = (item: unknown): MonitorEvent => {
  const run = record(item);
  const output = record(run.output);
  const { content } = output;
  const grounded = uniqueCitations(
    list(output.grounding).flatMap((entry) =>
      citations(record(entry).citations)
    )
  );
  const structured =
    content !== undefined && content !== null && typeof content !== "string";
  return compact({
    at: text(run.completedAt) ?? text(run.createdAt),
    citations: grounded.length > 0 ? grounded : undefined,
    id: text(run.id),
    output: structured ? content : undefined,
    raw: item,
    summary: eventSummary(run, content),
  });
};
