// Firecrawl's `download`: one scrape with `formats: ["rawBase64"]` and no
// parsers, which returns the file as Firecrawl fetched it for 1 credit.

import * as z from "zod/mini";

import {
  byteLimit,
  checkFileUrl,
  MIB,
  presentFile,
  tooLarge,
} from "../../download.js";
import { FieldworkError } from "../../errors.js";
import type { RawClient } from "../../http.js";
import { looseObject, optionalString } from "../../parse.js";
import type { DownloadedFile } from "../../types.js";
import { callSettings } from "../../util.js";
import type { FirecrawlDownloadOptions } from "./options.js";
import { pageBody } from "./request.js";
import { pageMeta } from "./response.js";
import { ScrapeResponse } from "./shapes.js";

/** The largest file Firecrawl's scrape returns: 50 MiB. */
const DOWNLOAD_CEILING = 50 * MIB;

/** The part of Firecrawl's error body that names the failure. */
const ErrorBody = looseObject({ code: optionalString });

/** Whether Firecrawl refused the file for exceeding its size limit. */
const overCeiling = (error: FieldworkError): boolean =>
  z.parse(ErrorBody, error.cause).code === "SCRAPE_UNSUPPORTED_FILE_ERROR" &&
  error.message.includes("size limit");

/** Fetches the file through Firecrawl's scrape and checks it. */
export const downloadFile = async (
  raw: RawClient,
  url: string,
  options: FirecrawlDownloadOptions | undefined
): Promise<DownloadedFile> => {
  const { provider } = raw;
  const { call, rest: o } = callSettings(options);
  checkFileUrl(provider, url);
  const limit = byteLimit(provider, DOWNLOAD_CEILING, o.maxBytes);
  let response: unknown;
  try {
    response = await raw.request("POST", "/scrape", {
      ...call,
      body: {
        formats: ["rawBase64"],
        url,
        ...pageBody({
          location:
            o.country === undefined
              ? undefined
              : { country: o.country.toUpperCase() },
          maxAge: o.maxAge,
          // No parser: the file comes back as it is, for 1 credit.
          parsers: [],
          proxy: o.proxy,
        }),
      },
    });
  } catch (error) {
    throw error instanceof FieldworkError && overCeiling(error)
      ? tooLarge(provider, url, undefined, limit)
      : error;
  }
  const { data, warning } = z.parse(ScrapeResponse, response);
  const { metadata } = data;
  if (data.rawBase64 === undefined) {
    throw new FieldworkError(
      "ProviderError",
      `firecrawl downloaded ${url} but returned no rawBase64 content`,
      { cause: response, provider }
    );
  }
  return presentFile(
    provider,
    {
      body: { base64: data.rawBase64 },
      contentType: metadata.contentType,
      meta: pageMeta(data, warning.notes),
      raw: response,
      requested: url,
      statusCode: metadata.statusCode,
      url: metadata.url ?? url,
    },
    limit
  );
};
