// Helpers every adapter shares: reading untyped provider bodies, building
// request bodies and `Meta`, and refusing option combinations before a send.
// Per-call deadlines live here (`callSettings`); the HTTP client is in http.ts.

import { FieldworkError } from "./errors.js";
import type { Original, SourceBlock } from "./parse.js";
import type { Citation, CallOptions, Meta, Page } from "./types.js";

/** An object with unchecked values: a parsed provider body, or a request body being built. */
export type Json = Record<string, unknown>;

const isJson = <V>(value: V): value is V & Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The value as an object, or an empty one when it is null, an array or not an object, so a read of a missing body needs no guard. */
export const record = (value: unknown): Json => (isJson(value) ? value : {});

// SAFETY: only keys whose value is undefined are dropped, so every other key
// keeps the type T gives it; callers read the dropped ones as absent.
/** Drops the keys whose value is undefined, so a request body or result carries only what was set. Shallow: nested objects are not touched. */
export const compact = <T extends Json>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as T;

/** The longest `timeout` a timer holds, in milliseconds: about 24.8 days. */
const MAX_TIMEOUT = 2_147_483_647;

/**
 * Refuses a `timeout` or `retries` that no timer or retry count can hold,
 * before anything is sent.
 *
 * Throws `InvalidRequest` naming the accepted range.
 */
export const checkCallSettings = (
  settings: Pick<CallOptions, "retries" | "timeout">
): void => {
  const { retries, timeout } = settings;
  if (
    timeout !== undefined &&
    !(Number.isInteger(timeout) && timeout >= 0 && timeout <= MAX_TIMEOUT)
  ) {
    throw new FieldworkError(
      "InvalidRequest",
      `timeout is ${timeout}: pass a whole number of milliseconds from 0 to ${MAX_TIMEOUT}`
    );
  }
  if (retries !== undefined && !(Number.isInteger(retries) && retries >= 0)) {
    throw new FieldworkError(
      "InvalidRequest",
      `retries is ${retries}: pass a whole number from 0 up`
    );
  }
};

/**
 * Splits an operation's options into the provider's own and the call's
 * settings. The call's `signal` also carries its `timeout` as a deadline, set
 * now, so every request the operation makes (a start, each poll, a result
 * download) shares one budget instead of restarting it. An empty `resume`
 * names no job, and a `timeout` or `retries` out of range holds no deadline or
 * count, so both are refused here, once for every adapter.
 *
 * `grace` extends the deadline past `timeout` for an operation that sends the
 * timeout to the provider and needs a moment more to hear its report.
 */
export const callSettings = <T extends CallOptions>(
  options: T | undefined,
  grace = 0
) => {
  // SAFETY: every operation interface makes `options` required when its type has
  // required keys, so absent options reach here only for a T with none, and {} is a T.
  const { retries, signal, timeout, ...rest } = options ?? ({} as T);
  if ("resume" in rest && rest.resume === "") {
    throw new FieldworkError(
      "InvalidRequest",
      "resume is empty: pass the jobId an earlier call returned, or leave resume out to start a job"
    );
  }
  checkCallSettings({ retries, timeout });
  const deadline =
    timeout === undefined
      ? signal
      : AbortSignal.any([
          ...(signal === undefined ? [] : [signal]),
          // The grace past the longest timeout is dropped rather than overflowing the timer.
          AbortSignal.timeout(Math.min(timeout + grace, MAX_TIMEOUT)),
        ]);
  return { call: { retries, signal: deadline, timeout }, rest };
};

/**
 * Reads a provider field that holds JSON text. A value that is not a string
 * is returned as it is, already parsed.
 *
 * Throws `ProviderError` carrying the parse error as `cause` when the text is
 * not valid JSON.
 */
export const parseJson = (provider: string, value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new FieldworkError(
      "ProviderError",
      `${provider} returned output that is not valid JSON`,
      {
        cause: error,
        provider,
      }
    );
  }
};

/** The citations with repeated URLs removed: the first of each URL stays, in order. */
export const uniqueCitations = (all: Citation[]): Citation[] => {
  const seen = new Map<string, Citation>();
  for (const item of all) {
    if (!seen.has(item.url)) {
      seen.set(item.url, item);
    }
  }
  return [...seen.values()];
};

/** The citation a parsed source amounts to, or undefined when it has no URL. */
export const citationOf = (source: SourceBlock): Citation | undefined =>
  source.url === undefined
    ? undefined
    : compact({
        excerpts: source.excerpts,
        title: source.title,
        url: source.url,
      });

/** The citations the parsed sources amount to; a source without a URL is left out. */
export const citationsOf = (sources: readonly SourceBlock[]): Citation[] =>
  sources
    .map((source) => citationOf(source))
    .filter((item): item is Citation => item !== undefined);

/** The job id a start call returned, or a ProviderError carrying the value as it arrived. */
export const requireJobId = (
  provider: string,
  id: Original<string | undefined>
): string => {
  if (id.value === undefined) {
    throw new FieldworkError(
      "ProviderError",
      `${provider} did not return a job id`,
      { cause: id.original, provider }
    );
  }
  return id.value;
};

/**
 * Builds a result's `meta`, leaving out whatever is absent: `units` with an
 * undefined count, an empty `usage`, no `warnings`. A single warning string
 * becomes a one-item list. Returns undefined when nothing is left, so a result
 * has no `meta` at all rather than an empty one.
 */
export const meta = (parts: {
  requestId?: string;
  credits?: number;
  costUsd?: number;
  units?: Record<string, number | undefined>;
  warnings?: string | readonly string[];
}): Meta | undefined => {
  const units = Object.fromEntries(
    Object.entries(parts.units ?? {}).filter(
      (entry): entry is [string, number] => entry[1] !== undefined
    )
  );
  const usage = compact({
    costUsd: parts.costUsd,
    credits: parts.credits,
    units: Object.keys(units).length > 0 ? units : undefined,
  });
  const warnings = [parts.warnings ?? []].flat();
  const result = compact({
    requestId: parts.requestId,
    usage: Object.keys(usage).length > 0 ? usage : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  });
  return Object.keys(result).length > 0 ? result : undefined;
};

/**
 * Refuses a request that sets more than one of `names` (a name counts as set
 * unless its value is undefined), for options the provider rejects or ignores
 * when combined. Throws before anything is sent.
 *
 * Throws `InvalidRequest` naming the options that were set.
 */
export const refuseTogether = <T>(
  provider: string,
  options: T,
  ...names: (keyof T & string)[]
): void => {
  const set = names.filter((name) => options[name] !== undefined);
  if (set.length > 1) {
    throw new FieldworkError(
      "InvalidRequest",
      `${provider} does not accept ${set.join(" and ")} together; pass one`,
      { provider }
    );
  }
};

/**
 * A `maxAge` in seconds as the whole hours Exa and Tavily count in, rounded
 * up, so 1 second is 1 hour and 0 stays 0 (always fetch fresh). A negative age
 * (read only the cache) becomes -1. Undefined stays undefined.
 */
export const hours = (seconds: number | undefined): number | undefined =>
  seconds === undefined
    ? undefined
    : seconds < 0
      ? -1
      : Math.ceil(seconds / 3600);

/** Statuses that mean the page is not there, so a read of it has no page to return. */
const GONE = new Set([404, 410]);

/**
 * A read whose page answered 404 or 410 fails as NotFound, as it does on
 * providers that return no page at all, instead of returning the error page
 * as if it were the content.
 */
export const presentPage = (provider: string, page: Page): Page => {
  if (page.statusCode !== undefined && GONE.has(page.statusCode)) {
    throw new FieldworkError(
      "NotFound",
      `${provider} could not read ${page.url}: the page returned ${page.statusCode}`,
      { provider, status: page.statusCode }
    );
  }
  return page;
};

/** Splits a batch's pages into those present and those that answered 404 or 410. */
export const presentPages = (pages: Page[]) => ({
  gone: pages
    .filter(
      (page) => page.statusCode !== undefined && GONE.has(page.statusCode)
    )
    .map((page) => ({
      error: `the page returned ${page.statusCode}`,
      url: page.url,
    })),
  pages: pages.filter(
    (page) => page.statusCode === undefined || !GONE.has(page.statusCode)
  ),
});
