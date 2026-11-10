import { describe, expect, it } from "vitest";

import { perplexity } from "../../src/adapters/perplexity.js";
import { Fieldwork } from "../../src/index.js";
import { fakeFetch } from "../helpers.js";

const setup = (...replies: Parameters<typeof fakeFetch>) => {
  const { fetch } = fakeFetch(...replies);
  return new Fieldwork({
    adapter: perplexity({ apiKey: "k", fetch, retries: 0 }),
  });
};

describe("perplexity adapter with a response of the wrong shape", () => {
  it("omits a search field of the wrong type and keeps the call working", async () => {
    const body = {
      id: 7,
      results: [
        { date: 2026, snippet: ["x"], title: "Oak", url: "https://a.test" },
        "not an object",
      ],
    };
    const response = await setup({ body }).search("oak");
    expect(response.results).toStrictEqual([
      { title: "Oak", url: "https://a.test" },
      { url: "" },
    ]);
    expect(response.meta).toStrictEqual({ requestId: "7" });
    expect(response.raw).toStrictEqual(body);
  });

  it("returns no results for a body that is not an object, and keeps it in raw", async () => {
    const response = await setup({ body: [1, 2] }).search("oak");
    expect(response.results).toStrictEqual([]);
    expect(response.raw).toStrictEqual([1, 2]);
  });

  it("reads an answer whose annotations, usage and id are of the wrong type", async () => {
    const body = {
      id: 5,
      output: [
        {
          content: [
            {
              annotations: [
                {
                  excerpts: "one",
                  title: 3,
                  type: "url_citation",
                  url: "https://a.test",
                },
                { type: 9, url: "https://b.test" },
                "bad",
              ],
              text: "Yes.",
            },
            "bad",
          ],
          type: "message",
        },
        "bad",
      ],
      status: "completed",
      usage: { input_tokens: "many", output_tokens: 4 },
    };
    const response = await setup({ body }).answer("q");
    expect(response.answer).toBe("Yes.");
    expect(response.citations).toStrictEqual([
      { excerpts: ["one"], url: "https://a.test" },
    ]);
    expect(response.continuationId).toBeUndefined();
    expect(response.meta).toStrictEqual({
      requestId: "5",
      usage: { units: { outputTokens: 4 } },
    });
    expect(response.raw).toStrictEqual(body);
  });

  it("raises a provider error with the raw body when the answer has no text", async () => {
    await expect(
      setup({ body: { error: { message: 5 }, status: "failed" } }).answer("q")
    ).rejects.toMatchObject({
      cause: { error: { message: 5 }, status: "failed" },
      code: "ProviderError",
    });
  });

  it("reads decisions whose probabilities are of the wrong type", async () => {
    const body = {
      answers: {
        mood: {
          choice: 4,
          probabilities: { mixed: 0.6, negative: "low" },
          type: "choice",
        },
        odd: "none",
      },
      usage: "free",
    };
    const response = await setup({ body }).decide("review", {
      mood: {
        choices: ["mixed", "negative"],
        question: "Mood?",
        type: "choice",
      },
    });
    expect(response.answers).toStrictEqual({
      mood: { choice: "mixed", probabilities: { mixed: 0.6 } },
    });
    expect(response.meta).toBeUndefined();
  });
});
