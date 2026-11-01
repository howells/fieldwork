export type FieldworkErrorCode =
  /** The adapter's provider does not offer this capability. */
  | "Unsupported"
  /** The API key is missing or the provider rejected it. */
  | "Unauthorized"
  /** The provider refused the request because of a rate or plan limit. */
  | "RateLimited"
  | "NotFound"
  /** The provider rejected the request as malformed. */
  | "InvalidRequest"
  /** An asynchronous job finished without a result. */
  | "JobFailed"
  | "Timeout"
  | "Aborted"
  /** Any other provider failure. */
  | "ProviderError";

export interface FieldworkErrorOptions {
  provider?: string;
  status?: number;
  /** Seconds the provider asked to wait before retrying. */
  retryAfter?: number;
  cause?: unknown;
}

/** The one error type every adapter throws, with a normalized code. */
export class FieldworkError extends Error {
  override readonly name = "FieldworkError";
  readonly code: FieldworkErrorCode;
  readonly provider?: string;
  readonly status?: number;
  readonly retryAfter?: number;

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
  }
}

export function codeForStatus(status: number): FieldworkErrorCode {
  if (status === 401 || status === 403) {
    return "Unauthorized";
  }
  if (status === 404) {
    return "NotFound";
  }
  if (status === 408) {
    return "Timeout";
  }
  // Tavily uses 432 and 433 for plan and pay-as-you-go limits.
  if (status === 429 || status === 432 || status === 433) {
    return "RateLimited";
  }
  if (status === 400 || status === 422) {
    return "InvalidRequest";
  }
  return "ProviderError";
}
