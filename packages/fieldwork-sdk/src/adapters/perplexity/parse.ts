// Request encoders and response readers for the Perplexity adapter: search
// filters, the Agent API's research setup and response, and decisions.
// ../perplexity.ts calls them; the response shapes are in ./response.ts.

import { FieldworkError, invalidRequest } from "../../errors.js";
import { jsonSchemaOf } from "../../schema.js";
import type { OutputSchema } from "../../schema.js";
import type {
  Citation,
  DecisionAnswer,
  DecisionQuestion,
} from "../../types.js";
import {
  citationOf,
  compact,
  meta,
  parseJson,
  refuseTogether,
  uniqueCitations,
} from "../../util.js";
import type {
  PerplexityFilters,
  PerplexityResearchOptions,
} from "./options.js";
import type {
  AgentBody,
  AgentRunBlock,
  AnnotationBlock,
  DecisionAnswerBlock,
} from "./response.js";

/** The name this adapter reports in errors and results. */
export const provider = "perplexity";
/** The most queries one `/search` request takes, the first included. */
export const MAX_QUERIES = 5;

/** Perplexity's MM/DD/YYYY form of a YYYY-MM-DD date. Refuses any other format. */
const usDate = (name: string, date: string | undefined) => {
  if (date === undefined) {
    return date;
  }
  const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u.exec(date);
  if (!match?.groups) {
    throw invalidRequest(provider, `${name} must be YYYY-MM-DD, got "${date}"`);
  }
  const { year, month, day } = match.groups;
  return `${month}/${day}/${year}`;
};

/**
 * The filter fields `/search` and the `web_search` tool share. Refuses both domain
 * lists together, since Perplexity has one list and marks exclusions with `-`.
 */
export const filterFields = (o: PerplexityFilters) => {
  refuseTogether(provider, { ...o }, "includeDomains", "excludeDomains");
  const domains = o.includeDomains ?? o.excludeDomains?.map((d) => `-${d}`);
  return compact({
    last_updated_after_filter: usDate("lastUpdatedAfter", o.lastUpdatedAfter),
    last_updated_before_filter: usDate(
      "lastUpdatedBefore",
      o.lastUpdatedBefore
    ),
    search_after_date_filter: usDate("publishedAfter", o.publishedAfter),
    search_before_date_filter: usDate("publishedBefore", o.publishedBefore),
    search_domain_filter: domains && domains.length > 0 ? domains : undefined,
    search_recency_filter: o.recency,
  });
};

/**
 * The `web_search` tool with the filters and `country` (as the user's location), or
 * undefined when none is set, so the effort's own tool applies.
 */
const webSearchTool = (o: PerplexityFilters & { country?: string }) => {
  const filters = filterFields(o);
  const tool = compact({
    filters: Object.keys(filters).length > 0 ? filters : undefined,
    type: "web_search",
    user_location:
      o.country === undefined || o.country === ""
        ? undefined
        : { country: o.country },
  });
  return Object.keys(tool).length > 1 ? tool : undefined;
};

/** Lower-cased language codes as a list, or undefined when there are none. */
export const languageCodes = (language: string | string[] | undefined) => {
  const codes = [language ?? []].flat().map((code) => code.toLowerCase());
  return codes.length > 0 ? codes : undefined;
};

/**
 * `JobFailed` once the run has an id, else `RateLimited` for a rate-limit error,
 * else `ProviderError`.
 */
const errorCode = (jobId: string | undefined, rateLimited: boolean) => {
  if (jobId !== undefined && jobId !== "") {
    return "JobFailed";
  }
  return rateLimited ? "RateLimited" : "ProviderError";
};

/**
 * The error for an Agent response that failed, was cancelled or has no text. It
 * carries `jobId` when given and is retryable for rate-limit and overloaded errors.
 */
export const responseError = (run: AgentRunBlock, jobId?: string) => {
  const { error, status } = run.value;
  const { type } = error;
  const message = error.message ?? `ended ${status ?? "unknown"}`;
  const rateLimited =
    type === "request_rate_limit_exceeded" ||
    type === "token_rate_limit_exceeded";
  return new FieldworkError(
    errorCode(jobId, rateLimited),
    `perplexity ${message}`,
    {
      cause: run.original,
      jobId,
      provider,
      retryable: rateLimited || type === "overloaded",
    }
  );
};

/**
 * The citations in message annotations. Only `url_citation` annotations, or ones
 * with no type, count.
 */
const annotated = (annotations: readonly AnnotationBlock[]): Citation[] =>
  annotations
    .filter(
      (found) => found.type === undefined || found.type === "url_citation"
    )
    .map((found) => citationOf(found))
    .filter((source): source is Citation => source !== undefined);

/**
 * Reads an Agent response. `text` joins every message part. `cited` is the unique
 * sources annotating that text. `retrieved` is the unique pages the run's
 * `search_results` and `fetch_url_results` returned, as title and URL only.
 */
export const readResponse = (body: AgentBody) => {
  const parts: string[] = [];
  const cited: Citation[] = [];
  const retrieved: Citation[] = [];
  for (const entry of body.output) {
    if (entry.type === "message") {
      for (const part of entry.content) {
        parts.push(part.text ?? "");
        cited.push(...annotated(part.annotations));
      }
    }
    let found = entry.contents;
    if (entry.type === "search_results") {
      found = entry.results;
    } else if (entry.type !== "fetch_url_results") {
      found = [];
    }
    for (const item of found) {
      const source = citationOf(item);
      if (source) {
        retrieved.push(compact({ title: source.title, url: source.url }));
      }
    }
  }
  return {
    cited: uniqueCitations(cited),
    retrieved: uniqueCitations(retrieved),
    text: parts.join(""),
  };
};

/**
 * Meta from an Agent response: cost in USD, token units and the id as `requestId`.
 * `warnings` is one message.
 */
export const responseMeta = (body: AgentBody, warnings?: string) => {
  const { usage } = body;
  const input = usage.input_tokens_details;
  return meta({
    costUsd: usage.cost.total_cost,
    requestId: body.id.second,
    units: {
      cacheCreationInputTokens: input.cache_creation_input_tokens,
      cacheReadInputTokens: input.cache_read_input_tokens,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      reasoningTokens: usage.output_tokens_details.reasoning_tokens,
      totalTokens: usage.total_tokens,
    },
    warnings,
  });
};

/** The Agent `response_format` for a schema, named "output", or undefined. */
export const responseFormat = (schema: OutputSchema<unknown> | undefined) =>
  schema
    ? {
        json_schema: { name: "output", schema: jsonSchemaOf(schema) },
        type: "json_schema",
      }
    : undefined;

/**
 * The decision `state`. A string, object or array goes through as it is; a number
 * or boolean is sent as text; anything else is refused.
 */
export const decisionState = (context: unknown) => {
  if (typeof context === "string" || (typeof context === "object" && context)) {
    return context;
  }
  if (typeof context === "number" || typeof context === "boolean") {
    return String(context);
  }
  throw invalidRequest(
    provider,
    "decide needs a context: a string, object or array"
  );
};

/**
 * The effort, model, step and tool fields of a research run. Refuses `models`
 * outside one to five. With `model` or `models` and no `effort`, the run is built
 * directly: `maxSteps` or 10 steps, with `web_search` and `fetch_url` tools.
 * Otherwise the effort defaults to "high" and a tool is sent only to carry filters.
 */
export const researchSetup = (o: PerplexityResearchOptions) => {
  if (o.models && (o.models.length < 1 || o.models.length > 5)) {
    throw invalidRequest(provider, "models takes one to five models");
  }
  const searchTool = webSearchTool(o);
  // Without an effort level the run has no tools or step budget of its own.
  const direct =
    o.effort === undefined && (o.model !== undefined || o.models !== undefined);
  if (direct) {
    return {
      max_steps: o.maxSteps ?? 10,
      model: o.model,
      models: o.models,
      tools: [searchTool ?? { type: "web_search" }, { type: "fetch_url" }],
    };
  }
  return {
    effort: o.effort ?? "high",
    max_steps: o.maxSteps,
    model: o.model,
    models: o.models,
    tools: searchTool ? [searchTool] : undefined,
  };
};

/**
 * A research run's output: the reply text, or its parsed JSON when a schema is set.
 * Invalid JSON from a completed run throws the parse error; from a run cut short it
 * throws `JobFailed`.
 */
export const researchOutput = (
  run: AgentRunBlock,
  reply: string,
  schema: OutputSchema<unknown> | undefined
) => {
  if (!schema) {
    return reply;
  }
  const { status } = run.value;
  try {
    return parseJson(provider, reply);
  } catch (error) {
    if (status === "completed") {
      throw error;
    }
    // A run cut short can leave JSON that stops mid-value: no usable output.
    throw new FieldworkError(
      "JobFailed",
      `perplexity research ended ${status} with output that is not valid JSON`,
      { cause: run.original, provider }
    );
  }
};

/**
 * Perplexity's form of a normalized decision question: `yesno` is `noul`, `choice`
 * takes its choices as criteria with no descriptions, and `score` takes the scale's
 * labels, in order, as criteria.
 */
export const decisionQuestion = (question: DecisionQuestion) => {
  if (question.type === "yesno") {
    return { instructions: question.question, type: "noul" };
  }
  if (question.type === "choice") {
    return {
      criteria: Object.fromEntries(
        question.choices.map((choice) => [choice, null])
      ),
      instructions: question.question,
      type: "choice",
    };
  }
  return {
    criteria: Object.values(question.scale),
    instructions: question.question,
    type: "score",
  };
};

/**
 * One decision answer in the shape its question asks for, or undefined when
 * Perplexity left out the part the question needs: a `yesno` answer's `noul`,
 * or a `choice` or `score` answer's choice. `noul` gives a `probability`.
 * Otherwise the probabilities without undefined entries; for a score,
 * Perplexity's level indexes are renamed to the scale's keys. `choice` is
 * Perplexity's, else the most likely.
 */
export const decisionAnswer = (
  found: DecisionAnswerBlock,
  question: DecisionQuestion
): DecisionAnswer | undefined => {
  if (question.type === "yesno") {
    return found.noul === undefined ? undefined : { probability: found.noul };
  }
  let probabilities = Object.fromEntries(
    Object.entries(found.probabilities).filter(
      (entry): entry is [string, number] => entry[1] !== undefined
    )
  );
  if (question.type === "score") {
    const scores = Object.keys(question.scale);
    probabilities = Object.fromEntries(
      Object.entries(probabilities).map(([index, probability]) => [
        scores[Number(index)] ?? index,
        probability,
      ])
    );
  }
  const top = Object.entries(probabilities).toSorted(
    (a, b) => b[1] - a[1]
  )[0]?.[0];
  const choice = found.choice ?? top;
  return choice === undefined
    ? undefined
    : compact({ choice, confidence: found.confidence, probabilities });
};
