// The one error type the SDK throws, and the mapping from HTTP statuses to its
// codes. http.ts raises these for transport and status failures; adapters raise
// them for the rest; job.ts attaches `jobId`.

/** Why a call failed. Branch on this, not on the message, which can change. */
export type FieldworkErrorCode =
  /** The adapter's provider does not offer this capability. */
  | "Unsupported"
  /** The API key is missing or the provider rejected it. */
  | "Unauthorized"
  /** The provider refused the request because of a rate or plan limit. */
  | "RateLimited"
  /** A 404, or a page read that answered 404 or 410. */
  | "NotFound"
  /** The request is malformed or combines options the provider rejects: its 400 or 422, or Fieldwork refusing it before sending. */
  | "InvalidRequest"
  /** An asynchronous job finished without a result. */
  | "JobFailed"
  /** The call's `timeout` ran out, a job did not finish within it, or the provider answered 408. */
  | "Timeout"
  /** The caller's `signal` cancelled the call. */
  | "Aborted"
  /** Any other provider failure. */
  | "ProviderError";

/** What a `FieldworkError` carries besides its code and message. */
export interface FieldworkErrorOptions {
  /** The provider the call was for, such as "exa". */
  provider?: string;
  /** The HTTP status the provider answered with. */
  status?: number;
  /** Seconds the provider asked to wait before retrying. */
  retryAfter?: number;
  /** The provider's id for an asynchronous job that was already created. */
  jobId?: string;
  /** Overrides the default, which follows from the code and status. */
  retryable?: boolean;
  /** What the failure came from, such as the provider's parsed error body or the underlying fetch error. */
  cause?: unknown;
}

/** The one error type every adapter throws, with a normalized code. */
export class FieldworkError extends Error {
  override readonly name = "FieldworkError";
  readonly code: FieldworkErrorCode;
  /** The provider the call was for, when the error came from one. */
  readonly provider?: string;
  /** The HTTP status the provider answered with, when there was a response. */
  readonly status?: number;
  /** Seconds the provider asked to wait before retrying, from its `Retry-After` header. */
  readonly retryAfter?: number;
  /**
   * The provider's id for an asynchronous job that was already created when
   * the call failed. The job may still be running and billing: pass this id
   * as `resume` to wait for it again rather than starting another.
   */
  readonly jobId?: string;
  /**
   * Whether repeating the same call can succeed. False whenever `jobId` is
   * set, because repeating the call would start a second job; resume it.
   */
  readonly retryable: boolean;

  constructor(
    code: FieldworkErrorCode,
    message: string,
    options: FieldworkErrorOptions = {}
  ) {
    super(message, { cause: options.cause });
    this.code = code;
    this.provider = options.provider;
    this.status = options.status;
    this.retryAfter = options.retryAfter;
    this.jobId = options.jobId;
    this.retryable =
      options.jobId === undefined &&
      (options.retryable ?? isRetryable(code, options.status));
  }

  /** The fields an agent or a log needs, without the provider's response. */
  toJSON() {
    return {
      code: this.code,
      jobId: this.jobId,
      message: this.message,
      name: this.name,
      provider: this.provider,
      retryAfter: this.retryAfter,
      retryable: this.retryable,
      status: this.status,
    };
  }
}

/** Rate limits, timeouts and 5xx statuses can succeed on repeat. The HTTP client still does not repeat a call whose own deadline ran out. */
const isRetryable = (code: FieldworkErrorCode, status: number | undefined) => {
  if (code === "RateLimited" || code === "Timeout") {
    return true;
  }
  return status !== undefined && status >= 500;
};

/**
 * The error with the job it belongs to attached. An error that is not a
 * `FieldworkError`, or that already has a `jobId`, comes back as it is.
 * Otherwise a copy carries `jobId`, which also makes it not `retryable`.
 */
export const withJob = <E>(error: E, jobId: string): E | FieldworkError => {
  if (!(error instanceof FieldworkError) || error.jobId !== undefined) {
    return error;
  }
  return new FieldworkError(error.code, error.message, {
    cause: error.cause,
    jobId,
    provider: error.provider,
    retryAfter: error.retryAfter,
    status: error.status,
  });
};

/**
 * The code for a provider's HTTP error status. Statuses not listed, 5xx
 * included, are `ProviderError`; a 5xx is still `retryable`.
 */
export const codeForStatus = (status: number): FieldworkErrorCode => {
  if (status === 401 || status === 403) {
    return "Unauthorized";
  }
  if (status === 404) {
    return "NotFound";
  }
  if (status === 408) {
    return "Timeout";
  }
  // Tavily uses 432, 433 and 434 for plan, pay-as-you-go and capacity limits.
  if (status === 429 || status === 432 || status === 433 || status === 434) {
    return "RateLimited";
  }
  if (status === 400 || status === 422) {
    return "InvalidRequest";
  }
  return "ProviderError";
};

/** A request refused before it is sent, with the provider's name leading the message. */
export const invalidRequest = (provider: string, message: string) =>
  new FieldworkError("InvalidRequest", `${provider} ${message}`, { provider });
