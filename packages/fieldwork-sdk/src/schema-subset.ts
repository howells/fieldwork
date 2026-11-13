import { invalidRequest } from "./errors.js";
import { joinPath } from "./path.js";
import { isJsonObject, isText } from "./tools/json.js";
import type { JsonObject, JsonValue } from "./tools/json.js";
import type { JsonSchema } from "./types.js";

export type SchemaSubset = "exa" | "tavily";
type Path = readonly (string | number)[];

const MAPS = new Set([
  "properties",
  "patternProperties",
  "$defs",
  "definitions",
  "dependentSchemas",
]);
const CHILDREN = new Set([
  "items",
  "additionalItems",
  "additionalProperties",
  "contains",
  "not",
  "if",
  "then",
  "else",
  "propertyNames",
  "unevaluatedProperties",
  "unevaluatedItems",
]);
const LISTS = new Set(["allOf", "anyOf", "oneOf", "prefixItems"]);

const refuse = (provider: SchemaSubset, path: Path, message: string): never => {
  throw invalidRequest(provider, `${joinPath(path)}: ${message}`);
};

// Only schema-bearing keywords are visited: enum, const and default are data.
const exaSchema = (
  value: JsonSchema | JsonValue | undefined,
  path: Path
): void => {
  if (!isJsonObject(value)) {
    return;
  }
  if (Array.isArray(value.type)) {
    refuse(
      "exa",
      [...path, "type"],
      "JSON Schema type arrays are not supported; use a single type. Fieldwork will not remove null from the caller's schema"
    );
  }
  for (const [key, child] of Object.entries(value)) {
    const next = [...path, key];
    if (MAPS.has(key) && isJsonObject(child)) {
      for (const [name, entry] of Object.entries(child)) {
        exaSchema(entry, [...next, name]);
      }
    } else if ((LISTS.has(key) || key === "items") && Array.isArray(child)) {
      for (const [index, entry] of child.entries()) {
        exaSchema(entry, [...next, index]);
      }
    } else if (CHILDREN.has(key)) {
      exaSchema(child, next);
    }
  }
};

const TYPES = new Set(["object", "string", "integer", "number", "array"]);
type Kind = "root" | "property" | "item";

const tavilyType = (node: JsonObject, path: Path, kind: Kind): string => {
  const type =
    kind === "root" && node.type === undefined ? "object" : node.type;
  if (
    !isText(type) ||
    !TYPES.has(type) ||
    (kind === "root" && type !== "object")
  ) {
    return refuse(
      "tavily",
      [...path, "type"],
      "must be object, string, integer, number or array (object at the root)"
    );
  }
  if (
    (kind === "property" || node.description !== undefined) &&
    !isText(node.description)
  ) {
    return refuse(
      "tavily",
      [...path, "description"],
      "must be a string on every property"
    );
  }
  const allowed = new Set([
    "type",
    "description",
    ...(type === "object" ? ["properties", "required"] : []),
    ...(type === "array" ? ["items"] : []),
  ]);
  for (const key of Object.keys(node)) {
    if (!allowed.has(key)) {
      refuse(
        "tavily",
        [...path, key],
        "is not supported by research output_schema"
      );
    }
  }
  return type;
};

const requiredNames = (
  required: JsonValue | undefined,
  properties: JsonObject,
  path: Path
): void => {
  if (required === undefined) {
    return;
  }
  if (
    !Array.isArray(required) ||
    required.length === 0 ||
    required.some((key) => !isText(key) || !Object.hasOwn(properties, key))
  ) {
    refuse(
      "tavily",
      [...path, "required"],
      "must be a nonempty array of names from properties"
    );
  }
};

// Properties need descriptions; array items need a type but no description,
// as in Tavily's documented request example.
const tavilySchema = (
  value: JsonSchema | JsonValue | undefined,
  path: Path,
  kind: Kind
): void => {
  if (!isJsonObject(value)) {
    return refuse("tavily", path, "must be a schema object");
  }
  const type = tavilyType(value, path, kind);
  if (type === "object") {
    const { properties } = value;
    if (!isJsonObject(properties)) {
      return refuse(
        "tavily",
        [...path, "properties"],
        "must be an object for an object schema"
      );
    }
    for (const [key, child] of Object.entries(properties)) {
      tavilySchema(child, [...path, "properties", key], "property");
    }
    requiredNames(value.required, properties, path);
  } else if (type === "array") {
    tavilySchema(value.items, [...path, "items"], "item");
  }
};

/** Validates the provider's documented or observed subset without rewriting it. */
export const checkSchemaSubset = (
  schema: JsonSchema,
  provider: SchemaSubset
): JsonSchema => {
  if (provider === "exa") {
    exaSchema(schema, ["schema"]);
  } else {
    tavilySchema(schema, ["schema"], "root");
  }
  return schema;
};
