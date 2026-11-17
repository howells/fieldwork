// What every adapter's `download` shares: the checks before a request is sent
// and the checks that turn a provider's reply into a `DownloadedFile`. Each
// adapter fetches through its provider's own network; nothing here fetches.

import { FieldworkError, invalidRequest } from "./errors.js";
import type { DownloadedFile, Meta } from "./types.js";

/** One mebibyte, the unit the providers' ceilings are stated in. */
export const MIB = 1024 * 1024;

/**
 * Throws `InvalidRequest` unless the URL parses and is http or https, so
 * nothing is sent for a URL no provider can download.
 */
export const checkFileUrl = (provider: string, url: string): void => {
  const parsed = URL.parse(url);
  if (parsed === null) {
    throw invalidRequest(provider, `cannot download ${url}: it is not a URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw invalidRequest(
      provider,
      `downloads only http and https URLs, not ${parsed.protocol} (${url})`
    );
  }
};

/**
 * The byte limit for a download: `maxBytes`, or the provider's ceiling when
 * it is unset. Throws `InvalidRequest` for a limit that is not a positive
 * whole number or exceeds the ceiling.
 */
export const byteLimit = (
  provider: string,
  ceiling: number,
  maxBytes: number | undefined
): number => {
  if (maxBytes === undefined) {
    return ceiling;
  }
  if (!Number.isInteger(maxBytes) || maxBytes < 1) {
    throw invalidRequest(
      provider,
      `needs maxBytes as a positive whole number, got ${maxBytes}`
    );
  }
  if (maxBytes > ceiling) {
    throw invalidRequest(
      provider,
      `downloads at most ${ceiling} bytes; maxBytes ${maxBytes} is larger`
    );
  }
  return maxBytes;
};

/** The error for a file over the limit. */
export const tooLarge = (
  provider: string,
  url: string,
  size: number | undefined,
  limit: number
) =>
  new FieldworkError(
    "TooLarge",
    `${provider} could not download ${url}: the file is ${
      size === undefined ? "larger than" : `${size} bytes, over`
    } the limit of ${limit} bytes`,
    { provider }
  );

/** Content types that are web pages rather than files. */
const PAGE_TYPES = new Set(["text/html", "application/xhtml+xml"]);

/** Statuses that mean the file is not there. */
const GONE = new Set([404, 410]);

/** What an adapter fetched, before it is checked. */
export interface Fetched {
  /** The URL the call asked for. */
  requested: string;
  /** The final URL after redirects, as the provider reports it. */
  url: string;
  statusCode?: number;
  contentType?: string;
  /** The body as Base64, or as text the provider decoded as UTF-8. */
  body: { base64: string } | { utf8: string };
  /** Response headers, in any case. */
  headers?: Record<string, string | undefined>;
  meta?: Meta;
  raw: unknown;
}

/** A header's value by name (lower-case) in any case, or undefined. */
export const header = (
  headers: Record<string, string | undefined> | undefined,
  name: string
): string | undefined =>
  Object.entries(headers ?? {}).find(
    ([key]) => key.toLowerCase() === name
  )?.[1];

/** Throws `NotFound` for a 404 or 410 and `ProviderError` for any other status that is not 2xx. */
const checkStatus = (provider: string, fetched: Fetched): void => {
  const { requested, statusCode } = fetched;
  if (statusCode === undefined) {
    return;
  }
  if (GONE.has(statusCode)) {
    throw new FieldworkError(
      "NotFound",
      `${provider} could not download ${requested}: it answered ${statusCode}`,
      { provider, status: statusCode }
    );
  }
  if (statusCode < 200 || statusCode > 299) {
    throw new FieldworkError(
      "ProviderError",
      `${provider} could not download ${requested}: it answered ${statusCode}`,
      { cause: fetched.raw, provider, status: statusCode }
    );
  }
};

/**
 * The checked file. Throws `NotFound` for a 404 or 410, `ProviderError` for
 * any other status that is not 2xx or a reply with no content type,
 * `NotAFile` for an HTML page, and `TooLarge` for more bytes than `limit`.
 */
export const presentFile = (
  provider: string,
  fetched: Fetched,
  limit: number
): DownloadedFile => {
  const { requested, statusCode } = fetched;
  checkStatus(provider, fetched);
  const { contentType } = fetched;
  if (contentType === undefined || contentType === "") {
    throw new FieldworkError(
      "ProviderError",
      `${provider} downloaded ${requested} but reported no content type`,
      { cause: fetched.raw, provider }
    );
  }
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (PAGE_TYPES.has(mediaType)) {
    throw new FieldworkError(
      "NotAFile",
      `${provider} could not download ${requested}: it is a web page (${contentType}), not a file`,
      { provider }
    );
  }
  const bytes =
    "base64" in fetched.body
      ? new Uint8Array(Buffer.from(fetched.body.base64, "base64"))
      : new TextEncoder().encode(fetched.body.utf8);
  if (bytes.byteLength > limit) {
    throw tooLarge(provider, requested, bytes.byteLength, limit);
  }
  return {
    bytes,
    contentType,
    ...(fetched.headers && {
      etag: header(fetched.headers, "etag"),
      lastModified: header(fetched.headers, "last-modified"),
    }),
    ...(fetched.meta && { meta: fetched.meta }),
    raw: fetched.raw,
    size: bytes.byteLength,
    ...(statusCode !== undefined && { statusCode }),
    url: fetched.url,
  };
};
