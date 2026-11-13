import { FieldworkError } from "../errors.js";
import type { Spec } from "../tool-specs/types.js";
import type { CallOptions } from "../types.js";
import { refuseTogether } from "../util.js";
import { isJsonObject, isText } from "./json.js";
import type { JsonObject, JsonValue } from "./json.js";

// Finds the method a tool calls on a Fieldwork instance and builds the
// arguments it takes: the positional fields, then one options object.

/** The file `parse` takes, decoded from the tool's base64 input. */
export type DocumentArgument =
  | { data: Uint8Array; name: string }
  | { url: string };

/** The options object: the tool's remaining fields plus the call settings. */
export interface OptionsArgument {
  [key: string]: JsonValue | AbortSignal | undefined;
}

/** One argument of a capability method: a positional value, the `parse` document or the trailing options object. */
export type Argument =
  | JsonValue
  | DocumentArgument
  | OptionsArgument
  | undefined;

/** A capability's method as the adapter's operations are typed for any provider. */
export type Operation = (...args: Argument[]) => Promise<JsonValue | undefined>;

interface Group {
  [method: string]: Operation | undefined;
}

/** A Fieldwork instance as a lookup from capability to method or group of methods. */
export interface Dispatcher {
  readonly [capability: string]: Operation | Group | undefined;
}

// The adapter's own types guarantee the shape of each method; a runtime check
// can only tell a function from an object.
const isOperation = (value: unknown): value is Operation =>
  typeof value === "function";

const isGroup = (value: unknown): value is Group => isJsonObject(value);

/** The method behind a spec, or undefined when the instance lacks it. */
export const operationFor = (
  web: Dispatcher,
  spec: Spec
): Operation | undefined => {
  const entry = web[spec.capability];
  if (spec.method === undefined) {
    return isOperation(entry) ? entry : undefined;
  }
  return isGroup(entry) ? entry[spec.method] : undefined;
};

/** Standard-alphabet base64: no backtracking, so it is linear in the input. */
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/u;

/**
 * The `parse` file from the tool's `name` and base64 `contentBase64`.
 *
 * Throws `InvalidRequest` when either is not a string or the content is not
 * well-formed base64 (standard alphabet, padded to a multiple of 4).
 */
const documentFrom = (
  provider: string,
  values: JsonObject
): DocumentArgument => {
  refuseTogether(provider, values, "url", "contentBase64");
  refuseTogether(provider, values, "url", "name");
  const { contentBase64: content, name, url } = values;
  if (isText(url)) {
    return { url };
  }
  if (!isText(name) || !isText(content)) {
    throw new FieldworkError(
      "InvalidRequest",
      "parse_document needs name and contentBase64, or a public url with llamaparse or reducto"
    );
  }
  if (content.length % 4 !== 0 || !BASE64.test(content)) {
    throw new FieldworkError(
      "InvalidRequest",
      `parse_document: contentBase64 must be standard base64 padded to a multiple of 4 characters${
        content.startsWith("data:") ? "; remove the data: prefix" : ""
      }`
    );
  }
  return {
    data: new Uint8Array(Buffer.from(content, "base64")),
    name,
  };
};

/**
 * The arguments for the spec's method, from validated input and the call
 * settings: the `positional` fields in order, then one options object of the
 * other fields and the call settings (`signal`, `timeout`, `retries`). `parse`
 * is the exception: its source fields become one `DocumentArgument`.
 */
export const argumentsFor = (
  spec: Spec,
  values: JsonObject,
  call: CallOptions,
  provider: string
): Argument[] => {
  const options: OptionsArgument = {
    ...Object.fromEntries(
      Object.entries(values).filter(([key]) => !spec.positional.includes(key))
    ),
    ...call,
  };
  const positional = spec.positional.map((name) => values[name]);
  if (spec.capability === "parse") {
    return [documentFrom(provider, values), options];
  }
  return [...positional, options];
};
