import { FieldworkError } from "../../errors.js";
import type {
  Citation,
  DecisionAnswer,
  DecisionQuestion,
  Entity,
  FieldSource,
  MonitorEvent,
  MonitorInfo,
  Page,
} from "../../types.js";
import {
  citations,
  compact,
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
import type { ParallelDiscovery } from "./options.js";

export const provider = "parallel";

export const invalid = (message: string): FieldworkError =>
  new FieldworkError("InvalidRequest", message, { provider });

export const nonEmpty = <T extends Json>(value: T): T | undefined => {
  const result = compact(value);
  return Object.keys(result).length > 0 ? result : undefined;
};

export const usageUnits = (value: unknown) => {
  const units = new Map<string, number>();
  for (const item of list(value)) {
    const entry = record(item);
    const name = text(entry.name);
    const count = num(entry.count);
    if (name !== undefined && count !== undefined) {
      units.set(name, (units.get(name) ?? 0) + count);
    }
  }
  return Object.fromEntries(units);
};

export const basis = (entries: unknown): FieldSource[] =>
  list(entries).map((item) => {
    const entry = record(item);
    return compact({
      citations: citations(entry.citations),
      confidence: text(entry.confidence),
      field: text(entry.field) ?? "",
      reasoning: text(entry.reasoning),
    });
  });

export const citedBy = (fields: FieldSource[]): Citation[] =>
  uniqueCitations(fields.flatMap((field) => field.citations));

export const taskMeta = (result: Json) => {
  const run = record(result.run);
  return meta({ requestId: run.run_id, warnings: run.warnings });
};

export const responseMessages = (response: Json): Json[] => {
  const messages = list(response.output)
    .map((item) => record(item))
    .filter((item) => item.type === "message");
  const final = messages.filter((item) => item.phase === "final_answer");
  return final.length > 0 ? final : messages;
};

export const probabilities = (
  value: unknown
): Record<string, number> | undefined => {
  const entries = Object.entries(record(value)).filter(
    (entry): entry is [string, number] => num(entry[1]) !== undefined
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

export const mostLikely = (chances: Record<string, number> | undefined) => {
  let best: string | undefined;
  for (const [key, chance] of Object.entries(chances ?? {})) {
    if (best === undefined || chance > (chances?.[best] ?? 0)) {
      best = key;
    }
  }
  return best;
};

export const decisionAnswer = (
  question: DecisionQuestion,
  value: unknown
): DecisionAnswer => {
  const answer = record(value);
  if (answer.type === "refusal") {
    return { refusal: "Parallel declined to answer this question" };
  }
  const confidence = num(answer.confidence);
  if (question.type === "yesno") {
    return compact({ probability: num(answer.noul) });
  }
  if (question.type === "choice") {
    return compact({
      choice: text(answer.choice),
      confidence,
      probabilities: probabilities(answer.probabilities),
    });
  }
  // Parallel numbers score levels from zero; give them back under the scale's own keys.
  const keys = Object.keys(question.scale);
  const byLevel = probabilities(answer.probabilities);
  const byKey =
    byLevel &&
    Object.fromEntries(
      Object.entries(byLevel).map(([level, chance]) => [
        keys[Number(level)] ?? level,
        chance,
      ])
    );
  return compact({
    choice: mostLikely(byKey),
    confidence,
    probabilities: byKey,
  });
};

/** Termination reasons that mean the run found everything it could. */
export const FINISHED = new Set(["match_limit_met", "candidates_exhausted"]);

export const candidate = <T>(value: unknown): Entity<T> | undefined => {
  const item = record(value);
  const status = text(item.match_status);
  if (status === "discarded") {
    return undefined;
  }
  const data: Json = {};
  for (const [key, output] of Object.entries(record(item.output))) {
    const entry = record(output);
    if (entry.type === "enrichment") {
      data[key] = entry.value;
    }
  }
  const fields = basis(item.basis);
  const sources = citedBy(fields);
  let matched: boolean | undefined;
  if (status === "matched") {
    matched = true;
  } else if (status === "unmatched") {
    matched = false;
  }
  return compact({
    citations: sources.length > 0 ? sources : undefined,
    data: nonEmpty(data) as T | undefined,
    description: text(item.description),
    fields: fields.length > 0 ? fields : undefined,
    matched,
    name: text(item.name) ?? "",
    url: text(item.url),
  });
};

export const monitorInfo = (value: unknown): MonitorInfo => {
  const monitor = record(value);
  return compact({
    createdAt: text(monitor.created_at),
    id: requireId(provider, monitor.monitor_id),
    raw: monitor,
    schedule: text(monitor.frequency),
    status: text(monitor.status),
    watch: text(record(monitor.settings).query),
    webhookUrl: text(record(monitor.webhook).url),
  });
};

export const monitorEvent = (value: unknown): MonitorEvent => {
  const event = record(value);
  const type = text(event.event_type);
  if (type === "completion") {
    return {
      at: text(event.timestamp),
      raw: event,
      summary: "Run finished with no material change.",
    };
  }
  if (type === "error") {
    return compact({
      at: text(event.timestamp),
      raw: event,
      summary: text(event.error_message),
    });
  }
  const output = record(
    type === "snapshot" ? event.changed_output : event.output
  );
  const { content } = output;
  const sources = citedBy(basis(output.basis));
  return compact({
    at: text(event.event_date),
    citations: sources.length > 0 ? sources : undefined,
    id: text(event.event_id),
    output:
      typeof content === "object" && content !== null ? content : undefined,
    raw: event,
    summary: typeof content === "string" ? content : undefined,
  });
};

export const pageFrom = (result: Json, extra: Partial<Page> = {}): Page =>
  compact({
    excerpts: strings(result.excerpts),
    markdown: text(result.full_content),
    publishedAt: text(result.publish_date),
    raw: result,
    title: text(result.title),
    url: text(result.url) ?? "",
    ...extra,
  });

export const extractFailure = (error: Json): string => {
  const status = num(error.http_status_code);
  const detail = text(error.content);
  return [
    text(error.error_type) ?? "error",
    status === undefined ? undefined : `HTTP ${status}`,
    detail,
  ]
    .filter((part): part is string => part !== undefined)
    .join(": ");
};

export const extractMeta = (response: Json) =>
  meta({
    requestId: response.extract_id,
    units: usageUnits(response.usage),
    warnings: response.warnings,
  });

export const discovery = <T>(
  id: string,
  result: Json
): ParallelDiscovery<T> => {
  const run = record(record(result.run).status);
  const metrics = record(run.metrics);
  const reason = text(run.termination_reason);
  const state = text(run.status) ?? "unknown";
  const entities = list(result.candidates)
    .map((item) => candidate<T>(item))
    .filter((item): item is Entity<T> => item !== undefined);
  const stoppedEarly =
    state !== "completed" || (reason !== undefined && !FINISHED.has(reason));
  if (stoppedEarly && !entities.some((entity) => entity.matched === true)) {
    throw new FieldworkError(
      "JobFailed",
      `parallel FindAll run ${id} ended as ${state}${reason === undefined ? "" : ` (${reason})`} without a match`,
      { cause: result, jobId: id, provider }
    );
  }
  const stopReason = reason ?? state;
  return compact({
    entities,
    id,
    meta: meta({
      requestId: id,
      units: {
        generated_candidates: metrics.generated_candidates_count,
        matched_candidates: metrics.matched_candidates_count,
      },
      warnings: stoppedEarly
        ? [`the run stopped before it finished: ${stopReason}`]
        : undefined,
    }),
    raw: result,
    status: stoppedEarly ? ("partial" as const) : ("completed" as const),
    stopReason: stoppedEarly ? stopReason : undefined,
  });
};
