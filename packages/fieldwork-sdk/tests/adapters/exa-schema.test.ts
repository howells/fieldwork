import { describe, expect, it } from "vitest";

import { exa } from "../../src/adapters/exa.js";
import { Fieldwork } from "../../src/index.js";
import { fakeFetch } from "../helpers.js";

describe("Exa extraction schemas", () => {
  it("refuses nullable type arrays before sending", async () => {
    const { fetch, calls } = fakeFetch();
    const web = new Fieldwork({
      adapter: exa({ apiKey: "fake", fetch, retries: 0 }),
    });
    await expect(
      web.extract("https://a.test", {
        schema: {
          properties: { sku: { type: ["string", "null"] } },
          type: "object",
        },
      })
    ).rejects.toMatchObject({
      code: "InvalidRequest",
      message: expect.stringContaining("schema.properties.sku.type"),
    });
    expect(calls).toHaveLength(0);
  });
});
