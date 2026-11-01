import { describe, expect, it } from "vitest";

import { perplexity } from "../../src/adapters/perplexity.js";
import { Fieldwork } from "../../src/index.js";
import type { DecisionQuestion } from "../../src/types.js";
import { fakeFetch, nth } from "../helpers.js";

const schema = {
  properties: { sku: { type: "string" } },
  required: ["sku"],
  type: "object",
};
const url =
  "https://www.tilebar.com/product/portmore-aqua-3x8-glazed-ceramic-tile.html";

const client = (...replies: Parameters<typeof fakeFetch>) => {
  const { fetch, calls } = fakeFetch(...replies);
  return {
    calls,
    web: new Fieldwork({
      adapter: perplexity({ apiKey: "k", fetch, retries: 0 }),
    }),
  };
};

const message = (value: string, annotations: unknown[] = []) => ({
  content: [{ annotations, text: value, type: "output_text" }],
  type: "message",
});

describe("perplexity search", () => {
  it("sends Perplexity's field names, dates as MM/DD/YYYY and a bearer key", async () => {
    const { web, calls } = client({ body: { id: "s1", results: [] } });
    await web.search("tile", {
      country: "GB",
      includeDomains: ["tilebar.com"],
      language: ["EN", "fr"],
      lastUpdatedAfter: "2026-02-01",
      lastUpdatedBefore: "2026-02-28",
      limit: 5,
      maxTokens: 2000,
      maxTokensPerPage: 500,
      publishedAfter: "2026-01-31",
      publishedBefore: "2026-03-01",
      queries: ["porcelain tile", "ceramic tile"],
      recency: "month",
      searchType: "fast",
    });
    expect(nth(calls, 0).method).toBe("POST");
    expect(nth(calls, 0).url.pathname).toBe("/search");
    expect(nth(calls, 0).headers.authorization).toBe("Bearer k");
    expect(nth(calls, 0).body).toStrictEqual({
      country: "GB",
      last_updated_after_filter: "02/01/2026",
      last_updated_before_filter: "02/28/2026",
      max_results: 5,
      max_tokens: 2000,
      max_tokens_per_page: 500,
      query: ["tile", "porcelain tile", "ceramic tile"],
      search_after_date_filter: "01/31/2026",
      search_before_date_filter: "03/01/2026",
      search_domain_filter: ["tilebar.com"],
      search_language_filter: ["en", "fr"],
      search_recency_filter: "month",
      search_type: "fast",
    });
  });

  it("sends a single query as a string and one language as a list", async () => {
    const { web, calls } = client({ body: { id: "s1", results: [] } });
    await web.search("tile", { language: "de" });
    expect(nth(calls, 0).body).toStrictEqual({
      query: "tile",
      search_language_filter: ["de"],
    });
  });

  it("prefixes excluded domains with a minus", async () => {
    const { web, calls } = client({ body: { id: "s1", results: [] } });
    await web.search("tile", {
      excludeDomains: ["pinterest.com", "reddit.com"],
    });
    expect(nth(calls, 0).body).toMatchObject({
      search_domain_filter: ["-pinterest.com", "-reddit.com"],
    });
  });

  it("splits date and last_updated and reports the request id", async () => {
    const { web } = client({
      body: {
        id: "e38104d5",
        results: [
          {
            date: "2026-02-01",
            last_updated: "2026-05-21",
            snippet: "s",
            title: "A",
            url: "https://a.test",
          },
          { date: null, snippet: "", title: "B", url: "https://b.test" },
        ],
        server_time: null,
      },
    });
    const response = await web.search("tile");
    expect(response.results).toStrictEqual([
      {
        lastUpdatedAt: "2026-05-21",
        publishedAt: "2026-02-01",
        snippet: "s",
        title: "A",
        url: "https://a.test",
      },
      { title: "B", url: "https://b.test" },
    ]);
    expect(response.meta).toStrictEqual({ requestId: "e38104d5" });
    expect(response.raw).toMatchObject({ id: "e38104d5" });
  });

  it("refuses include and exclude domains together before sending", async () => {
    const { web, calls } = client();
    await expect(
      web.search("tile", {
        excludeDomains: ["pinterest.com"],
        includeDomains: ["tilebar.com"],
      })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });

  it("refuses more than five queries in all", async () => {
    const { web, calls } = client();
    await expect(
      web.search("a", { queries: ["b", "c", "d", "e", "f"] })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });

  it("allows more than 20 results only for people search", async () => {
    const { web, calls } = client({ body: { id: "s1", results: [] } });
    await expect(web.search("tile", { limit: 30 })).rejects.toMatchObject({
      code: "InvalidRequest",
    });
    await web.search("head of design", { limit: 30, searchType: "people" });
    expect(calls).toHaveLength(1);
    expect(nth(calls, 0).body).toMatchObject({
      max_results: 30,
      search_type: "people",
    });
  });

  it("refuses a date that is not YYYY-MM-DD", async () => {
    const { web } = client();
    await expect(
      web.search("tile", { publishedAfter: "01/31/2026" })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
  });
});

describe("perplexity answer", () => {
  const reply = {
    id: "resp_1",
    output: [
      {
        results: [{ id: 1, title: "X", url: "https://x.test" }],
        type: "search_results",
      },
      message("Porcelain is denser.", [
        {
          end_index: 5,
          start_index: 0,
          title: "A",
          type: "url_citation",
          url: "https://a.test",
        },
        {
          end_index: 9,
          start_index: 6,
          title: "A",
          type: "url_citation",
          url: "https://a.test",
        },
      ]),
    ],
    status: "completed",
    usage: {
      cost: { currency: "USD", total_cost: 0.0042 },
      input_tokens: 100,
      output_tokens: 20,
      total_tokens: 120,
    },
  };

  it("asks the Agent API synchronously at the fast effort", async () => {
    const { web, calls } = client({ body: reply });
    await web.answer("Is porcelain denser than ceramic?");
    expect(nth(calls, 0).method).toBe("POST");
    expect(nth(calls, 0).url.pathname).toBe("/v1/agent");
    expect(nth(calls, 0).body).toStrictEqual({
      effort: "fast",
      input: "Is porcelain denser than ceramic?",
    });
  });

  it("sends schema, instructions, effort and continueFrom in Perplexity's fields", async () => {
    const { web, calls } = client({
      body: { ...reply, output: [message('{"sku":"X1"}')] },
    });
    const answer = await web.answer<{ sku: string }>("SKU?", {
      continueFrom: "resp_0",
      effort: "low@2026-10-24.0",
      instructions: "Be brief.",
      schema,
    });
    expect(nth(calls, 0).body).toStrictEqual({
      effort: "low@2026-10-24.0",
      input: "SKU?",
      instructions: "Be brief.",
      previous_response_id: "resp_0",
      response_format: {
        json_schema: { name: "output", schema },
        type: "json_schema",
      },
    });
    expect(answer.output?.sku).toBe("X1");
  });

  it("returns the cited sources, not everything retrieved, with cost and tokens", async () => {
    const { web } = client({ body: reply });
    const answer = await web.answer("Is porcelain denser than ceramic?");
    expect(answer.answer).toBe("Porcelain is denser.");
    expect(answer.citations).toStrictEqual([
      { title: "A", url: "https://a.test" },
    ]);
    expect(answer.continuationId).toBe("resp_1");
    expect(answer.meta).toStrictEqual({
      requestId: "resp_1",
      usage: {
        costUsd: 0.0042,
        units: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
      },
    });
    expect(answer.raw).toMatchObject({ id: "resp_1" });
  });

  it("warns when the answer stopped early", async () => {
    const { web } = client({ body: { ...reply, status: "incomplete" } });
    const answer = await web.answer("q");
    expect(answer.meta?.warnings).toStrictEqual([
      "perplexity stopped before finishing the answer",
    ]);
  });

  it("throws when the response failed", async () => {
    const { web } = client({
      body: {
        error: { message: "model overloaded", type: "overloaded" },
        id: "resp_2",
        output: [],
        status: "failed",
      },
    });
    await expect(web.answer("q")).rejects.toMatchObject({
      code: "ProviderError",
      retryable: true,
    });
  });
});

describe("perplexity research", () => {
  const done = {
    effort: "high@2026-10-28.0",
    id: "resp_9",
    output: [
      {
        results: [
          { id: 1, snippet: "s", title: "A", url: "https://a.test" },
          { id: 2, snippet: "s", title: "B", url: "https://b.test" },
        ],
        type: "search_results",
      },
      {
        contents: [{ snippet: "SKU", title: "Portmore", url }],
        type: "fetch_url_results",
      },
      message("Report text.", [
        { title: "A", type: "url_citation", url: "https://a.test" },
      ]),
    ],
    status: "completed",
    usage: {
      cost: { currency: "USD", total_cost: 0.5 },
      input_tokens: 1000,
      input_tokens_details: { cache_read_input_tokens: 400 },
      output_tokens: 300,
      output_tokens_details: { reasoning_tokens: 120 },
      total_tokens: 1300,
    },
  };
  const wait = { interval: 1 };

  it("runs on an effort alone, in the background, and polls by id", async () => {
    const { web, calls } = client(
      { body: { id: "resp_9", status: "queued" } },
      { body: { id: "resp_9", status: "in_progress" } },
      { body: done }
    );
    await web.research("Which tiles are frost resistant?", {
      effort: "high",
      ...wait,
    });
    expect(nth(calls, 0).method).toBe("POST");
    expect(nth(calls, 0).url.pathname).toBe("/v1/agent");
    expect(nth(calls, 0).body).toStrictEqual({
      background: true,
      effort: "high",
      input: "Which tiles are frost resistant?",
    });
    expect(
      calls.slice(1).map((call) => [call.method, call.url.pathname])
    ).toStrictEqual([
      ["GET", "/v1/agent/resp_9"],
      ["GET", "/v1/agent/resp_9"],
    ]);
  });

  it("uses the high effort when nothing is chosen", async () => {
    const { web, calls } = client(
      { body: { id: "r", status: "queued" } },
      { body: done }
    );
    await web.research("q", wait);
    expect(nth(calls, 0).body).toMatchObject({
      background: true,
      effort: "high",
    });
  });

  it("passes ultra-preview and version pins through", async () => {
    const { web, calls } = client(
      { body: { id: "r", status: "queued" } },
      { body: done },
      { body: { id: "r2", status: "queued" } },
      { body: done }
    );
    await web.research("q", { effort: "ultra-preview", ...wait });
    await web.research("q", { effort: "xhigh@2026-10-29.0", ...wait });
    expect(nth(calls, 0).body).toMatchObject({ effort: "ultra-preview" });
    expect(nth(calls, 2).body).toMatchObject({ effort: "xhigh@2026-10-29.0" });
  });

  it("returns cited sources, retrieved pages, cost and a continuation id", async () => {
    const { web } = client(
      { body: { id: "resp_9", status: "queued" } },
      { body: done }
    );
    const run = await web.research("q", wait);
    expect(run).toMatchObject({
      continuationId: "resp_9",
      id: "resp_9",
      output: "Report text.",
      status: "completed",
    });
    expect(run.stopReason).toBeUndefined();
    expect(run.sources).toStrictEqual([{ title: "A", url: "https://a.test" }]);
    expect(run.retrieved).toStrictEqual([
      { title: "A", url: "https://a.test" },
      { title: "B", url: "https://b.test" },
      { title: "Portmore", url },
    ]);
  });

  it("reports the run's cost and token units in meta", async () => {
    const { web } = client(
      { body: { id: "resp_9", status: "queued" } },
      { body: done }
    );
    const run = await web.research("q", wait);
    expect(run.meta).toStrictEqual({
      requestId: "resp_9",
      usage: {
        costUsd: 0.5,
        units: {
          cacheReadInputTokens: 400,
          inputTokens: 1000,
          outputTokens: 300,
          reasoningTokens: 120,
          totalTokens: 1300,
        },
      },
    });
    expect(run.raw).toMatchObject({ effort: "high@2026-10-28.0" });
  });

  it("parses structured output and sends the schema as response_format", async () => {
    const { web, calls } = client(
      { body: { id: "r", status: "queued" } },
      {
        body: {
          id: "r",
          output: [message('{"sku":"TLPRSRNAQU3X8"}')],
          status: "completed",
        },
      }
    );
    const run = await web.research<{ sku: string }>("SKU", { schema, ...wait });
    expect(run.output.sku).toBe("TLPRSRNAQU3X8");
    expect(nth(calls, 0).body).toMatchObject({
      response_format: {
        json_schema: { name: "output", schema },
        type: "json_schema",
      },
    });
  });

  it("sends a model chain with the default tools and ten steps", async () => {
    const { web, calls } = client(
      { body: { id: "r", status: "queued" } },
      { body: done }
    );
    await web.research("q", {
      instructions: "Cite everything.",
      languagePreference: "fr",
      maxOutputTokens: 4096,
      models: ["openai/gpt-6-luna", "openai/gpt-6.1-terra"],
      ...wait,
    });
    expect(nth(calls, 0).body).toStrictEqual({
      background: true,
      input: "q",
      instructions: "Cite everything.",
      language_preference: "fr",
      max_output_tokens: 4096,
      max_steps: 10,
      models: ["openai/gpt-6-luna", "openai/gpt-6.1-terra"],
      tools: [{ type: "web_search" }, { type: "fetch_url" }],
    });
  });

  it("keeps an explicit step budget and sends one model", async () => {
    const { web, calls } = client(
      { body: { id: "r", status: "queued" } },
      { body: done }
    );
    await web.research("q", {
      maxSteps: 3,
      model: "openai/gpt-6-luna",
      ...wait,
    });
    expect(nth(calls, 0).body).toMatchObject({
      max_steps: 3,
      model: "openai/gpt-6-luna",
    });
    expect(nth(calls, 0).body).not.toHaveProperty("effort");
  });

  it("refuses more than five models before sending", async () => {
    const { web, calls } = client();
    await expect(
      web.research("q", { models: ["a/1", "a/2", "a/3", "a/4", "a/5", "a/6"] })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });

  it("puts domains, dates, recency and country on the web_search tool", async () => {
    const { web, calls } = client(
      { body: { id: "r", status: "queued" } },
      { body: done }
    );
    await web.research("q", {
      country: "GB",
      effort: "medium",
      excludeDomains: ["pinterest.com"],
      lastUpdatedAfter: "2026-02-01",
      publishedAfter: "2026-01-31",
      publishedBefore: "2026-03-01",
      recency: "year",
      ...wait,
    });
    expect(nth(calls, 0).body).toMatchObject({
      effort: "medium",
      tools: [
        {
          filters: {
            last_updated_after_filter: "02/01/2026",
            search_after_date_filter: "01/31/2026",
            search_before_date_filter: "03/01/2026",
            search_domain_filter: ["-pinterest.com"],
            search_recency_filter: "year",
          },
          type: "web_search",
          user_location: { country: "GB" },
        },
      ],
    });
  });

  it("keeps the caller's filters on the web_search tool next to fetch_url for a direct model", async () => {
    const { web, calls } = client(
      { body: { id: "r", status: "queued" } },
      { body: done }
    );
    await web.research("q", {
      includeDomains: ["nature.com"],
      model: "openai/gpt-6-luna",
      ...wait,
    });
    expect(nth(calls, 0).body).toMatchObject({
      tools: [
        {
          filters: { search_domain_filter: ["nature.com"] },
          type: "web_search",
        },
        { type: "fetch_url" },
      ],
    });
  });

  it("refuses include and exclude domains together before sending", async () => {
    const { web, calls } = client();
    await expect(
      web.research("q", {
        excludeDomains: ["b.test"],
        includeDomains: ["a.test"],
      })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });

  it("continues from an earlier response", async () => {
    const { web, calls } = client(
      { body: { id: "r", status: "queued" } },
      { body: done }
    );
    await web.research("and the grout?", { continueFrom: "resp_8", ...wait });
    expect(nth(calls, 0).body).toMatchObject({
      previous_response_id: "resp_8",
    });
  });

  it("returns incomplete output as partial with the stop reason", async () => {
    const { web } = client(
      { body: { id: "r", status: "queued" } },
      { body: { ...done, status: "incomplete" } }
    );
    const run = await web.research("q", wait);
    expect(run.status).toBe("partial");
    expect(run.stopReason).toBe("incomplete");
    expect(run.output).toBe("Report text.");
    expect(run.sources).toStrictEqual([{ title: "A", url: "https://a.test" }]);
  });

  it("throws JobFailed with the job id when an incomplete run has no output", async () => {
    const { web } = client(
      { body: { id: "r", status: "queued" } },
      { body: { id: "r", output: [], status: "incomplete" } }
    );
    await expect(web.research("q", wait)).rejects.toMatchObject({
      code: "JobFailed",
      jobId: "r",
    });
  });

  it("throws JobFailed with the provider's message when the run failed", async () => {
    const { web } = client(
      { body: { id: "r", status: "queued" } },
      {
        body: {
          error: { message: "step budget spent", type: "error" },
          id: "r",
          output: [],
          status: "failed",
        },
      }
    );
    await expect(web.research("q", wait)).rejects.toMatchObject({
      code: "JobFailed",
      jobId: "r",
      message: expect.stringContaining("step budget spent"),
    });
  });

  it("throws JobFailed when a cut-off run leaves broken JSON", async () => {
    const { web } = client(
      { body: { id: "r", status: "queued" } },
      { body: { id: "r", output: [message('{"sku":')], status: "incomplete" } }
    );
    await expect(web.research("q", { schema, ...wait })).rejects.toMatchObject({
      code: "JobFailed",
      jobId: "r",
    });
  });

  it("keeps the run id when the run outlasts the timeout", async () => {
    const { web } = client(
      { body: { id: "resp_9", status: "queued" } },
      { body: { id: "resp_9", status: "in_progress" } }
    );
    await expect(
      web.research("q", { interval: 5, timeout: 1 })
    ).rejects.toMatchObject({
      code: "Timeout",
      jobId: "resp_9",
      retryable: false,
    });
  });

  it("resumes a run by id without starting another", async () => {
    const { web, calls } = client({ body: done });
    const run = await web.research("q", { resume: "resp_9", ...wait });
    expect(calls).toHaveLength(1);
    expect(nth(calls, 0).method).toBe("GET");
    expect(nth(calls, 0).url.pathname).toBe("/v1/agent/resp_9");
    expect(run.id).toBe("resp_9");
  });

  it("adds the job id to an error raised while polling", async () => {
    const { web } = client(
      { body: { id: "r", status: "queued" } },
      {
        body: { error: { message: "slow down" } },
        headers: { "retry-after": "3" },
        status: 429,
      }
    );
    await expect(web.research("q", wait)).rejects.toMatchObject({
      code: "RateLimited",
      jobId: "r",
    });
  });
});

describe("perplexity decide", () => {
  const questions = {
    defect: { question: "Does the review report a defect?", type: "yesno" },
    mood: {
      choices: ["positive", "mixed", "negative"],
      question: "What is the sentiment?",
      type: "choice",
    },
    severity: {
      question: "How severe is it?",
      scale: { "1": "Cosmetic", "2": "Inconvenient", "3": "Unusable" },
      type: "score",
    },
  } satisfies Record<string, DecisionQuestion>;
  const reply = {
    answers: {
      defect: { noul: 0.94, type: "noul" },
      mood: {
        choice: "mixed",
        confidence: 0.92,
        probabilities: { mixed: 0.95, negative: 0.03, positive: 0.02 },
        type: "choice",
      },
      severity: {
        confidence: 0.78,
        legend: { "0": "Cosmetic", "1": "Inconvenient", "2": "Unusable" },
        probabilities: { "0": 0.01, "1": 0.2, "2": 0.79 },
        score: 1.78,
        type: "score",
      },
    },
    model: "pplx-decider-latest",
    usage: { input_tokens: 367, output_tokens: 3 },
  };

  it("maps yesno, choice and score to noul, choice and score", async () => {
    const { web, calls } = client({ body: reply });
    await web.decide({ review: "The battery died." }, questions);
    expect(nth(calls, 0).method).toBe("POST");
    expect(nth(calls, 0).url.pathname).toBe("/v1/decisions");
    expect(nth(calls, 0).headers.authorization).toBe("Bearer k");
    expect(nth(calls, 0).body).toStrictEqual({
      model: "pplx-decider-latest",
      questions: {
        defect: {
          instructions: "Does the review report a defect?",
          type: "noul",
        },
        mood: {
          criteria: { mixed: null, negative: null, positive: null },
          instructions: "What is the sentiment?",
          type: "choice",
        },
        severity: {
          criteria: ["Cosmetic", "Inconvenient", "Unusable"],
          instructions: "How severe is it?",
          type: "score",
        },
      },
      state: { review: "The battery died." },
    });
  });

  it("sends the chosen decider model and a text context as state", async () => {
    const { web, calls } = client({ body: reply });
    await web.decide("The battery died.", questions, {
      model: "pplx-decider-flash-v1.2",
    });
    expect(nth(calls, 0).body).toMatchObject({
      model: "pplx-decider-flash-v1.2",
      state: "The battery died.",
    });
  });

  it("returns probabilities keyed by the caller's names and scores", async () => {
    const { web } = client({ body: reply });
    const decisions = await web.decide("The battery died.", questions);
    expect(decisions.answers).toStrictEqual({
      defect: { probability: 0.94 },
      mood: {
        choice: "mixed",
        confidence: 0.92,
        probabilities: { mixed: 0.95, negative: 0.03, positive: 0.02 },
      },
      severity: {
        choice: "3",
        confidence: 0.78,
        probabilities: { "1": 0.01, "2": 0.2, "3": 0.79 },
      },
    });
    expect(decisions.citations).toStrictEqual([]);
    expect(decisions.meta).toStrictEqual({
      usage: { units: { inputTokens: 367, outputTokens: 3 } },
    });
    expect(decisions.raw).toMatchObject({ model: "pplx-decider-latest" });
  });

  it("refuses a context that is not text, an object or a list", async () => {
    const { web, calls } = client();
    await expect(web.decide(undefined, questions)).rejects.toMatchObject({
      code: "InvalidRequest",
    });
    expect(calls).toHaveLength(0);
  });
});

describe("perplexity capabilities", () => {
  it("offers search, answer, research and decide only", () => {
    const { web } = client();
    expect(web.capabilities).toMatchObject({
      act: false,
      answer: true,
      crawl: false,
      decide: true,
      extract: false,
      images: false,
      map: false,
      parse: false,
      read: false,
      research: true,
      search: true,
    });
  });
});
