// What a run found, pulled from the results of its tool calls for the
// result view: the product it read, the values it pulled out, and any
// monitor it set up. Everything here is read from a call's output.
import { z } from "zod";

import type { Json } from "./events";
import type {
  Citation,
  MonitorOutput,
  ProductOutput,
  Variant,
} from "./outputs";
import {
  ExtractOutputSchema,
  MonitorOutputSchema,
  ProductOutputSchema,
  SearchOutputSchema,
} from "./outputs";
import type { CallState } from "./run-state";

const lastOutput = <T>(
  calls: readonly CallState[],
  tool: string,
  schema: z.ZodType<T>
): { call: CallState; output: T } | undefined => {
  for (const call of calls.toReversed()) {
    if (
      call.tool === tool &&
      call.status === "done" &&
      call.output !== undefined
    ) {
      const parsed = schema.safeParse(call.output);
      if (parsed.success) {
        return { call, output: parsed.data };
      }
    }
  }
  return undefined;
};

const TargetSchema = z.object({
  url: z.string().optional(),
  urls: z.array(z.string()).optional(),
});

/** The page a call was about: its `url`, or the first of its `urls`. */
export const targetOf = (call: CallState): string | undefined => {
  const parsed = TargetSchema.safeParse(call.input);
  return parsed.success
    ? (parsed.data.url ?? parsed.data.urls?.[0])
    : undefined;
};

export const productOf = (
  calls: readonly CallState[],
  url?: string
): { call: CallState; output: ProductOutput } | undefined =>
  lastOutput(
    url === undefined ? calls : calls.filter((call) => targetOf(call) === url),
    "read_product",
    ProductOutputSchema
  );

export const searchResultsOf = (calls: readonly CallState[]) =>
  lastOutput(calls, "search_web", SearchOutputSchema)?.output.results ?? [];

export const monitorsOf = (
  calls: readonly CallState[]
): { call: CallState; output: MonitorOutput }[] =>
  calls.flatMap((call) => {
    if (call.tool !== "create_monitor" || call.status !== "done") {
      return [];
    }
    const parsed = MonitorOutputSchema.safeParse(call.output);
    return parsed.success ? [{ call, output: parsed.data }] : [];
  });

/** The option a product varies by, such as "Fabric", from the first variant's values. */
export const optionName = (variants: readonly Variant[]): string => {
  const [firstVariant] = variants;
  const [first] = Object.keys(firstVariant?.values ?? {});
  return first === undefined
    ? "Variant"
    : first.charAt(0).toUpperCase() + first.slice(1);
};

export const variantName = (variant: Variant, index: number): string => {
  const values = Object.values(variant.values ?? {});
  if (values.length > 0) {
    return values.join(", ");
  }
  return variant.title ?? variant.sku ?? `Variant ${index + 1}`;
};

export const deliveryOf = (variant: Variant): string => {
  if (variant.availability !== undefined && variant.availability !== "") {
    return variant.availability;
  }
  if (variant.inStock === undefined) {
    return "";
  }
  return variant.inStock ? "In stock" : "Out of stock";
};

const ScalarSchema = z.union([z.string(), z.number(), z.boolean()]);
const ScalarListSchema = z.array(ScalarSchema);
const RecordListSchema = z.array(z.record(z.string(), ScalarSchema));
const RecordSchema = z.record(z.string(), z.json());

/** What a field shows when the provider found nothing for it. */
export const NOT_FOUND = "Not on the page";

/** A pulled-out value as text. Lists join with commas; anything nested is shown as JSON. */
export const valueText = (value: Json): string => {
  if (value === null || value === "") {
    return NOT_FOUND;
  }
  const scalar = ScalarSchema.safeParse(value);
  if (scalar.success) {
    return String(scalar.data);
  }
  const list = ScalarListSchema.safeParse(value);
  if (list.success) {
    return list.data.join(", ");
  }
  // A list of small records, such as a price per fabric group: one line each.
  const records = RecordListSchema.safeParse(value);
  return records.success
    ? records.data.map((record) => Object.values(record).join(" · ")).join("\n")
    : JSON.stringify(value);
};

export interface Field {
  citations: Citation[];
  name: string;
  value: string;
}

/** Each value an extraction returned, with the passages its provider cited for it. */
export const fieldsOf = (
  calls: readonly CallState[]
): { call: CallState; fields: Field[] } | undefined => {
  const found = lastOutput(calls, "extract_values", ExtractOutputSchema);
  if (found === undefined) {
    return undefined;
  }
  const record = RecordSchema.safeParse(found.output.data);
  if (!record.success) {
    return undefined;
  }
  const cited = new Map(
    (found.output.fields ?? []).map((field) => [field.field, field.citations])
  );
  const fields = Object.entries(record.data).map(([name, value]) => ({
    citations: cited.get(name) ?? [],
    name,
    value: valueText(value),
  }));
  return { call: found.call, fields };
};

/** "pricePerSquareMetre" as "Price per square metre". */
export const fieldLabel = (name: string): string => {
  const spaced = name
    .replaceAll(/[_-]+/gu, " ")
    .replaceAll(/(?<before>[a-z0-9])(?<after>[A-Z])/gu, "$<before> $<after>")
    .toLowerCase()
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};
