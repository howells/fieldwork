import { FieldworkError, invalidRequest, withJob } from "../../errors.js";
import { jsonSchemaOf } from "../../schema.js";
import type { OutputSchema } from "../../schema.js";
import type { Citation, DecisionQuestion } from "../../types.js";
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

export const provider = "perplexity";
export const MAX_QUERIES = 5;
export const TERMINAL = new Set([
  "completed",
  "failed",
  "incomplete",
  "cancelled",
]);

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

export const languageCodes = (language: string | string[] | undefined) => {
  const codes = [language ?? []].flat().map((code) => code.toLowerCase());
  return codes.length > 0 ? codes : undefined;
};

const errorCode = (jobId: string | undefined, rateLimited: boolean) => {
  if (jobId !== undefined && jobId !== "") {
    return "JobFailed";
  }
  return rateLimited ? "RateLimited" : "ProviderError";
};

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

const annotated = (annotations: readonly AnnotationBlock[]): Citation[] =>
  annotations
    .filter(
      (found) => found.type === undefined || found.type === "url_citation"
    )
    .map((found) => citationOf(found))
    .filter((source): source is Citation => source !== undefined);

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

export const responseFormat = (schema: OutputSchema<unknown> | undefined) =>
  schema
    ? {
        json_schema: { name: "output", schema: jsonSchemaOf(schema) },
        type: "json_schema",
      }
    : undefined;

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

export const researchOutput = (
  run: AgentRunBlock,
  reply: string,
  schema: OutputSchema<unknown> | undefined,
  id: string
) => {
  if (!schema) {
    return reply;
  }
  const { status } = run.value;
  try {
    return parseJson(provider, reply);
  } catch (error) {
    if (status === "completed") {
      throw withJob(error, id);
    }
    // A run cut short can leave JSON that stops mid-value: no usable output.
    throw new FieldworkError(
      "JobFailed",
      `perplexity research ended ${status} with output that is not valid JSON`,
      { cause: run.original, jobId: id, provider }
    );
  }
};

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

export const decisionAnswer = (
  found: DecisionAnswerBlock,
  scores: string[] | undefined
) => {
  if (found.type === "noul") {
    return compact({ probability: found.noul });
  }
  let probabilities = Object.fromEntries(
    Object.entries(found.probabilities).filter(
      (entry): entry is [string, number] => entry[1] !== undefined
    )
  );
  if (found.type === "score") {
    probabilities = Object.fromEntries(
      Object.entries(probabilities).map(([index, probability]) => [
        scores?.[Number(index)] ?? index,
        probability,
      ])
    );
  }
  const top = Object.entries(probabilities).toSorted(
    (a, b) => b[1] - a[1]
  )[0]?.[0];
  return compact({
    choice: found.choice ?? top,
    confidence: found.confidence,
    probabilities,
  });
};
