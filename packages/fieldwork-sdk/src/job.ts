// Runs every asynchronous provider job (start, poll, finish) in one place, so
// each carries `jobId` on its errors and accepts `resume`. Adapters never poll
// by hand.

import { FieldworkError, withJob } from "./errors.js";
import { sleep, stopped } from "./http.js";
import type { CallOptions } from "./types.js";

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
  /** Milliseconds between checks. Defaults to 2000. */
  interval?: number;
}

/**
 * Checks the job every `interval` until it has a finished state. Throws
 * `Timeout` when another interval would pass the deadline, and `Aborted` or
 * `Timeout` (by how the signal stopped) once the signal is aborted. Both carry
 * `jobId`, because the job may still be running.
 */
const waitFor = async <Found>(
  provider: string,
  id: string,
  check: Job<Found, unknown>["check"],
  settings: JobSettings
): Promise<Found> => {
  const interval = settings.interval ?? 2000;
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
    if (Date.now() + interval > deadline) {
      throw new FieldworkError(
        "Timeout",
        `${provider} job ${id} did not finish in time; it may still be running`,
        { jobId: id, provider }
      );
    }
    await sleep(interval, settings.signal);
  }
};

/**
 * Runs an asynchronous job to its result: resumes the job named by `resume`
 * or starts one, checks it until it finishes, then builds the result.
 *
 * Every error after the job has an id carries it as `jobId`, including a
 * timeout or cancellation while waiting, so the caller can resume rather than
 * start a second job.
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
    throw withJob(error, id);
  }
};
