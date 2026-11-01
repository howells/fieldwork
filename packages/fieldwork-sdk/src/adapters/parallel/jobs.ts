import { FieldworkError, withJob } from "../../errors.js";
import { poll } from "../../http.js";
import type { PollOptions, RawClient } from "../../http.js";
import type { CallOptions } from "../../types.js";
import { compact, list, record, requireId, text } from "../../util.js";
import type { Json } from "../../util.js";
import type { ParallelDiscoverOptions } from "./options.js";
import { jsonOutput } from "./options.js";
import { provider } from "./parse.js";

export const stoppedRun = (id: string, run: Json): FieldworkError => {
  const status = text(run.status) ?? "unknown";
  const reason = text(record(run.error).message);
  const warnings = list(run.warnings)
    .map((item) => text(record(item).message))
    .filter((item): item is string => item !== undefined);
  let message: string;
  if (status === "action_required") {
    message = `parallel task run ${id} stopped with status action_required: it is waiting for an action Fieldwork cannot take, so it will not finish on its own. Open the run in the Parallel console to see what it needs`;
  } else if (status === "cancelled") {
    message = `parallel task run ${id} was cancelled`;
  } else {
    message = `parallel task run ${id} failed: ${reason ?? "no reason given"}`;
  }
  if (warnings.length > 0) {
    message += ` (${warnings.join("; ")})`;
  }
  return new FieldworkError("JobFailed", message, {
    cause: run,
    jobId: id,
    provider,
  });
};

export const taskResult = async (
  raw: RawClient,
  id: string,
  signal: AbortSignal | undefined
): Promise<Json> => {
  try {
    return record(
      await raw.request("GET", `/v1/tasks/runs/${id}/result`, { signal })
    );
  } catch (error) {
    if (error instanceof FieldworkError && error.code === "NotFound") {
      const run = record(
        await raw.request("GET", `/v1/tasks/runs/${id}`, { signal })
      );
      if (text(run.status) === "failed" || text(run.status) === "cancelled") {
        throw stoppedRun(id, run);
      }
    }
    throw error;
  }
};

export const runTask = async (
  raw: RawClient,
  body: Json,
  settings: PollOptions & { resume?: string }
): Promise<{ id: string; result: Json }> => {
  const { resume, ...wait } = settings;
  const id =
    resume ??
    requireId(
      raw.provider,
      record(
        await raw.request("POST", "/v1/tasks/runs", {
          body,
          creates: true,
          signal: wait.signal,
          timeout: wait.timeout,
        })
      ).run_id
    );
  const result = await poll(
    raw.provider,
    id,
    async () => {
      const run = record(
        await raw.request("GET", `/v1/tasks/runs/${id}`, {
          signal: wait.signal,
        })
      );
      const status = text(run.status);
      if (
        status === "failed" ||
        status === "cancelled" ||
        status === "action_required"
      ) {
        throw stoppedRun(id, run);
      }
      // queued, running and cancelling are still going.
      return status === "completed"
        ? await taskResult(raw, id, wait.signal)
        : undefined;
    },
    wait
  );
  return { id, result };
};

export const startFindAll = async (
  raw: RawClient,
  objective: string,
  o: ParallelDiscoverOptions,
  call: CallOptions
): Promise<string> => {
  const created = record(
    await raw.request("POST", "/v1beta/findall/runs", {
      creates: true,
      ...call,
      body: compact({
        entity_type: o.entityType,
        exclude_list: o.exclude,
        generator: o.generator ?? "base",
        match_conditions: o.conditions.map((condition) => ({
          description: condition.description,
          name: condition.name,
        })),
        match_limit: o.limit ?? 10,
        metadata: o.metadata,
        objective,
      }),
    })
  );
  const id = requireId(provider, created.findall_id);
  if (o.schema) {
    try {
      await raw.request("POST", `/v1beta/findall/runs/${id}/enrich`, {
        body: compact({
          output_schema: jsonOutput(o.schema),
          processor: o.processor,
        }),
        creates: true,
        signal: call.signal,
      });
    } catch (error) {
      throw withJob(error, id);
    }
  }
  return id;
};

export const findAllResult = async (
  raw: RawClient,
  id: string,
  signal: AbortSignal | undefined
): Promise<Json | undefined> => {
  const run = record(
    await raw.request("GET", `/v1beta/findall/runs/${id}`, { signal })
  );
  const status = text(record(run.status).status);
  if (status === "action_required") {
    throw new FieldworkError(
      "JobFailed",
      `parallel FindAll run ${id} stopped with status action_required: it is waiting for an action Fieldwork cannot take, so it will not finish on its own. Open the run in the Parallel console to see what it needs`,
      { cause: run, jobId: id, provider }
    );
  }
  const stopped =
    status === "completed" || status === "failed" || status === "cancelled";
  return stopped
    ? record(
        await raw.request("GET", `/v1beta/findall/runs/${id}/result`, {
          signal,
        })
      )
    : undefined;
};
