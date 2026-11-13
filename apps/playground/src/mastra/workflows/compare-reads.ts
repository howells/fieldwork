// Compare: the same `read` of one page by several providers at once. Each
// arm names its provider in its own output, and a failed read is a typed
// outcome, so one provider's failure never stops the others. The checker
// that says what each read caught runs on the collected reads afterwards
// (agents/read-checker.ts).
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import { ReadOutcomeSchema } from "@/lib/events";
import { readOnce } from "@/server/read-once";

import { CompareContextSchema } from "../context";

/** Providers that can read a page: Exa, Firecrawl, Tavily, Parallel and Browserbase. */
export const MAX_READERS = 5;

const ReadRequestSchema = z.object({ provider: z.string(), url: z.url() });

const readPage = createStep({
  description:
    "Reads the page with one provider and measures the read (readOnce).",
  execute: async ({ abortSignal, inputData, requestContext }) => {
    const read = requestContext.get("readers").get(inputData.provider);
    if (read === undefined) {
      return {
        error: `No key for ${inputData.provider}`,
        images: 0,
        ms: 0,
        ok: false,
        provider: inputData.provider,
        words: 0,
      };
    }
    return await readOnce(
      inputData.provider,
      read.read,
      inputData.url,
      abortSignal
    );
  },
  id: "read-page",
  inputSchema: ReadRequestSchema,
  outputSchema: ReadOutcomeSchema,
  requestContextSchema: CompareContextSchema,
});

export const compareReads = createWorkflow({
  description: "Reads one page with several providers in parallel.",
  id: "compare-reads",
  inputSchema: z.array(ReadRequestSchema).min(1).max(MAX_READERS),
  outputSchema: z.array(ReadOutcomeSchema),
  requestContextSchema: CompareContextSchema,
})
  // Every arm is one HTTP read to a different provider, so they all go at
  // once; the input schema caps the arms at the five providers that read.
  .foreach(readPage, { concurrency: MAX_READERS })
  .commit();
