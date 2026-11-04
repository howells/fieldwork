// The JSON values that cross the tool boundary: what a model sends in, what a
// tool sends back. Tools take and return these types, and the guards below are
// the one place untyped data becomes one of them.

/** Any JSON value. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | JsonObject;

/** A JSON object. A key may be undefined, which reads as absent and is not serialized. */
export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

// The four guards below take undefined (an absent key) and answer false for it.

export const isText = (value: JsonValue | undefined): value is string =>
  typeof value === "string";

/** A finite number: JSON has no NaN or Infinity. */
export const isNumber = (value: JsonValue | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const isFlag = (value: JsonValue | undefined): value is boolean =>
  typeof value === "boolean";

export const isList = (value: JsonValue | undefined): value is JsonValue[] =>
  Array.isArray(value);

/** Narrows anything, such as a value a transport hands over, to a JSON object. */
export const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);
