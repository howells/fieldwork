// What a model call cost, as OpenRouter reported it. OpenRouter returns the
// charge in US dollars with each response's usage; Mastra's OpenRouter route
// puts it in the response's `providerMetadata.openrouter.usage.cost`. When it
// is missing the cost stays undefined: nothing here estimates one.
import { z } from "zod";

export const ModelSpendSchema = z.object({
  costUsd: z.number().optional(),
  inputTokens: z.number(),
  outputTokens: z.number(),
});
export type ModelSpend = z.infer<typeof ModelSpendSchema>;

/** Reads the OpenRouter cost out of a response's provider metadata. */
export const OpenRouterCostSchema = z
  .object({
    openrouter: z
      .object({ usage: z.object({ cost: z.number().optional() }).optional() })
      .optional(),
  })
  .optional()
  .transform((metadata) => metadata?.openrouter?.usage?.cost);

/** Reads input and output token counts out of a usage object. */
export const TokenCountsSchema = z
  .object({
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
  })
  .transform((usage) => ({
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
  }));
