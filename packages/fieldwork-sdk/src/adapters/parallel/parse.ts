// Turns Parallel responses into Fieldwork results: evidence and citations, usage
// units, decisions, FindAll entities and monitor events. The adapter in
// ../parallel.ts and the job helpers in ./jobs.ts call these; the response shapes
// are in ./response.ts.

import { FieldworkError } from "../../errors.js";
import type { Original } from "../../parse.js";
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
  citationsOf,
  compact,
  meta,
  requireJobId,
  uniqueCitations,
} from "../../util.js";
import type { Json } from "../../util.js";
import type { ParallelDiscovery } from "./options.js";
import type {
  AnswerBody,
  BasisBlock,
  CandidateBlock,
  DecisionBlock,
  EventsBlock,
  ExtractBody,
  ExtractErrorBlock,
  ExtractResultBlock,
  FindAllResultBlock,
  MonitorBlock,
  TaskResultBlock,
  UsageBlock,
} from "./response.js";

/** The name this adapter reports in errors and results. */
export const provider = "parallel";

/**
 * The object with undefined fields removed, or undefined when none is left, so an
 * empty settings block is not sent.
 */
export const nonEmpty = <T extends Json>(value: T): T | undefined => {
  const result = compact(value);
  return Object.keys(result).length > 0 ? result : undefined;
};

/**
 * Parallel's usage entries as a map of unit name to count, summing repeated names.
 * An entry without a name or count is skipped.
 */
export const usageUnits = (entries: UsageBlock) => {
  const units = new Map<string, number>();
  for (const { count, name } of entries) {
    if (name !== undefined && count !== undefined) {
      units.set(name, (units.get(name) ?? 0) + count);
    }
  }
  return Object.fromEntries(units);
};

/**
 * The evidence Parallel gives for each field, as field sources. A missing `field`
 * becomes an empty string.
 */
export const basis = (entries: readonly BasisBlock[]): FieldSource[] =>
  entries.map((entry) =>
    compact({
      citations: citationsOf(entry.citations),
      confidence: entry.confidence,
      field: entry.field ?? "",
      reasoning: entry.reasoning,
    })
  );

/** The unique citations across the fields' sources. */
export const citedBy = (fields: FieldSource[]): Citation[] =>
  uniqueCitations(fields.flatMap((field) => field.citations));

/** Meta for a Task result: the run id as `requestId`, and the run's warnings. */
export const taskMeta = (result: TaskResultBlock) => {
  const { run } = result.value;
  return meta({ requestId: run.run_id, warnings: run.warnings });
};

/** The messages of a response; only the final answer's when it marks one. */
export const responseMessages = (body: AnswerBody) => {
  const messages = body.output.filter((item) => item.type === "message");
  const final = messages.filter((item) => item.phase === "final_answer");
  return final.length > 0 ? final : messages;
};

/**
 * A decision's probabilities without the entries Parallel left undefined, or
 * undefined when none remain.
 */
export const probabilities = (
  chances: DecisionBlock["probabilities"]
): Record<string, number> | undefined => {
  const entries = Object.entries(chances).filter(
    (entry): entry is [string, number] => entry[1] !== undefined
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

/** The key with the highest probability; the first one wins a tie. */
export const mostLikely = (chances: Record<string, number> | undefined) => {
  let best: string | undefined;
  for (const [key, chance] of Object.entries(chances ?? {})) {
    if (best === undefined || chance > (chances?.[best] ?? 0)) {
      best = key;
    }
  }
  return best;
};

/**
 * One decision answer in the shape its question asks for, or undefined when
 * Parallel left out the part the question needs: a `yesno` answer's `noul`, a
 * `choice` answer's `choice`, a `score` answer's probabilities. A `refusal`
 * answer becomes `{ refusal }`. A `yesno` answer keeps only `probability`. A
 * `score` answer's probabilities are keyed by the scale's own keys and its
 * `choice` is the most likely of them; Parallel's numeric `score` stays in `raw`.
 */
export const decisionAnswer = (
  question: DecisionQuestion,
  answer: DecisionBlock
): DecisionAnswer | undefined => {
  if (answer.type === "refusal") {
    return { refusal: "Parallel declined to answer this question" };
  }
  const { confidence } = answer;
  if (question.type === "yesno") {
    return answer.noul === undefined ? undefined : { probability: answer.noul };
  }
  if (question.type === "choice") {
    return answer.choice === undefined
      ? undefined
      : compact({
          choice: answer.choice,
          confidence,
          probabilities: probabilities(answer.probabilities),
        });
  }
  // Parallel numbers score levels from zero; give them back under the scale's own keys.
  const keys = Object.keys(question.scale);
  const byLevel = probabilities(answer.probabilities);
  if (byLevel === undefined) {
    return undefined;
  }
  const byKey = Object.fromEntries(
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

/**
 * A FindAll candidate as an entity, or undefined when Parallel discarded it.
 * `matched` is true or false for the `matched` and `unmatched` statuses and unset
 * for any other. Only `enrichment` outputs reach `data`; the rest stay in `raw`.
 */
export const candidate = (
  item: CandidateBlock
): Entity<unknown> | undefined => {
  const status = item.match_status;
  if (status === "discarded") {
    return undefined;
  }
  const data: Json = {};
  for (const [key, output] of Object.entries(item.output)) {
    if (output.type === "enrichment") {
      data[key] = output.value;
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
    data: nonEmpty(data),
    description: item.description,
    fields: fields.length > 0 ? fields : undefined,
    matched,
    name: item.name ?? "",
    url: item.url,
  });
};

/**
 * A monitor from Parallel's entry. `watch` is the monitor's `settings.query` and
 * `schedule` is Parallel's frequency string. A missing id throws.
 */
export const monitorInfo = (entry: MonitorBlock): MonitorInfo => {
  const monitor = entry.value;
  return compact({
    createdAt: monitor.created_at,
    id: requireJobId(provider, monitor.monitor_id),
    raw: entry.original,
    schedule: monitor.frequency,
    status: monitor.status,
    watch: monitor.settings.query,
    webhookUrl: monitor.webhook.url,
  });
};

/**
 * A monitor event by `event_type`. A `completion` is a run that found no change,
 * with a fixed summary. An `error` takes its message as the summary. A `snapshot`
 * reads `changed_output`; any other type reads `output`. Completions and errors
 * are dated by `timestamp`, changes by `event_date`.
 */
export const monitorEvent = (entry: EventsBlock): MonitorEvent => {
  const event = entry.value;
  const type = event.event_type;
  if (type === "completion") {
    return {
      at: event.timestamp,
      raw: entry.original,
      summary: "Run finished with no material change.",
    };
  }
  if (type === "error") {
    return compact({
      at: event.timestamp,
      raw: entry.original,
      summary: event.error_message,
    });
  }
  const output = type === "snapshot" ? event.changed_output : event.output;
  const { structure, text } = output.content;
  const sources = citedBy(basis(output.basis));
  return compact({
    at: event.event_date,
    citations: sources.length > 0 ? sources : undefined,
    id: event.event_id,
    output: structure,
    raw: entry.original,
    summary: text,
  });
};

/** A page from an extracted result; `raw` is the entry as it arrived unless `extra` sets it. */
export const pageFrom = (
  entry: Original<ExtractResultBlock>,
  extra: Partial<Page> = {}
): Page => {
  const result = entry.value;
  return compact({
    excerpts: result.excerpts.length > 0 ? result.excerpts : undefined,
    markdown: result.full_content,
    publishedAt: result.publish_date,
    raw: entry.original,
    title: result.title,
    url: result.url ?? "",
    ...extra,
  });
};

/**
 * Why one URL failed, as `type: HTTP status: content`. A missing type reads as
 * "error"; missing parts are left out.
 */
export const extractFailure = (error: ExtractErrorBlock): string => {
  const status = error.http_status_code;
  return [
    error.error_type ?? "error",
    status === undefined ? undefined : `HTTP ${status}`,
    error.content,
  ]
    .filter((part): part is string => part !== undefined)
    .join(": ");
};

/** Meta for an Extract response: its id as `requestId`, usage units and warnings. */
export const extractMeta = (body: ExtractBody) =>
  meta({
    requestId: body.extract_id.id,
    units: usageUnits(body.usage),
    warnings: body.warnings,
  });

/**
 * A finished FindAll run as a discovery. The run counts as stopped early when its
 * status is not `completed` or its termination reason is not in `FINISHED`. Stopped
 * early with at least one matched entity, it is `partial` with a `stopReason` and
 * a warning; with none, it throws `JobFailed`. Discarded candidates are left out.
 */
export const discovery = (
  id: string,
  entry: FindAllResultBlock
): ParallelDiscovery<unknown> => {
  const run = entry.value.run.status;
  const { metrics } = run;
  const reason = run.termination_reason;
  const state = run.status ?? "unknown";
  const entities = entry.value.candidates
    .map((item) => candidate(item))
    .filter((item): item is Entity<unknown> => item !== undefined);
  const stoppedEarly =
    state !== "completed" || (reason !== undefined && !FINISHED.has(reason));
  if (stoppedEarly && !entities.some((entity) => entity.matched === true)) {
    throw new FieldworkError(
      "JobFailed",
      `parallel FindAll run ${id} ended as ${state}${reason === undefined ? "" : ` (${reason})`} without a match`,
      { cause: entry.original, provider }
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
    raw: entry.original,
    status: stoppedEarly ? ("partial" as const) : ("completed" as const),
    stopReason: stoppedEarly ? stopReason : undefined,
  });
};
