import { describe, expect, it } from "vitest";

import { jsonSchemaOf } from "../src/schema.js";

describe("provider single-type schemas", () => {
  it.each([
    {
      path: "schema.items.type",
      schema: { items: { type: ["string", "null"] } },
    },
    {
      path: "schema.$defs.value.type",
      schema: { $defs: { value: { type: ["number", "null"] } } },
    },
    {
      path: "schema.anyOf[0].type",
      schema: { anyOf: [{ type: ["string", "null"] }] },
    },
  ])("names type arrays at $path", ({ schema, path }) => {
    expect(() => jsonSchemaOf(schema, "draft-07", "exa")).toThrow(
      expect.objectContaining({
        code: "InvalidRequest",
        message: expect.stringContaining(path),
      })
    );
  });

  it("preserves plain schemas and leaves literal type properties alone", () => {
    const schema = {
      const: { type: ["string", "null"] },
      properties: { type: { type: "string" } },
      type: "object",
    };
    expect(jsonSchemaOf(schema, "draft-07", "exa")).toBe(schema);
  });
});
