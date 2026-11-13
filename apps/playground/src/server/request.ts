// The bodies the page sends. Provider keys travel with each request from the
// browser's own storage and go no further than the adapter for that provider.
import { CAPABILITIES } from "@howells/fieldwork-sdk";
import { z } from "zod";

import { MODEL_IDS } from "@/lib/models";
import { PROVIDER_IDS } from "@/lib/providers";

const Provider = z.enum(PROVIDER_IDS);

const Keys = z.partialRecord(Provider, z.string().max(400));

const Model = z
  .string()
  .refine((id) => MODEL_IDS.includes(id), "Pick one of the listed models");

const Text = z.string().min(1).max(8000);

export const RunRequestSchema = z.object({
  keys: Keys,
  messages: z
    .array(
      z.discriminatedUnion("role", [
        z.object({ content: Text, role: z.literal("user") }),
        z.object({ content: Text, role: z.literal("assistant") }),
      ])
    )
    .min(1)
    .max(20),
  model: Model,
  preferences: z.partialRecord(z.enum(CAPABILITIES), Provider).default({}),
});
export type RunRequest = z.infer<typeof RunRequestSchema>;

export const CompareRequestSchema = z.object({
  keys: Keys,
  model: Model,
  providers: z.array(Provider).min(1).max(5),
  url: z.url({ protocol: /^https?$/u }),
});
export type CompareRequest = z.infer<typeof CompareRequestSchema>;

export const MonitorRequestSchema = z.object({
  id: z.string().min(1).max(200),
  keys: Keys,
  provider: Provider,
});
