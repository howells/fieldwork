// The HTTP client every adapter builds on: JSON in and out, status codes mapped
// to `FieldworkError`, retries, deadlines, and redirects confined to the
// provider's own origin so its key never reaches another host.

import { codeForStatus, FieldworkError } from "./errors.js";
import type { CallOptions } from "./types.js";
import { record } from "./util.js";

/** Options for one request through an adapter's `raw` client. */
export interface RequestOptions extends CallOptions {
  /** A JSON body. */
  body?: unknown;
  /** A multipart body, sent as is. */
  form?: FormData;
  /** Query parameters. Undefined values are left out. */
  query?: Record<string, string | number | boolean | undefined>;
  /**
   * The request creates a job, session or monitor that the provider bills for
   * or keeps. After a 5xx or a dropped connection the provider may already
   * have created it, so only a rate limit, which it has certainly not acted
   * on, is retried.
   */
  creates?: boolean;
  /** The endpoint answers in text, such as an event stream, so its body is returned as a string. */
  text?: boolean;
}

/**
 * The provider's HTTP API with authentication applied: the escape hatch for
 * anything Fieldwork does not wrap. Paths are relative to the provider's base
 * URL, so `raw.request("GET", "/usage")` calls the provider directly.
 */
export interface RawClient {
  readonly provider: string;
  readonly baseUrl: string;
  /**
   * Sends a request and returns the response body: its JSON as `T`, which the
   * caller asserts and the client does not check (an empty body is undefined),
   * or a string when `options.text` is set. Retries as `CallOptions.retries`
   * says.
   *
   * Throws `FieldworkError`: from the status for an error response, and
   * `ProviderError` for a success whose body is not JSON, for a connection that
   * failed, and for a redirect to another origin. A stopped call is `Timeout` or
   * `Aborted`.
   */
  request: <T = unknown>(
    method: string,
    path: string,
    options?: RequestOptions
  ) => Promise<T>;
}

/** What `createRawClient` needs to talk to one provider. */
export interface ClientConfig {
  /** The provider's name, which leads every error message. */
  provider: string;
  /** The API's root; a request's path is appended to it. */
  baseUrl: string;
  /** Sent with every request, such as the authorization header. */
  headers: Record<string, string>;
  /** Defaults to the global `fetch`. A test passes a fake. */
  fetch?: typeof fetch;
  /** Repeats of a failed request; see `CallOptions.retries`. */
  retries?: number;
}

/** How many times a request that can succeed on repeat is retried by default. */
export const DEFAULT_RETRIES = 2;

/**
 * Waits `ms`. When `signal` aborts it resolves early rather than rejecting, so
 * the caller checks the signal afterwards. A signal already aborted on entry
 * returns at once.
 */
export const sleep = async (ms: number, signal?: AbortSignal) => {
  if (signal?.aborted === true) {
    return;
  }
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
    // The call's own deadline ran out; a 408 from the server can be retried.
    (error.code === "Timeout" && error.status === undefined) ||
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

/** Whether a stopped signal's deadline ran out, rather than its caller cancelling. */
const timedOut = (signal: AbortSignal) =>
  signal.reason instanceof DOMException &&
  signal.reason.name === "TimeoutError";

/**
 * The error for a call its signal stopped: `Timeout` when the signal's
 * deadline ran out (a call's `timeout` is a deadline signal across all its
 * requests), `Aborted` when the caller cancelled.
 */
export const stopped = (
  signal: AbortSignal,
  message: string,
  options: { cause?: unknown; jobId?: string; provider: string }
) =>
  new FieldworkError(
    timedOut(signal) ? "Timeout" : "Aborted",
    message,
    options
  );

/** The error for a fetch that threw: stopped by the signal (`Timeout` or `Aborted`), timed out on its own, or a lost connection, which can succeed on repeat. */
const transportError = (
  provider: string,
  error: unknown,
  signal: AbortSignal | undefined
) => {
  if (signal?.aborted === true) {
    return stopped(
      signal,
      `${provider} request stopped: ${timedOut(signal) ? "timed out" : "cancelled"}`,
      {
        cause: error,
        provider,
      }
    );
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

/** A response's body; a connection lost while it streams is a transport error like any other. */
const readText = async (
  provider: string,
  response: Response,
  signal: AbortSignal | undefined
): Promise<string> => {
  try {
    return await response.text();
  } catch (error) {
    throw transportError(provider, error, signal);
  }
};

/**
 * Builds the client for one provider. A request is sent to `baseUrl` plus its
 * path, with JSON bodies and the config's headers, and `timeout` and `signal`
 * stop it. A failed request is repeated as `CallOptions.retries` says, waiting
 * as long as the provider's `Retry-After` or backing off exponentially, and
 * never past the call's `timeout`. A request marked `creates` is repeated only
 * after a rate limit.
 */
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
        const text = await readText(config.provider, response, signal);
        const json = jsonOf(text);
        const parsed = json === undefined ? text : json.value;
        if (response.ok) {
          if (options.text !== true && json === undefined) {
            throw new FieldworkError(
              "ProviderError",
              `${config.provider} ${method} ${path} returned ${response.status} with a body that is not JSON: ${text.slice(0, 300)}`,
              {
                cause: text,
                provider: config.provider,
                status: response.status,
              }
            );
          }
          // SAFETY: the caller names T: the shape it expects of this endpoint's JSON, or string for a text endpoint. The client does not validate the body against it.
          return (options.text === true ? text : parsed) as T;
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
            throw stopped(
              options.signal,
              `${config.provider} request stopped while waiting to retry`,
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

/** The body's JSON, or undefined when the body is not JSON. An empty body is JSON with no value. */
const jsonOf = (text: string): { value: unknown } | undefined => {
  if (text === "") {
    return { value: undefined };
  }
  try {
    return { value: JSON.parse(text) };
  } catch {
    return undefined;
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

/**
 * Seconds to wait from a `Retry-After` header, which is a number of seconds or
 * an HTTP date. Undefined when the header is absent, empty or neither. `now`
 * is for tests.
 */
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

/** An id as one path segment, so a caller's `resume` cannot reach another endpoint. */
export const segment = (id: string): string => encodeURIComponent(id);

/**
 * The API key: `given`, else the environment variable. An empty `given` is
 * not replaced by the variable.
 *
 * Throws `Unauthorized` when there is no key or it is empty.
 */
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
  const text = await readText(provider, response, options.signal);
  if (!response.ok) {
    throw new FieldworkError(
      codeForStatus(response.status),
      `${provider} result at ${new URL(url).origin} returned ${response.status}: ${text.slice(0, 300)}`,
      { provider, status: response.status }
    );
  }
  return text;
};
