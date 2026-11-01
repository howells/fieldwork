import { FieldworkError } from "./errors.js";
import type { Original, SourceBlock } from "./parse.js";
import type { Citation, CallOptions, Meta, Page } from "./types.js";

export type Json = Record<string, unknown>;

const isJson = <V>(value: V): value is V & Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const record = (value: unknown): Json => (isJson(value) ? value : {});

// SAFETY: only keys whose value is undefined are dropped, so every other key
// keeps the type T gives it; callers read the dropped ones as absent.
export const compact = <T extends Json>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as T;

export const callSettings = <T extends CallOptions>(options: T | undefined) => {
  // SAFETY: every operation interface makes `options` required when its type has
  // required keys, so absent options reach here only for a T with none, and {} is a T.
  const { retries, signal, timeout, ...rest } = options ?? ({} as T);
  return { call: { retries, signal, timeout }, rest };
};

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
