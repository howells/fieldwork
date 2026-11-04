// Validates a model's tool input against the schemas the tools advertise, with
// messages the model can act on.

import type { FieldSchema } from "../tool-specs/schema.js";
import { isFlag, isJsonObject, isList, isNumber, isText } from "./json.js";
import type { JsonObject, JsonValue } from "./json.js";

/** The shape only: 2026-02-31 passes and is the provider's to refuse. */
const DATE = /^\d{4}-\d{2}-\d{2}$/u;

type Check = (
  schema: FieldSchema,
  value: JsonValue,
  name: string
) => string | undefined;

const textProblem = (
  schema: FieldSchema,
  value: string,
  name: string
): string | undefined => {
  if (value === "") {
    return `${name} must not be empty`;
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    return `${name} must be one of ${schema.enum.join(", ")}`;
  }
  if (schema.format === "uri" && !URL.canParse(value)) {
    return `${name} must be a full URL, including https://`;
  }
  if (schema.format === "date" && !DATE.test(value)) {
    return `${name} must be a date as YYYY-MM-DD`;
  }
  if (
    schema.pattern !== undefined &&
    !new RegExp(schema.pattern, "u").test(value)
  ) {
    return `${name} must match the pattern ${schema.pattern}`;
  }
  return undefined;
};

const range = (schema: FieldSchema): string => {
  const { maximum, minimum } = schema;
  if (minimum !== undefined && maximum !== undefined) {
    return ` from ${minimum} to ${maximum}`;
  }
  if (minimum !== undefined) {
    return ` of at least ${minimum}`;
  }
  return maximum === undefined ? "" : ` of at most ${maximum}`;
};

const numberMessage = (schema: FieldSchema, name: string): string =>
  `${name} must be a ${schema.type === "integer" ? "whole number" : "number"}${range(schema)}`;

const numberProblem = (
  schema: FieldSchema,
  value: number,
  name: string
): string | undefined => {
  const outside =
    (schema.minimum !== undefined && value < schema.minimum) ||
    (schema.maximum !== undefined && value > schema.maximum);
  return (schema.type === "integer" && !Number.isInteger(value)) || outside
    ? numberMessage(schema, name)
    : undefined;
};

const listProblem = (
  schema: FieldSchema,
  value: JsonValue[],
  name: string,
  check: Check
): string | undefined => {
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    return `${name} needs at least ${schema.minItems} item${schema.minItems === 1 ? "" : "s"}`;
  }
  const { items } = schema;
  if (items === undefined) {
    return undefined;
  }
  for (const [index, item] of value.entries()) {
    const found = check(items, item, `${name}[${index}]`);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
};

const objectProblem = (
  schema: FieldSchema,
  value: JsonObject,
  name: string,
  check: Check
): string | undefined => {
  const properties = schema.properties ?? {};
  const missing = (schema.required ?? []).find(
    (key) => value[key] === undefined
  );
  if (missing !== undefined) {
    return `${name} needs ${missing}`;
  }
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) {
      continue;
    }
    const own = properties[key];
    const { additionalProperties: extra } = schema;
    if (own === undefined && extra === false) {
      return `${name} has ${key}, which is not allowed; the keys are ${Object.keys(properties).join(", ")}`;
    }
    const against =
      own ?? (extra === true || extra === false ? undefined : extra);
    const found =
      against === undefined
        ? undefined
        : check(against, item, `${name}.${key}`);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
};

const typeProblem = (
  schema: FieldSchema,
  value: JsonValue,
  name: string,
  check: Check
): string | undefined => {
  const { type } = schema;
  if (type === "string") {
    return isText(value)
      ? textProblem(schema, value, name)
      : `${name} must be a string`;
  }
  if (type === "integer" || type === "number") {
    return isNumber(value)
      ? numberProblem(schema, value, name)
      : numberMessage(schema, name);
  }
  if (type === "boolean") {
    return isFlag(value) ? undefined : `${name} must be true or false`;
  }
  if (type === "array") {
    return isList(value)
      ? listProblem(schema, value, name, check)
      : `${name} must be a list`;
  }
  if (type === "object") {
    return isJsonObject(value)
      ? objectProblem(schema, value, name, check)
      : `${name} must be a JSON object`;
  }
  return undefined;
};

/**
 * What is wrong with `value` as `name`, in full ("limit must be a whole
 * number from 1 to 20"), or nothing. Checks only the keywords `FieldSchema`
 * has. A string must not be empty, and a schema with no `type` accepts any
 * value. With `oneOf`, one option that passes is enough.
 */
export const problem: Check = (schema, value, name) => {
  if (schema.oneOf !== undefined) {
    const problems = schema.oneOf.map((option) => problem(option, value, name));
    return problems.includes(undefined)
      ? undefined
      : `${name} matches none of the allowed forms: ${problems.join("; ")}`;
  }
  return typeProblem(schema, value, name, problem);
};
