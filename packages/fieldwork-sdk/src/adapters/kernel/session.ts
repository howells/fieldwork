// A Kernel session's lifecycle for one call: create it, run the work, delete
// it whether or not the work succeeded, and read the time it billed. `read`
// and `download` in ../kernel.ts both run through `inSession`.

import * as z from "zod/mini";

import { FieldworkError } from "../../errors.js";
import { segment } from "../../http.js";
import type { RawClient } from "../../http.js";
import { runJob } from "../../job.js";
import type { CallOptions } from "../../types.js";
import { compact, meta, requireJobId } from "../../util.js";
import type { KernelProfile, KernelProxy } from "../kernel.js";
import { BrowserResponse, DeletedBrowserResponse } from "./response.js";

/** Seconds a read's session may sit idle before Kernel deletes it. */
const READ_IDLE_SECONDS = 60;

/** Milliseconds a read waits for Kernel to delete its session, apart from the call's own deadline. */
const RELEASE_TIMEOUT = 10_000;

/** Milliseconds a read waits for the deleted session's billed time. */
const BILLED_TIME_WAIT = 15_000;

/** The session's profile and proxy as Kernel's create body spells them. */
export const sessionBody = (o: {
  profile?: KernelProfile & { saveChanges?: boolean };
  proxy?: KernelProxy;
}) => ({
  profile: o.profile
    ? compact({
        id: o.profile.id,
        name: o.profile.name,
        save_changes: o.profile.saveChanges,
      })
    : undefined,
  proxy: o.proxy
    ? compact({ id: o.proxy.id, mode: o.proxy.mode, name: o.proxy.name })
    : undefined,
});

/** Why a session still bills, for a warning or an error. */
const leakText = (id: string, failure: FieldworkError) =>
  `could not delete browser ${id}, which bills until its ${READ_IDLE_SECONDS}-second idle timeout: ${failure.message}`;

/** What the work returned, or what it threw. */
const settle = async <T>(
  work: Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> => {
  try {
    return { ok: true, value: await work };
  } catch (error) {
    return { error, ok: false };
  }
};

/**
 * Deletes a read's session under its own 10-second deadline, not the call's,
 * so a read its caller stopped still stops the bill. A 404 or 410 means the
 * session is already gone. Returns why the delete failed, or undefined when
 * it did not, so the caller reports it without losing its own error.
 */
const release = async (
  raw: RawClient,
  id: string,
  retries: number | undefined
): Promise<FieldworkError | undefined> => {
  const deleted = await settle(
    raw.request("DELETE", `/browsers/${segment(id)}`, {
      retries,
      timeout: RELEASE_TIMEOUT,
    })
  );
  if (deleted.ok) {
    return undefined;
  }
  const { error } = deleted;
  if (!(error instanceof FieldworkError)) {
    return new FieldworkError("ProviderError", String(error), {
      cause: error,
      provider: raw.provider,
    });
  }
  return error.status === 404 || error.status === 410 ? undefined : error;
};

/**
 * The deleted session's billed time, which Kernel reports about a second after
 * deletion, waiting up to 15 seconds and no longer than the call's signal
 * allows. A failure to get it does not fail the read: the page is already
 * read and billed, so the result carries a warning instead.
 */
const billedTime = async (
  raw: RawClient,
  id: string,
  call: CallOptions
): Promise<{ uptimeMs?: number; warning?: string }> => {
  try {
    const uptimeMs = await runJob(
      "kernel",
      {
        check: async (sessionId, request) => {
          const body = z.parse(
            DeletedBrowserResponse,
            await raw.request("GET", `/browsers/${segment(sessionId)}`, {
              ...request,
              query: { include_deleted: true },
            })
          );
          return body.usage_status === "ready" ? body : undefined;
        },
        finish: (body) => body.usage?.uptime_ms,
        // The session already exists; its id is the one to wait on.
        start: async () => id,
      },
      {
        retries: call.retries,
        signal: call.signal,
        timeout: BILLED_TIME_WAIT,
      }
    );
    return { uptimeMs };
  } catch (error) {
    // runJob's own wait ran out, rather than the call's signal or a 408.
    const ranOut =
      error instanceof FieldworkError &&
      error.code === "Timeout" &&
      error.status === undefined &&
      call.signal?.aborted !== true;
    return {
      warning: ranOut
        ? `kernel did not report the session's billed time within ${BILLED_TIME_WAIT / 1000} seconds`
        : `could not get the session's billed time: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

/** A session's billed time as `meta`: `usage.units.uptime_ms`, or a warning saying why it is missing. */
export const sessionMeta = (
  id: string,
  billed: { uptimeMs?: number; warning?: string }
) =>
  meta({
    requestId: id,
    units: { uptime_ms: billed.uptimeMs },
    warnings: billed.warning,
  });

/** What a session ran, the session's billed time, and Kernel's create reply. */
interface SessionRun<T> {
  id: string;
  value: T;
  created: unknown;
  billed: { uptimeMs?: number; warning?: string };
}

/**
 * Runs `work` in a new headless session and deletes the session whether or
 * not the work succeeded. A failure whose session could not be deleted fails
 * with its own error, naming the session that still bills; one whose session
 * was deleted carries the session's billed time as `meta`.
 */
export const inSession = async <T>(
  raw: RawClient,
  o: { stealth?: boolean; profile?: KernelProfile; proxy?: KernelProxy },
  call: CallOptions,
  work: (id: string) => Promise<T>
): Promise<SessionRun<T>> => {
  const { provider } = raw;
  const created = await raw.request("POST", "/browsers", {
    creates: true,
    ...call,
    body: compact({
      headless: true,
      stealth: o.stealth,
      timeout_seconds: READ_IDLE_SECONDS,
      ...sessionBody({ profile: o.profile, proxy: o.proxy }),
    }),
  });
  const id = requireJobId(
    provider,
    z.parse(BrowserResponse, created).session_id
  );
  const done = await settle(work(id));
  const unreleased = await release(raw, id, call.retries);
  if (!done.ok) {
    const { error } = done;
    if (unreleased === undefined) {
      if (!(error instanceof FieldworkError)) {
        throw error;
      }
      throw new FieldworkError(error.code, error.message, {
        cause: error.cause,
        jobId: error.jobId,
        meta: sessionMeta(id, await billedTime(raw, id, call)),
        provider: error.provider,
        retryAfter: error.retryAfter,
        retryable: error.retryable,
        status: error.status,
      });
    }
    const message = `${error instanceof Error ? error.message : String(error)}; also ${leakText(id, unreleased)}`;
    throw error instanceof FieldworkError
      ? new FieldworkError(error.code, message, {
          cause: error,
          jobId: error.jobId,
          provider: error.provider,
          retryAfter: error.retryAfter,
          retryable: error.retryable,
          status: error.status,
        })
      : new FieldworkError("ProviderError", message, {
          cause: error,
          provider,
        });
  }
  const billed =
    unreleased === undefined
      ? await billedTime(raw, id, call)
      : { warning: leakText(id, unreleased) };
  return { billed, created, id, value: done.value };
};
