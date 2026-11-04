import { FieldworkError } from "./errors.js";
import type { JsonSchema } from "./types.js";

// Structured-output schemas: accepts a plain JSON Schema or a Standard Schema
// (Zod, Valibot, ArkType), converts it for the provider (`jsonSchemaOf`) and
// checks the provider's output against it (`checkOutput`).
//
// The Standard Schema interfaces below are copied from https://standardschema.dev
// (MIT), as its authors ask libraries to do rather than depend on
// @standard-schema/spec. The namespaces of the original are flattened into
// prefixed names; the shapes are the same.

/** Vendor-specific parameters a schema library may accept. */
type LibraryOptions = JsonSchema;

/** The path segment interface of an issue. */
export interface StandardSchemaPathSegment {
  /** The key representing a path segment. */
  readonly key: PropertyKey;
}

/** The issue interface of a failed validation. */
export interface StandardSchemaIssue {
  /** The error message of the issue. */
  readonly message: string;
  /** The path of the issue, if any. */
  readonly path?: readonly (PropertyKey | StandardSchemaPathSegment)[];
}

/** The result interface if validation succeeds. */
export interface StandardSchemaSuccess<Output> {
  /** The typed output value. */
  readonly value: Output;
  /** The absence of issues indicates success. */
  readonly issues?: undefined;
}

/** The result interface if validation fails. */
export interface StandardSchemaFailure {
  /** The issues of failed validation. */
  readonly issues: readonly StandardSchemaIssue[];
}

/** The result interface of the validate function. */
export type StandardSchemaResult<Output> =
  | StandardSchemaSuccess<Output>
  | StandardSchemaFailure;

/** The options of the validate function. */
export interface StandardSchemaOptions {
  /** Implicit support for additional vendor-specific parameters, if needed. */
  readonly libraryOptions?: LibraryOptions;
}

/** The Standard types interface. */
export interface StandardTypes<Input = unknown, Output = Input> {
  /** The input type of the schema. */
  readonly input: Input;
  /** The output type of the schema. */
  readonly output: Output;
}

/** The Standard properties shared by both interfaces. */
export interface StandardTypedProps<Input = unknown, Output = Input> {
  /** The version number of the standard. */
  readonly version: 1;
  /** The vendor name of the schema library. */
  readonly vendor: string;
  /** Inferred types associated with the schema. */
  readonly types?: StandardTypes<Input, Output> | undefined;
}

/** The Standard Schema properties interface. */
export interface StandardSchemaProps<
  Input = unknown,
  Output = Input,
> extends StandardTypedProps<Input, Output> {
  /** Validates a value. `OutputSchema` fixes `Input` to `unknown`, as the spec has it. */
  readonly validate: (
    value: Input,
    options?: StandardSchemaOptions
  ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
}

/** The Standard Schema interface. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  /** The Standard Schema properties. */
  readonly "~standard": StandardSchemaProps<Input, Output>;
}

/**
 * The target version of the generated JSON Schema. Libraries should support
 * `"draft-2020-12"` and `"draft-07"`.
 */
export type StandardJSONSchemaTarget =
  | "draft-2020-12"
  | "draft-07"
  | "openapi-3.0"
  // oxlint-disable-next-line typescript/ban-types -- the spec leaves the target open
  | (string & {});

/** The options for the input/output methods. */
export interface StandardJSONSchemaOptions {
  /** The target version of the generated JSON Schema. */
  readonly target: StandardJSONSchemaTarget;
  /** Implicit support for additional vendor-specific parameters, if needed. */
  readonly libraryOptions?: LibraryOptions;
}

/** The Standard JSON Schema converter interface. */
export interface StandardJSONSchemaConverter {
  /** Converts the input type to JSON Schema. May throw if conversion is not supported. */
  readonly input: (options: StandardJSONSchemaOptions) => JsonSchema;
  /** Converts the output type to JSON Schema. May throw if conversion is not supported. */
  readonly output: (options: StandardJSONSchemaOptions) => JsonSchema;
}

/** The Standard JSON Schema properties interface. */
export interface StandardJSONSchemaProps<
  Input = unknown,
  Output = Input,
> extends StandardTypedProps<Input, Output> {
  /** Methods for generating the input/output JSON Schema. */
  readonly jsonSchema: StandardJSONSchemaConverter;
}

/** The Standard JSON Schema interface. */
export interface StandardJSONSchemaV1<Input = unknown, Output = Input> {
  /** The Standard JSON Schema properties. */
  readonly "~standard": StandardJSONSchemaProps<Input, Output>;
}

/** A schema that both validates and describes itself: Zod, Valibot and ArkType. */
export interface StandardSchemaWithJSON<Input = unknown, Output = Input> {
  readonly "~standard": StandardSchemaProps<Input, Output> &
    StandardJSONSchemaProps<Input, Output>;
}

/**
 * The shape of a structured output: a plain JSON Schema, or a Standard Schema
 * with JSON Schema support. A Standard Schema gives the result its type and
 * checks the provider's output against it; a plain JSON Schema does neither.
 */
export type OutputSchema<T> = JsonSchema | StandardSchemaWithJSON<unknown, T>;

/** The JSON Schema dialects Fieldwork asks a Standard Schema for. */
export type SchemaTarget = "draft-07" | "draft-2020-12";

const isStandard = (
  schema: OutputSchema<unknown>
): schema is StandardSchemaWithJSON => "~standard" in schema;

/**
 * The JSON Schema to send to a provider. A plain JSON Schema passes through as
 * given; a Standard Schema is converted to `target`, without its `$schema` key,
 * because the provider's docs, not the library, say which dialect it reads.
 *
 * Throws `InvalidRequest`, with the library's error as `cause`, when the
 * library cannot write the schema as `target`.
 */
export const jsonSchemaOf = (
  schema: OutputSchema<unknown>,
  target: SchemaTarget = "draft-2020-12"
): JsonSchema => {
  if (!isStandard(schema)) {
    return schema;
  }
  try {
    const converted = schema["~standard"].jsonSchema.input({ target });
    return Object.fromEntries(
      Object.entries(converted).filter(([key]) => key !== "$schema")
    );
  } catch (error) {
    throw new FieldworkError(
      "InvalidRequest",
      `the ${schema["~standard"].vendor} schema cannot be written as ${target} JSON Schema: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
};

const MAX_ISSUES = 3;

const pathOf = (issue: StandardSchemaIssue): string => {
  const segments = (issue.path ?? []).map((segment) =>
    String(segment instanceof Object ? segment.key : segment)
  );
  return segments.length > 0 ? segments.join(".") : "(root)";
};

const describeIssues = (issues: readonly StandardSchemaIssue[]): string => {
  const shown = issues
    .slice(0, MAX_ISSUES)
    .map((issue) => `${pathOf(issue)}: ${issue.message}`);
  const more = issues.length - shown.length;
  return `${shown.join("; ")}${more > 0 ? `; and ${more} more` : ""}`;
};

/** Where a structured output came from, for the error when it does not match. */
export interface OutputContext {
  provider: string;
  /** Set when the call was a job, so the caller can resume it. */
  jobId?: string;
}

/**
 * The provider's structured output as the caller's type. A Standard Schema
 * checks it and throws `ProviderError` listing the first three issues with
 * their paths, not `retryable` and carrying the context's `jobId`; the value
 * returned is the schema's own output, so transforms and defaults apply. A
 * plain JSON Schema, or no schema, leaves it unchecked.
 */
export const checkOutput = async <T>(
  schema: OutputSchema<T> | undefined,
  value: unknown,
  context: OutputContext
): Promise<T> => {
  if (schema === undefined || !isStandard(schema)) {
    // SAFETY: a plain JSON Schema cannot validate; T comes from the caller's type argument and the output is unchecked.
    return value as T;
  }
  const result = await schema["~standard"].validate(value);
  if (result.issues !== undefined) {
    throw new FieldworkError(
      "ProviderError",
      `${context.provider} returned output that does not match the schema: ${describeIssues(result.issues)}`,
      {
        cause: result.issues,
        jobId: context.jobId,
        provider: context.provider,
        retryable: false,
      }
    );
  }
  return result.value;
};
