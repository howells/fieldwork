import { describe, expect, it } from "vitest";

import { parallel } from "../../src/adapters/parallel.js";
import { Fieldwork, FieldworkError } from "../../src/index.js";
import { fakeFetch, nth } from "../helpers.js";

const schema = {
  properties: { sku: { type: "string" } },
  required: ["sku"],
  type: "object",
};
const url =
  "https://www.tilebar.com/product/portmore-aqua-3x8-glazed-ceramic-tile.html";

const connect = (...replies: Parameters<typeof fakeFetch>) => {
  const { fetch, calls } = fakeFetch(...replies);
  return {
    calls,
    web: new Fieldwork({
      adapter: parallel({ apiKey: "k", fetch, retries: 0 }),
    }),
  };
};

const run = (status: string, extra: Record<string, unknown> = {}) => ({
  interaction_id: "trun_1_int",
  is_active: ["queued", "running", "cancelling"].includes(status),
  processor: "base",
  run_id: "trun_1",
  status,
  ...extra,
});

const findall = (status: string, reason?: string, matched = 1) => ({
  findall_id: "findall_1",
  generator: "base",
  status: {
    is_active: status === "queued" || status === "running",
    metrics: {
      generated_candidates_count: 4,
      matched_candidates_count: matched,
    },
    status,
    termination_reason: reason ?? null,
  },
});

describe("parallel search", () => {
  it("sends Parallel's v1 request with advanced settings", async () => {
    const { web, calls } = connect({ body: { results: [], search_id: "s" } });
    await web.search("porcelain tile", {
      country: "GB",
      includeDomains: ["tilebar.com", "docs.example.com/tiles"],
      limit: 5,
      maxAge: 3600,
      maxCharsPerResult: 800,
      maxCharsTotal: 4000,
      mode: "fast",
      objective: "Find porcelain tile makers",
      publishedAfter: "2026-01-01",
      queries: ["porcelain tile makers", "porcelain tile brands"],
      sessionId: "session-1",
    });
    expect(calls[0]).toMatchObject({
      headers: { "content-type": "application/json", "x-api-key": "k" },
      method: "POST",
    });
    expect(nth(calls, 0).url.pathname).toBe("/v1/search");
    expect(nth(calls, 0).body).toStrictEqual({
      advanced_settings: {
        excerpt_settings: { max_chars_per_result: 800 },
        fetch_policy: { max_age_seconds: 3600 },
        location: "GB",
        max_results: 5,
        source_policy: {
          after_date: "2026-01-01",
          include_domains: ["tilebar.com", "docs.example.com/tiles"],
        },
      },
      max_chars_total: 4000,
      mode: "fast",
      objective: "Find porcelain tile makers",
      search_queries: ["porcelain tile makers", "porcelain tile brands"],
      session_id: "session-1",
    });
  });

  it("sends only the query when no option is set", async () => {
    const { web, calls } = connect({ body: { results: [], search_id: "s" } });
    await web.search("porcelain tile");
    expect(nth(calls, 0).body).toStrictEqual({
      objective: "porcelain tile",
      search_queries: ["porcelain tile"],
    });
  });

  it("normalizes results, the publish date and meta", async () => {
    const { web } = connect({
      body: {
        results: [
          {
            excerpts: ["Glazed ceramic", "3x8"],
            publish_date: "2026-03-04",
            title: "Portmore",
            url,
          },
          { excerpts: [], url: "https://b.test" },
        ],
        search_id: "search_1",
        session_id: "session-1",
        usage: [{ count: 1, name: "sku_search" }],
        warnings: [
          { message: "location ignored for this mode", type: "warning" },
        ],
      },
    });
    const response = await web.search("tile");
    expect(response.results).toStrictEqual([
      {
        publishedAt: "2026-03-04",
        snippet: "Glazed ceramic … 3x8",
        title: "Portmore",
        url,
      },
      { url: "https://b.test" },
    ]);
    expect(response.meta).toStrictEqual({
      requestId: "search_1",
      usage: { units: { sku_search: 1 } },
      warnings: ["location ignored for this mode"],
    });
    expect(response.raw).toMatchObject({ session_id: "session-1" });
  });

  it("refuses include and exclude domains together, since Parallel ignores the second", async () => {
    const { web, calls } = connect();
    await expect(
      web.search("tile", {
        excludeDomains: ["b.test"],
        includeDomains: ["a.test"],
      })
    ).rejects.toMatchObject({ code: "InvalidRequest", provider: "parallel" });
    expect(calls).toHaveLength(0);
  });

  it("refuses a maxAge below Parallel's 600 second minimum", async () => {
    const { web, calls } = connect();
    await expect(web.search("tile", { maxAge: 0 })).rejects.toMatchObject({
      code: "InvalidRequest",
    });
    await expect(web.search("tile", { maxAge: 599 })).rejects.toMatchObject({
      code: "InvalidRequest",
    });
    expect(calls).toHaveLength(0);
  });
});

describe("parallel images", () => {
  it("searches /v1/images/search", async () => {
    const { web, calls } = connect({
      body: {
        results: [
          {
            height: 600,
            image_url: "https://img.test/a.jpg",
            source_page_url: url,
            title: "Aqua tile",
            width: 800,
          },
          {
            height: null,
            image_url: "https://img.test/b.jpg",
            source_page_url: "https://b.test",
            title: "Bare",
            width: null,
          },
        ],
        search_id: "img_1",
        session_id: "s",
        usage: [{ count: 1, name: "sku_image_search" }],
        warnings: [{ message: "max_results reduced", type: "warning" }],
      },
    });
    const images = await web.images("aqua glazed tile", {
      country: "GB",
      limit: 5,
      mode: "advanced",
      sessionId: "s",
    });
    expect(nth(calls, 0).url.pathname).toBe("/v1/images/search");
    expect(nth(calls, 0).body).toStrictEqual({
      advanced_settings: { location: "GB", max_results: 5 },
      mode: "advanced",
      objective: "aqua glazed tile",
      search_queries: ["aqua glazed tile"],
      session_id: "s",
    });
    expect(images.results).toStrictEqual([
      {
        height: 600,
        sourceUrl: url,
        title: "Aqua tile",
        url: "https://img.test/a.jpg",
        width: 800,
      },
      {
        sourceUrl: "https://b.test",
        title: "Bare",
        url: "https://img.test/b.jpg",
      },
    ]);
    expect(images.meta).toStrictEqual({
      requestId: "img_1",
      usage: { units: { sku_image_search: 1 } },
      warnings: ["max_results reduced"],
    });
  });
});

describe("parallel read", () => {
  it("reads full content with Extract", async () => {
    const { web, calls } = connect({
      body: {
        errors: [],
        results: [{ full_content: "# Portmore", title: "Portmore", url }],
      },
    });
    const page = await web.read(url);
    expect(nth(calls, 0).url.pathname).toBe("/v1/extract");
    expect(nth(calls, 0).body).toStrictEqual({
      advanced_settings: { full_content: true },
      urls: [url],
    });
    expect(page.markdown).toBe("# Portmore");
  });

  it("puts every setting inside advanced_settings", async () => {
    const { web, calls } = connect({
      body: { errors: [], extract_id: "e", results: [{ excerpts: [], url }] },
    });
    await web.read(url, {
      maxAge: 600,
      maxCharsPerResult: 700,
      maxCharsTotal: 900,
      maxContentChars: 5000,
      queries: ["finish"],
      query: "What is the finish?",
      sessionId: "s",
    });
    expect(nth(calls, 0).body).toStrictEqual({
      advanced_settings: {
        excerpt_settings: { max_chars_per_result: 700 },
        fetch_policy: { max_age_seconds: 600 },
        full_content: { max_chars_per_result: 5000 },
      },
      max_chars_total: 900,
      objective: "What is the finish?",
      search_queries: ["finish"],
      session_id: "s",
      urls: [url],
    });
  });

  it("returns the publish date, excerpts and meta", async () => {
    const { web } = connect({
      body: {
        errors: [],
        extract_id: "extract_1",
        results: [
          {
            excerpts: ["Glazed ceramic"],
            full_content: "# Portmore",
            publish_date: "2026-02-03",
            title: "Portmore",
            url,
          },
        ],
        usage: [{ count: 1, name: "sku_extract_excerpts" }],
        warnings: [{ message: "page was cached", type: "warning" }],
      },
    });
    const page = await web.read(url);
    expect(page).toMatchObject({
      excerpts: ["Glazed ceramic"],
      markdown: "# Portmore",
      meta: {
        requestId: "extract_1",
        usage: { units: { sku_extract_excerpts: 1 } },
        warnings: ["page was cached"],
      },
      publishedAt: "2026-02-03",
      title: "Portmore",
      url,
    });
    expect(page.raw).toMatchObject({ extract_id: "extract_1" });
  });

  it("raises the per-URL error when the page cannot be read", async () => {
    const { web } = connect({
      body: {
        errors: [
          {
            content: "Forbidden",
            error_type: "fetch_error",
            http_status_code: 403,
            url,
          },
        ],
        results: [],
      },
    });
    await expect(web.read(url)).rejects.toMatchObject({
      code: "ProviderError",
      message: expect.stringContaining("fetch_error: HTTP 403: Forbidden"),
    });
  });

  it("refuses a maxAge below the minimum", async () => {
    const { web, calls } = connect();
    await expect(web.read(url, { maxAge: 0 })).rejects.toMatchObject({
      code: "InvalidRequest",
    });
    expect(calls).toHaveLength(0);
  });
});

describe("parallel readMany", () => {
  it("reads several URLs in one call and lists the ones that failed", async () => {
    const other = "https://b.test/page";
    const { web, calls } = connect({
      body: {
        errors: [
          {
            content: "Not found",
            error_type: "fetch_error",
            http_status_code: 404,
            url: other,
          },
        ],
        extract_id: "extract_2",
        results: [
          { full_content: "# A", publish_date: "2026-01-01", title: "A", url },
        ],
        usage: [{ count: 2, name: "sku_extract_excerpts" }],
      },
    });
    const batch = await web.readMany([url, other], { query: "finish" });
    expect(nth(calls, 0).url.pathname).toBe("/v1/extract");
    expect(nth(calls, 0).body).toStrictEqual({
      advanced_settings: { full_content: true },
      objective: "finish",
      urls: [url, other],
    });
    expect(batch).toMatchObject({
      failed: [{ error: "fetch_error: HTTP 404: Not found", url: other }],
      id: "extract_2",
      meta: {
        requestId: "extract_2",
        usage: { units: { sku_extract_excerpts: 2 } },
      },
      pages: [{ markdown: "# A", publishedAt: "2026-01-01", title: "A", url }],
    });
  });

  it("refuses more than 20 URLs before sending", async () => {
    const { web, calls } = connect();
    const urls = Array.from({ length: 21 }, (_, i) => `https://a.test/${i}`);
    await expect(web.readMany(urls)).rejects.toMatchObject({
      code: "InvalidRequest",
    });
    expect(calls).toHaveLength(0);
  });
});

describe("parallel extract", () => {
  const output = {
    basis: [
      {
        citations: [{ excerpts: ["SKU TLPRSRNAQU3X8"], url }],
        confidence: "high",
        field: "sku",
        reasoning: "Printed on the page",
      },
    ],
    content: { sku: "TLPRSRNAQU3X8" },
    type: "json",
  };

  it("extracts through a Task run and keeps its basis", async () => {
    const { web, calls } = connect(
      { body: run("queued") },
      { body: run("completed") },
      {
        body: {
          output,
          run: run("completed", {
            warnings: [{ message: "one field was guessed", type: "warning" }],
          }),
        },
      }
    );
    const result = await web.extract<{ sku: string }>(url, {
      country: "GB",
      interval: 1,
      metadata: { source: "test" },
      schema,
    });
    expect(calls.map((call) => call.method)).toStrictEqual([
      "POST",
      "GET",
      "GET",
    ]);
    expect(calls.map((call) => call.url.pathname)).toStrictEqual([
      "/v1/tasks/runs",
      "/v1/tasks/runs/trun_1",
      "/v1/tasks/runs/trun_1/result",
    ]);
    expect(nth(calls, 0).body).toStrictEqual({
      advanced_settings: { location: "GB" },
      input: {
        instructions:
          "Extract the values in the output schema from this page only.",
        url,
      },
      metadata: { source: "test" },
      processor: "base",
      source_policy: {
        include_domains: [
          "www.tilebar.com/product/portmore-aqua-3x8-glazed-ceramic-tile.html",
        ],
      },
      task_spec: { output_schema: { json_schema: schema, type: "json" } },
    });
    expect(result).toMatchObject({
      data: { sku: "TLPRSRNAQU3X8" },
      fields: [
        {
          citations: [{ excerpts: ["SKU TLPRSRNAQU3X8"], url }],
          confidence: "high",
          field: "sku",
          reasoning: "Printed on the page",
        },
      ],
      meta: { requestId: "trun_1", warnings: ["one field was guessed"] },
    });
  });

  it("asks Parallel for its auto schema when no schema is given", async () => {
    const { web, calls } = connect(
      { body: run("queued") },
      { body: run("completed") },
      {
        body: {
          output: {
            basis: [],
            content: { title: "Portmore" },
            output_schema: { type: "object" },
            type: "json",
          },
          run: run("completed"),
        },
      }
    );
    const result = await web.extract<{ title: string }>(url, {
      interval: 1,
      processor: "pro",
    });
    expect(nth(calls, 0).body).toMatchObject({
      processor: "pro",
      task_spec: { output_schema: { type: "auto" } },
    });
    expect(result.data).toStrictEqual({ title: "Portmore" });
  });

  it("raises JobFailed with the run id when the run fails", async () => {
    const { web } = connect(
      { body: run("queued") },
      {
        body: run("failed", {
          error: { message: "could not read the page", ref_id: "e1" },
        }),
      }
    );
    await expect(
      web.extract(url, { interval: 1, schema })
    ).rejects.toMatchObject({
      code: "JobFailed",
      jobId: "trun_1",
      message: expect.stringContaining("could not read the page"),
      retryable: false,
    });
  });
});

describe("parallel answer", () => {
  const response = {
    effort_used: "medium",
    id: "resp_1",
    model: "parallel",
    object: "response",
    output: [
      {
        action: { queries: ["portmore"], type: "search" },
        id: "ws_1",
        status: "completed",
        type: "web_search_call",
      },
      {
        content: [
          {
            annotations: [
              {
                end_index: 8,
                start_index: 0,
                title: "Portmore",
                type: "url_citation",
                url,
              },
              {
                end_index: 12,
                start_index: 9,
                title: "Portmore again",
                type: "url_citation",
                url,
              },
            ],
            text: "Portmore is glazed ceramic.",
            type: "output_text",
          },
        ],
        id: "msg_1",
        role: "assistant",
        status: "completed",
        type: "message",
      },
    ],
    status: "completed",
    usage: {
      input_tokens: 10,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 20,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 30,
    },
  };

  it("calls the Responses API synchronously", async () => {
    const { web, calls } = connect({ body: response });
    await web.answer("What is Portmore?", {
      continueFrom: "resp_0",
      effort: "high",
      includeDomains: ["tilebar.com"],
      instructions: "Be brief.",
      metadata: { case: "1" },
    });
    expect(nth(calls, 0).url.pathname).toBe("/v1/responses");
    expect(nth(calls, 0).body).toStrictEqual({
      input: "What is Portmore?",
      instructions: "Be brief.",
      metadata: { case: "1" },
      model: "parallel",
      previous_response_id: "resp_0",
      reasoning: { effort: "high" },
      tools: [
        { filters: { allowed_domains: ["tilebar.com"] }, type: "web_search" },
      ],
    });
  });

  it("returns the answer, its citations, a continuation id and meta", async () => {
    const { web } = connect({ body: response });
    const answer = await web.answer("What is Portmore?");
    expect(answer).toMatchObject({
      answer: "Portmore is glazed ceramic.",
      citations: [{ title: "Portmore", url }],
      continuationId: "resp_1",
      meta: {
        requestId: "resp_1",
        usage: {
          units: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
        },
      },
    });
    expect(answer.raw).toMatchObject({ effort_used: "medium" });
  });

  it("parses structured output when a schema is given", async () => {
    const structured = {
      ...response,
      output: [
        {
          content: [
            {
              annotations: [],
              text: '{"sku":"TLPRSRNAQU3X8"}',
              type: "output_text",
            },
          ],
          role: "assistant",
          status: "completed",
          type: "message",
        },
      ],
    };
    const { web, calls } = connect({ body: structured });
    const answer = await web.answer<{ sku: string }>("SKU?", { schema });
    expect(nth(calls, 0).body).toMatchObject({
      text: { format: { name: "answer", schema, type: "json_schema" } },
    });
    expect(answer.output).toStrictEqual({ sku: "TLPRSRNAQU3X8" });
    expect(answer.answer).toBe('{"sku":"TLPRSRNAQU3X8"}');
  });

  it("notes an incomplete answer in meta", async () => {
    const { web } = connect({
      body: {
        ...response,
        incomplete_details: { reason: "max_output_tokens" },
        status: "incomplete",
      },
    });
    const answer = await web.answer("q");
    expect(answer.meta?.warnings).toStrictEqual([
      "the answer is incomplete: max_output_tokens",
    ]);
  });

  it("raises a failed response", async () => {
    const { web } = connect({
      body: {
        error: { code: "server_error", message: "upstream broke" },
        id: "resp_2",
        output: [],
        status: "failed",
      },
    });
    await expect(web.answer("q")).rejects.toMatchObject({
      code: "ProviderError",
      message: expect.stringContaining("upstream broke"),
    });
  });

  it("refuses both domain lists, which Parallel does not combine", async () => {
    const { web, calls } = connect();
    await expect(
      web.answer("q", {
        excludeDomains: ["b.test"],
        includeDomains: ["a.test"],
      })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });
});

describe("parallel research", () => {
  it("runs a text Task and returns the continuation id", async () => {
    const { web, calls } = connect(
      { body: run("queued") },
      { body: run("completed") },
      {
        body: {
          output: {
            basis: [
              {
                citations: [{ title: "Portmore", url }],
                field: "output",
                reasoning: "Listed on the page",
              },
            ],
            content: "Blue",
            type: "text",
          },
          run: run("completed", {
            warnings: [{ message: "source policy narrowed", type: "warning" }],
          }),
        },
      }
    );
    const result = await web.research<string>("What colorway?", {
      continueFrom: "trun_0_int",
      country: "GB",
      excludeDomains: ["pinterest.com"],
      interval: 1,
      metadata: { case: "1" },
      publishedAfter: "2026-01-01",
    });
    expect(nth(calls, 0).body).toStrictEqual({
      advanced_settings: { location: "GB" },
      input: "What colorway?",
      metadata: { case: "1" },
      previous_interaction_id: "trun_0_int",
      processor: "base",
      source_policy: {
        after_date: "2026-01-01",
        exclude_domains: ["pinterest.com"],
      },
      task_spec: { output_schema: { type: "text" } },
    });
    expect(result).toMatchObject({
      continuationId: "trun_1_int",
      id: "trun_1",
      meta: { requestId: "trun_1", warnings: ["source policy narrowed"] },
      output: "Blue",
      sources: [{ title: "Portmore", url }],
      status: "completed",
    });
    expect(result.fields).toMatchObject([
      { field: "output", reasoning: "Listed on the page" },
    ]);
  });

  it("sends a structured schema and accepts any processor name", async () => {
    const { web, calls } = connect(
      { body: run("queued") },
      { body: run("completed") },
      {
        body: {
          output: { basis: [], content: { sku: "X" }, type: "json" },
          run: run("completed"),
        },
      }
    );
    const result = await web.research<{ sku: string }>("SKU?", {
      interval: 1,
      processor: "pro-fast",
      schema,
    });
    expect(nth(calls, 0).body).toMatchObject({
      processor: "pro-fast",
      task_spec: { output_schema: { json_schema: schema, type: "json" } },
    });
    expect(result.output.sku).toBe("X");
  });

  it("keeps checking while the run is going", async () => {
    const { web, calls } = connect(
      { body: run("queued") },
      { body: run("queued") },
      { body: run("running") },
      { body: run("completed") },
      {
        body: {
          output: { basis: [], content: "Blue", type: "text" },
          run: run("completed"),
        },
      }
    );
    const result = await web.research<string>("What colorway?", {
      interval: 1,
    });
    expect(result.output).toBe("Blue");
    expect(calls.map((call) => call.method)).toStrictEqual([
      "POST",
      "GET",
      "GET",
      "GET",
      "GET",
    ]);
  });

  it("raises JobFailed, not NotFound, for a failed run", async () => {
    const { web } = connect(
      { body: run("queued") },
      { body: run("running") },
      {
        body: run("failed", {
          error: { message: "out of credit", ref_id: "e1" },
        }),
      }
    );
    const attempt = web.research("q", { interval: 1 });
    await expect(attempt).rejects.toMatchObject({
      code: "JobFailed",
      jobId: "trun_1",
      provider: "parallel",
    });
    await expect(
      connect(
        { body: run("queued") },
        { body: run("failed", { error: { message: "boom", ref_id: "e" } }) }
      ).web.research("q", { interval: 1 })
    ).rejects.toMatchObject({ message: expect.stringContaining("boom") });
  });

  it("raises JobFailed when the result call returns 404 for a run that failed", async () => {
    const { web } = connect(
      { body: run("queued") },
      { body: run("completed") },
      { body: { error: { message: "Run failed or not found" } }, status: 404 },
      { body: run("failed", { error: { message: "crashed", ref_id: "e" } }) }
    );
    await expect(web.research("q", { interval: 1 })).rejects.toMatchObject({
      code: "JobFailed",
      jobId: "trun_1",
      message: expect.stringContaining("crashed"),
    });
  });

  it("raises JobFailed for a run that needs an action instead of waiting", async () => {
    const { web, calls } = connect(
      { body: run("queued") },
      { body: run("action_required") }
    );
    await expect(web.research("q", { interval: 1 })).rejects.toMatchObject({
      code: "JobFailed",
      jobId: "trun_1",
      message: expect.stringContaining("action_required"),
    });
    expect(calls).toHaveLength(2);
  });

  it("raises JobFailed for a cancelled run", async () => {
    const { web } = connect(
      { body: run("queued") },
      { body: run("cancelled") }
    );
    await expect(web.research("q", { interval: 1 })).rejects.toMatchObject({
      code: "JobFailed",
      jobId: "trun_1",
      message: expect.stringContaining("cancelled"),
    });
  });

  it("resumes a run without creating another", async () => {
    const { web, calls } = connect(
      { body: run("completed") },
      {
        body: {
          output: { basis: [], content: "Blue", type: "text" },
          run: run("completed"),
        },
      }
    );
    const result = await web.research<string>("What colorway?", {
      interval: 1,
      resume: "trun_1",
    });
    expect(calls.map((call) => call.method)).toStrictEqual(["GET", "GET"]);
    expect(result.id).toBe("trun_1");
  });

  it("carries the job id on an error raised while waiting", async () => {
    const { web } = connect(
      { body: run("queued") },
      { body: { error: "server broke" }, status: 500 }
    );
    await expect(web.research("q", { interval: 1 })).rejects.toMatchObject({
      jobId: "trun_1",
      retryable: false,
    });
  });
});

describe("parallel discover", () => {
  const candidates = [
    {
      basis: [
        {
          citations: [
            { title: "About", url: "https://heathceramics.com/about" },
          ],
          confidence: "high",
          field: "made_in_usa",
          reasoning: "Factory in Sausalito",
        },
      ],
      candidate_id: "c1",
      description: "Tile maker",
      match_status: "matched",
      name: "Heath Ceramics",
      output: {
        ceo_name: { type: "enrichment", value: "Cory Thomsen" },
        made_in_usa: {
          is_matched: true,
          type: "match_condition",
          value: "yes",
        },
      },
      url: "https://heathceramics.com",
    },
    {
      candidate_id: "c2",
      match_status: "unmatched",
      name: "Imports Ltd",
      output: {
        made_in_usa: {
          is_matched: false,
          type: "match_condition",
          value: "no",
        },
      },
      url: "https://imports.test",
    },
    {
      candidate_id: "c3",
      match_status: "discarded",
      name: "Duplicate",
      url: "https://dup.test",
    },
  ];
  const conditions = [
    { description: "The tile is made in the USA.", name: "made_in_usa" },
  ];

  it("creates the run, adds the enrichment and waits", async () => {
    const { web, calls } = connect(
      { body: findall("queued") },
      {
        body: {
          entity_type: "companies",
          match_conditions: [],
          objective: "x",
        },
      },
      { body: findall("running") },
      { body: findall("completed", "match_limit_met") },
      {
        body: {
          candidates,
          run: findall("completed", "match_limit_met"),
        },
      }
    );
    const discovery = await web.discover<{ ceo_name: string }>(
      "US tile makers",
      {
        conditions,
        entityType: "companies",
        exclude: [{ name: "Acme", url: "https://acme.test" }],
        generator: "core",
        interval: 1,
        limit: 20,
        metadata: { case: "1" },
        processor: "base",
        schema: {
          properties: { ceo_name: { type: "string" } },
          type: "object",
        },
      }
    );
    expect(
      calls.map((call) => `${call.method} ${call.url.pathname}`)
    ).toStrictEqual([
      "POST /v1beta/findall/runs",
      "POST /v1beta/findall/runs/findall_1/enrich",
      "GET /v1beta/findall/runs/findall_1",
      "GET /v1beta/findall/runs/findall_1",
      "GET /v1beta/findall/runs/findall_1/result",
    ]);
    expect([nth(calls, 0).body, nth(calls, 1).body]).toStrictEqual([
      {
        entity_type: "companies",
        exclude_list: [{ name: "Acme", url: "https://acme.test" }],
        generator: "core",
        match_conditions: conditions,
        match_limit: 20,
        metadata: { case: "1" },
        objective: "US tile makers",
      },
      {
        output_schema: {
          json_schema: {
            properties: { ceo_name: { type: "string" } },
            type: "object",
          },
          type: "json",
        },
        processor: "base",
      },
    ]);
    expect(discovery).toMatchObject({
      id: "findall_1",
      meta: {
        requestId: "findall_1",
        usage: { units: { generated_candidates: 4, matched_candidates: 1 } },
      },
      status: "completed",
    });
    expect(discovery).not.toHaveProperty("stopReason");
    expect(discovery.entities).toStrictEqual([
      {
        citations: [{ title: "About", url: "https://heathceramics.com/about" }],
        data: { ceo_name: "Cory Thomsen" },
        description: "Tile maker",
        fields: [
          {
            citations: [
              { title: "About", url: "https://heathceramics.com/about" },
            ],
            confidence: "high",
            field: "made_in_usa",
            reasoning: "Factory in Sausalito",
          },
        ],
        matched: true,
        name: "Heath Ceramics",
        url: "https://heathceramics.com",
      },
      { matched: false, name: "Imports Ltd", url: "https://imports.test" },
    ]);
  });

  it("sends the defaults and skips the enrichment without a schema", async () => {
    const { web, calls } = connect(
      { body: findall("queued") },
      { body: findall("completed", "candidates_exhausted", 0) },
      {
        body: {
          candidates: [],
          run: findall("completed", "candidates_exhausted", 0),
        },
      }
    );
    const discovery = await web.discover("US tile makers", {
      conditions,
      entityType: "companies",
      interval: 1,
    });
    expect(nth(calls, 0).body).toMatchObject({
      generator: "base",
      match_limit: 10,
    });
    expect(calls.map((call) => call.method)).toStrictEqual([
      "POST",
      "GET",
      "GET",
    ]);
    expect(discovery.entities).toStrictEqual([]);
    expect(discovery.status).toBe("completed");
  });

  it("returns a partial discovery when the run stopped early with matches", async () => {
    const { web } = connect(
      { body: findall("queued") },
      { body: findall("completed", "low_match_rate") },
      {
        body: { candidates, run: findall("completed", "low_match_rate") },
      }
    );
    const discovery = await web.discover("US tile makers", {
      conditions,
      entityType: "companies",
      interval: 1,
    });
    expect(discovery.status).toBe("partial");
    expect(discovery.stopReason).toBe("low_match_rate");
    expect(discovery.meta?.warnings).toStrictEqual([
      "the run stopped before it finished: low_match_rate",
    ]);
    expect(discovery.entities).toHaveLength(2);
  });

  it("returns a partial discovery for a run that timed out with matches", async () => {
    const { web } = connect(
      { body: findall("queued") },
      { body: findall("failed", "timeout") },
      { body: { candidates, run: findall("failed", "timeout") } }
    );
    const discovery = await web.discover("x", {
      conditions,
      entityType: "companies",
      interval: 1,
    });
    expect(discovery).toMatchObject({
      status: "partial",
      stopReason: "timeout",
    });
  });

  it("raises JobFailed when the run ended without a match", async () => {
    const { web } = connect(
      { body: findall("queued") },
      { body: findall("failed", "error_occurred", 0) },
      { body: { candidates: [], run: findall("failed", "error_occurred", 0) } }
    );
    await expect(
      web.discover("x", { conditions, entityType: "companies", interval: 1 })
    ).rejects.toMatchObject({
      code: "JobFailed",
      jobId: "findall_1",
      message: expect.stringContaining("error_occurred"),
    });
  });

  it("raises JobFailed for a run that needs an action", async () => {
    const { web } = connect(
      { body: findall("queued") },
      { body: findall("action_required") }
    );
    await expect(
      web.discover("x", { conditions, entityType: "companies", interval: 1 })
    ).rejects.toMatchObject({
      code: "JobFailed",
      jobId: "findall_1",
      message: expect.stringContaining("action_required"),
    });
  });

  it("carries the job id when the enrichment is rejected", async () => {
    const { web } = connect(
      { body: findall("queued") },
      { body: { error: { message: "bad schema" } }, status: 422 }
    );
    await expect(
      web.discover("x", {
        conditions,
        entityType: "companies",
        schema: { type: "array" },
      })
    ).rejects.toMatchObject({ code: "InvalidRequest", jobId: "findall_1" });
  });

  it("resumes a run without creating another", async () => {
    const { web, calls } = connect(
      { body: findall("completed", "match_limit_met") },
      { body: { candidates, run: findall("completed", "match_limit_met") } }
    );
    const discovery = await web.discover("x", {
      conditions,
      entityType: "companies",
      interval: 1,
      resume: "findall_1",
    });
    expect(calls.map((call) => call.method)).toStrictEqual(["GET", "GET"]);
    expect(discovery.id).toBe("findall_1");
  });
});

describe("parallel decide", () => {
  it("maps the question types to Parallel's and sends the context as state", async () => {
    const { web, calls } = connect({
      body: {
        answers: {},
        citations: [],
        decision_id: "decisions_1",
        mode: "fast",
        usage: { input_tokens: 100, output_tokens: 0 },
      },
    });
    await web.decide(
      { product: "Portmore tile" },
      {
        durability: {
          question: "How durable is it?",
          scale: { "1": "Fragile", "2": "Fair", "3": "Tough" },
          type: "score",
        },
        finish: {
          choices: ["glossy", "matte"],
          question: "What is the finish?",
          type: "choice",
        },
        outdoor: { question: "Is it rated for outdoor use?", type: "yesno" },
      },
      { country: "GB", includeExcerpts: false }
    );
    expect(nth(calls, 0).url.pathname).toBe("/v1/decisions");
    expect(nth(calls, 0).body).toStrictEqual({
      advanced_settings: { include_excerpts: false, location: "GB" },
      questions: {
        durability: {
          criteria: ["Fragile", "Fair", "Tough"],
          instructions: "How durable is it?",
          type: "score",
        },
        finish: {
          criteria: { glossy: "glossy", matte: "matte" },
          instructions: "What is the finish?",
          type: "choice",
        },
        outdoor: { instructions: "Is it rated for outdoor use?", type: "noul" },
      },
      state: { product: "Portmore tile" },
    });
  });

  it("normalizes answers, refusals, shared citations and meta", async () => {
    const { web } = connect({
      body: {
        answers: {
          durability: {
            legend: { "0": "Fragile", "1": "Fair", "2": "Tough" },
            probabilities: { "0": 0.1, "1": 0.2, "2": 0.7 },
            score: 1.6,
            type: "score",
          },
          finish: {
            choice: "matte",
            confidence: 0.7,
            probabilities: { glossy: 0.2, matte: 0.8 },
            type: "choice",
          },
          outdoor: { noul: 0.9, type: "noul" },
          warranty: { type: "refusal" },
        },
        citations: [
          { excerpts: ["Rated for exterior use"], title: "Portmore", url },
          { excerpts: [], url: "https://b.test" },
        ],
        decision_id: "decisions_1",
        mode: "fast",
        usage: { input_tokens: 100, output_tokens: 0 },
      },
    });
    const decisions = await web.decide(
      {},
      {
        durability: {
          question: "Durable?",
          scale: { "1": "Fragile", "2": "Fair", "3": "Tough" },
          type: "score",
        },
        finish: {
          choices: ["glossy", "matte"],
          question: "Finish?",
          type: "choice",
        },
        outdoor: { question: "Outdoor?", type: "yesno" },
        warranty: { question: "Warranted?", type: "yesno" },
      }
    );
    expect(decisions.answers).toStrictEqual({
      durability: {
        choice: "3",
        probabilities: { "1": 0.1, "2": 0.2, "3": 0.7 },
      },
      finish: {
        choice: "matte",
        confidence: 0.7,
        probabilities: { glossy: 0.2, matte: 0.8 },
      },
      outdoor: { probability: 0.9 },
      warranty: { refusal: "Parallel declined to answer this question" },
    });
    expect(decisions.citations).toStrictEqual([
      { excerpts: ["Rated for exterior use"], title: "Portmore", url },
      { url: "https://b.test" },
    ]);
    expect(decisions.meta).toStrictEqual({
      requestId: "decisions_1",
      usage: { units: { input_tokens: 100 } },
    });
  });

  it("refuses questions Parallel cannot take, before sending", async () => {
    const { web, calls } = connect();
    await expect(
      web.decide({}, { "bad name": { question: "?", type: "yesno" } })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    await expect(web.decide({}, {})).rejects.toMatchObject({
      code: "InvalidRequest",
    });
    await expect(
      web.decide(
        {},
        { a: { choices: ["only"], question: "?", type: "choice" } }
      )
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    await expect(
      web.decide(
        {},
        { a: { question: "?", scale: { "1": "only" }, type: "score" } }
      )
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });
});

describe("parallel monitor", () => {
  const monitor = {
    created_at: "2026-11-01T10:00:00Z",
    frequency: "1d",
    last_run_at: null,
    monitor_id: "monitor_1",
    processor: "lite",
    settings: { query: "new Portmore colorways" },
    status: "active",
    type: "event_stream",
    webhook: { event_types: [], url: "https://hooks.test/p" },
  };

  it("creates an event stream monitor", async () => {
    const { web, calls } = connect({ body: monitor, status: 201 });
    const info = await web.monitor.create({
      country: "GB",
      includeBackfill: true,
      includeDomains: ["tilebar.com"],
      metadata: { case: "1" },
      processor: "base",
      publishedAfter: "2026-01-01",
      query: "new Portmore colorways",
      schedule: { every: "day" },
      schema,
      webhookEvents: ["monitor.event.detected"],
      webhookUrl: "https://hooks.test/p",
    });
    expect(calls[0]).toMatchObject({ method: "POST" });
    expect(nth(calls, 0).url.pathname).toBe("/v1/monitors");
    expect(nth(calls, 0).body).toStrictEqual({
      frequency: "1d",
      metadata: { case: "1" },
      processor: "base",
      settings: {
        advanced_settings: {
          location: "GB",
          source_policy: {
            after_date: "2026-01-01",
            include_domains: ["tilebar.com"],
          },
        },
        include_backfill: true,
        output_schema: { json_schema: schema, type: "json" },
        query: "new Portmore colorways",
      },
      type: "event_stream",
      webhook: {
        event_types: ["monitor.event.detected"],
        url: "https://hooks.test/p",
      },
    });
    expect(info).toStrictEqual({
      createdAt: "2026-11-01T10:00:00Z",
      id: "monitor_1",
      raw: monitor,
      schedule: "1d",
      status: "active",
      watch: "new Portmore colorways",
      webhookUrl: "https://hooks.test/p",
    });
  });

  it("creates a snapshot monitor from a Task run", async () => {
    const { web, calls } = connect({
      body: {
        ...monitor,
        settings: { query: "SKU?", task_run_id: "trun_1" },
        type: "snapshot",
      },
      status: 201,
    });
    const info = await web.monitor.create({
      schedule: { every: "12h" },
      taskRunId: "trun_1",
    });
    expect(nth(calls, 0).body).toStrictEqual({
      frequency: "12h",
      settings: { task_run_id: "trun_1" },
      type: "snapshot",
    });
    expect(info.watch).toBe("SKU?");
  });

  it("maps schedules to Parallel's frequency", async () => {
    const frequencies: [
      Parameters<typeof web.monitor.create>[0]["schedule"],
      string,
    ][] = [
      [{ every: "hour" }, "1h"],
      [{ every: "week" }, "1w"],
      [{ every: "6h" }, "6h"],
      [{ every: "30d" }, "30d"],
      [{ every: "720h" }, "720h"],
    ];
    const { web, calls } = connect(
      ...frequencies.map(() => ({ body: monitor, status: 201 }))
    );
    for (const [schedule] of frequencies) {
      await web.monitor.create({ query: "q", schedule });
    }
    expect(calls.map((call) => call.body)).toMatchObject(
      frequencies.map(([, frequency]) => ({ frequency }))
    );
  });

  it("refuses schedules Parallel cannot express, before sending", async () => {
    const { web, calls } = connect();
    for (const schedule of [
      { cron: "0 9 * * 1" },
      { every: "31d" },
      { every: "721h" },
      { every: "0h" },
    ] as const) {
      await expect(
        web.monitor.create({ query: "q", schedule })
      ).rejects.toMatchObject({ code: "InvalidRequest", provider: "parallel" });
    }
    expect(calls).toHaveLength(0);
  });

  it("refuses options a monitor cannot take, before sending", async () => {
    const { web, calls } = connect();
    const schedule = { every: "day" } as const;
    const refused: unknown[] = [
      // Parallel monitors cannot watch a list of URLs.
      { query: "q", schedule, urls: ["https://a.test"] },
      { schedule },
      { query: "q", schedule, taskRunId: "trun_1" },
      {
        excludeDomains: ["b.test"],
        includeDomains: ["a.test"],
        query: "q",
        schedule,
      },
      { query: "q", schedule, webhookEvents: ["monitor.event.detected"] },
    ];
    const codes: unknown[] = [];
    for (const options of refused) {
      try {
        // @ts-expect-error each set of options is one the types refuse
        await web.monitor.create(options);
        codes.push("sent");
      } catch (error) {
        codes.push(error instanceof FieldworkError ? error.code : error);
      }
    }
    expect(codes).toStrictEqual(refused.map(() => "InvalidRequest"));
    expect(calls).toHaveLength(0);
  });

  it("gets one monitor", async () => {
    const { web, calls } = connect({ body: monitor });
    const info = await web.monitor.get("monitor_1");
    expect(calls[0]).toMatchObject({ method: "GET" });
    expect(nth(calls, 0).url.pathname).toBe("/v1/monitors/monitor_1");
    expect(info.id).toBe("monitor_1");
  });

  it("lists every page of monitors", async () => {
    const { web, calls } = connect(
      { body: { monitors: [monitor], next_cursor: "cursor_2" } },
      { body: { monitors: [{ ...monitor, monitor_id: "monitor_2" }] } }
    );
    const monitors = await web.monitor.list();
    expect(nth(calls, 0).url.pathname).toBe("/v1/monitors");
    expect(nth(calls, 0).url.searchParams.get("limit")).toBe("100");
    expect(nth(calls, 1).url.searchParams.get("cursor")).toBe("cursor_2");
    expect(monitors.map((item) => item.id)).toStrictEqual([
      "monitor_1",
      "monitor_2",
    ]);
  });

  it("deletes a monitor by cancelling it", async () => {
    const { web, calls } = connect({
      body: { ...monitor, status: "cancelled" },
    });
    await expect(web.monitor.delete("monitor_1")).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({ method: "POST" });
    expect(nth(calls, 0).url.pathname).toBe("/v1/monitors/monitor_1/cancel");
  });

  it("lists events of every kind and the next cursor", async () => {
    const { web, calls } = connect({
      body: {
        events: [
          {
            event_date: "2026-11-01",
            event_group_id: "grp_1",
            event_id: "ev_1",
            event_type: "event_stream",
            output: {
              basis: [
                {
                  citations: [{ title: "Portmore", url }],
                  field: "output",
                  reasoning: "New listing",
                },
              ],
              content: "Portmore now comes in sage.",
              type: "text",
            },
          },
          {
            event_date: "2026-10-30",
            event_group_id: "grp_2",
            event_id: "ev_2",
            event_type: "event_stream",
            output: { basis: [], content: { color: "sage" }, type: "json" },
          },
          {
            changed_output: {
              basis: [],
              content: { price: "12" },
              type: "json",
            },
            event_date: "2026-10-29",
            event_group_id: "grp_3",
            event_id: "ev_3",
            event_type: "snapshot",
            previous_output: {
              basis: [],
              content: { price: "10" },
              type: "json",
            },
          },
          { event_type: "completion", timestamp: "2026-10-28T09:00:00Z" },
          {
            error_message: "quota exceeded",
            event_type: "error",
            timestamp: "2026-10-27T09:00:00Z",
          },
        ],
        next_cursor: "cursor_2",
      },
    });
    const events = await web.monitor.events("monitor_1", {
      cursor: "cursor_1",
      eventGroupId: "grp_1",
      includeCompletions: true,
      limit: 20,
    });
    expect(nth(calls, 0).url.pathname).toBe("/v1/monitors/monitor_1/events");
    expect(Object.fromEntries(nth(calls, 0).url.searchParams)).toStrictEqual({
      cursor: "cursor_1",
      event_group_id: "grp_1",
      include_completions: "true",
      limit: "20",
    });
    expect(events.next).toBe("cursor_2");
    expect(events.events.map(({ raw: _raw, ...event }) => event)).toStrictEqual(
      [
        {
          at: "2026-11-01",
          citations: [{ title: "Portmore", url }],
          id: "ev_1",
          summary: "Portmore now comes in sage.",
        },
        { at: "2026-10-30", id: "ev_2", output: { color: "sage" } },
        { at: "2026-10-29", id: "ev_3", output: { price: "12" } },
        {
          at: "2026-10-28T09:00:00Z",
          summary: "Run finished with no material change.",
        },
        { at: "2026-10-27T09:00:00Z", summary: "quota exceeded" },
      ]
    );
  });
});

describe("parallel capabilities", () => {
  it("offers only what Parallel has", () => {
    const { web } = connect();
    expect(web.capabilities).toMatchObject({
      search: true,
      images: true,
      read: true,
      readMany: true,
      extract: true,
      answer: true,
      research: true,
      discover: true,
      decide: true,
      monitor: true,
      product: false,
      map: false,
      crawl: false,
      act: false,
      browser: false,
      parse: false,
      // Parallel's balance API takes an OAuth token, not the API key.
      usage: false,
    });
  });

  it("refuses a capability Parallel lacks instead of falling back", async () => {
    const { web, calls } = connect();
    // @ts-expect-error Parallel has no account usage call for an API key.
    // oxlint-disable-next-line typescript/no-unsafe-call -- calling the missing method is the point of the test
    const attempt = web.usage();
    await expect(attempt).rejects.toMatchObject({ code: "Unsupported" });
    expect(calls).toHaveLength(0);
  });
});
