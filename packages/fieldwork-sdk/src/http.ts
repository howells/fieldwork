import { codeForStatus, FieldworkError, withJob } from "./errors.js";
import type { CallOptions } from "./types.js";

export interface RequestOptions extends CallOptions {
  /** A JSON body. */
  body?: unknown;
  /** A multipart body, sent as is. */
  form?: FormData;
  query?: Record<string, string | number | boolean | undefined>;
}

/**
 * The provider's HTTP API with authentication applied: the escape hatch for
 * anything Fieldwork does not wrap. Paths are relative to the provider's base
 * URL, so `raw.request("GET", "/usage")` calls the provider directly.
 */
export interface RawClient {
  readonly provider: string;
  readonly baseUrl: string;
  request<T = unknown>(
    method: string,
    path: string,
    options?: RequestOptions
  ): Promise<T>;
}

export interface ClientConfig {
  provider: string;
  baseUrl: string;
  headers: Record<string, string>;
  fetch?: typeof fetch;
}

export function createRawClient(config: ClientConfig): RawClient {
  const doFetch = config.fetch ?? globalThis.fetch;
  return {
    provider: config.provider,
    baseUrl: config.baseUrl,
    async request<T>(
      method: string,
      path: string,
      options: RequestOptions = {}
    ): Promise<T> {
      const url = new URL(config.baseUrl.replace(/\/$/u, "") + path);
      for (const [key, value] of Object.entries(options.query ?? {})) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
      const headers = new Headers({
        accept: "application/json",
        ...config.headers,
      });
      let body: string | FormData | undefined;
      if (options.form) {
        body = options.form;
      } else if (options.body !== undefined) {
        headers.set("content-type", "application/json");
        body = JSON.stringify(options.body);
      }
      const signal = combineSignals(options.signal, options.timeout);
      let response: Response;
      try {
        response = await doFetch(url, { method, headers, body, signal });
      } catch (error) {
        throw transportError(config.provider, error, options.signal);
      }
      const text = await response.text();
      const parsed = parseBody(text);
      if (!response.ok) {
        throw new FieldworkError(
          codeForStatus(response.status),
          `${config.provider} ${method} ${path} returned ${response.status}: ${describe(parsed, text)}`,
          {
            provider: config.provider,
            status: response.status,
            retryAfter: retryAfterSeconds(response.headers.get("retry-after")),
            cause: parsed,
          }
        );
      }
      return parsed as T;
    },
  };
}

function combineSignals(
  signal: AbortSignal | undefined,
  timeout: number | undefined
) {
  const signals = [
    signal,
    timeout === undefined ? undefined : AbortSignal.timeout(timeout),
  ].filter((value): value is AbortSignal => value !== undefined);
  return signals.length <= 1 ? signals[0] : AbortSignal.any(signals);
}

function transportError(
  provider: string,
  error: unknown,
  signal: AbortSignal | undefined
) {
  if (signal?.aborted) {
    return new FieldworkError("Aborted", `${provider} request was cancelled`, {
      provider,
      cause: error,
    });
  }
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return new FieldworkError("Timeout", `${provider} request timed out`, {
      provider,
      cause: error,
    });
  }
  // The request never reached a response, so repeating it can succeed.
  return new FieldworkError(
    "ProviderError",
    `${provider} request failed: ${String(error)}`,
    {
      provider,
      retryable: true,
      cause: error,
    }
  );
}

function parseBody(text: string): unknown {
  if (text === "") {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function describe(parsed: unknown, text: string): string {
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    for (const key of ["error", "message", "detail"]) {
      const value = record[key];
      if (typeof value === "string") {
        return value;
      }
      if (value && typeof value === "object") {
        return JSON.stringify(value).slice(0, 300);
      }
    }
  }
  return text.slice(0, 300);
}

/** Retry-After is either a number of seconds or an HTTP date. */
export function retryAfterSeconds(
  header: string | null,
  now = Date.now()
): number | undefined {
  if (!header) {
    return undefined;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return seconds;
  }
  const date = Date.parse(header);
  return Number.isNaN(date)
    ? undefined
    : Math.max(0, Math.ceil((date - now) / 1000));
}

export interface PollOptions extends CallOptions {
  /** Milliseconds between checks. */
  interval?: number;
}

/**
 * Calls `check` until it returns a value, waiting between calls. `check`
 * returns `undefined` while the job is still running. Every error raised while
 * waiting carries `jobId`, so the caller can resume the job instead of paying
 * for a second one.
 */
export async function poll<T>(
  provider: string,
  jobId: string,
  check: () => Promise<T | undefined>,
  options: PollOptions = {}
): Promise<T> {
  const interval = options.interval ?? 2000;
  const deadline = Date.now() + (options.timeout ?? 600_000);
  for (;;) {
    if (options.signal?.aborted) {
      throw new FieldworkError(
        "Aborted",
        `stopped waiting for ${provider} job ${jobId}; it may still be running`,
        { provider, jobId }
      );
    }
    let value: T | undefined;
    try {
      value = await check();
    } catch (error) {
      throw withJob(error, jobId);
    }
    if (value !== undefined) {
      return value;
    }
    if (Date.now() + interval > deadline) {
      throw new FieldworkError(
        "Timeout",
        `${provider} job ${jobId} did not finish in time; it may still be running`,
        { provider, jobId }
      );
    }
    await sleep(interval, options.signal);
  }
}

async function sleep(ms: number, signal?: AbortSignal) {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

/** Reads an API key from the adapter options or the environment. */
export function requireKey(
  provider: string,
  given: string | undefined,
  envName: string
): string {
  const key = given ?? process.env[envName];
  if (!key) {
    throw new FieldworkError(
      "Unauthorized",
      `${provider} needs an API key: pass apiKey or set ${envName}`,
      {
        provider,
      }
    );
  }
  return key;
}
