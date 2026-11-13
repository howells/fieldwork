// What every run carries in Mastra's request context: the model the person
// picked, and the Fieldwork instance built from their keys. Keys themselves
// never enter the context, workflow state or a prompt; only the adapters
// built from them do, and only for the length of the request.
import { Fieldwork } from "@howells/fieldwork-sdk";
import type { AnyAdapter, CallOptions, Page } from "@howells/fieldwork-sdk";
import { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";

import { MODEL_IDS } from "@/lib/models";

const isFieldwork = (value: unknown): value is Fieldwork<AnyAdapter> =>
  value instanceof Fieldwork;

export const RunContextSchema = z.object({
  model: z.string().refine((id) => MODEL_IDS.includes(id), "Unknown model"),
  web: z.custom<Fieldwork<AnyAdapter>>(
    isFieldwork,
    "Expected a Fieldwork instance"
  ),
});

export type RunContext = z.infer<typeof RunContextSchema>;

export const runContext = (values: RunContext): RequestContext<RunContext> => {
  const context = new RequestContext<RunContext>();
  context.set("model", values.model);
  context.set("web", values.web);
  return context;
};

/** A provider's read, as server/providers.ts builds it from that provider's key. */
export type ReadPage = (url: string, options: CallOptions) => Promise<Page>;

/** One provider's read, held in the request context for the compare workflow. */
export class Reader {
  readonly read: ReadPage;

  constructor(read: ReadPage) {
    this.read = read;
  }
}

/**
 * The compare workflow's context: the model that checks the reads, and a
 * reader for each provider asked, built from that provider's key.
 */
export const CompareContextSchema = z.object({
  model: z.string().refine((id) => MODEL_IDS.includes(id), "Unknown model"),
  readers: z.map(z.string(), z.instanceof(Reader)),
});

export type CompareContext = z.infer<typeof CompareContextSchema>;

export const compareContext = (
  values: CompareContext
): RequestContext<CompareContext> => {
  const context = new RequestContext<CompareContext>();
  context.set("model", values.model);
  context.set("readers", values.readers);
  return context;
};
