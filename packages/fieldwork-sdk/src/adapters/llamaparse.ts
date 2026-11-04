// The LlamaParse adapter: `parse` uploads a document, runs it through `runJob`
// and normalizes the result. llamaparse/response.ts holds the response schemas and
// the box conversion.

import * as z from "zod/mini";

import { defineAdapter } from "../adapter.js";
import { documentPart, refuseLarger } from "../document.js";
import { FieldworkError } from "../errors.js";
import { createRawClient, readSigned, requireKey, segment } from "../http.js";
import type { RawClient } from "../http.js";
import { runJob } from "../job.js";
import type { CallOptions, DocumentInput, ParsedDocument } from "../types.js";
import {
  callSettings,
  compact,
  meta,
  parseJson,
  requireJobId,
} from "../util.js";
import {
  documentBlocks,
  ItemsPage,
  JobResult,
  JobStart,
} from "./llamaparse/response.js";
import type { JobResultBlock } from "./llamaparse/response.js";

/** Settings for `llamaparse()`. */
export interface LlamaParseConfig {
  /** Defaults to the LLAMA_CLOUD_API_KEY environment variable. */
  apiKey?: string;
  /** Defaults to https://api.cloud.llamaindex.ai; the EU region is https://api.cloud.eu.llamaindex.ai. */
  baseUrl?: string;
  /** Defaults to the global `fetch`. It also downloads result files from the presigned URLs LlamaParse returns. A test passes a fake. */
  fetch?: typeof fetch;
  /** Repeats of a request that can succeed on repeat; 2 unless set. `0` turns retrying off. */
  retries?: number;
}

/**
 * LlamaParse's tiers, cheapest first. `fast` reads the text layer only, with
 * no AI model; `agentic` reads tables, scans and multi-column layouts.
 */
export type LlamaParseTier =
  | "fast"
  | "cost_effective"
  | "agentic"
  | "agentic_plus";

/** Options for `parse`. */
export interface LlamaParseParseOptions extends CallOptions {
  /** Defaults to "agentic". */
  tier?: LlamaParseTier;
  /** The parser version: "latest" (the default) or a date such as "2026-09-28". */
  version?: string;
  /** Return layout blocks with positions. */
  blocks?: boolean;
  /**
   * Also return where each word and table cell sits in each block, from a
   * second download. Returns blocks too.
   */
  wordBoxes?: boolean;
  /** Leave out text a reader cannot see, such as white text on white. */
  ignoreHiddenText?: boolean;
  /**
   * Also return a picture of each page as `pages[].image`, an address that
   * expires after about an hour. Collect fresh addresses with
   * `parse({ resume: id, pageImages: true })`; a parse started without
   * `pageImages` saved no pictures, so resuming it with them throws.
   */
  pageImages?: boolean;
  /** The id of a job from an error's `jobId`; waits for it instead of starting another. */
  resume?: string;
  /** Milliseconds between checks. Defaults to 2000. */
  interval?: number;
}

/** Options for collecting an earlier parse by its id, without the file. */
export type LlamaParseResumeOptions = Omit<LlamaParseParseOptions, "resume"> & {
  resume: string;
};

/** What the LlamaParse adapter offers. */
export interface LlamaParseOperations {
  parse: {
    /** Uploads the file and waits for the parse. An error after the upload carries `jobId`. */
    (
      document: DocumentInput,
      options?: LlamaParseParseOptions
    ): Promise<ParsedDocument>;
    /** Collects an earlier parse by its id, without sending the file again. */
    (options: LlamaParseResumeOptions): Promise<ParsedDocument>;
  };
}

const provider = "llamaparse";
/** LlamaParse names each page's screenshot `page_<n>.jpg`. */
const PAGE_IMAGE = /^page_(?<page>\d+)\.jpg$/u;
/** The largest file LlamaParse takes, in megabytes. */
const MAX_PARSE_MB = 512;

/** The upload's `configuration`. The tier and version are always sent; the rest only when asked for. */
const configuration = (o: LlamaParseParseOptions) =>
  compact({
    output_options:
      o.wordBoxes === true || o.pageImages === true
        ? compact({
            granular_bboxes:
              o.wordBoxes === true ? ["word", "line", "cell"] : undefined,
            images_to_save: o.pageImages === true ? ["screenshot"] : undefined,
          })
        : undefined,
    processing_options:
      o.ignoreHiddenText === true
        ? { ignore: { ignore_hidden_text: true } }
        : undefined,
    tier: o.tier ?? "agentic",
    version: o.version ?? "latest",
  });

/** Uploads the file and returns the job id. Refuses a missing document, or a file over the size limit, before sending. */
const startParse = async (
  raw: RawClient,
  document: DocumentInput | undefined,
  o: LlamaParseParseOptions,
  call: CallOptions
) => {
  if (document === undefined) {
    throw new FieldworkError(
      "InvalidRequest",
      "parse needs a document, or resume with the id of an earlier parse",
      { provider }
    );
  }
  refuseLarger(provider, document, MAX_PARSE_MB);
  const form = new FormData();
  form.set("configuration", JSON.stringify(configuration(o)));
  form.set("file", documentPart(document), document.name);
  const created = z.parse(
    JobStart,
    await raw.request("POST", "/api/v2/parse/upload", {
      creates: true,
      ...call,
      form,
    })
  );
  return requireJobId(provider, created.id);
};

/** The result once the job has completed, undefined while it runs; throws `JobFailed` when LlamaParse failed or cancelled it. */
const finished = (found: JobResultBlock) => {
  const { error_message: message, status } = found.value.job;
  if (status === "FAILED" || status === "CANCELLED") {
    throw new FieldworkError(
      "JobFailed",
      `llamaparse job ${status.toLowerCase()}${message === undefined ? "" : `: ${message}`}`,
      { cause: found.original, provider }
    );
  }
  return status === "COMPLETED" ? found : undefined;
};

/** The grounded items: one JSON line per page, each page's items with word and cell boxes. */
const groundedPages = async (
  found: JobResultBlock,
  options: { fetch?: typeof fetch; signal?: AbortSignal }
) => {
  const url = found.value.result_content_metadata.grounded_items.presigned_url;
  if (url === undefined) {
    throw new FieldworkError(
      "ProviderError",
      "llamaparse finished without the word boxes it was asked for",
      { cause: found.original, provider }
    );
  }
  const text = await readSigned(provider, url, options);
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => parseJson(provider, line));
};

/** Each page's picture, keyed by page number, from the job's saved screenshots. */
const pageImageAddresses = (found: JobResultBlock, id: string) => {
  const addresses = new Map<number, string>();
  for (const image of found.value.images_content_metadata.images) {
    const page = PAGE_IMAGE.exec(image.filename ?? "")?.groups?.page;
    if (page !== undefined && image.presigned_url !== undefined) {
      addresses.set(Number(page), image.presigned_url);
    }
  }
  if (addresses.size === 0) {
    throw new FieldworkError(
      "ProviderError",
      `llamaparse job ${id} has no page pictures; only a parse started with pageImages saves them`,
      { cause: found.original, provider }
    );
  }
  return addresses;
};

/** The finished job as a document, with word boxes and page pictures when they were asked for. */
const parsedDocument = async (
  found: JobResultBlock,
  id: string,
  o: LlamaParseParseOptions,
  read: { fetch?: typeof fetch; signal?: AbortSignal }
): Promise<ParsedDocument> => {
  // A blank page still arrives as a page; a finished job with none lost its output.
  if (found.value.markdown.pages.length === 0) {
    throw new FieldworkError(
      "ProviderError",
      `llamaparse finished job ${id} without any pages of Markdown`,
      { cause: found.original, provider }
    );
  }
  const grounded =
    o.wordBoxes === true ? await groundedPages(found, read) : undefined;
  const images =
    o.pageImages === true ? pageImageAddresses(found, id) : undefined;
  const pages = found.value.markdown.pages.flatMap((page) => {
    if (page.page_number === undefined) {
      return [];
    }
    const image = images?.get(page.page_number);
    if (images !== undefined && image === undefined) {
      throw new FieldworkError(
        "ProviderError",
        `llamaparse job ${id} has no picture of page ${page.page_number}`,
        { cause: found.original, provider }
      );
    }
    return [
      compact({
        image,
        markdown: page.markdown ?? "",
        pageNumber: page.page_number,
      }),
    ];
  });
  let laidOut;
  if (grounded !== undefined) {
    laidOut = documentBlocks(grounded.map((row) => z.parse(ItemsPage, row)));
  } else if (o.blocks === true) {
    laidOut = documentBlocks(found.value.items.pages);
  }
  return compact({
    blocks: laidOut,
    id,
    markdown: pages.map((page) => page.markdown).join("\n\n"),
    meta: meta({ credits: found.value.job.usage.credits }),
    pages,
    raw:
      grounded === undefined
        ? found.original
        : { groundedItems: grounded, job: found.original },
  });
};

/** Runs the job. `expand` names the sections of the result to include; blocks, word boxes and page images each add one. */
const parse = async (
  raw: RawClient,
  document: DocumentInput | undefined,
  options: LlamaParseParseOptions | undefined,
  fetchImpl: typeof fetch | undefined
): Promise<ParsedDocument> => {
  const { call, rest: o } = callSettings(options);
  const blocks = o.blocks === true || o.wordBoxes === true;
  const expand = [
    "markdown",
    "usage",
    ...(blocks ? ["items"] : []),
    ...(o.pageImages === true ? ["images_content_metadata"] : []),
  ].join(",");
  return await runJob(
    provider,
    {
      check: async (id, request) =>
        finished(
          z.parse(
            JobResult,
            await raw.request("GET", `/api/v2/parse/${segment(id)}`, {
              ...request,
              query: { expand },
            })
          )
        ),
      finish: async (found, id) =>
        await parsedDocument(found, id, o, {
          fetch: fetchImpl,
          signal: call.signal,
        }),
      start: async () => await startParse(raw, document, o, call),
    },
    { ...call, interval: o.interval, resume: o.resume }
  );
};

/**
 * An adapter for LlamaParse: parse. Pass it to `new Fieldwork({ adapter })`.
 *
 * Throws `Unauthorized` when neither `apiKey` nor `LLAMA_CLOUD_API_KEY` is set.
 */
export const llamaparse = (config: LlamaParseConfig = {}) => {
  const raw = createRawClient({
    baseUrl: config.baseUrl ?? "https://api.cloud.llamaindex.ai",
    fetch: config.fetch,
    headers: {
      authorization: `Bearer ${requireKey(provider, config.apiKey, "LLAMA_CLOUD_API_KEY")}`,
    },
    provider,
    retries: config.retries,
  });

  const operations: LlamaParseOperations = {
    async parse(
      first: DocumentInput | LlamaParseResumeOptions,
      options?: LlamaParseParseOptions
    ) {
      return "resume" in first
        ? await parse(raw, undefined, first, config.fetch)
        : await parse(raw, first, options, config.fetch);
    },
  };

  return defineAdapter({ name: provider, operations, raw });
};
