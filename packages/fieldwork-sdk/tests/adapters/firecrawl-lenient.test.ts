import { describe, expect, it } from "vitest";

import { firecrawl } from "../../src/adapters/firecrawl.js";
import { Fieldwork } from "../../src/index.js";
import { fakeFetch } from "../helpers.js";

const setup = (...replies: Parameters<typeof fakeFetch>) => {
  const { fetch } = fakeFetch(...replies);
  return new Fieldwork({
    adapter: firecrawl({ apiKey: "k", fetch, retries: 0 }),
  });
};

describe("firecrawl adapter with a response of the wrong shape", () => {
  it("omits a search field of the wrong type and keeps the call working", async () => {
    const body = {
      creditsUsed: "two",
      data: {
        images: "none",
        news: [{ title: 4, url: "https://n.test" }],
        research: [{ paperId: "web:https://p.test", score: "high" }],
        web: [
          { description: ["x"], title: "Oak", url: "https://a.test" },
          "not an object",
        ],
      },
      id: 5,
      warning: ["slow", 7, { a: 1 }],
    };
    const response = await setup({ body }).search("oak");
    expect(response.results).toStrictEqual([
      { kind: "web", title: "Oak", url: "https://a.test" },
      { kind: "web", url: "" },
      { kind: "news", url: "https://n.test" },
      { kind: "research", url: "https://p.test" },
    ]);
    expect(response.images).toBeUndefined();
    expect(response.meta).toStrictEqual({
      requestId: "5",
      warnings: ["slow", "7", "[object Object]"],
    });
    expect(response.raw).toStrictEqual(body);
  });

  it("returns no results for a body that is not an object, and keeps it in raw", async () => {
    const response = await setup({ body: [1, 2] }).search("oak");
    expect(response.results).toStrictEqual([]);
    expect(response.raw).toStrictEqual([1, 2]);
  });

  it("reads a page whose metadata is of the wrong type", async () => {
    const body = {
      data: {
        highlights: ["one", 2],
        links: ["https://l.test", 3],
        markdown: ["not text"],
        metadata: {
          language: ["", "en-GB"],
          statusCode: "200",
          title: [5, "Oak"],
        },
      },
    };
    const page = await setup({ body }).read("https://a.test");
    expect(page).toMatchObject({
      excerpts: ["one"],
      language: "en",
      links: ["https://l.test"],
      title: "Oak",
      url: "https://a.test",
    });
    expect(page.markdown).toBeUndefined();
    expect(page.statusCode).toBeUndefined();
    expect(page.raw).toStrictEqual(body);
  });

  it("keeps each crawled page's own entry in raw", async () => {
    const entry = { markdown: 3, metadata: { sourceURL: "https://a.test/1" } };
    const response = await setup(
      { body: { id: 31 } },
      { body: { data: [entry, "bad"], status: "completed", total: "2" } },
      { body: { errors: "none", robotsBlocked: ["https://r.test", 4] } }
    ).crawl("https://a.test");
    expect(response.pages.map((page) => page.raw)).toStrictEqual([
      entry,
      "bad",
    ]);
    expect(response.pages.map((page) => page.url)).toStrictEqual([
      "https://a.test/1",
      "https://a.test",
    ]);
    expect(response.total).toBeUndefined();
    expect(response.robotsBlocked).toStrictEqual(["https://r.test"]);
  });

  it("raises NotFound for a page whose product is not an object", async () => {
    await expect(
      setup({ body: { data: { product: [1], warning: "gone" } } }).product(
        "https://a.test"
      )
    ).rejects.toMatchObject({ code: "NotFound" });
  });

  it("reads a monitor whose id is a number and a usage report of strings", async () => {
    const monitor = await setup({
      body: { data: { id: 12, schedule: "daily", targets: ["bad"] } },
    }).monitor.get("m");
    expect(monitor.id).toBe("12");
    expect(monitor.watch).toBeUndefined();
    const usage = await setup({
      body: { data: { planCredits: "100", remainingCredits: 40 } },
    }).usage();
    expect(usage.limit).toBeUndefined();
    expect(usage.remaining).toBe(40);
  });
});
