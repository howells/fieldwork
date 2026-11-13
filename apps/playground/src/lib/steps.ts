// How each tool call reads in the step list: a title in plain words from its
// input, and a one-line summary from its result. Both come from what the
// call actually sent and got back; nothing is guessed.
import { z } from "zod";

import type { Json } from "./events";
import { clip, count, domainOf, priceText } from "./format";
import {
  AnswerOutputSchema,
  ExtractOutputSchema,
  MapOutputSchema,
  MonitorOutputSchema,
  PageOutputSchema,
  PagesOutputSchema,
  ProductOutputSchema,
  ResearchOutputSchema,
  SearchOutputSchema,
} from "./outputs";
import type { Variant } from "./outputs";
import type { CallState } from "./run-state";

const InputSchema = z.object({
  query: z.string().optional(),
  question: z.string().optional(),
  schedule: z
    .object({ cron: z.string().optional(), every: z.string().optional() })
    .optional(),
  url: z.string().optional(),
  urls: z.array(z.string()).optional(),
});

const ValuesSchema = z.record(z.string(), z.json());

const inputOf = (input: Json) => {
  const parsed = InputSchema.safeParse(input);
  return parsed.success ? parsed.data : {};
};

const scheduleWords = (
  schedule: { cron?: string; every?: string } | undefined
): string => {
  if (schedule?.every !== undefined) {
    return schedule.every === "day" ? "every day" : `every ${schedule.every}`;
  }
  return schedule?.cron === undefined
    ? "on a schedule"
    : `on cron ${schedule.cron}`;
};

const TITLE_FOR = {
  answer_question: (input) =>
    `Ask: ${clip(input.question ?? "a question", 70)}`,
  create_monitor: (input) => {
    const target = input.urls?.[0];
    return `Check ${target === undefined ? "the results" : domainOf(target)} ${scheduleWords(input.schedule)}`;
  },
  extract_values: (input) =>
    `Pull out values from ${domainOf(input.url ?? "the page")}`,
  find_entities: () => "Find everything that fits",
  make_decisions: () => "Decide",
  map_site: (input) => `Map ${domainOf(input.url ?? "the site")}`,
  read_page: (input) => `Read ${domainOf(input.url ?? "the page")}`,
  read_pages: (input) => `Read ${count(input.urls?.length ?? 0)} pages`,
  read_product: () => "Read the product and every variant",
  research_question: (input) =>
    `Research: ${clip(input.question ?? "a question", 70)}`,
  // The model's exact-match quotes would sit inside these, so they go.
  search_web: (input) =>
    `Search for “${clip((input.query ?? "").replaceAll('"', ""), 60)}”`,
} satisfies Record<string, (input: ReturnType<typeof inputOf>) => string>;

const TITLES = new Map(Object.entries(TITLE_FOR));

export const stepTitle = (call: CallState): string =>
  TITLES.get(call.tool)?.(inputOf(call.input)) ??
  call.tool.replaceAll("_", " ");

const plural = (value: number, one: string, many: string): string =>
  `${count(value)} ${value === 1 ? one : many}`;

/** Lowest and highest price among variants that state an amount, in the page's own format. */
export interface PriceRange {
  high?: string;
  low?: string;
}

export const priceRange = (variants: readonly Variant[]): PriceRange => {
  const priced = variants
    .flatMap((variant) => {
      const amount = Number(variant.price?.amount);
      return Number.isFinite(amount) && variant.price !== undefined
        ? [
            {
              amount,
              label: priceText(variant.price) ?? "",
            },
          ]
        : [];
    })
    .toSorted((a, b) => a.amount - b.amount);
  return { high: priced.at(-1)?.label, low: priced[0]?.label };
};

export const inStockCount = (variants: readonly Variant[]): number =>
  variants.filter((variant) => variant.inStock === true).length;

const rangeWords = (
  low: string | undefined,
  high: string | undefined
): string => {
  if (low === undefined) {
    return "";
  }
  return low === high ? `, at ${low}` : `, from ${low} to ${high ?? low}`;
};

const productSummary = (output: Json): string | null => {
  const product = ProductOutputSchema.safeParse(output);
  if (!product.success) {
    return null;
  }
  const { variants } = product.data;
  const { high, low } = priceRange(variants);
  const range = rangeWords(low, high);
  const stocked = inStockCount(variants);
  const stock = variants.some((variant) => variant.inStock !== undefined)
    ? ` ${count(stocked)} in stock.`
    : "";
  return `Found ${plural(variants.length, "variant", "variants")}${range}.${stock}`;
};

const words = (text: string): number =>
  text.split(/\s+/u).filter((word) => word !== "").length;

const SUMMARY_FOR = {
  answer_question: (output) => {
    const parsed = AnswerOutputSchema.safeParse(output);
    return parsed.success
      ? `Answered, citing ${plural(parsed.data.citations.length, "source", "sources")}.`
      : null;
  },
  create_monitor: (output) => {
    const parsed = MonitorOutputSchema.safeParse(output);
    return parsed.success
      ? `Watching, as monitor ${clip(parsed.data.id, 24)}.`
      : null;
  },
  extract_values: (output) => {
    const parsed = ExtractOutputSchema.safeParse(output);
    if (!parsed.success) {
      return null;
    }
    const values = ValuesSchema.safeParse(parsed.data.data);
    const size = values.success ? Object.keys(values.data).length : 0;
    return `Pulled out ${plural(size, "value", "values")}.`;
  },
  map_site: (output) => {
    const parsed = MapOutputSchema.safeParse(output);
    return parsed.success
      ? `Found ${plural(parsed.data.links.length, "URL", "URLs")}.`
      : null;
  },
  read_page: (output) => {
    const parsed = PageOutputSchema.safeParse(output);
    if (!parsed.success) {
      return null;
    }
    const passages = parsed.data.excerpts?.length ?? 0;
    const read = `Read ${plural(words(parsed.data.markdown ?? ""), "word", "words")}`;
    return passages > 0
      ? `${read}, ${plural(passages, "passage", "passages")} on the question.`
      : `${read}.`;
  },
  read_pages: (output) => {
    const parsed = PagesOutputSchema.safeParse(output);
    return parsed.success
      ? `Read ${count(parsed.data.pages.length)} of ${count(parsed.data.pages.length + parsed.data.failed.length)}.`
      : null;
  },
  read_product: productSummary,
  research_question: (output) => {
    const parsed = ResearchOutputSchema.safeParse(output);
    if (!parsed.success) {
      return null;
    }
    const partial = parsed.data.status === "partial" ? " Stopped early." : "";
    return `A report citing ${plural(parsed.data.sources.length, "source", "sources")}.${partial}`;
  },
  search_web: (output) => {
    const parsed = SearchOutputSchema.safeParse(output);
    return parsed.success
      ? `${plural(parsed.data.results.length, "result", "results")}.`
      : null;
  },
} satisfies Record<string, (output: Json) => string | null>;

const SUMMARIES = new Map(Object.entries(SUMMARY_FOR));

export const stepSummary = (call: CallState): string | null =>
  call.output === undefined
    ? null
    : (SUMMARIES.get(call.tool)?.(call.output) ?? null);

export interface PageRow {
  ok: boolean;
  url: string;
  note?: string;
}

/** The per-page rows under a batch read: each page read, and each that failed. */
export const pageRows = (call: CallState): PageRow[] => {
  const input = inputOf(call.input);
  if (call.tool !== "read_pages") {
    return [];
  }
  const parsed =
    call.output === undefined
      ? undefined
      : PagesOutputSchema.safeParse(call.output);
  if (parsed?.success !== true) {
    return (input.urls ?? []).map((url) => ({ ok: false, url }));
  }
  return [
    ...parsed.data.pages.map((page) => ({ ok: true, url: page.url })),
    ...parsed.data.failed.map((failure) => ({
      note: failure.reason,
      ok: false,
      url: failure.url,
    })),
  ];
};
