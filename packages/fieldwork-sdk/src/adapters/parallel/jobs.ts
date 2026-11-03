import * as z from "zod/mini";

import { FieldworkError, withJob } from "../../errors.js";
import { segment } from "../../http.js";
import type { RawClient } from "../../http.js";
import { runJob } from "../../job.js";
import type { JobSettings } from "../../job.js";
import type { CallOptions } from "../../types.js";
import { compact, requireJobId } from "../../util.js";
import type { Json } from "../../util.js";
import type { ParallelDiscoverOptions } from "./options.js";
import { jsonOutput } from "./options.js";
import { provider } from "./parse.js";
import {
  FindAllRun,
  FindAllResult,
  FindAllStart,
  TaskResult,
  TaskRun,
  TaskStart,
} from "./response.js";
import type { TaskResultBlock, TaskRunBlock } from "./response.js";

export const stoppedRun = (id: string, entry: TaskRunBlock): FieldworkError => {
  const run = entry.value;
  const status = run.status ?? "unknown";
  const reason = run.error.message;
  const warnings = run.warnings
    .map((item) => item.message)
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
    cause: entry.original,
    provider,
  });
};

export const taskResult = async (
  raw: RawClient,
  id: string,
  request: CallOptions
) => {
  try {
    return z.parse(
      TaskResult,
      await raw.request("GET", `/v1/tasks/runs/${segment(id)}/result`, request)
    );
  } catch (error) {
    if (error instanceof FieldworkError && error.code === "NotFound") {
      const run = z.parse(
        TaskRun,
        await raw.request("GET", `/v1/tasks/runs/${segment(id)}`, request)
      );
      if (run.value.status === "failed" || run.value.status === "cancelled") {
        throw stoppedRun(id, run);
      }
    }
    throw error;
  }
};

/** Runs a task to its result, or waits for the run named by `resume`. */
export const runTask = async <Result>(
  raw: RawClient,
  body: Json,
  settings: JobSettings,
  finish: (result: TaskResultBlock, id: string) => Promise<Result>
): Promise<Result> =>
  await runJob(
    provider,
    {
      check: async (id, request) => {
        const run = z.parse(
          TaskRun,
          await raw.request("GET", `/v1/tasks/runs/${segment(id)}`, request)
        );
        const { status } = run.value;
        if (
          status === "failed" ||
          status === "cancelled" ||
          status === "action_required"
        ) {
          throw stoppedRun(id, run);
        }
        // queued, running and cancelling are still going.
        return status === "completed"
          ? await taskResult(raw, id, request)
          : undefined;
      },
      finish,
      start: async () =>
        requireJobId(
          provider,
          z.parse(
            TaskStart,
            await raw.request("POST", "/v1/tasks/runs", {
              body,
              creates: true,
              retries: settings.retries,
              signal: settings.signal,
            })
          ).run_id
        ),
    },
    settings
  );

export const startFindAll = async (
  raw: RawClient,
  objective: string,
  o: ParallelDiscoverOptions,
  call: CallOptions
): Promise<string> => {
  const created = z.parse(
    FindAllStart,
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
  const id = requireJobId(provider, created.findall_id);
  if (o.schema) {
    try {
      await raw.request("POST", `/v1beta/findall/runs/${segment(id)}/enrich`, {
        ...call,
        body: compact({
          output_schema: jsonOutput(o.schema),
          processor: o.processor,
        }),
        creates: true,
      });
    } catch (error) {
      throw withJob(error, id);
    }
  }
  return id;
};

/** The result of a FindAll run once it has stopped, or undefined while it runs. */
export const findAllResult = async (
  raw: RawClient,
  id: string,
  request: CallOptions
) => {
  const run = z.parse(
    FindAllRun,
    await raw.request("GET", `/v1beta/findall/runs/${segment(id)}`, request)
  );
  const { status } = run.value.status;
  if (status === "action_required") {
    throw new FieldworkError(
      "JobFailed",
      `parallel FindAll run ${id} stopped with status action_required: it is waiting for an action Fieldwork cannot take, so it will not finish on its own. Open the run in the Parallel console to see what it needs`,
      { cause: run.original, provider }
    );
  }
  const stopped =
    status === "completed" || status === "failed" || status === "cancelled";
  return stopped
    ? z.parse(
        FindAllResult,
        await raw.request(
          "GET",
          `/v1beta/findall/runs/${segment(id)}/result`,
          request
        )
      )
    : undefined;
};
