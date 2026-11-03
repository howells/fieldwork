import { codeForStatus, FieldworkError, withJob } from "./errors.js";
import type { CallOptions } from "./types.js";
import { record } from "./util.js";

export interface RequestOptions extends CallOptions {
  /** A JSON body. */
  body?: unknown;
  /** A multipart body, sent as is. */
  form?: FormData;
  query?: Record<string, string | number | boolean | undefined>;
  /**
   * The request creates a job, session or monitor that the provider bills for
   * or keeps. After a 5xx or a dropped connection the provider may already
   * have created it, so only a rate limit, which it has certainly not acted
   * on, is retried.
   */
  creates?: boolean;
}

/**
 * The provider's HTTP API with authentication applied: the escape hatch for
 * anything Fieldwork does not wrap. Paths are relative to the provider's base
 * URL, so `raw.request("GET", "/usage")` calls the provider directly.
 */
export interface RawClient {
  readonly provider: string;
  readonly baseUrl: string;
  request: <T = unknown>(
    method: string,
    path: string,
    options?: RequestOptions
  ) => Promise<T>;
}

export interface ClientConfig {
  provider: string;
  baseUrl: string;
  headers: Record<string, string>;
  fetch?: typeof fetch;
  /** Repeats of a failed request; see `CallOptions.retries`. */
  retries?: number;
}

/** How many times a request that can succeed on repeat is retried by default. */
export const DEFAULT_RETRIES = 2;

const sleep = async (ms: number, signal?: AbortSignal) => {
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
};

/** The longest wait between attempts; a provider asking for longer gets the error instead. */
const MAX_RETRY_WAIT = 30_000;
const FIRST_RETRY_WAIT = 500;

interface RetryState {
  count: number;
  retries: number;
  creates: boolean;
  signal: AbortSignal | undefined;
}

/**
 * Milliseconds to wait before repeating a failed request, or undefined when it
 * should not be repeated: the attempts are used up, the call was cancelled or
 * timed out, the failure would recur, or the request created something.
 */
const retryDelay = (
  error: FieldworkError,
  state: RetryState
): number | undefined => {
  if (
    state.count >= state.retries ||
    state.signal?.aborted === true ||
    !error.retryable ||
    error.code === "Timeout" ||
    (state.creates && error.code !== "RateLimited")
  ) {
    return undefined;
  }
  if (error.retryAfter !== undefined) {
    const asked = error.retryAfter * 1000;
    return asked > MAX_RETRY_WAIT ? undefined : asked;
  }
  // Exponential backoff with jitter, so clients that failed together spread out.
  const ceiling = Math.min(MAX_RETRY_WAIT, FIRST_RETRY_WAIT * 2 ** state.count);
  return ceiling / 2 + Math.random() * (ceiling / 2);
};

export const createRawClient = (config: ClientConfig): RawClient => {
  const doFetch = config.fetch ?? globalThis.fetch;
  return {
    baseUrl: config.baseUrl,
    provider: config.provider,
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
      const send = async (request: Hop) => {
        try {
          return await doFetch(request.url, {
            body: request.body,
            headers,
            method: request.method,
            // Redirects are followed below, so the key is never sent to a
            // host other than the provider's.
            redirect: "manual",
            signal,
          });
        } catch (error) {
          throw transportError(config.provider, error, options.signal);
        }
      };
      const once = async () => {
        const response = await followRedirects(config.provider, send, {
          body,
          method,
          url,
        });
        const text = await response.text();
        const parsed = parseBody(text);
        if (response.ok) {
          // SAFETY: the caller names T, the shape it expects of this endpoint's JSON; the client does not validate the body against it.
          return parsed as T;
        }
        throw new FieldworkError(
          codeForStatus(response.status),
          `${config.provider} ${method} ${path} returned ${response.status}: ${describe(parsed, text)}`,
          {
            cause: parsed,
            provider: config.provider,
            retryAfter: retryAfterSeconds(response.headers.get("retry-after")),
            status: response.status,
          }
        );
      };
      const retries = options.retries ?? config.retries ?? DEFAULT_RETRIES;
      // A wait that would outlast the call's timeout only delays the same error.
      const deadline =
        options.timeout === undefined
          ? undefined
          : Date.now() + options.timeout;
      const attempt = async (count: number): Promise<T> => {
        try {
          return await once();
        } catch (error) {
          if (!(error instanceof FieldworkError)) {
            throw error;
          }
          const wait = retryDelay(error, {
            count,
            creates: options.creates === true,
            retries,
            signal,
          });
          if (
            wait === undefined ||
            (deadline !== undefined && Date.now() + wait >= deadline)
          ) {
            throw error;
          }
          await sleep(wait, signal);
          if (options.signal?.aborted === true) {
            throw new FieldworkError(
              "Aborted",
              `${config.provider} request was cancelled while waiting to retry`,
              { cause: error, provider: config.provider }
            );
          }
          return await attempt(count + 1);
        }
      };
      return await attempt(0);
    },
  };
};

interface Hop {
  url: URL;
  method: string;
  body: string | FormData | undefined;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

/**
 * Follows a provider's redirects only within its own origin, so the key in
 * the request's headers or query never reaches another host. A redirect to
 * another origin, scheme or port fails before anything is sent there.
 */
const followRedirects = async (
  provider: string,
  send: (hop: Hop) => Promise<Response>,
  first: Hop
): Promise<Response> => {
  let hop = first;
  for (let count = 0; count <= MAX_REDIRECTS; count += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each hop depends on the previous response
    const response = await send(hop);
    if (response.type === "opaqueredirect") {
      throw new FieldworkError(
        "ProviderError",
        `${provider} redirected the request, and this runtime hides where to; Fieldwork does not follow it`,
        { provider }
      );
    }
    const location = response.headers.get("location");
    if (!REDIRECTS.has(response.status) || location === null) {
      return response;
    }
    const target = new URL(location, hop.url);
    if (target.origin !== first.url.origin) {
      throw new FieldworkError(
        "ProviderError",
        `${provider} redirected the request to ${target.origin}; Fieldwork follows redirects only within ${first.url.origin}, so the key was not sent`,
        { provider, status: response.status }
      );
    }
    // As fetch does: 303, and 301 or 302 after a POST, become a GET without a body.
    const toGet =
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) &&
        hop.method === "POST");
    hop = toGet
      ? { body: undefined, method: "GET", url: target }
      : { ...hop, url: target };
  }
  throw new FieldworkError(
    "ProviderError",
    `${provider} redirected the request more than ${MAX_REDIRECTS} times`,
    { provider }
  );
};

const combineSignals = (
  signal: AbortSignal | undefined,
  timeout: number | undefined
) => {
  const signals = [
    signal,
    timeout === undefined ? undefined : AbortSignal.timeout(timeout),
  ].filter((value): value is AbortSignal => value !== undefined);
  return signals.length <= 1 ? signals[0] : AbortSignal.any(signals);
};

const transportError = (
  provider: string,
  error: unknown,
  signal: AbortSignal | undefined
) => {
  if (signal?.aborted === true) {
    return new FieldworkError("Aborted", `${provider} request was cancelled`, {
      cause: error,
      provider,
    });
  }
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return new FieldworkError("Timeout", `${provider} request timed out`, {
      cause: error,
      provider,
    });
  }
  // The request never reached a response, so repeating it can succeed.
  return new FieldworkError(
    "ProviderError",
    `${provider} request failed: ${String(error)}`,
    {
      cause: error,
      provider,
      retryable: true,
    }
  );
};

const parseBody = (text: string): unknown => {
  if (text === "") {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const describe = (parsed: unknown, text: string): string => {
  const body = record(parsed);
  for (const key of ["error", "message", "detail"]) {
    const value = body[key];
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "object" && value !== null) {
      return JSON.stringify(value).slice(0, 300);
    }
  }
  return text.slice(0, 300);
};

export const retryAfterSeconds = (
  header: string | null,
  now = Date.now()
): number | undefined => {
  if (header === null || header === "") {
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
};

export interface PollOptions extends CallOptions {
  /** Milliseconds between checks. */
  interval?: number;
}

export const poll = async <T>(
  provider: string,
  jobId: string,
  check: () => Promise<T | undefined>,
  options: PollOptions = {}
): Promise<T> => {
  const interval = options.interval ?? 2000;
  const deadline = Date.now() + (options.timeout ?? 600_000);
  for (;;) {
    if (options.signal?.aborted === true) {
      throw new FieldworkError(
        "Aborted",
        `stopped waiting for ${provider} job ${jobId}; it may still be running`,
        { jobId, provider }
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
        { jobId, provider }
      );
    }
    await sleep(interval, options.signal);
  }
};

export const requireKey = (
  provider: string,
  given: string | undefined,
  envName: string
): string => {
  const key = given ?? process.env[envName];
  if (key === undefined || key === "") {
    throw new FieldworkError(
      "Unauthorized",
      `${provider} needs an API key: pass apiKey or set ${envName}`,
      {
        provider,
      }
    );
  }
  return key;
};

/**
 * Fetches a presigned URL a provider returned, such as a large result on
 * storage, and returns its body as text. Nothing of the provider's client is
 * sent with it: the URL carries its own authorization, and the key must not
 * reach another host.
 */
export const readSigned = async (
  provider: string,
  url: string,
  options: { fetch?: typeof fetch; signal?: AbortSignal }
): Promise<string> => {
  const doFetch = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await doFetch(url, { signal: options.signal });
  } catch (error) {
    throw transportError(provider, error, options.signal);
  }
  const text = await response.text();
  if (!response.ok) {
    throw new FieldworkError(
      codeForStatus(response.status),
      `${provider} result at ${new URL(url).origin} returned ${response.status}: ${text.slice(0, 300)}`,
      { provider, status: response.status }
    );
  }
  return text;
};
