import type * as z from "zod/mini";

import {
  arrayOf,
  looseObject,
  nonEmptyString,
  optionalBoolean,
  optionalNumber,
  optionalString,
  recordOf,
} from "../../parse.js";

/** The `query` block every search response carries. */
const Query = looseObject({
  altered: optionalString,
  show_strict_warning: optionalBoolean,
});

/** One result of a web, news, video, discussion or place section. */
const Result = looseObject({
  coordinates: arrayOf(optionalNumber),
  description: optionalString,
  extra_snippets: arrayOf(nonEmptyString),
  meta_url: looseObject({ favicon: optionalString }),
  page_age: optionalString,
  postal_address: looseObject({ displayAddress: optionalString }),
  rating: looseObject({
    ratingValue: optionalNumber,
    reviewCount: optionalNumber,
  }),
  thumbnail: looseObject({
    original: optionalString,
    src: optionalString,
  }),
  title: optionalString,
  url: optionalString,
});

const Section = looseObject({ results: arrayOf(Result) });

/** `/web/search`: the sections are each optional in what Brave sends. */
export const WebSearchResponse = looseObject({
  discussions: Section,
  locations: Section,
  news: Section,
  query: Query,
  videos: Section,
  web: Section,
});

/** `/news/search` and `/videos/search`. */
export const VerticalSearchResponse = looseObject({
  query: Query,
  results: arrayOf(Result),
});

const ImageItem = looseObject({
  properties: looseObject({
    height: optionalNumber,
    url: optionalString,
    width: optionalNumber,
  }),
  thumbnail: looseObject({ src: optionalString }),
  title: optionalString,
  url: optionalString,
});

/** `/images/search`. */
export const ImageSearchResponse = looseObject({
  query: Query,
  results: arrayOf(ImageItem),
});

const ContextItem = looseObject({
  name: optionalString,
  snippets: arrayOf(nonEmptyString),
  title: optionalString,
  url: optionalString,
});

const ContextSource = looseObject({
  description: optionalString,
  favicon: optionalString,
  thumbnail: optionalString,
  title: optionalString,
});

/** `/llm/context`: grounding items, and their sources keyed by URL. */
export const ContextResponse = looseObject({
  grounding: looseObject({
    generic: arrayOf(ContextItem),
    map: arrayOf(ContextItem),
    poi: ContextItem,
  }),
  sources: recordOf(ContextSource),
});

const Choice = looseObject({
  delta: looseObject({ content: optionalString }),
  message: looseObject({ content: optionalString }),
});

/** A chat completion, whole or as one streamed chunk. */
export const Completion = looseObject({ choices: arrayOf(Choice) });

/** The `<citation>` tag the answer stream embeds. */
export const CitationTag = looseObject({
  snippet: optionalString,
  url: optionalString,
});

/** The `<usage>` tag the answer stream embeds. */
export const UsageTag = looseObject({
  "X-Request-Queries": optionalNumber,
  "X-Request-Requests": optionalNumber,
  "X-Request-Tokens-In": optionalNumber,
  "X-Request-Tokens-Out": optionalNumber,
  "X-Request-Total-Cost": optionalNumber,
});

export type QueryBlock = z.output<typeof Query>;
export type ResultItem = z.output<typeof Result>;
export type ImageItemBlock = z.output<typeof ImageItem>;
export type ContextItemBlock = z.output<typeof ContextItem>;
export type ContextSourceBlock = z.output<typeof ContextSource>;
export type ContextBlock = z.output<typeof ContextResponse>;
export type CompletionBlock = z.output<typeof Completion>;
