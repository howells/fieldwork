// The events the run and compare routes stream to the page, one JSON object
// per line. The page parses each line against these schemas, so a change on
// one side that the other doesn't know fails loudly.
import { z } from "zod";

/** What the provider reported it charged, from the SDK result's `meta.usage`. */
export const UsageSchema = z.object({
  costUsd: z.number().optional(),
  credits: z.number().optional(),
  units: z.record(z.string(), z.number()).optional(),
});
export type Usage = z.infer<typeof UsageSchema>;

const JsonSchema = z.json();
export type Json = z.infer<typeof JsonSchema>;

export const RunEventSchema = z.discriminatedUnion("type", [
  z.object({
    model: z.string(),
    routes: z.record(z.string(), z.string()),
    type: z.literal("start"),
  }),
  z.object({ text: z.string(), type: z.literal("text") }),
  z.object({
    capability: z.string(),
    id: z.string(),
    input: JsonSchema,
    method: z.string().optional(),
    provider: z.string(),
    tool: z.string(),
    type: z.literal("call"),
  }),
  z.object({
    id: z.string(),
    ms: z.number(),
    output: JsonSchema,
    type: z.literal("result"),
    usage: UsageSchema.optional(),
  }),
  z.object({
    code: z.string().optional(),
    id: z.string(),
    message: z.string(),
    ms: z.number(),
    type: z.literal("call-error"),
  }),
  z.object({
    costUsd: z.number().optional(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    type: z.literal("model"),
  }),
  z.object({ ms: z.number(), reason: z.string(), type: z.literal("done") }),
  z.object({ message: z.string(), type: z.literal("error") }),
]);
export type RunEvent = z.infer<typeof RunEventSchema>;

/** The six things the compare view checks each read for. */
export const FACTS = [
  "name",
  "price",
  "size",
  "stock",
  "images",
  "reviews",
] as const;
export type Fact = (typeof FACTS)[number];

export const ReadOutcomeSchema = z.object({
  error: z.string().optional(),
  excerpts: z.array(z.string()).optional(),
  images: z.number(),
  markdown: z.string().optional(),
  ms: z.number(),
  ok: z.boolean(),
  provider: z.string(),
  title: z.string().optional(),
  usage: UsageSchema.optional(),
  words: z.number(),
});
export type ReadOutcome = z.infer<typeof ReadOutcomeSchema>;

/** Each fact as one read gave it: the value as written, or null when it isn't there. */
export const FactValuesSchema = z.object({
  name: z.string().nullable(),
  price: z.string().nullable(),
  reviews: z.string().nullable(),
  size: z.string().nullable(),
  stock: z.string().nullable(),
});
export type FactValues = z.infer<typeof FactValuesSchema>;

export const CheckedReadSchema = z.object({
  facts: FactValuesSchema,
  provider: z.string(),
});
export type CheckedRead = z.infer<typeof CheckedReadSchema>;

export const CompareEventSchema = z.discriminatedUnion("type", [
  z.object({
    providers: z.array(z.string()),
    type: z.literal("start"),
    url: z.string(),
  }),
  z.object({ read: ReadOutcomeSchema, type: z.literal("read") }),
  z.object({ checked: z.array(CheckedReadSchema), type: z.literal("checked") }),
  z.object({
    costUsd: z.number().optional(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    type: z.literal("model"),
  }),
  z.object({ ms: z.number(), type: z.literal("done") }),
  z.object({ message: z.string(), type: z.literal("error") }),
]);
export type CompareEvent = z.infer<typeof CompareEventSchema>;
