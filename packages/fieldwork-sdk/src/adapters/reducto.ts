import * as z from "zod/mini";

import { defineAdapter } from "../adapter.js";
import { documentPart, refuseLarger } from "../document.js";
import { FieldworkError, withJob } from "../errors.js";
import {
  createRawClient,
  poll,
  readSigned,
  requireKey,
  segment,
} from "../http.js";
import type { RawClient } from "../http.js";
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
  JobResponse,
  ParseOutput,
  ParseStart,
  UploadResponse,
} from "./reducto/response.js";
import type { JobResponseBlock } from "./reducto/response.js";

export interface ReductoConfig {
  /** Defaults to the REDUCTO_API_KEY environment variable. */
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Repeats of a request that can succeed on repeat; 2 unless set. `0` turns retrying off. */
  retries?: number;
}

export interface ReductoParseOptions extends CallOptions {
  /** Return layout blocks with positions. */
  blocks?: boolean;
  /** Also return where each word and table cell sits in each block. Returns blocks too. */
  wordBoxes?: boolean;
  /**
   * The id of a job from an error's `jobId`; waits for it instead of starting
   * another. Reducto keeps a job's result for about 12 hours.
   */
  resume?: string;
  /** Milliseconds between checks. Defaults to 2000. */
  interval?: number;
}

export interface ReductoOperations {
  parse: (
    document: DocumentInput,
    options?: ReductoParseOptions
  ) => Promise<ParsedDocument>;
}

const provider = "reducto";
/** The largest file `/upload` takes, in megabytes. */
const MAX_UPLOAD_MB = 100;

const startParse = async (
  raw: RawClient,
  document: DocumentInput,
  o: ReductoParseOptions,
  call: CallOptions
) => {
  if (o.resume !== undefined) {
    return o.resume;
  }
  refuseLarger(provider, document, MAX_UPLOAD_MB);
  const form = new FormData();
  form.set("file", documentPart(document), document.name);
  const uploaded = z.parse(
    UploadResponse,
    await raw.request("POST", "/upload", { creates: true, ...call, form })
  );
  const started = z.parse(
    ParseStart,
    await raw.request("POST", "/parse_async", {
      creates: true,
      ...call,
      body: compact({
        input: requireJobId(provider, uploaded.file_id),
        settings: o.wordBoxes === true ? { return_citations: true } : undefined,
      }),
    })
  );
  return requireJobId(provider, started.job_id);
};

const finished = (found: JobResponseBlock, id: string) => {
  const { error, reason, status } = found.value;
  if (status === "Failed") {
    const why = reason ?? error.message;
    throw new FieldworkError(
      "JobFailed",
      `reducto job failed${why === undefined ? "" : `: ${why}`}`,
      { cause: found.original, jobId: id, provider }
    );
  }
  return status === "Completed" ? found : undefined;
};

/** The parse output, fetched from where Reducto put it when it was too large to return. */
const outputOf = async (
  found: JobResponseBlock,
  id: string,
  options: { fetch?: typeof fetch; signal?: AbortSignal }
) => {
  const output = found.value.result.result;
  if (output.type === "full") {
    return { output, stored: undefined };
  }
  if (output.type !== "url") {
    throw new FieldworkError(
      "ProviderError",
      `reducto returned a result of type ${output.type ?? "(none)"}; Fieldwork reads "full" and "url"`,
      { cause: found.original, jobId: id, provider }
    );
  }
  if (output.url === undefined) {
    throw new FieldworkError(
      "ProviderError",
      "reducto stored the result without saying where",
      { cause: found.original, jobId: id, provider }
    );
  }
  try {
    const stored = parseJson(
      provider,
      await readSigned(provider, output.url, options)
    );
    return { output: z.parse(ParseOutput, stored), stored };
  } catch (error) {
    throw withJob(error, id);
  }
};

const parse = async (
  raw: RawClient,
  document: DocumentInput,
  options: ReductoParseOptions | undefined,
  fetchImpl: typeof fetch | undefined
): Promise<ParsedDocument> => {
  const { call, rest: o } = callSettings(options);
  const id = await startParse(raw, document, o, call);
  const found = await poll(
    provider,
    id,
    async (request) =>
      finished(
        z.parse(
          JobResponse,
          await raw.request("GET", `/job/${segment(id)}`, request)
        ),
        id
      ),
    { ...call, interval: o.interval }
  );
  const { output, stored } = await outputOf(found, id, {
    fetch: fetchImpl,
    signal: call.signal,
  });
  // A blank page still arrives as a chunk; a finished job with none lost its output.
  if (output.chunks.length === 0) {
    throw new FieldworkError(
      "ProviderError",
      `reducto finished job ${id} without any chunks of output`,
      { cause: stored ?? found.original, jobId: id, provider }
    );
  }
  const { usage } = found.value.result;
  return compact({
    blocks:
      o.blocks === true || o.wordBoxes === true
        ? documentBlocks(output)
        : undefined,
    id,
    markdown: output.chunks.map((chunk) => chunk.content ?? "").join("\n\n"),
    meta: meta({ credits: usage.credits, units: { pages: usage.num_pages } }),
    pageCount: usage.num_pages,
    raw:
      stored === undefined ? found.original : { job: found.original, stored },
  });
};

export const reducto = (config: ReductoConfig = {}) => {
  const raw = createRawClient({
    baseUrl: config.baseUrl ?? "https://platform.reducto.ai",
    fetch: config.fetch,
    headers: {
      authorization: `Bearer ${requireKey(provider, config.apiKey, "REDUCTO_API_KEY")}`,
    },
    provider,
    retries: config.retries,
  });

  const operations: ReductoOperations = {
    async parse(document, options) {
      return await parse(raw, document, options, config.fetch);
    },
  };

  return defineAdapter({ name: provider, operations, raw });
};
