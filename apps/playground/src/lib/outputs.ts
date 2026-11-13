// The parts of each tool's result the interface draws. These follow the
// SDK's output schemas (`outputSchema` on each tool) and read only the
// fields the views use; anything else in the result is left alone.
import { z } from "zod";

const PriceSchema = z.object({
  amount: z.string().optional(),
  currency: z.string().optional(),
  formatted: z.string().optional(),
});
export type Price = z.infer<typeof PriceSchema>;

const CitationSchema = z.object({
  excerpts: z.array(z.string()).optional(),
  title: z.string().optional(),
  url: z.string(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const SearchOutputSchema = z.object({
  results: z.array(
    z.object({
      price: PriceSchema.optional(),
      snippet: z.string().optional(),
      title: z.string().optional(),
      url: z.string(),
    })
  ),
});

export const PageOutputSchema = z.object({
  excerpts: z.array(z.string()).optional(),
  markdown: z.string().optional(),
  title: z.string().optional(),
  url: z.string(),
});

export const PagesOutputSchema = z.object({
  failed: z.array(z.object({ reason: z.string().optional(), url: z.string() })),
  pages: z.array(PageOutputSchema),
});

export const ExtractOutputSchema = z.object({
  data: z.json(),
  fields: z
    .array(z.object({ citations: z.array(CitationSchema), field: z.string() }))
    .optional(),
});

const VariantSchema = z.object({
  availability: z.string().optional(),
  images: z
    .array(z.object({ alt: z.string().optional(), url: z.string() }))
    .optional(),
  inStock: z.boolean().optional(),
  originalPrice: PriceSchema.optional(),
  price: PriceSchema.optional(),
  sku: z.string().optional(),
  title: z.string().optional(),
  values: z.record(z.string(), z.string()).optional(),
});
export type Variant = z.infer<typeof VariantSchema>;

export const ProductOutputSchema = z.object({
  brand: z.string().optional(),
  images: z
    .array(z.object({ alt: z.string().optional(), url: z.string() }))
    .optional(),
  title: z.string().optional(),
  url: z.string().optional(),
  variants: z.array(VariantSchema),
});
export type ProductOutput = z.infer<typeof ProductOutputSchema>;

export const AnswerOutputSchema = z.object({
  answer: z.string().optional(),
  citations: z.array(CitationSchema),
});

export const ResearchOutputSchema = z.object({
  sources: z.array(CitationSchema),
  status: z.string(),
  stopReason: z.string().optional(),
});

export const MonitorOutputSchema = z.object({
  id: z.string(),
  schedule: z.string().optional(),
  status: z.string().optional(),
  watch: z.string().optional(),
});
export type MonitorOutput = z.infer<typeof MonitorOutputSchema>;

export const MapOutputSchema = z.object({
  links: z.array(z.object({ url: z.string() })),
});
