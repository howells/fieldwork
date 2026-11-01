import { FieldworkError } from "../../errors.js";
import type { Citation, Place, SearchResult } from "../../types.js";
import {
  compact,
  list,
  num,
  record,
  refuseTogether,
  text,
} from "../../util.js";
import type { Json } from "../../util.js";
import type { BraveRecency, SearchInput } from "./options.js";

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

export const warningsOf = (query: unknown) => {
  const q = record(query);
  const warnings: string[] = [];
  const altered = text(q.altered);
  if (altered !== undefined) {
    warnings.push(`brave searched the spell-corrected query "${altered}"`);
  }
  if (q.show_strict_warning === true) {
    warnings.push("strict safe search hid some results");
  }
  return warnings;
};

export const result = (
  item: unknown,
  kind: string
): SearchResult | undefined => {
  const r = record(item);
  const url = text(r.url);
  if (url === undefined) {
    return undefined;
  }
  const thumbnail = record(r.thumbnail);
  const extra = list(r.extra_snippets).filter(
    (s): s is string => typeof s === "string" && s !== ""
  );
  const snippet = [text(r.description), ...extra]
    .filter((s): s is string => s !== undefined)
    .join("\n\n");
  return compact({
    favicon: text(record(r.meta_url).favicon),
    image: text(thumbnail.original) ?? text(thumbnail.src),
    kind,
    publishedAt: text(r.page_age),
    snippet: snippet === "" ? undefined : snippet,
    title: text(r.title),
    url,
  });
};

export const placeResult = (item: unknown): SearchResult | undefined => {
  const base = result(item, "place");
  if (!base) {
    return undefined;
  }
  const r = record(item);
  const [latitude, longitude] = list(r.coordinates);
  const place: Place = compact({
    address: text(record(r.postal_address).displayAddress),
    latitude: num(latitude),
    longitude: num(longitude),
  });
  const rating = record(r.rating);
  return compact({
    ...base,
    place: Object.keys(place).length > 0 ? place : undefined,
    rating: num(rating.ratingValue),
    reviewCount: num(rating.reviewCount),
  });
};

export const section = (
  response: Json,
  name: string,
  map: (item: unknown) => SearchResult | undefined
): SearchResult[] =>
  list(record(response[name]).results)
    .map((item) => map(item))
    .filter((item): item is SearchResult => item !== undefined);

const contextResult = (
  item: unknown,
  kind: string,
  sources: Json
): SearchResult | undefined => {
  const r = record(item);
  const url = text(r.url);
  if (url === undefined) {
    return undefined;
  }
  const source = record(sources[url]);
  const passages = list(r.snippets).filter(
    (s): s is string => typeof s === "string" && s !== ""
  );
  return compact({
    content: passages.length > 0 ? passages.join("\n\n") : undefined,
    favicon: text(source.favicon),
    image: text(source.thumbnail),
    kind,
    snippet: text(source.description),
    title: text(r.title) ?? text(r.name) ?? text(source.title),
    url,
  });
};

export const parseContext = (response: Json): SearchResult[] => {
  const grounding = record(response.grounding);
  const sources = record(response.sources);
  const poi = record(grounding.poi);
  return [
    ...list(grounding.generic).map((item) =>
      contextResult(item, "web", sources)
    ),
    ...(Object.keys(poi).length > 0
      ? [contextResult(poi, "place", sources)]
      : []),
    ...list(grounding.map).map((item) => contextResult(item, "place", sources)),
  ].filter((item): item is SearchResult => item !== undefined);
};

export const completionText = (response: unknown): string => {
  if (typeof response === "string") {
    let content = "";
    for (const line of response.split(/\r?\n/u)) {
      if (!line.startsWith("data:")) {
        continue;
      }
      const payload = line.slice(5).trim();
      if (payload === "" || payload === "[DONE]") {
        continue;
      }
      try {
        for (const choice of list(record(JSON.parse(payload)).choices)) {
          const delta = text(record(record(choice).delta).content);
          content += delta ?? "";
        }
      } catch {
        // A line that is not a chunk carries no answer text.
      }
    }
    return content;
  }
  const choice = record(list(record(response).choices)[0]);
  return (
    text(record(choice.message).content) ??
    text(record(choice.delta).content) ??
    ""
  );
};

export const CITATION_TAG = /<citation>(?<body>[\s\S]*?)<\/citation>/gu;
export const USAGE_TAG = /<usage>(?<body>[\s\S]*?)<\/usage>/gu;

const tagJson = (body: string): Json | undefined => {
  try {
    let value: unknown = JSON.parse(body);
    if (typeof value === "string") {
      value = JSON.parse(value);
    }
    return record(value);
  } catch {
    return undefined;
  }
};

export const tagBodies = (content: string, tag: RegExp): Json[] =>
  [...content.matchAll(tag)]
    .map((match) => tagJson(match.groups?.body ?? ""))
    .filter((item): item is Json => item !== undefined);

export const answerCitations = (content: string): Citation[] => {
  const byUrl = new Map<string, string[]>();
  for (const item of tagBodies(content, CITATION_TAG)) {
    const url = text(item.url);
    if (url === undefined) {
      continue;
    }
    const excerpts = byUrl.get(url) ?? [];
    const snippet = text(item.snippet);
    if (snippet !== undefined && !excerpts.includes(snippet)) {
      excerpts.push(snippet);
    }
    byUrl.set(url, excerpts);
  }
  return [...byUrl].map(([url, excerpts]) =>
    compact({ excerpts: excerpts.length > 0 ? excerpts : undefined, url })
  );
};
