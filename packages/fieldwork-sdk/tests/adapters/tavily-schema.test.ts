import { describe, expect, it } from "vitest";
import * as z from "zod";

import { tavily } from "../../src/adapters/tavily.js";
import { Fieldwork } from "../../src/index.js";
import { jsonSchemaOf } from "../../src/schema.js";
import type { JsonSchema } from "../../src/types.js";
import { fakeFetch, nth } from "../helpers.js";

const property = (value: JsonSchema): JsonSchema => ({ properties: { value } });
const cases: { schema: JsonSchema; path: string }[] = [
  ...["boolean", "null", "unknown", ["string", "null"]].map((type) => ({
    path: "schema.properties.value.type",
    schema: property({ description: "Value", type }),
  })),
  {
    path: "schema.properties.value.type",
    schema: property({ description: "Value" }),
  },
  {
    path: "schema.properties.value.description",
    schema: property({ type: "string" }),
  },
  {
    path: "schema.properties.value.description",
    schema: property({ description: 1, type: "string" }),
  },
  { path: "schema.properties", schema: { type: "object" } },
  { path: "schema.properties", schema: { properties: [] } },
  { path: "schema.properties.value", schema: { properties: { value: true } } },
  {
    path: "schema.properties.value.properties",
    schema: property({ description: "Value", type: "object" }),
  },
  {
    path: "schema.properties.value.items",
    schema: property({ description: "Value", type: "array" }),
  },
  {
    path: "schema.properties.value.items",
    schema: property({
      description: "Value",
      items: [{ type: "string" }],
      type: "array",
    }),
  },
  {
    path: "schema.properties.value.items.type",
    schema: property({
      description: "Value",
      items: { type: "boolean" },
      type: "array",
    }),
  },
  {
    path: "schema.properties.value.items.properties.nested.description",
    schema: property({
      description: "Value",
      items: { properties: { nested: { type: "string" } }, type: "object" },
      type: "array",
    }),
  },
  {
    path: "schema.required",
    schema: {
      ...property({ description: "Value", type: "string" }),
      required: [],
    },
  },
  {
    path: "schema.required",
    schema: {
      ...property({ description: "Value", type: "string" }),
      required: ["missing"],
    },
  },
  {
    path: "schema.required",
    schema: {
      ...property({ description: "Value", type: "string" }),
      required: "value",
    },
  },
  ...["anyOf", "oneOf", "allOf", "$ref", "enum", "additionalProperties"].map(
    (key) => ({
      path: `schema.properties.value.${key}`,
      schema: property({ description: "Value", [key]: [], type: "string" }),
    })
  ),
];

describe("Tavily research output_schema", () => {
  it.each(cases)("refuses $path before sending", async ({ schema, path }) => {
    const { calls, fetch } = fakeFetch();
    const web = new Fieldwork({
      adapter: tavily({ apiKey: "fake", fetch, retries: 0 }),
    });
    const original = structuredClone(schema);
    await expect(web.research("Question", { schema })).rejects.toMatchObject({
      code: "InvalidRequest",
      message: expect.stringContaining(path),
      provider: "tavily",
    });
    expect(calls).toHaveLength(0);
    expect(schema).toStrictEqual(original);
  });

  it("sends the documented recursive subset unchanged, including undescribed array items", async () => {
    const schema = {
      properties: {
        company: { description: "The company", type: "string" },
        financials: {
          description: "Financial details",
          properties: {
            count: { description: "Count", type: "integer" },
            income: { description: "Income", type: "number" },
          },
          type: "object",
        },
        metrics: {
          description: "Metrics",
          items: { type: "string" },
          type: "array",
        },
      },
      required: ["company"],
    };
    const { fetch, calls } = fakeFetch(
      { body: { request_id: "job" } },
      { body: { content: {}, sources: [], status: "completed" } }
    );
    const web = new Fieldwork({
      adapter: tavily({ apiKey: "fake", fetch, retries: 0 }),
    });
    const original = structuredClone(schema);
    await web.research("Question", { interval: 1, schema });
    expect(nth(calls, 0).body).toMatchObject({ output_schema: original });
    expect(schema).toStrictEqual(original);
    expect(jsonSchemaOf(schema, "draft-2020-12", "tavily")).toBe(schema);
  });

  it("checks converted Standard Schemas in the same conversion path", () => {
    expect(() =>
      jsonSchemaOf(
        z.object({ value: z.boolean().describe("Value") }),
        "draft-2020-12",
        "tavily"
      )
    ).toThrow(
      expect.objectContaining({
        code: "InvalidRequest",
        message: expect.stringContaining("schema.properties.value.type"),
        provider: "tavily",
      })
    );
  });
});
