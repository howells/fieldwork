import type { AnyAdapter } from "./adapter.js";
import { FieldworkError } from "./errors.js";
import type { Fieldwork } from "./fieldwork.js";
import { SPECS } from "./tool-specs/index.js";
import { toJsonSchema } from "./tool-specs/schema.js";
import type { Field, Spec } from "./tool-specs/types.js";
import { argumentsFor, operationFor } from "./tools/dispatch.js";
import type { Dispatcher, Operation } from "./tools/dispatch.js";
import { isJsonObject } from "./tools/json.js";
import type { JsonObject, JsonValue } from "./tools/json.js";
import { forModel } from "./tools/model.js";
import { problem } from "./tools/validate.js";
import { CAPABILITIES } from "./types.js";
import type { CallOptions, Capability, JsonSchema } from "./types.js";

/**
 * Tool definitions for agents, built from a Fieldwork instance. Each tool's
 * input schema lists only the options its provider supports, so a model is
 * never offered an option that would be ignored. The definitions are plain
 * JSON Schema with MCP-style annotations, so they work with the AI SDK, MCP
 * servers and any framework that accepts JSON Schema tools.
 */

/** What a model sends a tool: a parsed JSON value, which must be an object. */
export type ToolInput = JsonValue;

/** The arguments a tool accepts, once they are known to be an object. */
export type ToolArguments = JsonObject;

/** What a tool returns: a JSON object, shaped for a model. */
export type ToolOutput = JsonObject;

export interface ToolAnnotations {
  title: string;
  /** True when the tool changes nothing outside Fieldwork. */
  readOnlyHint: boolean;
  /** True when the tool can make changes that cannot be undone. */
  destructiveHint: boolean;
  /** True when repeating a call with the same input has no further effect. */
  idempotentHint: boolean;
  /** True when the tool reaches the open web. */
  openWorldHint: boolean;
}

export interface FieldworkTool {
  /** A verb_noun name, such as `search_web`. */
  name: string;
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
   * with long text cut to the `maxCharacters` budget. Throws a
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
}

const offers = (field: Field, provider: string): boolean =>
  field.providers === undefined || field.providers.includes(provider);

const needs = (field: Field, provider: string): boolean =>
  field.required === true || field.requiredFor?.includes(provider) === true;

const invalid = (tool: string, provider: string, message: string) =>
  new FieldworkError("InvalidRequest", `${tool}: ${message}`, { provider });

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

/** The tool's result as an object: a list is wrapped, a confirmation is spelled out. */
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

const inputSchema = (fields: Field[], provider: string): JsonSchema => ({
  additionalProperties: false,
  properties: Object.fromEntries(
    fields.map((field) => [field.name, toJsonSchema(field.schema)])
  ),
  required: fields
    .filter((field) => needs(field, provider))
    .map((field) => field.name),
  type: "object",
});

const toolFor = (
  spec: Spec,
  provider: string,
  operation: Operation,
  budget: number
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
      const values = readInput(spec.name, provider, fields, input);
      const result = await operation(...argumentsFor(spec, values, call));
      return forModel(resultObject(spec, values, result), budget);
    },
    inputSchema: inputSchema(fields, provider),
    method: spec.method,
    name: spec.name,
    outputSchema: toJsonSchema(spec.output),
    provider,
  };
};

/** Makes one tool per capability, or per method of a group, the instance supports. */
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
  const budget = options.maxCharacters ?? 20_000;
  const dispatcher: Dispatcher = web;
  return SPECS.flatMap((spec) => {
    const provider = web.providerFor(spec.capability);
    const operation = operationFor(dispatcher, spec);
    return wanted.has(spec.capability) &&
      provider !== undefined &&
      operation !== undefined
      ? [toolFor(spec, provider, operation, budget)]
      : [];
  });
};

/**
 * An error as a model or an MCP client should see it: the code, the message
 * and what to do next, without the provider's response.
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
