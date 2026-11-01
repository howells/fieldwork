import { describe, expect, it } from "vitest";

import { exa } from "../../src/adapters/exa.js";
import { Fieldwork } from "../../src/index.js";
import { fakeFetch } from "../helpers.js";

const setup = (...replies: Parameters<typeof fakeFetch>) => {
  const { fetch } = fakeFetch(...replies);
  return new Fieldwork({
    adapter: exa({ apiKey: "k", fetch, retries: 0 }),
  });
};

describe("exa adapter with a response of the wrong shape", () => {
  it("omits a search field of the wrong type and keeps the call working", async () => {
    const body = {
      costDollars: { total: "free" },
      notices: [{ message: "slow" }, 5],
      output: { content: { verdict: "yes" } },
      requestId: 9,
      results: [
        {
          highlights: ["one", 2, "three"],
          score: "high",
          title: 5,
          url: "https://a.test/oak",
        },
        "not an object",
      ],
      warnings: "ignored",
    };
    const response = await setup({ body }).search("oak");
    expect(response.results).toStrictEqual([
      { snippet: "one … three", url: "https://a.test/oak" },
      { url: "" },
    ]);
    expect(response.answer).toBe('{"verdict":"yes"}');
    expect(response.meta).toStrictEqual({
      requestId: "9",
      warnings: ["slow"],
    });
    expect(response.raw).toStrictEqual(body);
  });

  it("returns no results for a body that is not an object, and keeps it in raw", async () => {
    const response = await setup({ body: [1, 2] }).search("oak");
    expect(response.results).toStrictEqual([]);
    expect(response.raw).toStrictEqual([1, 2]);
  });

  it("keeps each page's own entry in raw for readMany", async () => {
    const entry = {
      extras: { links: ["a", 3] },
      text: 5,
      url: "https://a.test",
    };
    const response = await setup({
      body: {
        results: [entry, "bad"],
        statuses: [{ id: "https://b.test", status: 7 }],
      },
    }).readMany(["https://a.test", "https://b.test"]);
    expect(response.pages).toStrictEqual([
      { links: ["a"], raw: entry, url: "https://a.test" },
      { raw: "bad", url: "" },
    ]);
    expect(response.failed).toStrictEqual([
      { error: "unknown", url: "https://b.test" },
    ]);
  });

  it("reads a monitor whose id is a number and raises for one without an id", async () => {
    const created = await setup({
      body: { id: 31, status: ["on"] },
    }).monitor.get("m");
    expect(created.id).toBe("31");
    expect(created.status).toBeUndefined();
    await expect(
      setup({ body: { id: { x: 1 } } }).monitor.get("m")
    ).rejects.toMatchObject({ cause: { x: 1 }, code: "ProviderError" });
  });

  it("reads monitor runs of the wrong shape", async () => {
    const entry = { id: "r1", output: { content: 5 }, status: "failed" };
    const events = await setup({
      body: { data: [entry, "bad"], hasMore: "yes", nextCursor: "c" },
    }).monitor.events("m");
    expect(events.next).toBeUndefined();
    expect(events.events).toStrictEqual([
      { id: "r1", output: 5, raw: entry, summary: "Run failed" },
      { raw: "bad" },
    ]);
  });
});
