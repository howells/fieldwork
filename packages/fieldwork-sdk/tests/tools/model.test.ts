import { describe, expect, it } from "vitest";

import { forModel } from "../../src/tools/model.js";

describe("structured cuts", () => {
  it("records every cut with nested array and escaped object paths, including zero shown", () => {
    const page = forModel(
      {
        raw: { text: "d".repeat(900) },
        results: [{ text: "a".repeat(600) }, { text: "b".repeat(700) }],
        values: { "a.b": "c".repeat(800), raw: "kept" },
      },
      100
    );
    expect(page.truncated).toStrictEqual([
      { length: 600, path: "results[0].text", shown: 100 },
      { length: 700, path: "results[1].text", shown: 0 },
      { length: 800, path: 'values["a.b"]', shown: 0 },
    ]);
    expect(page).not.toHaveProperty("raw");
    expect(page.values).toMatchObject({ raw: "kept" });
  });

  it("omits metadata when the budget covers the long text and preserves short text", () => {
    expect(
      forModel({ markdown: "m".repeat(600), title: "t".repeat(500) }, 600)
    ).toStrictEqual({ markdown: "m".repeat(600), title: "t".repeat(500) });
  });
});
