import {
  condition,
  continueFrom,
  country,
  excludeDomains,
  includeDomains,
  language,
  limit,
  maxAge,
  publishedAfter,
  publishedBefore,
  recency,
  resume,
  schemaField,
} from "./fields.js";
import {
  ANSWER_OUTPUT,
  DECIDE_OUTPUT,
  DISCOVER_OUTPUT,
  RESEARCH_OUTPUT,
} from "./outputs.js";
import {
  anything,
  choice,
  keyed,
  list,
  object,
  str,
  text,
  texts,
} from "./schema.js";
import type { FieldSchema } from "./schema.js";
import type { Field, Spec } from "./types.js";

/** The required `question` input, the tool's one positional argument. */
const question = (description: string): Field => ({
  name: "question",
  required: true,
  schema: text(description),
});

/** One question for `make_decisions`, in the three forms of the `DecisionQuestion` type: `yesno`, `choice` and `score`. */
const decisionQuestion: FieldSchema = {
  oneOf: [
    object(
      { question: str, type: choice("A yes or no question.", ["yesno"]) },
      ["type", "question"]
    ),
    object(
      {
        choices: texts("The options, each a short label."),
        question: str,
        type: choice("A question with one answer from a list.", ["choice"]),
      },
      ["type", "question", "choices"]
    ),
    object(
      {
        question: str,
        scale: keyed(str, "Each score and what it means."),
        type: choice("A question answered with a score on a rubric.", [
          "score",
        ]),
      },
      ["type", "question", "scale"]
    ),
  ],
};

/**
 * The tools that answer or decide: `answer_question`, `research_question`,
 * `find_entities` and `make_decisions`. `research_question` and
 * `find_entities` run as jobs, so they take `resume` where the provider does.
 */
export const ANSWER_SPECS: Spec[] = [
  {
    capability: "answer",
    description:
      "Answer a question in one call from the provider's own search, and return the answer with the sources it cites. Faster and cheaper than research_question. Use for a factual question with a short answer. Do not use for a question that needs many sources compared or a long report (use research_question), or to find pages (use search_web).",
    destructive: false,
    fields: [
      question("The question, with any context the answer depends on."),
      schemaField(
        "A JSON Schema object for the answer, which then comes back as output.",
        ["exa", "parallel", "perplexity"]
      ),
      continueFrom(["parallel", "perplexity"]),
      limit("How many search results to base the answer on.", 20, ["tavily"]),
      includeDomains("sources", ["tavily", "parallel"]),
      excludeDomains("sources", ["tavily", "parallel"]),
      publishedAfter(["tavily"]),
      publishedBefore(["tavily"]),
      ...recency([], ["tavily"]),
      country(["exa", "tavily", "brave"], "Localize the answer to"),
      language(["tavily", "brave"]),
      maxAge(["tavily"]),
    ],
    idempotent: true,
    name: "answer_question",
    output: ANSWER_OUTPUT,
    positional: ["question"],
    readOnly: true,
    title: "Answer a question",
  },
  {
    capability: "research",
    description:
      "Research a question across the web and return an answer with its sources: a written report, or values matching a JSON Schema when one is given. Runs a job of many steps that can take minutes and costs more than a search. status is partial when the run stopped early (stopReason says why) but still has output. Use for questions that need several sources compared or combined. Do not use for a single lookup (use search_web or answer_question), or to read a page you have a URL for (use read_page).",
    destructive: false,
    fields: [
      question("The question, with any context the answer depends on."),
      schemaField(
        "A JSON Schema object for the answer. Without one, the answer is a written report.",
        ["exa", "firecrawl", "tavily", "parallel", "perplexity"]
      ),
      continueFrom(["exa", "firecrawl", "parallel", "perplexity"]),
      includeDomains(
        "sources",
        ["tavily", "parallel", "perplexity"],
        "Tavily treats it as a preference, not a restriction."
      ),
      excludeDomains("sources", ["tavily", "parallel", "perplexity"]),
      publishedAfter(["parallel", "perplexity"]),
      publishedBefore(["perplexity"]),
      ...recency(["perplexity"], []),
      country(["firecrawl", "parallel", "perplexity"], "Search from"),
      resume(["exa", "firecrawl", "tavily", "parallel", "perplexity"]),
    ],
    idempotent: false,
    name: "research_question",
    output: RESEARCH_OUTPUT,
    positional: ["question"],
    readOnly: true,
    title: "Research a question",
  },
  {
    capability: "discover",
    description:
      "Find entities of one kind, such as companies, products or people, that meet every condition you list, and return each with its URL and description. Runs a job that can take minutes and costs more than a search. status is partial when the run stopped early (stopReason says why) but found entities. Use to build a list of things that match criteria. Do not use to answer a question (use answer_question or research_question) or to look up one named entity (use search_web).",
    destructive: false,
    fields: [
      {
        name: "objective",
        required: true,
        schema: text(
          "What to find, in plain words, with any context that narrows it."
        ),
      },
      {
        name: "entityType",
        required: true,
        schema: text(
          'The kind of entity to find, such as "companies" or "people".'
        ),
      },
      {
        name: "conditions",
        required: true,
        schema: list(condition, "Every entity found must meet all of these.", {
          minItems: 1,
        }),
      },
      limit("How many matching entities to find.", 1000, ["parallel"]),
      schemaField(
        "A JSON Schema object of extra values to fill in for every matching entity, returned in its data.",
        ["parallel"]
      ),
      resume(["parallel"]),
    ],
    idempotent: false,
    name: "find_entities",
    output: DISCOVER_OUTPUT,
    positional: ["objective"],
    readOnly: true,
    title: "Find entities",
  },
  {
    capability: "decide",
    description:
      "Answer closed questions about a context: yes or no, one choice from a list, or a score on a rubric. Each answer carries probabilities, not only a verdict. Use to classify or judge a piece of text or data. Do not use for open questions (use answer_question).",
    destructive: false,
    fields: [
      {
        name: "context",
        required: true,
        schema: anything(
          "What the questions are about: text, or any JSON value."
        ),
      },
      {
        name: "questions",
        required: true,
        schema: keyed(
          decisionQuestion,
          "The questions, each under a name of your choice: letters, digits, _ and -. The answers come back under the same names."
        ),
      },
      country(["parallel"], "Search from"),
    ],
    idempotent: true,
    name: "make_decisions",
    output: DECIDE_OUTPUT,
    positional: ["context", "questions"],
    readOnly: true,
    title: "Make decisions",
  },
];
