import type { AnyAdapter } from "./adapter.js";
import { FieldworkError } from "./errors.js";
import type { Fieldwork } from "./fieldwork.js";
import { OUTPUTS, SPECS } from "./tool-specs.js";
import type { Field } from "./tool-specs.js";
import type { CallOptions, Capability, JsonSchema } from "./types.js";

/**
 * Tool definitions for agents, built from a Fieldwork instance. Each tool's
 * input schema lists only the options its provider supports, so a model is
 * never offered an option that would be ignored. The definitions are plain
 * JSON Schema with MCP-style annotations, so they work with the AI SDK, MCP
 * servers and any framework that accepts JSON Schema tools.
 */

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
  execute(input: unknown, options?: CallOptions): Promise<unknown>;
}

export interface ToolsOptions {
  /**
   * Capabilities to make tools for. Defaults to every capability the instance
   * supports except `act`, which runs code in a browser and is included only
   * when named here.
   */
  capabilities?: Capability[];
  /**
   * The most characters of long text (page Markdown, reports, document text)
   * one result returns, shared across its fields. Text of 500 characters or
   * fewer, such as titles, URLs and snippets, is never cut. Defaults to 20,000.
   */
  maxCharacters?: number;
}

/** Makes one tool per capability the instance supports. */
export function toolsFor(
  web: Fieldwork<AnyAdapter>,
  options: ToolsOptions = {}
): FieldworkTool[] {
  const wanted = new Set(
    options.capabilities ??
      SPECS.map((spec) => spec.capability).filter((c) => c !== "act")
  );
  const budget = options.maxCharacters ?? 20_000;
  const methods = web as unknown as Record<
    Capability,
    (subject: unknown, options: Record<string, unknown>) => Promise<unknown>
  >;
  return SPECS.flatMap((spec) => {
    const provider = web.providerFor(spec.capability);
    if (!wanted.has(spec.capability) || provider === undefined) {
      return [];
    }
    const fields = spec.fields.filter(
      (field) =>
        field.providers === undefined || field.providers.includes(provider)
    );
    const tool: FieldworkTool = {
      name: spec.name,
      capability: spec.capability,
      provider,
      description: spec.description,
      inputSchema: {
        type: "object",
        properties: Object.fromEntries(
          fields.map((field) => [field.name, field.schema])
        ),
        required: fields
          .filter((field) => field.required)
          .map((field) => field.name),
        additionalProperties: false,
      },
      outputSchema: OUTPUTS[spec.capability],
      annotations: {
        title: spec.title,
        readOnlyHint: spec.readOnly,
        destructiveHint: !spec.readOnly,
        idempotentHint: spec.idempotent,
        openWorldHint: true,
      },
      async execute(input, call = {}) {
        const values = checkInput(spec.name, provider, fields, input);
        const { [spec.subject]: subject, ...rest } = values;
        const result =
          spec.capability === "parse"
            ? await methods.parse(toDocument(values), {
                pages: values.pages,
                ...call,
              })
            : await methods[spec.capability](subject, { ...rest, ...call });
        return forModel(result, budget);
      },
    };
    return [tool];
  });
}

/**
 * An error as a model or an MCP client should see it: the code, the message
 * and what to do next, without the provider's response.
 */
export function toolError(error: unknown) {
  if (error instanceof FieldworkError) {
    return error.toJSON();
  }
  return {
    name: "Error",
    code: "ProviderError" as const,
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
  };
}

function invalid(tool: string, provider: string, message: string) {
  return new FieldworkError("InvalidRequest", `${tool}: ${message}`, {
    provider,
  });
}

function checkInput(
  tool: string,
  provider: string,
  fields: Field[],
  input: unknown
): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw invalid(tool, provider, "input must be an object");
  }
  const values = input as Record<string, unknown>;
  const known = new Map(fields.map((field) => [field.name, field]));
  for (const key of Object.keys(values)) {
    if (!known.has(key)) {
      throw invalid(
        tool,
        provider,
        `${key} is not an input with ${provider}; the inputs are ${[...known.keys()].join(", ")}`
      );
    }
  }
  for (const field of fields) {
    const value = values[field.name];
    if (value === undefined) {
      if (field.required) {
        throw invalid(tool, provider, `${field.name} is required`);
      }
      continue;
    }
    const problem = checkValue(field.schema, value);
    if (problem) {
      throw invalid(tool, provider, `${field.name} ${problem}`);
    }
  }
  return values;
}

function checkString(schema: JsonSchema, value: unknown): string | undefined {
  if (typeof value !== "string" || value === "") {
    return "must be a non-empty string";
  }
  const allowed = schema.enum as string[] | undefined;
  if (allowed && !allowed.includes(value)) {
    return `must be one of ${allowed.join(", ")}`;
  }
  if (schema.format === "uri" && !URL.canParse(value)) {
    return "must be a full URL, including https://";
  }
  if (schema.format === "date" && !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return "must be a date as YYYY-MM-DD";
  }
  return undefined;
}

function checkInteger(schema: JsonSchema, value: unknown): string | undefined {
  const minimum = schema.minimum as number;
  const maximum = schema.maximum as number;
  const ok =
    Number.isInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum;
  return ok
    ? undefined
    : `must be a whole number from ${minimum} to ${maximum}`;
}

const CHECKS = new Map<
  unknown,
  (schema: JsonSchema, value: unknown) => string | undefined
>([
  ["string", checkString],
  ["integer", checkInteger],
  [
    "boolean",
    (_, value) =>
      typeof value === "boolean" ? undefined : "must be true or false",
  ],
  [
    "array",
    (_, value) =>
      Array.isArray(value) &&
      value.every((item) => typeof item === "string" && item !== "")
        ? undefined
        : "must be a list of strings",
  ],
  [
    "object",
    (_, value) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? undefined
        : "must be a JSON object",
  ],
]);

function checkValue(schema: JsonSchema, value: unknown): string | undefined {
  return CHECKS.get(schema.type)?.(schema, value);
}

function toDocument(values: Record<string, unknown>) {
  return {
    name: values.name as string,
    data: new Uint8Array(Buffer.from(values.contentBase64 as string, "base64")),
  };
}

const SHORT_TEXT = 500;

/**
 * Drops the provider's `raw` response (on the result and on each crawled
 * page) and cuts long text to a budget shared across the result. Keys inside
 * extracted data are left alone, whatever their names.
 */
function strip(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const { raw: _raw, ...rest } = value as Record<string, unknown>;
  return rest;
}

function forModel(result: unknown, budget: number): unknown {
  let remaining = budget;
  const cut = (value: unknown): unknown => {
    if (typeof value === "string") {
      if (value.length <= SHORT_TEXT) {
        return value;
      }
      const kept = Math.min(value.length, remaining);
      remaining -= kept;
      return kept === value.length
        ? value
        : `${value.slice(0, kept)}\n\n[cut: ${kept} of ${value.length} characters shown]`;
    }
    if (Array.isArray(value)) {
      return value.map((item) => cut(item));
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, cut(item)])
      );
    }
    return value;
  };
  const shaped = strip(result);
  if (
    shaped &&
    typeof shaped === "object" &&
    "pages" in shaped &&
    Array.isArray(shaped.pages)
  ) {
    shaped.pages = shaped.pages.map((page) => strip(page));
  }
  return cut(shaped);
}
