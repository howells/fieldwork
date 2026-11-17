// Browserbase's `download`: Browserbase Fetch with redirects off, one Fetch
// call per hop, so the final URL is known. Fetch returns binary bodies as
// Base64 and text bodies decoded as UTF-8.

import * as z from "zod/mini";

import {
  byteLimit,
  checkFileUrl,
  header,
  MIB,
  presentFile,
  tooLarge,
} from "../../download.js";
import type { Fetched } from "../../download.js";
import { FieldworkError } from "../../errors.js";
import type { RawClient } from "../../http.js";
import { looseObject, optionalString } from "../../parse.js";
import type { CallOptions, DownloadedFile } from "../../types.js";
import { compact, meta } from "../../util.js";
import type { BrowserbaseDownloadOptions } from "../browserbase.js";
import { FetchResponse } from "./response.js";
import type { FetchBody } from "./response.js";

/** The largest body Browserbase Fetch returns: 5 MB. */
const DOWNLOAD_CEILING = 5 * MIB;

/** Redirects `download` follows before it gives up. */
const MAX_HOPS = 10;

/** The part of Browserbase's error body that says why. */
const ErrorBody = looseObject({ message: optionalString });

/** Whether Browserbase refused the response for exceeding its size limit. */
const overCeiling = (error: FieldworkError): boolean =>
  error.status === 502 &&
  (z.parse(ErrorBody, error.cause).message ?? "").includes(
    "maximum allowed size"
  );

/**
 * The body as Fetch returned it: Base64 for a binary file, or text Fetch
 * decoded as UTF-8. Throws `ProviderError` for text in any other encoding,
 * whose exact bytes cannot be recovered.
 */
const contentOf = (
  provider: string,
  url: string,
  body: FetchBody
): Fetched["body"] => {
  const content = body.content ?? "";
  if (body.encoding === "base64") {
    return { base64: content };
  }
  if (body.encoding?.toLowerCase() === "utf-8") {
    return { utf8: content };
  }
  throw new FieldworkError(
    "ProviderError",
    `browserbase downloaded ${url} as ${body.encoding ?? "an unknown encoding"} text, which cannot be turned back into the exact bytes`,
    { cause: body, provider }
  );
};

/** What every hop of one download shares. */
interface Download {
  raw: RawClient;
  url: string;
  limit: number;
  options: BrowserbaseDownloadOptions;
  proxies: BrowserbaseDownloadOptions["proxies"];
  call: CallOptions;
}

/** Fetches `current` through Browserbase, following a redirect with another Fetch. */
const hop = async (
  download: Download,
  current: string,
  hops: unknown[]
): Promise<DownloadedFile> => {
  const { raw, url, limit, call } = download;
  const { provider } = raw;
  if (hops.length > MAX_HOPS) {
    throw new FieldworkError(
      "ProviderError",
      `browserbase could not download ${url}: more than ${MAX_HOPS} redirects`,
      { cause: hops, provider }
    );
  }
  const { options: o, proxies } = download;
  let response: unknown;
  try {
    // Fieldwork never requests the file itself: every hop is a Fetch call.
    response = await raw.request("POST", "/v1/fetch", {
      ...call,
      body: compact({
        allowInsecureSsl: o.allowInsecureSsl,
        allowRedirects: false,
        contextId: o.contextId,
        format: "raw",
        proxies,
        url: current,
      }),
    });
  } catch (error) {
    throw error instanceof FieldworkError && overCeiling(error)
      ? tooLarge(provider, url, undefined, limit)
      : error;
  }
  const seen = [...hops, response];
  const body = z.parse(FetchResponse, response);
  const status = body.statusCode;
  if (status !== undefined && status >= 300 && status < 400) {
    const location = header(body.headers, "location");
    if (location === undefined) {
      throw new FieldworkError(
        "ProviderError",
        `browserbase could not download ${url}: ${current} answered ${status} without a Location`,
        { cause: response, provider, status }
      );
    }
    return await hop(download, new URL(location, current).href, seen);
  }
  return presentFile(
    provider,
    {
      body: contentOf(provider, url, body),
      contentType: body.contentType,
      headers: body.headers,
      meta: meta({ requestId: body.id }),
      raw: seen.length === 1 ? response : seen,
      requested: url,
      statusCode: status,
      url: current,
    },
    limit
  );
};

/** Fetches the file through Browserbase Fetch and checks it. */
export const downloadFile = async (
  raw: RawClient,
  url: string,
  o: BrowserbaseDownloadOptions,
  proxies: BrowserbaseDownloadOptions["proxies"],
  call: CallOptions
): Promise<DownloadedFile> => {
  checkFileUrl(raw.provider, url);
  const limit = byteLimit(raw.provider, DOWNLOAD_CEILING, o.maxBytes);
  return await hop({ call, limit, options: o, proxies, raw, url }, url, []);
};
