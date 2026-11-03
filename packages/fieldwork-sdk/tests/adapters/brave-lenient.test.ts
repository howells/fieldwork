import { describe, expect, it } from "vitest";

import { brave } from "../../src/adapters/brave.js";
import { Fieldwork } from "../../src/index.js";
import { fakeFetch } from "../helpers.js";

const setup = (...replies: Parameters<typeof fakeFetch>) => {
  const { fetch } = fakeFetch(...replies);
  return new Fieldwork({
    adapter: brave({ apiKey: "k", fetch, retries: 0 }),
  });
};

const chunk = (content: string | number) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`;

describe("brave adapter with a response of the wrong shape", () => {
  it("omits a field of the wrong type and keeps the call working", async () => {
    const body = {
      discussions: "none",
      locations: {
        results: [
          {
            coordinates: ["north", 3],
            rating: { ratingValue: "high", reviewCount: 7 },
            title: "Oak Supply",
            url: "https://oak.test",
          },
        ],
      },
      news: [],
      query: { altered: 3, show_strict_warning: "yes" },
      web: {
        results: [
          {
            description: ["not a string"],
            extra_snippets: ["kept", 5, ""],
            meta_url: null,
            thumbnail: "https://imgs.test/t",
            title: 5,
            url: "https://a.test/oak",
          },
          "not an object",
          { description: "no url" },
        ],
      },
    };
    const response = await setup({ body }).search("oak");
    expect(response.results).toStrictEqual([
      { kind: "web", snippet: "kept", url: "https://a.test/oak" },
      {
        kind: "place",
        place: { longitude: 3 },
        reviewCount: 7,
        title: "Oak Supply",
        url: "https://oak.test",
      },
    ]);
    expect(response.meta).toBeUndefined();
    expect(response.raw).toStrictEqual(body);
  });

  it("returns no results for a body that is not an object, and keeps it in raw", async () => {
    const response = await setup({ body: [1, 2] }).search("oak");
    expect(response.results).toStrictEqual([]);
    expect(response.raw).toStrictEqual([1, 2]);
  });

  it("counts an image item of the wrong type as one without an image URL", async () => {
    const body = {
      query: "oak",
      results: [
        { properties: { height: "tall", url: "https://a.test/o.jpg" } },
        { properties: { url: 5 } },
        7,
      ],
    };
    const response = await setup({ body }).images("oak");
    expect(response.results).toStrictEqual([{ url: "https://a.test/o.jpg" }]);
    expect(response.meta?.warnings).toStrictEqual([
      "2 results had no image URL and were left out",
    ]);
    expect(response.raw).toStrictEqual(body);
  });

  it("reads LLM context whose sources are of the wrong type", async () => {
    const body = {
      grounding: {
        generic: [
          {
            snippets: ["one", 2, "", "three"],
            title: "Oak",
            url: "https://a.test",
          },
        ],
        poi: "none",
      },
      sources: { "https://a.test": "bad" },
    };
    const response = await setup({ body }).search("oak", { content: true });
    expect(response.results).toStrictEqual([
      {
        content: "one\n\nthree",
        kind: "web",
        title: "Oak",
        url: "https://a.test",
      },
    ]);
  });

  it("reads an answer whose usage numbers are strings", async () => {
    const body = [
      chunk("Yes."),
      chunk(5),
      chunk(
        `<usage>${JSON.stringify({ "X-Request-Queries": 2, "X-Request-Total-Cost": "free" })}</usage>`
      ),
      "data: [DONE]",
    ].join("\n\n");
    const response = await setup({ text: body }).answer("q");
    expect(response.answer).toBe("Yes.");
    expect(response.meta).toStrictEqual({ usage: { units: { queries: 2 } } });
  });
});
