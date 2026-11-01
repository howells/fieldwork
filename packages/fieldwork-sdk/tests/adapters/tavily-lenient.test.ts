import { describe, expect, it } from "vitest";

import { tavily } from "../../src/adapters/tavily.js";
import { Fieldwork } from "../../src/index.js";
import { fakeFetch } from "../helpers.js";

const setup = (...replies: Parameters<typeof fakeFetch>) => {
  const { fetch } = fakeFetch(...replies);
  return new Fieldwork({
    adapter: tavily({ apiKey: "k", fetch, retries: 0 }),
  });
};

describe("tavily adapter with a response of the wrong shape", () => {
  it("omits a field of the wrong type and keeps the call working", async () => {
    const body = {
      answer: 5,
      images: ["https://a.test/i.jpg", "", 3, { description: "no url" }],
      request_id: 42,
      response_time: "fast",
      results: [
        {
          content: ["not a string"],
          score: "high",
          title: 5,
          url: "https://a.test/oak",
        },
        "not an object",
      ],
      usage: "none",
    };
    const response = await setup({ body }).search("oak");
    expect(response.answer).toBeUndefined();
    expect(response.results).toStrictEqual([
      { url: "https://a.test/oak" },
      { url: "" },
    ]);
    expect(response.images).toStrictEqual([{ url: "https://a.test/i.jpg" }]);
    expect(response.meta).toStrictEqual({ requestId: "42" });
    expect(response.raw).toStrictEqual(body);
  });

  it("returns no results for a body that is not an object, and keeps it in raw", async () => {
    const response = await setup({ body: [1, 2] }).search("oak");
    expect(response.results).toStrictEqual([]);
    expect(response.raw).toStrictEqual([1, 2]);
  });

  it("keeps each crawled page's own entry in raw", async () => {
    const entry = { images: ["a", 2], raw_content: 7, url: "https://a.test" };
    const response = await setup({
      body: { results: [entry, "bad"] },
    }).readMany(["https://a.test", "https://b.test"]);
    expect(response.pages).toStrictEqual([
      { images: ["a"], raw: entry, url: "https://a.test" },
      { raw: "bad", url: "" },
    ]);
  });

  it("reads a usage report whose numbers are strings", async () => {
    const body = {
      account: { plan_limit: "1000", plan_usage: 12, search_usage: "x" },
      key: "none",
    };
    const usage = await setup({ body }).usage();
    expect(usage.limit).toBeUndefined();
    expect(usage.used).toBe(12);
    expect(usage.breakdown).toBeUndefined();
    expect(usage.raw).toStrictEqual(body);
  });

  it("reports a research start without an id as a provider error, not a crash", async () => {
    await expect(
      setup({ body: { request_id: { id: 1 } } }).research("oak")
    ).rejects.toMatchObject({
      cause: { id: 1 },
      code: "ProviderError",
    });
  });
});
