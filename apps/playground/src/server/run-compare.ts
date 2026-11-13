// Runs the compare workflow and streams each read as it lands, then asks the
// read checker what each read caught. Keys stay out of the workflow's input
// and state: each arm finds its provider's read in the request context.
import { z } from "zod";

import { ReadOutcomeSchema } from "@/lib/events";
import type { CompareEvent, ReadOutcome } from "@/lib/events";
import { mastra } from "@/mastra";
import { checkReads } from "@/mastra/agents/read-checker";
import { compareContext, Reader } from "@/mastra/context";

import type { Emit } from "./ndjson";
import { isReadProvider, readerFor, usableKeys } from "./providers";
import type { CompareRequest } from "./request";
import { logSpend } from "./spend-log";

const ReadsSchema = z.array(ReadOutcomeSchema);

const readersFor = (request: CompareRequest): Map<string, Reader> => {
  const keys = usableKeys(request.keys);
  const readers = new Map<string, Reader>();
  for (const provider of request.providers) {
    if (!isReadProvider(provider)) {
      throw new Error(`${provider} doesn't read pages`);
    }
    if (!keys.has(provider)) {
      throw new Error(`Add a key for ${provider} first`);
    }
    readers.set(provider, new Reader(readerFor(provider, keys.get(provider))));
  }
  return readers;
};

const collectReads = async (
  request: CompareRequest,
  context: ReturnType<typeof compareContext>,
  emit: Emit<CompareEvent>
): Promise<ReadOutcome[]> => {
  const run = await mastra.getWorkflow("compareReads").createRun();
  const output = run.stream({
    inputData: request.providers.map((provider) => ({
      provider,
      url: request.url,
    })),
    requestContext: context,
  });
  for await (const chunk of output.fullStream) {
    if (chunk.type === "workflow-step-progress") {
      const read = ReadOutcomeSchema.safeParse(chunk.payload.iterationOutput);
      if (read.success) {
        emit({ read: read.data, type: "read" });
        await logSpend({
          capability: "read",
          provider: read.data.provider,
          ...read.data.usage,
        });
      }
    }
  }
  const result = await output.result;
  if (result.status !== "success") {
    throw new Error(
      result.status === "failed"
        ? result.error.message
        : `The comparison ${result.status}`
    );
  }
  return ReadsSchema.parse(result.result);
};

export const runCompare = async (
  request: CompareRequest,
  emit: Emit<CompareEvent>,
  signal: AbortSignal
): Promise<void> => {
  const started = performance.now();
  const context = compareContext({
    model: request.model,
    readers: readersFor(request),
  });
  emit({ providers: request.providers, type: "start", url: request.url });
  const reads = await collectReads(request, context, emit);
  const { checked, spend } = await checkReads(reads, context, signal);
  emit({ checked, type: "checked" });
  emit({ ...spend, type: "model" });
  await logSpend({ capability: "model", provider: request.model, ...spend });
  emit({ ms: Math.round(performance.now() - started), type: "done" });
};
