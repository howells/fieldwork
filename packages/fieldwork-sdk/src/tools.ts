import type { AnyAdapter } from "./adapter.js";
import { FieldworkError } from "./errors.js";
import type { Fieldwork } from "./fieldwork.js";
import { SPECS } from "./tool-specs/index.js";
import { list, object, str, whole } from "./tool-specs/schema.js";
import type { Field, Spec } from "./tool-specs/types.js";
import { checkMaxCharacters, DEFAULT_MAX_CHARACTERS } from "./tools/budget.js";
import { argumentsFor, operationFor } from "./tools/dispatch.js";
import type { Dispatcher, Operation } from "./tools/dispatch.js";
import { isJsonObject } from "./tools/json.js";
import type { JsonObject, JsonValue } from "./tools/json.js";
import { forModel } from "./tools/model.js";
import { problem } from "./tools/validate.js";
import { CAPABILITIES } from "./types.js";
import type { CallOptions, Capability, JsonSchema } from "./types.js";

export { checkMaxCharacters, DEFAULT_MAX_CHARACTERS } from "./tools/budget.js";

// Tool definitions for agents, built from a Fieldwork instance. Each tool's
// input schema lists only the options its provider supports, so a model is
// never offered an option that would be ignored. The definitions are plain
// JSON Schema with MCP-style annotations, so they work with the AI SDK, MCP
// servers and any framework that accepts JSON Schema tools.
//
// The tools themselves are declared in tool-specs/; tools/ holds the dispatch,
// input validation and result shaping `toolsFor` ties together.

/** What a model sends a tool: a parsed JSON value, which must be an object. */
export type ToolInput = JsonValue;

/** The arguments a tool accepts, once they are known to be an object. */
export type ToolArguments = JsonObject;

/** What a tool returns: a JSON object, shaped for a model. */
export type ToolOutput = JsonObject;

/** MCP tool annotations, which clients use to decide when to ask before calling. */
export interface ToolAnnotations {
  title: string;
  /** True when the tool changes nothing outside Fieldwork. */
  readOnlyHint: boolean;
  /** True when the tool can make changes that cannot be undone. */
  destructiveHint: boolean;
  /** True when repeating a call with the same input has no further effect. */
  idempotentHint: boolean;
  /** True when the tool reaches outside Fieldwork. `toolsFor` sets it on every tool. */
  openWorldHint: boolean;
}

/** One agent tool, ready to register with an MCP server or a model's tool API. */
export interface FieldworkTool {
  /** A verb_noun name, such as `search_web`. */
  name: string;
  /** The capability this tool calls on the instance. */
  capability: Capability;
  /** For a group capability, the method this tool calls, such as `create` for `monitor`. */
  method?: string;
  /** The provider that serves this tool, such as "firecrawl". */
  provider: string;
  /** What the tool does, when to use it and when to use another tool. */
  description: string;
  /** A JSON Schema object for the tool's input. */
  inputSchema: JsonSchema;
  /** A JSON Schema object for what `execute` returns. */
  outputSchema: JsonSchema;
  annotations: ToolAnnotations;
  /**
   * Checks the input against `inputSchema`, calls the capability and returns
   * the result shaped for a model: without the provider's `raw` response and
   * with long text cut to the `maxCharacters` budget. `options` are the call's
   * `signal`, `timeout` and `retries`, passed through. Throws a
   * `FieldworkError`; bad input is `InvalidRequest`.
   */
  execute: (input: ToolInput, options?: CallOptions) => Promise<ToolOutput>;
}

/**
 * Capabilities that start remote browsers or create lasting or billed
 * resources. `toolsFor` leaves them out unless they are named in `allow` or
 * `capabilities`.
 */
export const EXCLUDED_BY_DEFAULT: readonly Capability[] = [
  "act",
  "browser",
  "monitor",
];

/** Which tools `toolsFor` makes, and how much text each result may return. */
export interface ToolsOptions {
  /**
   * Capabilities to make tools for. Defaults to every capability the instance
   * supports except those in `EXCLUDED_BY_DEFAULT`.
   */
  capabilities?: Capability[];
  /**
   * Capabilities left out by default to include as well, such as `act`,
   * `browser` and `monitor`.
   */
  allow?: Capability[];
  /**
   * The most characters of long text (page Markdown, reports, document text)
   * one result returns, shared across its fields. Text of 500 characters or
   * fewer, such as titles, URLs and snippets, is never cut. Defaults to 20,000.
   */
  maxCharacters?: number;
  /** Maximum configured or per-call budget; advertised in each input schema. */
  maxCharactersLimit?: number;
}

/** Whether the field is offered to the provider: a field with no `providers` goes to every provider that has the capability. */
const offers = (field: Field, provider: string): boolean =>
  field.providers === undefined ||
  field.providers.some((name) => name === provider);

/** Whether the field is required for the provider, either for all that are offered it or for this one. */
const needs = (field: Field, provider: string): boolean =>
  field.required === true ||
  field.requiredFor?.some((name) => name === provider) === true;

const invalid = (tool: string, provider: string, message: string) =>
  new FieldworkError("InvalidRequest", `${tool}: ${message}`, { provider });

/**
 * Checks a model's input against the fields offered to the provider and
 * returns it unchanged: it must be an object, with no key the provider does
 * not take, every required field present and each value valid for its schema.
 *
 * Throws `InvalidRequest`, prefixed with the tool's name, on the first problem.
 */
const readInput = (
  tool: string,
  provider: string,
  fields: Field[],
  input: ToolInput
): ToolArguments => {
  if (!isJsonObject(input)) {
    throw invalid(tool, provider, "input must be an object");
  }
  const known = new Set(fields.map((field) => field.name));
  for (const key of Object.keys(input)) {
    if (!known.has(key)) {
      throw invalid(
        tool,
        provider,
        `${key} is not an input with ${provider}; the inputs are ${[...known].join(", ")}`
      );
    }
  }
  for (const field of fields) {
    const value = input[field.name];
    if (value === undefined) {
      if (needs(field, provider)) {
        throw invalid(tool, provider, `${field.name} is required`);
      }
      continue;
    }
    const found = problem(field.schema, value, field.name);
    if (found !== undefined) {
      throw invalid(tool, provider, found);
    }
  }
  return input;
};

/**
 * The tool's result as an object: a list is wrapped, a confirmation is spelled
 * out. Any other result must already be an object, or this throws
 * `ProviderError`.
 */
const resultObject = (
  spec: Spec,
  values: ToolArguments,
  result: JsonValue | undefined
): ToolOutput => {
  if (spec.wrapAs !== undefined) {
    return { [spec.wrapAs]: result };
  }
  if (spec.confirmAs !== undefined) {
    return { [spec.confirmAs]: true, id: values.id };
  }
  if (isJsonObject(result)) {
    return result;
  }
  throw new FieldworkError(
    "ProviderError",
    `${spec.name} got a result that is not an object`
  );
};

/** The JSON Schema advertised for the tool's input: closed to other keys, requiring what `needs` says. */
const inputSchema = (
  fields: Field[],
  provider: string,
  budget: number,
  limit?: number
): JsonSchema => {
  const schema: JsonSchema = {
    additionalProperties: false,
    properties: Object.fromEntries([
      ...fields.map((field) => [field.name, { ...field.schema }]),
      [
        "maxCharacters",
        {
          ...whole(
            `Shared long-text budget for this call; defaults to ${budget}. Never sent to the provider.`,
            1,
            limit
          ),
        },
      ],
    ]),
    required: fields
      .filter((field) => needs(field, provider))
      .map((field) => field.name),
    type: "object",
  };
  if (
    fields.some((field) => field.name === "contentBase64") &&
    fields.some((field) => field.name === "url")
  ) {
    schema.oneOf = [
      {
        not: {
          anyOf: [{ required: ["name"] }, { required: ["contentBase64"] }],
        },
        required: ["url"],
      },
      { not: { required: ["url"] }, required: ["name", "contentBase64"] },
    ];
  }
  return schema;
};

const toolFor = (
  spec: Spec,
  provider: string,
  operation: Operation,
  budget: number,
  limit?: number
): FieldworkTool => {
  const fields = spec.fields.filter((field) => offers(field, provider));
  return {
    annotations: {
      destructiveHint: spec.destructive,
      idempotentHint: spec.idempotent,
      openWorldHint: true,
      readOnlyHint: spec.readOnly,
      title: spec.title,
    },
    capability: spec.capability,
    description: spec.description,
    execute: async (input, call = {}) => {
      if (!isJsonObject(input)) {
        throw invalid(spec.name, provider, "input must be an object");
      }
      const { maxCharacters, ...args } = input;
      const values = readInput(spec.name, provider, fields, args);
      const callBudget =
        maxCharacters === undefined
          ? budget
          : checkMaxCharacters(maxCharacters, limit);
      const result = await operation(
        ...argumentsFor(spec, values, call, provider)
      );
      return forModel(resultObject(spec, values, result), callBudget);
    },
    inputSchema: inputSchema(fields, provider, budget, limit),
    method: spec.method,
    name: spec.name,
    outputSchema: {
      ...spec.output,
      properties: {
        ...spec.output.properties,
        truncated: list(
          object(
            {
              length: whole("Original character length.", 0),
              path: str,
              shown: whole("Characters shown before the inline cut note.", 0),
            },
            ["path", "shown", "length"]
          ),
          "One entry for each cut text field; absent when nothing was cut."
        ),
      },
    },
    provider,
  };
};

/**
 * Makes one tool per capability, or per method of a group, the instance
 * supports, in the order of `SPECS`. A router gives each tool the inputs of
 * the provider that serves its capability, and `provider` names it.
 */
export const toolsFor = (
  web: Fieldwork<AnyAdapter>,
  options: ToolsOptions = {}
): FieldworkTool[] => {
  const wanted = new Set<Capability>([
    ...(options.capabilities ??
      CAPABILITIES.filter(
        (capability) => !EXCLUDED_BY_DEFAULT.includes(capability)
      )),
    ...(options.allow ?? []),
  ]);
  const limit =
    options.maxCharactersLimit === undefined
      ? undefined
      : checkMaxCharacters(options.maxCharactersLimit);
  const budget = checkMaxCharacters(
    options.maxCharacters ?? DEFAULT_MAX_CHARACTERS,
    limit
  );
  const dispatcher: Dispatcher = web;
  return SPECS.flatMap((spec) => {
    const provider = web.providerFor(spec.capability);
    const operation = operationFor(dispatcher, spec);
    return wanted.has(spec.capability) &&
      provider !== undefined &&
      operation !== undefined
      ? [toolFor(spec, provider, operation, budget, limit)]
      : [];
  });
};

/**
 * An error as a model or an MCP client should see it: the code, the message
 * and what to do next (`retryable`, `retryAfter`, `jobId`), without the
 * provider's response. An error that is not a `FieldworkError` becomes a
 * `ProviderError` that is not retryable.
 */
export const toolError = (cause: unknown) => {
  if (cause instanceof FieldworkError) {
    return cause.toJSON();
  }
  return {
    code: "ProviderError" as const,
    message: cause instanceof Error ? cause.message : String(cause),
    name: "Error",
    retryable: false,
  };
};
