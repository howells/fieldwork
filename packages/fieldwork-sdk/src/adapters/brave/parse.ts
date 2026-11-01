import * as z from "zod/mini";

import { FieldworkError } from "../../errors.js";
import type { Citation, Place, SearchResult } from "../../types.js";
import { compact, refuseTogether } from "../../util.js";
import type { BraveRecency, SearchInput } from "./options.js";
import { CitationTag, Completion } from "./response.js";
import type {
  CompletionBlock,
  ContextBlock,
  ContextItemBlock,
  ContextSourceBlock,
  QueryBlock,
  ResultItem,
} from "./response.js";

export const provider = "brave";

const FRESHNESS: Record<BraveRecency, string> = {
  day: "pd",
  month: "pm",
  week: "pw",
  year: "py",
};

const SHARED = [
  "limit",
  "country",
  "language",
  "recency",
  "publishedAfter",
  "publishedBefore",
  "safesearch",
];

/** The provider options each search endpoint takes; any other is refused. */
const ALLOWED = {
  context: [
    ...SHARED,
    "content",
    "maxTokens",
    "maxTokensPerUrl",
    "relevance",
    "sourceMetadata",
    "operators",
    "goggles",
  ],
  news: [
    ...SHARED,
    "vertical",
    "offset",
    "extraSnippets",
    "spellcheck",
    "uiLanguage",
    "operators",
    "goggles",
  ],
  videos: [
    ...SHARED,
    "vertical",
    "offset",
    "spellcheck",
    "uiLanguage",
    "operators",
  ],
  web: [
    ...SHARED,
    "vertical",
    "content",
    "offset",
    "resultTypes",
    "extraSnippets",
    "spellcheck",
    "uiLanguage",
    "units",
    "operators",
    "goggles",
    "textDecorations",
  ],
} as const;

type Mode = keyof typeof ALLOWED;

const invalid = (message: string): FieldworkError =>
  new FieldworkError("InvalidRequest", `brave ${message}`, { provider });

export const modeOf = (o: SearchInput): Mode => {
  if (o.content === true) {
    return "context";
  }
  if (o.vertical === undefined || o.vertical === "web") {
    return "web";
  }
  if (o.vertical === "news" || o.vertical === "videos") {
    return o.vertical;
  }
  throw invalid(`has no "${o.vertical}" search; use web, news or videos`);
};

export const refuseUnsupported = (mode: Mode, o: SearchInput) => {
  const refused = Object.entries(o)
    .filter(
      ([name, value]) =>
        value !== undefined &&
        !ALLOWED[mode].some((allowed) => allowed === name)
    )
    .map(([name]) => name);
  if (refused.length > 0) {
    throw invalid(`${mode} search does not accept ${refused.join(", ")}`);
  }
};

const today = () => new Date().toISOString().slice(0, 10);

export const freshness = (o: SearchInput): string | undefined => {
  refuseTogether(provider, o, "recency", "publishedAfter");
  refuseTogether(provider, o, "recency", "publishedBefore");
  if (o.recency !== undefined) {
    const window = FRESHNESS[o.recency];
    if (!window) {
      throw invalid(
        `has no "${o.recency}" recency window; use day, week, month or year`
      );
    }
    return window;
  }
  if (o.publishedBefore !== undefined && o.publishedAfter === undefined) {
    throw invalid(
      "needs publishedAfter with publishedBefore: its date range has two ends"
    );
  }
  if (o.publishedAfter === undefined) {
    return undefined;
  }
  const after = o.publishedAfter;
  const before = o.publishedBefore ?? today();
  for (const date of [after, before]) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
      throw invalid(`dates must be YYYY-MM-DD, got "${date}"`);
    }
  }
  return `${after}to${before}`;
};

export const gogglesOf = (
  value: string | string[] | undefined
): string[] | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const all = Array.isArray(value) ? value : [value];
  if (all.length > 3) {
    throw invalid("accepts at most 3 goggles per search");
  }
  return all;
};

type Param = string | number | boolean | string[] | undefined;

export const withQuery = (
  path: string,
  params: Record<string, Param>
): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      search.append(key, String(item));
    }
  }
  const query = search.toString();
  return query === "" ? path : `${path}?${query}`;
};

export const upper = (value: string | undefined) => value?.toUpperCase();

export const lower = (value: string | undefined) => value?.toLowerCase();

export const warningsOf = (query: QueryBlock) => {
  const warnings: string[] = [];
  if (query.altered !== undefined) {
    warnings.push(
      `brave searched the spell-corrected query "${query.altered}"`
    );
  }
  if (query.show_strict_warning === true) {
    warnings.push("strict safe search hid some results");
  }
  return warnings;
};

export const result = (
  r: ResultItem,
  kind: string
): SearchResult | undefined => {
  if (r.url === undefined) {
    return undefined;
  }
  const snippet = [r.description, ...r.extra_snippets]
    .filter((s): s is string => s !== undefined)
    .join("\n\n");
  return compact({
    favicon: r.meta_url.favicon,
    image: r.thumbnail.original ?? r.thumbnail.src,
    kind,
    publishedAt: r.page_age,
    snippet: snippet === "" ? undefined : snippet,
    title: r.title,
    url: r.url,
  });
};

export const placeResult = (r: ResultItem): SearchResult | undefined => {
  const base = result(r, "place");
  if (!base) {
    return undefined;
  }
  const [latitude, longitude] = r.coordinates;
  const place: Place = compact({
    address: r.postal_address.displayAddress,
    latitude,
    longitude,
  });
  return compact({
    ...base,
    place: Object.keys(place).length > 0 ? place : undefined,
    rating: r.rating.ratingValue,
    reviewCount: r.rating.reviewCount,
  });
};

export const section = (
  items: ResultItem[],
  map: (item: ResultItem) => SearchResult | undefined
): SearchResult[] =>
  items
    .map((item) => map(item))
    .filter((item): item is SearchResult => item !== undefined);

const contextResult = (
  r: ContextItemBlock,
  kind: string,
  sources: Record<string, ContextSourceBlock>
): SearchResult | undefined => {
  if (r.url === undefined) {
    return undefined;
  }
  const source = sources[r.url];
  return compact({
    content: r.snippets.length > 0 ? r.snippets.join("\n\n") : undefined,
    favicon: source?.favicon,
    image: source?.thumbnail,
    kind,
    snippet: source?.description,
    title: r.title ?? r.name ?? source?.title,
    url: r.url,
  });
};

export const parseContext = ({
  grounding,
  sources,
}: ContextBlock): SearchResult[] =>
  [
    ...grounding.generic.map((item) => contextResult(item, "web", sources)),
    contextResult(grounding.poi, "place", sources),
    ...grounding.map.map((item) => contextResult(item, "place", sources)),
  ].filter((item): item is SearchResult => item !== undefined);

/** The text of a streamed answer: the content of each `data:` line's chunk. */
export const streamText = (stream: string): string => {
  let content = "";
  for (const line of stream.split(/\r?\n/u)) {
    if (!line.startsWith("data:")) {
      continue;
    }
    const payload = line.slice(5).trim();
    if (payload === "" || payload === "[DONE]") {
      continue;
    }
    try {
      const chunk = z.parse(Completion, JSON.parse(payload));
      for (const choice of chunk.choices) {
        content += choice.delta.content ?? "";
      }
    } catch {
      // A line that is not a chunk carries no answer text.
    }
  }
  return content;
};

/** The text of an answer sent whole, from its first choice. */
export const completionText = (completion: CompletionBlock): string => {
  const [choice] = completion.choices;
  return choice?.message.content ?? choice?.delta.content ?? "";
};

export const CITATION_TAG = /<citation>(?<body>[\s\S]*?)<\/citation>/gu;
export const USAGE_TAG = /<usage>(?<body>[\s\S]*?)<\/usage>/gu;

/** The JSON inside a tag, which Brave sometimes encodes twice, read through `schema`. */
const parseTag = <Schema extends z.ZodMiniType>(
  body: string,
  schema: Schema
): z.output<Schema>[] => {
  try {
    const value: unknown = JSON.parse(body);
    const twice = z.safeParse(z.string(), value);
    return [z.parse(schema, twice.success ? JSON.parse(twice.data) : value)];
  } catch {
    return [];
  }
};

/** Every tag in the content whose body is JSON, read through `schema`. */
export const tagBodies = <Schema extends z.ZodMiniType>(
  content: string,
  tag: RegExp,
  schema: Schema
): z.output<Schema>[] =>
  [...content.matchAll(tag)].flatMap((match) =>
    parseTag(match.groups?.body ?? "", schema)
  );

export const answerCitations = (content: string): Citation[] => {
  const byUrl = new Map<string, string[]>();
  for (const item of tagBodies(content, CITATION_TAG, CitationTag)) {
    if (item.url === undefined) {
      continue;
    }
    const excerpts = byUrl.get(item.url) ?? [];
    if (item.snippet !== undefined && !excerpts.includes(item.snippet)) {
      excerpts.push(item.snippet);
    }
    byUrl.set(item.url, excerpts);
  }
  return [...byUrl].map(([url, excerpts]) =>
    compact({ excerpts: excerpts.length > 0 ? excerpts : undefined, url })
  );
};
