// Builders for the schemas of tool inputs and outputs, in the subset
// `FieldSchema` names.

/**
 * The JSON Schema keywords the tools use. Tool inputs are checked against
 * this subset, and the same objects are advertised to clients.
 */
export interface FieldSchema {
  additionalProperties?: boolean | FieldSchema;
  description?: string;
  enum?: readonly string[];
  format?: "date" | "uri";
  items?: FieldSchema;
  maximum?: number;
  minimum?: number;
  minItems?: number;
  oneOf?: readonly FieldSchema[];
  pattern?: string;
  properties?: Readonly<Record<string, FieldSchema>>;
  required?: readonly string[];
  type?: "array" | "boolean" | "integer" | "number" | "object" | "string";
}

const described = (
  schema: FieldSchema,
  description: string | undefined
): FieldSchema =>
  description === undefined ? schema : { ...schema, description };

/** A string, with any extra keywords such as `pattern`. */
export const text = (
  description: string,
  extra: FieldSchema = {}
): FieldSchema => ({ ...extra, description, type: "string" });

/** A string that must parse as a full URL. */
export const url = (description: string): FieldSchema =>
  text(description, { format: "uri" });

/** A string in the form YYYY-MM-DD. */
export const date = (description: string): FieldSchema =>
  text(description, { format: "date" });

/** A string that is one of `values`. */
export const choice = (
  description: string,
  values: readonly string[]
): FieldSchema => text(description, { enum: values });

/** An integer from `minimum`, up to `maximum` when given. */
export const whole = (
  description: string,
  minimum: number,
  maximum?: number
): FieldSchema =>
  maximum === undefined
    ? { description, minimum, type: "integer" }
    : { description, maximum, minimum, type: "integer" };

/** Any number. */
export const number = (description?: string): FieldSchema =>
  described({ type: "number" }, description);

/** A boolean. */
export const flag = (description?: string): FieldSchema =>
  described({ type: "boolean" }, description);

/** An array of `items`, with any extra keywords such as `minItems`. */
export const list = (
  items: FieldSchema,
  description?: string,
  extra: FieldSchema = {}
): FieldSchema => described({ ...extra, items, type: "array" }, description);

/** An array of strings. */
export const texts = (description?: string): FieldSchema =>
  list({ type: "string" }, description);

/** An object with the given properties; `required` lists the keys that must be present. Other keys are allowed. */
export const object = (
  properties: Readonly<Record<string, FieldSchema>>,
  required: readonly string[] = [],
  description?: string
): FieldSchema =>
  described(
    required.length === 0
      ? { properties, type: "object" }
      : { properties, required, type: "object" },
    description
  );

/** An object whose keys the caller chooses and whose values share a schema. */
export const keyed = (values: FieldSchema, description?: string): FieldSchema =>
  described({ additionalProperties: values, type: "object" }, description);

/** Any JSON value. */
export const anything = (description?: string): FieldSchema =>
  described({}, description);

/** A bare string, for properties that need no description. */
export const str: FieldSchema = { type: "string" };
