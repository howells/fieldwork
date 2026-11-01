import { describe, expect, it } from "vitest";

import { tavily } from "../../src/adapters/tavily.js";
import { Fieldwork } from "../../src/index.js";
import { fakeFetch, nth } from "../helpers.js";

const schema = {
  properties: { sku: { description: "The SKU", type: "string" } },
  required: ["sku"],
  type: "object",
};
const url =
  "https://www.tilebar.com/product/portmore-aqua-3x8-glazed-ceramic-tile.html";

const make = (...replies: Parameters<typeof fakeFetch>) => {
  const { fetch, calls } = fakeFetch(...replies);
  const web = new Fieldwork({
    adapter: tavily({ apiKey: "k", fetch, retries: 0 }),
  });
  return { calls, web };
};

describe("tavily config", () => {
  it("sends the key and the project id", async () => {
    const { fetch, calls } = fakeFetch({ body: { results: [] } });
    const web = new Fieldwork({
      adapter: tavily({ apiKey: "k", fetch, projectId: "proj_1", retries: 0 }),
    });
    await web.search("tile");
    expect(nth(calls, 0).headers).toMatchObject({
      authorization: "Bearer k",
      "x-project-id": "proj_1",
    });
  });

  it("leaves the project header out when no project is set", async () => {
    const { web, calls } = make({ body: { results: [] } });
    await web.search("tile");
    expect(nth(calls, 0).headers["x-project-id"]).toBeUndefined();
  });
});

describe("tavily search", () => {
  it("sends the minimal request with usage on", async () => {
    const { web, calls } = make({ body: { results: [] } });
    await web.search("tile", { includeDomains: ["tilebar.com"], limit: 5 });
    expect(calls[0]).toMatchObject({
      body: {
        include_domains: ["tilebar.com"],
        include_usage: true,
        max_results: 5,
        query: "tile",
      },
      method: "POST",
      url: { pathname: "/search" },
    });
  });

  it("sends every documented option under Tavily's names", async () => {
    const { web, calls } = make({ body: { results: [] } });
    await web.search("tile", {
      autoParameters: true,
      chunksPerSource: 2,
      content: "text",
      country: "gb",
      exactMatch: true,
      excludeDomains: ["spam.test"],
      favicon: true,
      filterByLanguage: true,
      filterByPublishedDate: true,
      imageDescriptions: true,
      includeDomains: ["tilebar.com"],
      includeDomainsMode: "prefer",
      includeImages: true,
      language: "en",
      limit: 3,
      maxAge: 7200,
      publishedAfter: "2026-01-01",
      publishedBefore: "2026-06-30",
      recency: "month",
      safeSearch: true,
      searchDepth: "advanced",
      topic: "general",
    });
    expect(nth(calls, 0).body).toStrictEqual({
      auto_parameters: true,
      chunks_per_source: 2,
      country: "united kingdom",
      end_date: "2026-06-30",
      exact_match: true,
      exclude_domains: ["spam.test"],
      filter_by_language: true,
      filter_by_published_date: true,
      include_domains: ["tilebar.com"],
      include_domains_mode: "prefer",
      include_favicon: true,
      include_image_descriptions: true,
      include_images: true,
      include_published_date: true,
      include_raw_content: "text",
      include_usage: true,
      language: "en",
      max_age_hours: 2,
      max_results: 3,
      query: "tile",
      safe_search: true,
      search_depth: "advanced",
      start_date: "2026-01-01",
      time_range: "month",
      topic: "general",
    });
  });

  it("asks for published dates whenever a date option is set", async () => {
    for (const options of [
      { recency: "week" as const },
      { publishedAfter: "2026-01-01" },
      { publishedBefore: "2026-01-01" },
    ]) {
      const { web, calls } = make({ body: { results: [] } });
      await web.search("tile", options);
      expect(nth(calls, 0).body).toMatchObject({
        include_published_date: true,
      });
    }
    const { web, calls } = make({ body: { results: [] } });
    await web.search("tile");
    expect(nth(calls, 0).body).not.toHaveProperty("include_published_date");
  });

  it("sends content: true as Markdown", async () => {
    const { web, calls } = make({ body: { results: [] } });
    await web.search("tile", { content: true });
    expect(nth(calls, 0).body).toMatchObject({
      include_raw_content: "markdown",
    });
  });

  it("converts maxAge from seconds to hours", async () => {
    const cases: [number, number][] = [
      [0, 0],
      [1, 1],
      [3600, 1],
      [3601, 2],
      [-1, -1],
    ];
    for (const [seconds, hours] of cases) {
      const { web, calls } = make({ body: { results: [] } });
      await web.search("tile", { maxAge: seconds });
      expect(nth(calls, 0).body).toMatchObject({ max_age_hours: hours });
    }
  });

  it("returns results, images, answer-free meta and keeps raw", async () => {
    const body = {
      images: [
        { description: "A blue tile", url: "https://a.test/1.jpg" },
        { url: "https://a.test/2.jpg" },
      ],
      query: "tile",
      request_id: "req_1",
      response_time: 0.42,
      results: [
        {
          content: "one [...] two",
          favicon: "https://a.test/f.ico",
          id: "a3f9c2-04",
          published_date: "2026-03-01",
          raw_content: "# Page",
          score: 0.9,
          title: "A",
          url: "https://a.test",
        },
      ],
      usage: { credits: 2 },
    };
    const { web } = make({ body });
    const response = await web.search("tile");
    expect(response).toStrictEqual({
      images: [
        { description: "A blue tile", url: "https://a.test/1.jpg" },
        { url: "https://a.test/2.jpg" },
      ],
      meta: {
        requestId: "req_1",
        usage: { credits: 2, units: { responseTimeSeconds: 0.42 } },
      },
      raw: body,
      results: [
        {
          content: "# Page",
          favicon: "https://a.test/f.ico",
          publishedAt: "2026-03-01",
          score: 0.9,
          snippet: "one [...] two",
          title: "A",
          url: "https://a.test",
        },
      ],
    });
  });

  it("accepts image URLs sent as plain strings", async () => {
    const { web } = make({
      body: { images: ["https://a.test/1.jpg"], results: [] },
    });
    const response = await web.search("tile", { includeImages: true });
    expect(response.images).toStrictEqual([{ url: "https://a.test/1.jpg" }]);
  });

  describe("refuses options Tavily rejects", () => {
    const refused: [string, Record<string, unknown>][] = [
      ["country with the news topic", { country: "GB", topic: "news" }],
      ["a country Tavily does not list", { country: "XX" }],
      [
        "includeDomainsMode without includeDomains",
        { includeDomainsMode: "prefer" },
      ],
      ["filterByLanguage without language", { filterByLanguage: true }],
      ["safeSearch with fast", { safeSearch: true, searchDepth: "fast" }],
      [
        "safeSearch with ultra-fast",
        { safeSearch: true, searchDepth: "ultra-fast" },
      ],
      [
        "chunksPerSource with ultra-fast",
        { chunksPerSource: 2, searchDepth: "ultra-fast" },
      ],
      ["imageDescriptions without includeImages", { imageDescriptions: true }],
      ["a cache age over 30 days", { maxAge: 721 * 3600 }],
    ];

    it.each(refused)("refuses %s", async (_name, options) => {
      const { web, calls } = make();
      await expect(web.search("tile", options)).rejects.toMatchObject({
        code: "InvalidRequest",
      });
      expect(calls).toHaveLength(0);
    });
  });

  it("maps an ISO code to the country name", async () => {
    const { web, calls } = make({ body: { results: [] } });
    await web.search("tile", { country: "US" });
    expect(nth(calls, 0).body).toMatchObject({ country: "united states" });
  });

  it("maps a rate limit to RateLimited with the wait", async () => {
    const { web } = make({
      body: { detail: { error: "plan limit" } },
      headers: { "retry-after": "5" },
      status: 432,
    });
    await expect(web.search("tile")).rejects.toMatchObject({
      code: "RateLimited",
      retryAfter: 5,
      status: 432,
    });
  });
});

describe("tavily images", () => {
  it("searches with images and descriptions on", async () => {
    const { web, calls } = make({ body: { images: [], results: [] } });
    await web.images("blue tile", { safeSearch: true, topic: "general" });
    expect(calls[0]).toMatchObject({
      body: {
        include_image_descriptions: true,
        include_images: true,
        include_usage: true,
        query: "blue tile",
        safe_search: true,
        topic: "general",
      },
      method: "POST",
      url: { pathname: "/search" },
    });
  });

  it("can leave descriptions off", async () => {
    const { web, calls } = make({ body: { images: [], results: [] } });
    await web.images("blue tile", { descriptions: false });
    expect(nth(calls, 0).body).toMatchObject({
      include_image_descriptions: false,
    });
  });

  it("returns the image results with meta", async () => {
    const body = {
      images: [{ description: "A blue tile", url: "https://a.test/1.jpg" }],
      request_id: "req_2",
      results: [],
      usage: { credits: 1 },
    };
    const { web } = make({ body });
    await expect(web.images("blue tile")).resolves.toStrictEqual({
      meta: { requestId: "req_2", usage: { credits: 1 } },
      raw: body,
      results: [{ description: "A blue tile", url: "https://a.test/1.jpg" }],
    });
  });
});

describe("tavily read", () => {
  it("posts one URL to extract with every option", async () => {
    const { web, calls } = make({
      body: { results: [{ raw_content: "x", url }] },
    });
    await web.read(url, {
      chunksPerSource: 2,
      extractDepth: "advanced",
      favicon: true,
      format: "text",
      includeImages: true,
      query: "grout",
      serverTimeout: 20,
    });
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: { pathname: "/extract" },
    });
    expect(nth(calls, 0).body).toStrictEqual({
      chunks_per_source: 2,
      extract_depth: "advanced",
      format: "text",
      include_favicon: true,
      include_images: true,
      include_usage: true,
      query: "grout",
      timeout: 20,
      urls: [url],
    });
  });

  it("returns the page as Markdown, without a title", async () => {
    const body = {
      failed_results: [],
      request_id: "req_3",
      response_time: 0.5,
      results: [
        {
          favicon: "https://a.test/f.ico",
          images: ["https://a.test/1.jpg"],
          raw_content: "# Portmore",
          url,
        },
      ],
      usage: { credits: 1 },
    };
    const { web } = make({ body });
    await expect(web.read(url)).resolves.toStrictEqual({
      favicon: "https://a.test/f.ico",
      images: ["https://a.test/1.jpg"],
      markdown: "# Portmore",
      meta: {
        requestId: "req_3",
        usage: { credits: 1, units: { responseTimeSeconds: 0.5 } },
      },
      raw: body,
      url,
    });
  });

  it("splits query-ranked chunks into excerpts", async () => {
    const { web } = make({
      body: {
        results: [{ raw_content: "First passage [...] Second passage", url }],
      },
    });
    const page = await web.read(url, { query: "grout" });
    expect(page.excerpts).toStrictEqual(["First passage", "Second passage"]);
    expect(page.markdown).toBeUndefined();
  });

  it("refuses chunksPerSource without a query", async () => {
    const { web, calls } = make();
    await expect(web.read(url, { chunksPerSource: 2 })).rejects.toMatchObject({
      code: "InvalidRequest",
    });
    expect(calls).toHaveLength(0);
  });

  it("throws ProviderError with Tavily's reason when the URL failed", async () => {
    const { web } = make({
      body: { failed_results: [{ error: "timeout", url }], results: [] },
    });
    await expect(web.read(url)).rejects.toMatchObject({
      code: "ProviderError",
      message: expect.stringMatching(/timeout/u),
    });
  });

  it("throws NotFound when the page was not found", async () => {
    const { web } = make({
      body: { failed_results: [{ error: "404 Not Found", url }], results: [] },
    });
    await expect(web.read(url)).rejects.toMatchObject({ code: "NotFound" });
  });
});

describe("tavily readMany", () => {
  it("posts the URLs to extract and splits successes from failures", async () => {
    const other = "https://b.test/";
    const body = {
      failed_results: [{ error: "Failed to retrieve content", url: other }],
      request_id: "req_4",
      results: [{ favicon: "https://a.test/f.ico", raw_content: "# One", url }],
      usage: { credits: 1 },
    };
    const { web, calls } = make({ body });
    const batch = await web.readMany([url, other], { extractDepth: "basic" });
    expect(nth(calls, 0).body).toStrictEqual({
      extract_depth: "basic",
      include_usage: true,
      urls: [url, other],
    });
    expect(batch).toStrictEqual({
      failed: [{ error: "Failed to retrieve content", url: other }],
      meta: { requestId: "req_4", usage: { credits: 1 } },
      pages: [
        {
          favicon: "https://a.test/f.ico",
          markdown: "# One",
          raw: body.results[0],
          url,
        },
      ],
      raw: body,
    });
  });

  it("does not throw when every URL failed", async () => {
    const { web } = make({
      body: { failed_results: [{ error: "blocked", url }], results: [] },
    });
    const batch = await web.readMany([url]);
    expect(batch.pages).toStrictEqual([]);
    expect(batch.failed).toStrictEqual([{ error: "blocked", url }]);
  });

  it("refuses an empty list and more than 20 URLs", async () => {
    const { web, calls } = make();
    await expect(web.readMany([])).rejects.toMatchObject({
      code: "InvalidRequest",
    });
    await expect(
      web.readMany(Array.from({ length: 21 }, (_, i) => `https://a.test/${i}`))
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });
});

describe("tavily map", () => {
  it("sends the traversal options under pattern names", async () => {
    const { web, calls } = make({ body: { results: [] } });
    await web.map("https://docs.tavily.com", {
      allowExternal: false,
      excludeDomainPatterns: ["^private\\.tavily\\.com$"],
      excludePathPatterns: ["/admin/.*"],
      instructions: "find the API pages",
      limit: 20,
      maxBreadth: 10,
      maxDepth: 2,
      selectDomainPatterns: ["^docs\\.tavily\\.com$"],
      selectPathPatterns: ["/docs/.*"],
      serverTimeout: 60,
    });
    expect(calls[0]).toMatchObject({ url: { pathname: "/map" } });
    expect(nth(calls, 0).body).toStrictEqual({
      allow_external: false,
      exclude_domains: ["^private\\.tavily\\.com$"],
      exclude_paths: ["/admin/.*"],
      include_usage: true,
      instructions: "find the API pages",
      limit: 20,
      max_breadth: 10,
      max_depth: 2,
      select_domains: ["^docs\\.tavily\\.com$"],
      select_paths: ["/docs/.*"],
      timeout: 60,
      url: "https://docs.tavily.com",
    });
  });

  it("returns the links and credits", async () => {
    const body = {
      base_url: "docs.tavily.com",
      request_id: "req_5",
      results: ["https://docs.tavily.com/a", "https://docs.tavily.com/b"],
      usage: { credits: 1 },
    };
    const { web } = make({ body });
    await expect(web.map("https://docs.tavily.com")).resolves.toStrictEqual({
      links: [
        { url: "https://docs.tavily.com/a" },
        { url: "https://docs.tavily.com/b" },
      ],
      meta: { requestId: "req_5", usage: { credits: 1 } },
      raw: body,
    });
  });
});

describe("tavily crawl", () => {
  it("sends the traversal and extraction options", async () => {
    const { web, calls } = make({ body: { results: [] } });
    await web.crawl("https://docs.tavily.com", {
      chunksPerSource: 2,
      excludeDomainPatterns: ["^x\\.test$"],
      extractDepth: "advanced",
      favicon: true,
      format: "text",
      includeImages: true,
      instructions: "API pages",
      limit: 5,
      maxDepth: 1,
      selectPathPatterns: ["/docs/.*"],
      serverTimeout: 30,
    });
    expect(calls[0]).toMatchObject({ url: { pathname: "/crawl" } });
    expect(nth(calls, 0).body).toStrictEqual({
      chunks_per_source: 2,
      exclude_domains: ["^x\\.test$"],
      extract_depth: "advanced",
      format: "text",
      include_favicon: true,
      include_images: true,
      include_usage: true,
      instructions: "API pages",
      limit: 5,
      max_depth: 1,
      select_paths: ["/docs/.*"],
      timeout: 30,
      url: "https://docs.tavily.com",
    });
  });

  it("returns pages with credits", async () => {
    const result = {
      favicon: "https://docs.tavily.com/f.ico",
      raw_content: "# A",
      url: "https://docs.tavily.com/a",
    };
    const body = {
      base_url: "docs.tavily.com",
      request_id: "req_6",
      results: [result],
      usage: { credits: 3 },
    };
    const { web } = make({ body });
    await expect(web.crawl("https://docs.tavily.com")).resolves.toStrictEqual({
      meta: { requestId: "req_6", usage: { credits: 3 } },
      pages: [
        {
          favicon: result.favicon,
          markdown: "# A",
          raw: result,
          url: result.url,
        },
      ],
      raw: body,
    });
  });

  it("splits instruction-ranked chunks into excerpts", async () => {
    const { web } = make({
      body: {
        results: [{ raw_content: "One [...] Two", url: "https://a.test/" }],
      },
    });
    const crawl = await web.crawl("https://a.test/", { instructions: "x" });
    expect(nth(crawl.pages, 0).excerpts).toStrictEqual(["One", "Two"]);
  });

  it("refuses chunksPerSource without instructions", async () => {
    const { web, calls } = make();
    await expect(
      web.crawl("https://a.test/", { chunksPerSource: 2 })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });
});

describe("tavily answer", () => {
  it("asks search for a basic answer by default", async () => {
    const { web, calls } = make({
      body: { answer: "Blue", results: [] },
    });
    await web.answer("What colour is Portmore Aqua?");
    expect(calls[0]).toMatchObject({
      body: {
        include_answer: "basic",
        include_usage: true,
        query: "What colour is Portmore Aqua?",
      },
      method: "POST",
      url: { pathname: "/search" },
    });
  });

  it("passes the answer depth and search options", async () => {
    const { web, calls } = make({ body: { answer: "Blue", results: [] } });
    await web.answer("q", {
      answerDepth: "advanced",
      limit: 3,
      recency: "year",
      searchDepth: "advanced",
    });
    expect(nth(calls, 0).body).toMatchObject({
      include_answer: "advanced",
      include_published_date: true,
      max_results: 3,
      search_depth: "advanced",
      time_range: "year",
    });
  });

  it("returns the answer with the results as citations", async () => {
    const body = {
      answer: "Blue",
      request_id: "req_7",
      results: [
        { content: "one [...] two", title: "A", url: "https://a.test" },
        { content: "three", title: "B", url: "https://b.test" },
      ],
      usage: { credits: 1 },
    };
    const { web } = make({ body });
    await expect(web.answer("q")).resolves.toStrictEqual({
      answer: "Blue",
      citations: [
        { excerpts: ["one", "two"], title: "A", url: "https://a.test" },
        { excerpts: ["three"], title: "B", url: "https://b.test" },
      ],
      meta: { requestId: "req_7", usage: { credits: 1 } },
      raw: body,
    });
  });

  it("throws when Tavily returns no answer", async () => {
    const { web } = make({ body: { results: [] } });
    await expect(web.answer("q")).rejects.toMatchObject({
      code: "ProviderError",
    });
  });
});

describe("tavily research", () => {
  const completed = {
    content: { sku: "TLPRSRNAQU3X8" },
    request_id: "r1",
    response_time: 31,
    sources: [{ favicon: "https://a.test/f.ico", title: "Portmore", url }],
    status: "completed",
    usage: { credits: 16 },
  };

  it("creates the task with every option", async () => {
    const { web, calls } = make(
      { body: { request_id: "r1", status: "pending" }, status: 201 },
      { body: completed }
    );
    await web.research("SKU", {
      citationFormat: "apa",
      excludeDomains: ["spam.test"],
      files: [
        { data: "hello", name: "notes.md" },
        { data: new Uint8Array([123, 125]), name: "data.json" },
      ],
      includeDomains: ["tilebar.com"],
      interval: 1,
      model: "pro",
      outputLength: "long",
      schema,
    });
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: { pathname: "/research" },
    });
    expect(nth(calls, 0).body).toStrictEqual({
      citation_format: "apa",
      exclude_domains: ["spam.test"],
      files: [
        { data: "aGVsbG8=", name: "notes.md", type: "base64" },
        { data: "e30=", name: "data.json", type: "base64" },
      ],
      include_domains: ["tilebar.com"],
      input: "SKU",
      model: "pro",
      output_length: "long",
      output_schema: schema,
      stream: false,
    });
  });

  it("polls with usage on until the task completes", async () => {
    const { web, calls } = make(
      { body: { request_id: "r1", status: "pending" }, status: 201 },
      { body: { request_id: "r1", status: "in_progress" }, status: 202 },
      { body: completed }
    );
    const run = await web.research<{ sku: string }>("SKU", {
      interval: 1,
      schema,
    });
    expect(
      calls.map(
        (call) => `${call.method} ${call.url.pathname}${call.url.search}`
      )
    ).toStrictEqual([
      "POST /research",
      "GET /research/r1?include_usage=true",
      "GET /research/r1?include_usage=true",
    ]);
    expect(run).toStrictEqual({
      id: "r1",
      meta: {
        requestId: "r1",
        usage: { credits: 16, units: { responseTimeSeconds: 31 } },
      },
      output: { sku: "TLPRSRNAQU3X8" },
      raw: completed,
      sources: [{ title: "Portmore", url }],
      status: "completed",
    });
  });

  it("returns a report as text when there is no schema", async () => {
    const { web } = make(
      { body: { request_id: "r1" }, status: 201 },
      { body: { ...completed, content: "Porcelain." } }
    );
    const run = await web.research("question", { interval: 1 });
    expect(run.output).toBe("Porcelain.");
  });

  it("throws JobFailed with the job id when the task failed", async () => {
    const { web } = make(
      { body: { request_id: "r2" }, status: 201 },
      { body: { request_id: "r2", response_time: 3, status: "failed" } }
    );
    await expect(
      web.research("question", { interval: 1 })
    ).rejects.toMatchObject({ code: "JobFailed", jobId: "r2" });
  });

  it("throws JobFailed when a completed task has no output", async () => {
    const { web } = make(
      { body: { request_id: "r3" }, status: 201 },
      { body: { request_id: "r3", sources: [], status: "completed" } }
    );
    await expect(
      web.research("question", { interval: 1 })
    ).rejects.toMatchObject({ code: "JobFailed", jobId: "r3" });
  });

  it("resumes by id without creating a task", async () => {
    const { web, calls } = make({ body: completed });
    const run = await web.research("ignored", { resume: "r1" });
    expect(run.id).toBe("r1");
    expect(
      calls.map((call) => `${call.method} ${call.url.pathname}`)
    ).toStrictEqual(["GET /research/r1"]);
  });

  it("attaches the job id to an error raised while waiting", async () => {
    const { web } = make(
      { body: { request_id: "req_4" }, status: 201 },
      { body: { error: "bad gateway" }, status: 502 }
    );
    await expect(web.research("question")).rejects.toMatchObject({
      code: "ProviderError",
      jobId: "req_4",
      retryable: false,
      status: 502,
    });
  });

  it("maps an unknown task to NotFound with the job id", async () => {
    const { web } = make({ body: { detail: "not found" }, status: 404 });
    await expect(
      web.research("question", { resume: "gone" })
    ).rejects.toMatchObject({ code: "NotFound", jobId: "gone" });
  });

  it("refuses unsupported files and more than five", async () => {
    const { web, calls } = make();
    await expect(
      web.research("q", { files: [{ data: "x", name: "a.pdf" }] })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    await expect(
      web.research("q", {
        files: Array.from({ length: 6 }, (_, i) => ({
          data: "x",
          name: `${i}.txt`,
        })),
      })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });
});

describe("tavily usage", () => {
  it("reads the account and key usage", async () => {
    const body = {
      account: {
        crawl_usage: 50,
        current_plan: "Bootstrap",
        extract_usage: 75,
        map_usage: 15,
        paygo_limit: 100,
        paygo_usage: 25,
        plan_limit: 15_000,
        plan_usage: 500,
        research_usage: 10,
        search_usage: 350,
      },
      key: {
        crawl_usage: 15,
        extract_usage: 25,
        limit: 1000,
        map_usage: 7,
        research_usage: 3,
        search_usage: 100,
        usage: 150,
      },
    };
    const { web, calls } = make({ body });
    const usage = await web.usage();
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: { pathname: "/usage" },
    });
    expect(usage).toStrictEqual({
      breakdown: {
        crawl: 50,
        extract: 75,
        keyTotal: 150,
        map: 15,
        paygo: 25,
        research: 10,
        search: 350,
      },
      limit: 15_000,
      raw: body,
      used: 500,
    });
  });
});

describe("tavily operations", () => {
  it("offers only the capabilities Tavily has", () => {
    const { web } = make();
    expect(
      Object.entries(web.capabilities)
        .filter(([, offered]) => offered)
        .map(([name]) => name)
        .toSorted()
    ).toStrictEqual([
      "answer",
      "crawl",
      "images",
      "map",
      "read",
      "readMany",
      "research",
      "search",
      "usage",
    ]);
  });
});
