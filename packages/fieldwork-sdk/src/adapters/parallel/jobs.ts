// Task and FindAll job plumbing for the Parallel adapter: starting a run, checking
// it through `runJob`, and turning a run that stopped without a result into a
// `JobFailed` error. The operations that use it are in ../parallel.ts.

import * as z from "zod/mini";

import { FieldworkError, withJob } from "../../errors.js";
import { segment } from "../../http.js";
import type { RawClient } from "../../http.js";
import { jobState, requireOutput, runJob, startJob } from "../../job.js";
import type { JobSettings, JobStates } from "../../job.js";
import type { CallOptions } from "../../types.js";
import { compact } from "../../util.js";
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

// Parallel's run statuses, the same for Task and FindAll runs, which always
// include one (TaskRun and FindAllRunStatus in
// github.com/parallel-web/parallel-sdk-typescript, src/resources/task-run.ts
// and src/resources/beta/findall.ts). `action_required` waits on something
// Fieldwork cannot do, so it never finishes on its own.
const RUNNING = ["queued", "running", "cancelling"];
const TASK_STATES: JobStates = {
  done: ["completed"],
  failed: ["failed", "cancelled", "action_required"],
  running: RUNNING,
};
// A failed or cancelled FindAll run still has the candidates it found.
const FINDALL_STATES: JobStates = {
  done: ["completed", "failed", "cancelled"],
  failed: ["action_required"],
  running: RUNNING,
};

/**
 * The `JobFailed` error for a Task run that ended without a result: cancelled,
 * failed with Parallel's message, or `action_required`, which waits on something
 * Fieldwork cannot do and so never finishes. The run's warnings are appended.
 */
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

/**
 * A completed run's result. When the result endpoint answers `NotFound` for a run
 * that failed or was cancelled, this raises that run's `JobFailed` instead; any
 * other error passes through.
 */
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

/**
 * Runs a task to its result, or waits for the run named by `resume`. A failed,
 * cancelled or `action_required` run throws at once; queued, running and
 * cancelling runs are polled again; any other status throws `ProviderError`.
 * A completed run whose result has no `output.content` throws `JobFailed`.
 */
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
        const state = jobState(provider, id, TASK_STATES, {
          original: run.original,
          value: run.value.status,
        });
        if (state === "failed") {
          throw stoppedRun(id, run);
        }
        return state === "done"
          ? await taskResult(raw, id, request)
          : undefined;
      },
      finish: async (result, id) => {
        requireOutput(provider, id, {
          original: result.original,
          value: result.value.output.content,
        });
        return await finish(result, id);
      },
      start: async () =>
        await startJob(
          raw,
          "/v1/tasks/runs",
          { body, retries: settings.retries, signal: settings.signal },
          TaskStart,
          (reply) => reply.run_id
        ),
    },
    settings
  );

/**
 * Starts a FindAll run and returns its id. With a `schema` it then adds the
 * enrichment; if that request fails, the error carries the run's id, since the run
 * already exists.
 */
export const startFindAll = async (
  raw: RawClient,
  objective: string,
  o: ParallelDiscoverOptions,
  call: CallOptions
): Promise<string> => {
  const id = await startJob(
    raw,
    "/v1beta/findall/runs",
    {
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
    },
    FindAllStart,
    (reply) => reply.findall_id
  );
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

/**
 * The result of a FindAll run once it has stopped (completed, failed or
 * cancelled), or undefined while it runs. `action_required` throws `JobFailed`,
 * and a status Parallel does not document throws `ProviderError`.
 */
export const findAllResult = async (
  raw: RawClient,
  id: string,
  request: CallOptions
) => {
  const run = z.parse(
    FindAllRun,
    await raw.request("GET", `/v1beta/findall/runs/${segment(id)}`, request)
  );
  const state = jobState(provider, id, FINDALL_STATES, {
    original: run.original,
    value: run.value.status.status,
  });
  if (state === "failed") {
    throw new FieldworkError(
      "JobFailed",
      `parallel FindAll run ${id} stopped with status action_required: it is waiting for an action Fieldwork cannot take, so it will not finish on its own. Open the run in the Parallel console to see what it needs`,
      { cause: run.original, provider }
    );
  }
  return state === "done"
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
