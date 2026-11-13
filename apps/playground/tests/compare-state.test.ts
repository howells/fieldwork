import { describe, expect, it } from "vitest";

import { previewOf } from "@/lib/compare-state";

describe("a read's preview", () => {
  it("drops images and link targets, and keeps headings", () => {
    const markdown = [
      "[Pay in 3 ways with **Klarna**](https://example.com/a)[Free samples](https://example.com/b)",
      "",
      "![Metro White Gloss Tile](https://example.com/tile.jpg)",
      "",
      "![Tile](https://cdn.example.com/filters:upscale():fill(white)/tile.jpg)",
      "",
      "# Metro White Gloss Tile",
      "",
      "£14.50",
    ].join("\n");
    expect(previewOf(markdown)).toStrictEqual([
      { kind: "text", text: "Pay in 3 ways with Klarna Free samples" },
      { kind: "heading", text: "Metro White Gloss Tile" },
      { kind: "text", text: "£14.50" },
    ]);
  });

  it("joins hard-wrapped lines and tidies a link split over a blank line", () => {
    const markdown = [
      "Splashbacks to",
      "complement your kitchen.",
      "",
      "[**HURRY! 10% off**",
      "",
      "ends soon](/trending-now)",
    ].join("\n");
    expect(previewOf(markdown)).toStrictEqual([
      { kind: "text", text: "Splashbacks to complement your kitchen." },
      { kind: "text", text: "HURRY! 10% off" },
      { kind: "text", text: "ends soon" },
    ]);
  });

  it("drops Markdown escapes", () => {
    const markdown = String.raw`\\ 3.8\\ \\ (4)\\ 3.8 out of 5 stars. \[Box\] 10mm Trim.`;
    expect(previewOf(markdown)).toStrictEqual([
      { kind: "text", text: "3.8 (4) 3.8 out of 5 stars. [Box] 10mm Trim." },
    ]);
  });
});
