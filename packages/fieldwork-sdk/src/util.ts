import { FieldworkError } from "./errors.js";
import type { Citation, CallOptions } from "./types.js";

export type Json = Record<string, unknown>;

export function record(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};
}

export function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function text(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function strings(value: unknown): string[] | undefined {
  const items = list(value).filter(
    (item): item is string => typeof item === "string"
  );
  return items.length > 0 ? items : undefined;
}

/** Drops keys whose value is undefined, so request bodies carry only what was set. */
export function compact<T extends Json>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as T;
}

/** Splits Fieldwork's own call settings from the provider options. */
export function callSettings<T extends CallOptions>(options: T | undefined) {
  const { signal, timeout, ...rest } = options ?? ({} as T);
  return { call: { signal, timeout }, rest };
}

export function parseJson(provider: string, value: unknown): unknown {
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
        provider,
        cause: error,
      }
    );
  }
}

export function uniqueCitations(all: Citation[]): Citation[] {
  const seen = new Map<string, Citation>();
  for (const item of all) {
    if (!seen.has(item.url)) {
      seen.set(item.url, item);
    }
  }
  return [...seen.values()];
}

export function citation(value: unknown): Citation | undefined {
  const item = record(value);
  const url = text(item.url);
  if (!url) {
    return undefined;
  }
  const excerpts =
    typeof item.excerpts === "string"
      ? [item.excerpts]
      : strings(item.excerpts);
  return compact({ url, title: text(item.title), excerpts });
}

export function citations(value: unknown): Citation[] {
  return list(value)
    .map((item) => citation(item))
    .filter((item): item is Citation => item !== undefined);
}

/** The id of a job the provider just created; a missing id means the job cannot be followed. */
export function requireId(provider: string, value: unknown): string {
  const id = typeof value === "number" ? String(value) : text(value);
  if (id === undefined) {
    throw new FieldworkError(
      "ProviderError",
      `${provider} did not return a job id`,
      { provider, cause: value }
    );
  }
  return id;
}

/** Any scalar as text, for values a provider may send as a string or a number. */
export function scalar(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  return typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : undefined;
}
