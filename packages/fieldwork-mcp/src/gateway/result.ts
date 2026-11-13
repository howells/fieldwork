import { FieldworkError } from "@howells/fieldwork-sdk";
import type { ToolOutput } from "@howells/fieldwork-sdk/tools";
import * as z from "zod/mini";

import { MAX_ENCODED_RESULT_BYTES } from "./limits.js";

const JobIds = z.object({
  id: z.optional(z.string()),
  meta: z.optional(z.object({ requestId: z.optional(z.string()) })),
});

/**
 * The id a resumable tool's result is collected again by: the job's `id`, or
 * the run id a Parallel task reports as `meta.requestId`.
 */
const jobIdOf = (result: ToolOutput): string | undefined => {
  const ids = z.safeParse(JobIds, result);
  return ids.success ? (ids.data.id ?? ids.data.meta?.requestId) : undefined;
};

/**
 * Serializes once and bounds MCP's two copies, including escaped text. A
 * refused result of a `resumable` tool keeps its job id, so the caller can
 * collect the billed job again with a smaller budget.
 */
export const checkedResultText = (
  result: ToolOutput,
  provider: string,
  resumable: boolean
): string => {
  const text = JSON.stringify(result);
  const encoded = `{"content":[{"text":${JSON.stringify(text)},"type":"text"}],"structuredContent":${text}}`;
  if (Buffer.byteLength(encoded) > MAX_ENCODED_RESULT_BYTES) {
    throw new FieldworkError(
      "InvalidRequest",
      "Result exceeds the gateway response limit; lower maxCharacters or narrow the request",
      { jobId: resumable ? jobIdOf(result) : undefined, provider }
    );
  }
  return text;
};
