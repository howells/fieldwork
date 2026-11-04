// Schemas for Perplexity's responses, built from the lenient blocks in
// ../../parse.ts so a changed field reads as absent instead of failing.
// ../perplexity.ts and ./parse.ts read the parsed values; the response as received
// still goes in `raw`.

import type * as z from "zod/mini";

import {
  anything,
  arrayOf,
  both,
  looseObject,
  optionalId,
  optionalNumber,
  optionalScalar,
  optionalString,
  recordOf,
  Source,
  sourceShape,
  withOriginal,
} from "../../parse.js";

/** `/search`. */
export const SearchResponse = looseObject({
  id: optionalScalar,
  results: arrayOf(
    looseObject({
      date: optionalString,
      last_updated: optionalString,
      snippet: optionalString,
      title: optionalString,
      url: optionalString,
    })
  ),
});

/** An annotation on message text. Its `type` is kept as it arrived, since only an absent one or `url_citation` counts as a citation. */
const Annotation = looseObject({ ...sourceShape, type: anything });

/** One part of a message's content. */
const MessagePart = looseObject({
  annotations: arrayOf(Annotation),
  text: optionalString,
});

/**
 * One item of an Agent response's `output`: a `message` with `content`, or a list
 * of pages in `results` (`search_results`) or `contents` (`fetch_url_results`).
 */
const OutputEntry = looseObject({
  content: arrayOf(MessagePart),
  contents: arrayOf(Source),
  results: arrayOf(Source),
  type: optionalString,
});

/** A response of the Agent API, whole. Its `id` is read as a continuation id (a non-empty string) and as a request id (a string, number or boolean). */
const Agent = looseObject({
  error: looseObject({ message: optionalString, type: optionalString }),
  id: both(optionalString, optionalScalar),
  output: arrayOf(OutputEntry),
  status: optionalString,
  usage: looseObject({
    cost: looseObject({ total_cost: optionalNumber }),
    input_tokens: optionalNumber,
    input_tokens_details: looseObject({
      cache_creation_input_tokens: optionalNumber,
      cache_read_input_tokens: optionalNumber,
    }),
    output_tokens: optionalNumber,
    output_tokens_details: looseObject({ reasoning_tokens: optionalNumber }),
    total_tokens: optionalNumber,
  }),
});

/** An Agent API response beside the response as it arrived. */
export const AgentRun = withOriginal(Agent);

/** The reply to starting a run: its id as a string, and as it arrived. */
export const AgentStart = looseObject({ id: withOriginal(optionalId) });

/**
 * One decision answer. `noul` is a yes/no probability; `probabilities` is keyed by
 * choice, or by zero-based score level.
 */
const DecisionAnswer = looseObject({
  choice: optionalString,
  confidence: optionalNumber,
  noul: optionalNumber,
  probabilities: recordOf(optionalNumber),
  type: optionalString,
});

/** `/v1/decisions`. */
export const DecisionsResponse = looseObject({
  answers: recordOf(DecisionAnswer),
  usage: looseObject({
    input_tokens: optionalNumber,
    output_tokens: optionalNumber,
  }),
});

export type AgentBody = z.output<typeof Agent>;
export type AgentRunBlock = z.output<typeof AgentRun>;
export type AnnotationBlock = z.output<typeof Annotation>;
export type DecisionAnswerBlock = z.output<typeof DecisionAnswer>;
