// Request encoders and result readers for the Brave adapter: which options each
// search endpoint takes, freshness and goggles encoding, the normalized results of
// each endpoint, and the tags in a streamed answer. ../brave.ts calls them; the
// response shapes are in ./response.ts.

import * as z from "zod/mini";

import { invalidRequest } from "../../errors.js";
import type { Citation, Place, SearchResult } from "../../types.js";
import { compact, parseJson, refuseTogether } from "../../util.js";
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

/** The name this adapter reports in errors and results. */
export const provider = "brave";

/** Brave's `freshness` codes: past day, week, month and year. */
const FRESHNESS: Record<BraveRecency, string> = {
  day: "pd",
  month: "pm",
  week: "pw",
  year: "py",
};

/** The options every search endpoint takes (`BraveSearchBase`). */
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
    "content",
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
    "content",
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

/** The endpoint a search goes to. */
type Mode = keyof typeof ALLOWED;

/**
 * The endpoint for a search: `content: true` is the LLM context endpoint; otherwise
 * `vertical` picks web (the default), news or videos. Any other `vertical`, which
 * only an untyped caller can pass, is refused.
 */
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
  throw invalidRequest(
    provider,
    `has no "${o.vertical}" search; use web, news or videos`
  );
};

/**
 * Refuses every set option the endpoint does not take, naming all of them. An
 * option set to undefined passes.
 */
export const refuseUnsupported = (mode: Mode, o: SearchInput) => {
  const refused = Object.entries(o)
    .filter(
      ([name, value]) =>
        value !== undefined &&
        !ALLOWED[mode].some((allowed) => allowed === name)
    )
    .map(([name]) => name);
  if (refused.length > 0) {
    throw invalidRequest(
      provider,
      `${mode} search does not accept ${refused.join(", ")}`
    );
  }
};

/** Today's date in UTC, as YYYY-MM-DD. */
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Brave's `freshness` value: a code for `recency`, or `<after>to<before>` for
 * dates, with `before` defaulting to today (UTC). Refuses `recency` with either
 * date, `publishedBefore` without `publishedAfter`, a recency Brave has no window
 * for (such as "hour") and dates that are not YYYY-MM-DD.
 */
export const freshness = (o: SearchInput): string | undefined => {
  refuseTogether(provider, o, "recency", "publishedAfter");
  refuseTogether(provider, o, "recency", "publishedBefore");
  if (o.recency !== undefined) {
    const window = FRESHNESS[o.recency];
    if (!window) {
      throw invalidRequest(
        provider,
        `has no "${o.recency}" recency window; use day, week, month or year`
      );
    }
    return window;
  }
  if (o.publishedBefore !== undefined && o.publishedAfter === undefined) {
    throw invalidRequest(
      provider,
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
      throw invalidRequest(provider, `dates must be YYYY-MM-DD, got "${date}"`);
    }
  }
  return `${after}to${before}`;
};

/**
 * The goggles as a list, so each is sent as its own `goggles` parameter. Refuses
 * more than three.
 */
export const gogglesOf = (
  value: string | string[] | undefined
): string[] | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const all = Array.isArray(value) ? value : [value];
  if (all.length > 3) {
    throw invalidRequest(provider, "accepts at most 3 goggles per search");
  }
  return all;
};

type Param = string | number | boolean | string[] | undefined;

/**
 * The path with its parameters as a query string. Undefined parameters are left
 * out and an array repeats its key.
 */
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

/** Brave takes country codes in upper case. */
export const upper = (value: string | undefined) => value?.toUpperCase();

/** Brave takes language codes in lower case. */
export const lower = (value: string | undefined) => value?.toLowerCase();

/**
 * Warnings from a response's `query` block: the spell-corrected query Brave
 * searched, and strict safe search hiding results.
 */
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

/**
 * A web, news, video or discussion item as a result, of the given `kind`. The
 * snippet is the description followed by any extra snippets, split by blank
 * lines. `image` prefers the thumbnail's original over its resized `src`. An item
 * with no URL is dropped.
 */
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

/**
 * A `locations` item as a `place` result: its address, coordinates (Brave sends
 * `[latitude, longitude]`), rating and review count.
 */
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

/** The section's items through `map`, without the ones it drops. */
export const section = (
  items: ResultItem[],
  map: (item: ResultItem) => SearchResult | undefined
): SearchResult[] =>
  items
    .map((item) => map(item))
    .filter((item): item is SearchResult => item !== undefined);

/**
 * A grounding item as a result. The passages are the `content`; the description,
 * favicon and image come from the source entry keyed by the item's URL. The title
 * is the item's `title`, then its `name`, then the source's.
 */
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

/**
 * The results of an LLM context response: generic items as `web`, and the `poi`
 * and `map` items as `place`.
 */
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

/** Brave's inline `<citation>` tag in answer text; `body` captures its JSON. */
export const CITATION_TAG = /<citation>(?<body>[\s\S]*?)<\/citation>/gu;
/** Brave's inline `<usage>` tag in answer text; `body` captures its JSON. */
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

/**
 * One citation per URL from the answer's `<citation>` tags, with each distinct
 * snippet as an excerpt.
 */
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

/**
 * The answer text of a reply to `/chat/completions`, and the response to keep
 * in `raw`. A stream arrives as event lines; a plain completion as one JSON
 * object.
 */
export const replyContent = (reply: string) => {
  if (!reply.trimStart().startsWith("{")) {
    return { content: streamText(reply), response: reply };
  }
  const completion = parseJson(provider, reply);
  return {
    content: completionText(z.parse(Completion, completion)),
    response: completion,
  };
};
