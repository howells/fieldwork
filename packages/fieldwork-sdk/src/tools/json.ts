/**
 * The JSON values that cross the tool boundary: what a model sends in, what a
 * tool sends back. Tools take and return these types, and the guards below are
 * the one place untyped data becomes one of them.
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | JsonObject;

export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

export const isText = (value: JsonValue | undefined): value is string =>
  typeof value === "string";

export const isNumber = (value: JsonValue | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const isFlag = (value: JsonValue | undefined): value is boolean =>
  typeof value === "boolean";

export const isList = (value: JsonValue | undefined): value is JsonValue[] =>
  Array.isArray(value);

/** Narrows anything, such as a value a transport hands over, to a JSON object. */
export const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);
