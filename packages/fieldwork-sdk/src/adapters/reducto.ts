// The Reducto adapter: `parse` uploads a document, starts an asynchronous parse,
// runs it through `runJob` and normalizes the result. reducto/response.ts holds the
// response schemas and the block conversion.

import * as z from "zod/mini";

import { defineAdapter } from "../adapter.js";
import { documentPart, refuseLarger } from "../document.js";
import { FieldworkError } from "../errors.js";
import { createRawClient, readSigned, requireKey, segment } from "../http.js";
import type { RawClient } from "../http.js";
import { jobState, runJob, startJob } from "../job.js";
import type { JobStates } from "../job.js";
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

/** Settings for `reducto()`. */
export interface ReductoConfig {
  /** Defaults to the REDUCTO_API_KEY environment variable. */
  apiKey?: string;
  /** Defaults to https://platform.reducto.ai. */
  baseUrl?: string;
  /** Defaults to the global `fetch`. It also downloads a large result from the URL Reducto stores it at. A test passes a fake. */
  fetch?: typeof fetch;
  /** Repeats of a request that can succeed on repeat; 2 unless set. `0` turns retrying off. */
  retries?: number;
}

/** Options for `parse`. */
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

/** Options for collecting an earlier parse by its id, without the file. */
export type ReductoResumeOptions = Omit<ReductoParseOptions, "resume"> & {
  resume: string;
};

/** What the Reducto adapter offers. */
export interface ReductoOperations {
  parse: {
    /** Uploads the file, starts the parse and waits for it. An error after the parse starts carries `jobId`. */
    (
      document: DocumentInput,
      options?: ReductoParseOptions
    ): Promise<ParsedDocument>;
    /** Collects an earlier parse by its id, without sending the file again. */
    (options: ReductoResumeOptions): Promise<ParsedDocument>;
  };
}

const provider = "reducto";
/** The largest file `/upload` takes, in megabytes. */
const MAX_UPLOAD_MB = 100;

/** Uploads the file, then starts the parse, and returns the job id. Refuses a file over the size limit before sending. */
const startParse = async (
  raw: RawClient,
  document: DocumentInput,
  o: ReductoParseOptions,
  call: CallOptions
) => {
  refuseLarger(provider, document, MAX_UPLOAD_MB);
  const form = new FormData();
  form.set("file", documentPart(document), document.name);
  const uploaded = z.parse(
    UploadResponse,
    await raw.request("POST", "/upload", { creates: true, ...call, form })
  );
  return await startJob(
    raw,
    "/parse_async",
    {
      ...call,
      body: compact({
        input: requireJobId(provider, uploaded.file_id),
        settings: o.wordBoxes === true ? { return_citations: true } : undefined,
      }),
    },
    ParseStart,
    (reply) => reply.job_id
  );
};

// Reducto's job statuses, always sent (docs.reducto.ai/api-reference/get-job).
// The docs do not say what `Idle` means; it is not finished, so it is polled.
const JOB_STATES: JobStates = {
  done: ["Completed"],
  failed: ["Failed"],
  running: ["Pending", "Idle"],
};

/** The result once the job has completed, undefined while it runs; throws `JobFailed` when Reducto reports a failure. */
const finished = (id: string, found: JobResponseBlock) => {
  const { error, reason, status } = found.value;
  const state = jobState(provider, id, JOB_STATES, {
    original: found.original,
    value: status,
  });
  if (state === "failed") {
    const why = reason ?? error.message;
    throw new FieldworkError(
      "JobFailed",
      `reducto job failed${why === undefined ? "" : `: ${why}`}`,
      { cause: found.original, provider }
    );
  }
  return state === "done" ? found : undefined;
};

/** The parse output, fetched from where Reducto put it when it was too large to return. */
const outputOf = async (
  found: JobResponseBlock,
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
      { cause: found.original, provider }
    );
  }
  if (output.url === undefined) {
    throw new FieldworkError(
      "ProviderError",
      "reducto stored the result without saying where",
      { cause: found.original, provider }
    );
  }
  const stored = parseJson(
    provider,
    await readSigned(provider, output.url, options)
  );
  return { output: z.parse(ParseOutput, stored), stored };
};

const parse = async (
  raw: RawClient,
  document: DocumentInput | undefined,
  options: ReductoParseOptions | undefined,
  fetchImpl: typeof fetch | undefined
): Promise<ParsedDocument> => {
  const { call, rest: o } = callSettings(options);
  return await runJob(
    provider,
    {
      check: async (id, request) =>
        finished(
          id,
          z.parse(
            JobResponse,
            await raw.request("GET", `/job/${segment(id)}`, request)
          )
        ),
      finish: async (found, id) => {
        const { output, stored } = await outputOf(found, {
          fetch: fetchImpl,
          signal: call.signal,
        });
        // A blank page still arrives as a chunk; a finished job with none lost its output.
        if (output.chunks.length === 0) {
          throw new FieldworkError(
            "ProviderError",
            `reducto finished job ${id} without any chunks of output`,
            { cause: stored ?? found.original, provider }
          );
        }
        const { usage } = found.value.result;
        return compact({
          blocks:
            o.blocks === true || o.wordBoxes === true
              ? documentBlocks(output)
              : undefined,
          id,
          markdown: output.chunks
            .map((chunk) => chunk.content ?? "")
            .join("\n\n"),
          meta: meta({
            credits: usage.credits,
            units: { pages: usage.num_pages },
          }),
          pageCount: usage.num_pages,
          raw:
            stored === undefined
              ? found.original
              : { job: found.original, stored },
        });
      },
      start: async () => {
        if (document === undefined) {
          throw new FieldworkError(
            "InvalidRequest",
            "parse needs a document, or resume with the id of an earlier parse",
            { provider }
          );
        }
        return await startParse(raw, document, o, call);
      },
    },
    { ...call, interval: o.interval, resume: o.resume }
  );
};

/**
 * An adapter for Reducto: parse. Pass it to `new Fieldwork({ adapter })`.
 *
 * Throws `Unauthorized` when neither `apiKey` nor `REDUCTO_API_KEY` is set.
 */
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
    async parse(
      first: DocumentInput | ReductoResumeOptions,
      options?: ReductoParseOptions
    ) {
      return "resume" in first
        ? await parse(raw, undefined, first, config.fetch)
        : await parse(raw, first, options, config.fetch);
    },
  };

  return defineAdapter({ name: provider, operations, raw });
};
