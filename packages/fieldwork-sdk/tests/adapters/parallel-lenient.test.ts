import { describe, expect, it } from "vitest";

import { parallel } from "../../src/adapters/parallel.js";
import { Fieldwork } from "../../src/index.js";
import { fakeFetch } from "../helpers.js";

const setup = (...replies: Parameters<typeof fakeFetch>) => {
  const { fetch } = fakeFetch(...replies);
  return new Fieldwork({
    adapter: parallel({ apiKey: "k", fetch, retries: 0 }),
  });
};

describe("parallel adapter with a response of the wrong shape", () => {
  it("omits a search field of the wrong type and keeps the call working", async () => {
    const body = {
      results: [
        {
          excerpts: ["one", 2, "three"],
          publish_date: 5,
          title: ["x"],
          url: "https://a.test",
        },
        "not an object",
      ],
      search_id: 12,
      usage: [
        { count: "many", name: "sku_search" },
        { count: 2, name: "sku_search" },
        7,
      ],
      warnings: [{ message: "slow" }, 3],
    };
    const response = await setup({ body }).search("oak");
    expect(response.results).toStrictEqual([
      { snippet: "one … three", url: "https://a.test" },
      { url: "" },
    ]);
    expect(response.meta).toStrictEqual({
      requestId: "12",
      usage: { units: { sku_search: 2 } },
      warnings: ["slow"],
    });
    expect(response.raw).toStrictEqual(body);
  });

  it("returns no results for a body that is not an object, and keeps it in raw", async () => {
    const response = await setup({ body: "oops" }).search("oak");
    expect(response.results).toStrictEqual([]);
    expect(response.raw).toBe("oops");
  });

  it("keeps each extracted page's own entry in raw", async () => {
    const entry = {
      excerpts: ["a", 1],
      full_content: 9,
      url: "https://a.test",
    };
    const response = await setup({
      body: {
        errors: [
          { error_type: "fetch", http_status_code: "x", url: "https://b.test" },
          "bad",
        ],
        extract_id: 5,
        results: [entry, "bad"],
      },
    }).readMany(["https://a.test", "https://b.test"]);
    expect(response.pages).toStrictEqual([
      { excerpts: ["a"], raw: entry, url: "https://a.test" },
      { raw: "bad", url: "" },
    ]);
    expect(response.failed).toStrictEqual([
      { error: "fetch", url: "https://b.test" },
      { error: "error", url: "" },
    ]);
    expect(response.id).toBeUndefined();
  });

  it("reads an answer whose annotations and usage are of the wrong type", async () => {
    const body = {
      id: 3,
      output: [
        {
          content: [
            {
              annotations: [
                { type: "url_citation", url: "https://a.test" },
                { type: "file", url: "https://b.test" },
                "bad",
              ],
              text: "Yes.",
              type: "output_text",
            },
            { text: 4, type: "output_text" },
          ],
          type: "message",
        },
      ],
      usage: { input_tokens: "many", output_tokens: 2 },
    };
    const response = await setup({ body }).answer("q");
    expect(response.answer).toBe("Yes.");
    expect(response.citations).toStrictEqual([{ url: "https://a.test" }]);
    expect(response.continuationId).toBeUndefined();
    expect(response.meta).toStrictEqual({
      requestId: "3",
      usage: { units: { output_tokens: 2 } },
    });
  });

  it("reads a monitor whose fields are of the wrong type and keeps its entry in raw", async () => {
    const body = { monitor_id: 8, settings: "none", status: ["on"] };
    const monitors = await setup({
      body: { monitors: [body], next_cursor: 4 },
    }).monitor.list();
    expect(monitors[0]).toStrictEqual({ id: "8", raw: body });
  });

  it("reports a task run without an id as a provider error carrying the value as it arrived", async () => {
    await expect(
      setup({ body: { run_id: ["r"] } }).research("q")
    ).rejects.toMatchObject({ cause: ["r"], code: "ProviderError" });
  });
});
