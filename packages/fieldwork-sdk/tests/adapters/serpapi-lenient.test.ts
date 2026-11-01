import { describe, expect, it } from "vitest";

import { serpapi } from "../../src/adapters/serpapi.js";
import { Fieldwork } from "../../src/index.js";
import { fakeFetch } from "../helpers.js";

const setup = (...replies: Parameters<typeof fakeFetch>) => {
  const { fetch } = fakeFetch(...replies);
  return new Fieldwork({
    adapter: serpapi({ apiKey: "k", fetch, retries: 0 }),
  });
};

describe("serpapi adapter with a response of the wrong shape", () => {
  it("omits a field of the wrong type and keeps the call working", async () => {
    const body = {
      answer_box: "none",
      answer_box_list: [7],
      error: { code: 3 },
      organic_results: [
        {
          date: 2024,
          link: "https://a.test/oak",
          snippet: ["not a string"],
          title: 5,
        },
        "not an object",
        { title: "no link" },
      ],
      search_metadata: { id: ["x"], status: 7 },
    };
    const response = await setup({ body }).search("oak");
    expect(response.results).toStrictEqual([
      { kind: "web", url: "https://a.test/oak" },
    ]);
    expect(response.answer).toBeUndefined();
    expect(response.meta).toBeUndefined();
    expect(response.raw).toStrictEqual(body);
  });

  it("returns no results for a body that is not an object, and keeps it in raw", async () => {
    const response = await setup({ body: [1, 2] }).search("oak");
    expect(response.results).toStrictEqual([]);
    expect(response.raw).toStrictEqual([1, 2]);
  });

  it("reads a request id that is a number and warnings that are mixed", async () => {
    const body = {
      error: ["hush", { message: "soft" }, { detail: "d" }, 3, {}],
      search_metadata: { id: 42, status: "Success" },
    };
    const response = await setup({ body }).search("oak");
    expect(response.meta).toStrictEqual({
      requestId: "42",
      warnings: ["hush", "soft", "d"],
    });
  });

  it("counts a place object with only unknown keys as a single place", async () => {
    const body = {
      local_results: "none",
      place_results: { place_id: "p1", title: "Oak Supply", unknown: true },
    };
    const response = await setup({ body }).search("oak", {
      engine: "google_maps",
    });
    expect(response.results).toHaveLength(1);
  });

  it("reads an image item of the wrong type as one without an image URL", async () => {
    const body = {
      images_results: [
        { original: "https://a.test/o.jpg", original_height: "tall" },
        { original: 5 },
        7,
      ],
    };
    const response = await setup({ body }).images("oak");
    expect(response.results).toStrictEqual([{ url: "https://a.test/o.jpg" }]);
    expect(response.raw).toStrictEqual(body);
  });

  it("reads an account whose numbers are strings and still leaves out the key", async () => {
    const body = {
      api_key: "secret",
      plan_searches_left: "many",
      this_hour_searches: 3,
      this_month_usage: "lots",
    };
    const usage = await setup({ body }).usage();
    expect(usage.breakdown).toStrictEqual({ this_hour_searches: 3 });
    expect(usage.remaining).toBeUndefined();
    expect(usage.used).toBeUndefined();
    expect(usage.raw).toStrictEqual({
      plan_searches_left: "many",
      this_hour_searches: 3,
      this_month_usage: "lots",
    });
  });
});
