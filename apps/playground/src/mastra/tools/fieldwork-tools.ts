// The agent's tools are the SDK's own tool definitions, wrapped for Mastra.
// Name, description and input schema come from `@howells/fieldwork-sdk/tools`
// unchanged, and `execute` hands straight back to the SDK, which checks the
// input, calls the routed provider and shapes the result for a model.
import type { AnyAdapter, Fieldwork } from "@howells/fieldwork-sdk";
import { toolsFor } from "@howells/fieldwork-sdk/tools";
import type {
  FieldworkTool,
  ToolArguments,
  ToolInput,
} from "@howells/fieldwork-sdk/tools";
import type { PublicSchema } from "@mastra/core/schema";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { AGENT_CAPABILITIES } from "@/lib/routing";

/**
 * The most characters of long text one tool result returns. Lower than the
 * SDK's default of 20,000, because every result is sent back to the model
 * on each later step and Simple mode runs on cheap models.
 */
const MAX_CHARACTERS = 12_000;

/** Research jobs and batch reads poll; bound each call so a run can't hang. */
const CALL_TIMEOUT_MS = 150_000;

// The SDK's input schemas are plain JSON Schema objects, which Mastra accepts
// as the JSONSchema7 member of PublicSchema and wraps for validation. This
// guard only narrows the static type: an object whose `type` is "object" is
// the shape the SDK promises.
const isJsonSchema = (
  schema: FieldworkTool["inputSchema"]
): schema is FieldworkTool["inputSchema"] & PublicSchema<ToolArguments> =>
  schema.type === "object";

// Mastra turns the nulls a strict-mode model sends for options it leaves out
// back into undefined. JSON has no undefined, and to the SDK an option that
// is undefined is an option not given, so those keys are dropped here.
const dropUndefined = (
  record: Record<string, ToolInput | undefined>
): Record<string, ToolInput> =>
  Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [string, ToolInput] => entry[1] !== undefined
    )
  );

const ToolInputSchema: z.ZodType<ToolInput> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(ToolInputSchema),
    z.record(z.string(), ToolInputSchema.optional()).transform(dropUndefined),
  ])
);

const wrap = (tool: FieldworkTool) => {
  if (!isJsonSchema(tool.inputSchema)) {
    throw new Error(`${tool.name} has an input schema that is not an object`);
  }
  return createTool({
    description: tool.description,
    execute: async (input, context) =>
      await tool.execute(ToolInputSchema.parse(input), {
        signal: context.abortSignal,
        timeout: CALL_TIMEOUT_MS,
      }),
    id: tool.name,
    inputSchema: tool.inputSchema,
  });
};

export type FieldworkTools = Record<string, ReturnType<typeof wrap>>;

/** Mastra tools for every capability the instance routes, keyed by the SDK's verb_noun names. */
export const fieldworkTools = (web: Fieldwork<AnyAdapter>): FieldworkTools =>
  Object.fromEntries(
    toolsFor(web, {
      allow: ["monitor"],
      capabilities: [...AGENT_CAPABILITIES],
      maxCharacters: MAX_CHARACTERS,
    }).map((tool) => [tool.name, wrap(tool)])
  );

export type ToolDirectory = Map<
  string,
  Pick<FieldworkTool, "capability" | "method" | "provider">
>;

/** The SDK's own record of each tool: capability, method and provider, by name. */
export const toolDirectory = (web: Fieldwork<AnyAdapter>): ToolDirectory =>
  new Map(
    toolsFor(web, {
      allow: ["monitor"],
      capabilities: [...AGENT_CAPABILITIES],
    }).map((tool) => [
      tool.name,
      {
        capability: tool.capability,
        method: tool.method,
        provider: tool.provider,
      },
    ])
  );
