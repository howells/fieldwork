// Runs every asynchronous provider job (start, poll, finish) in one place, so
// each carries `jobId` on its errors and accepts `resume`. Adapters never poll
// by hand.

import * as z from "zod/mini";

import { FieldworkError, withJob } from "./errors.js";
import { sleep, stopped } from "./http.js";
import type { RawClient, RequestOptions } from "./http.js";
import type { Original } from "./parse.js";
import type { CallOptions } from "./types.js";
import { requireJobId } from "./util.js";

/**
 * How one asynchronous job runs. The job module calls these in order; each
 * error they raise once the job has an id surfaces with it as `jobId`.
 */
export interface Job<Found, Result> {
  /** Starts the job and returns its id. Not called when resuming. */
  start: () => Promise<string>;
  /**
   * Checks the job once: its finished state, or undefined while it runs.
   * Throws when the provider reports that the job failed.
   */
  check: (id: string, request: CallOptions) => Promise<Found | undefined>;
  /** Turns the finished state into the call's result. */
  finish: (found: Found, id: string) => Promise<Result> | Result;
}

/**
 * The settings `runJob` reads. Here `timeout` is how long to wait for the job
 * to finish, 600000 ms (ten minutes) when unset, and `signal` stops the wait;
 * `retries` applies to each check request.
 */
export interface JobSettings extends CallOptions {
  /** The id of a job already started, from an error's `jobId`; waits for it instead of starting another. */
  resume?: string;
  /**
   * Milliseconds between checks. When unset, the first wait is 500 ms and each
   * later one doubles, up to 2000 ms, so a short job is collected soon after
   * it finishes and a long one is not checked more often than every 2 seconds.
   */
  interval?: number;
}

/** The first wait between checks when `interval` is unset, and the longest. */
const FIRST_WAIT = 500;
const LONGEST_WAIT = 2000;

/**
 * Checks the job until it has a finished state, waiting `interval` between
 * checks, or 500 ms doubling to 2000 ms when it is unset. Throws
 * `Timeout` when another wait would pass the deadline, and `Aborted` or
 * `Timeout` (by how the signal stopped) once the signal is aborted. Both carry
 * `jobId`, because the job may still be running.
 */
const waitFor = async <Found>(
  provider: string,
  id: string,
  check: Job<Found, unknown>["check"],
  settings: JobSettings
): Promise<Found> => {
  let wait = settings.interval ?? FIRST_WAIT;
  const deadline = Date.now() + (settings.timeout ?? 600_000);
  // Each check is one request: the call's signal carries its whole deadline.
  const request = { retries: settings.retries, signal: settings.signal };
  for (;;) {
    if (settings.signal?.aborted === true) {
      throw stopped(
        settings.signal,
        `stopped waiting for ${provider} job ${id}; it may still be running`,
        { jobId: id, provider }
      );
    }
    const found = await check(id, request);
    if (found !== undefined) {
      return found;
    }
    if (Date.now() + wait > deadline) {
      throw new FieldworkError(
        "Timeout",
        `${provider} job ${id} did not finish in time; it may still be running`,
        { jobId: id, provider }
      );
    }
    await sleep(wait, settings.signal);
    if (settings.interval === undefined) {
      wait = Math.min(wait * 2, LONGEST_WAIT);
    }
  }
};

/**
 * Runs an asynchronous job to its result: resumes the job named by `resume`
 * or starts one, checks it until it finishes, then builds the result.
 *
 * Every error after the job has an id carries it as `jobId`, including a
 * timeout or cancellation while waiting, so the caller can resume rather than
 * start a second job. An error that is not a `FieldworkError` becomes
 * `ProviderError` with the original as `cause`.
 */
export const runJob = async <Found, Result>(
  provider: string,
  job: Job<Found, Result>,
  settings: JobSettings
): Promise<Result> => {
  const id = settings.resume ?? (await job.start());
  try {
    return await job.finish(
      await waitFor(provider, id, job.check, settings),
      id
    );
  } catch (error) {
    if (error instanceof FieldworkError) {
      throw withJob(error, id);
    }
    throw new FieldworkError(
      "ProviderError",
      error instanceof Error ? error.message : String(error),
      { cause: error, jobId: id, provider }
    );
  }
};

/**
 * Sends the POST that creates a job, marked `creates` so a failure after
 * which the provider may have created it is not repeated, reads the reply
 * through `reply`, and returns the job id `idOf` picks from it.
 *
 * Throws `ProviderError` carrying the id as it arrived when the reply has none.
 */
export const startJob = async <Reply extends z.ZodMiniType>(
  raw: RawClient,
  path: string,
  request: Omit<RequestOptions, "creates">,
  reply: Reply,
  idOf: (parsed: z.output<Reply>) => Original<string | undefined>
): Promise<string> =>
  requireJobId(
    raw.provider,
    idOf(
      z.parse(
        reply,
        await raw.request("POST", path, { ...request, creates: true })
      )
    )
  );

/** A provider's status names for one kind of job. Names compare exactly, case included. */
export interface JobStates {
  /** Still going: check again. */
  running: readonly string[];
  /** Finished: the result can be read. */
  done: readonly string[];
  /** Ended without a result. */
  failed: readonly string[];
  /** The provider may leave the status out while the job runs. Otherwise a missing status throws. */
  missingIsRunning?: boolean;
}

/**
 * Which of `states` a job's reported status is in. `status.original` is the
 * provider's whole response, not the status field alone.
 *
 * Throws `ProviderError` with `jobId`, carrying that response as `cause`, for
 * a status in none of them or a missing one the provider always sends, rather
 * than polling an unknown state until the timeout.
 */
export const jobState = (
  provider: string,
  id: string,
  states: JobStates,
  { original, value: status }: Original<string | undefined>
): "running" | "done" | "failed" => {
  if (status === undefined && states.missingIsRunning === true) {
    return "running";
  }
  if (status !== undefined) {
    if (states.running.includes(status)) {
      return "running";
    }
    if (states.done.includes(status)) {
      return "done";
    }
    if (states.failed.includes(status)) {
      return "failed";
    }
  }
  throw new FieldworkError(
    "ProviderError",
    status === undefined
      ? `${provider} job ${id} reported no status`
      : `${provider} job ${id} reported status "${status}", which Fieldwork does not know`,
    { cause: original, jobId: id, provider }
  );
};

/**
 * A finished job's main payload, which must be there: a run that ends without
 * it has no result to return. `output.original` is the provider's whole
 * response.
 *
 * Throws `JobFailed` with `jobId`, carrying that response as `cause`, when the
 * value is undefined, null or an empty string.
 */
export const requireOutput = <Value>(
  provider: string,
  id: string,
  { original, value }: Original<Value>
): NonNullable<Value> => {
  if (value === undefined || value === null || value === "") {
    throw new FieldworkError(
      "JobFailed",
      `${provider} job ${id} finished without output`,
      { cause: original, jobId: id, provider }
    );
  }
  return value;
};
