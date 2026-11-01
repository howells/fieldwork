import { FieldworkError } from "./errors.js";
import type { Citation, CallOptions, Meta, ProductImage } from "./types.js";

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
        cause: error,
        provider,
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
  return compact({ excerpts, title: text(item.title), url });
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
      { cause: value, provider }
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

/** A Meta block with only the parts that were set, or undefined when none was. */
export function meta(parts: {
  requestId?: unknown;
  credits?: unknown;
  costUsd?: unknown;
  units?: Record<string, unknown>;
  warnings?: unknown;
}): Meta | undefined {
  const units = Object.fromEntries(
    Object.entries(parts.units ?? {}).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1])
    )
  );
  const usage = compact({
    costUsd: num(parts.costUsd),
    credits: num(parts.credits),
    units: Object.keys(units).length > 0 ? units : undefined,
  });
  const warnings =
    typeof parts.warnings === "string"
      ? [parts.warnings]
      : list(parts.warnings)
          .map((item) =>
            typeof item === "string"
              ? item
              : (text(record(item).message) ?? text(record(item).detail))
          )
          .filter((item): item is string => item !== undefined);
  const result = compact({
    requestId: scalar(parts.requestId),
    usage: Object.keys(usage).length > 0 ? usage : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  });
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Product images, whether the provider sends URLs or `{url, alt}` objects. */
export function productImages(value: unknown): ProductImage[] | undefined {
  const items = list(value)
    .map((item) => {
      if (typeof item === "string") {
        return item === "" ? undefined : { url: item };
      }
      const image = record(item);
      const url = text(image.url) ?? text(image.src);
      return url ? compact({ alt: text(image.alt), url }) : undefined;
    })
    .filter((item): item is ProductImage => item !== undefined);
  return items.length > 0 ? items : undefined;
}

/**
 * Refuses a call that sets options the provider cannot combine, before any
 * request is sent: `refuseTogether(provider, o, "includeDomains", "excludeDomains")`.
 */
export function refuseTogether(
  provider: string,
  options: Record<string, unknown>,
  ...names: string[]
): void {
  const set = names.filter((name) => options[name] !== undefined);
  if (set.length > 1) {
    throw new FieldworkError(
      "InvalidRequest",
      `${provider} does not accept ${set.join(" and ")} together; pass one`,
      { provider }
    );
  }
}

/** Seconds to whole hours, rounding up, for providers that count freshness in hours. */
export function hours(seconds: number | undefined): number | undefined {
  return seconds === undefined
    ? undefined
    : seconds < 0
      ? -1
      : Math.ceil(seconds / 3600);
}
