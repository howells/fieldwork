// Checks what each provider's read contains, for the compare view. It has no
// tools: it only reads the text it is given and says, for each fact, the
// value as the text writes it or null. Images are counted from the SDK's
// result, not by the model.
import { Agent } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";

import { FactValuesSchema } from "@/lib/events";
import type { CheckedRead, ReadOutcome } from "@/lib/events";

import { CompareContextSchema } from "../context";
import type { CompareContext } from "../context";
import { OpenRouterCostSchema, TokenCountsSchema } from "../spend";
import type { ModelSpend } from "../spend";

const INSTRUCTIONS = `You check what several web page reads contain. Each read is the same product page, read by a different provider.

For each read, give these facts exactly as that read's text states them, or null when that text does not contain it:
- name: the product's name.
- price: the price with its currency, as written.
- size: the product's dimensions or size.
- stock: availability or stock level.
- reviews: the rating and review count.

Judge each read only by its own text. Never copy a value from one read into another. Keep each value under 60 characters.`;

export const readChecker = new Agent({
  description: "Says which facts each provider's read of a page contains.",
  id: "read-checker",
  instructions: INSTRUCTIONS,
  model: ({ requestContext }): string => requestContext.get("model"),
  name: "Read checker",
  requestContextSchema: CompareContextSchema,
  tools: {},
});

/** Text of each read the checker sees; enough for a product page's key facts. */
const CHECKED_CHARACTERS = 30_000;
const MAX_OUTPUT_TOKENS = 2000;

const CheckerOutputSchema = z.object({
  reads: z.array(FactValuesSchema.extend({ provider: z.string() })),
});

const prompt = (reads: readonly ReadOutcome[]): string =>
  reads
    .map((read) => {
      const text = read.markdown ?? read.excerpts?.join("\n\n") ?? "";
      return `## Read by ${read.provider}\n\n${text.slice(0, CHECKED_CHARACTERS)}`;
    })
    .join("\n\n");

export interface Checked {
  checked: CheckedRead[];
  spend: ModelSpend;
}

/** One structured call over every successful read; failed reads are left out. */
export const checkReads = async (
  reads: readonly ReadOutcome[],
  requestContext: RequestContext<CompareContext>,
  abortSignal: AbortSignal
): Promise<Checked> => {
  const readable = reads.filter((read) => read.ok);
  if (readable.length === 0) {
    return { checked: [], spend: { inputTokens: 0, outputTokens: 0 } };
  }
  const response = await readChecker.generate(prompt(readable), {
    abortSignal,
    modelSettings: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0 },
    requestContext,
    structuredOutput: { schema: CheckerOutputSchema },
  });
  const output = CheckerOutputSchema.parse(response.object);
  const checked = output.reads.flatMap(({ provider, ...facts }) =>
    readable.some((read) => read.provider === provider)
      ? [{ facts, provider }]
      : []
  );
  return {
    checked,
    spend: {
      costUsd: OpenRouterCostSchema.parse(response.providerMetadata),
      ...TokenCountsSchema.parse(response.totalUsage),
    },
  };
};
