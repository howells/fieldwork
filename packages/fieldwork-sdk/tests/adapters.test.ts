import { describe, expect, it } from "vitest";

import { exa } from "../src/adapters/exa.js";
import { firecrawl } from "../src/adapters/firecrawl.js";
import { parallel } from "../src/adapters/parallel.js";
import { perplexity } from "../src/adapters/perplexity.js";
import { tavily } from "../src/adapters/tavily.js";
import { Fieldwork } from "../src/index.js";
import { fakeFetch } from "./helpers.js";

const schema = {
  type: "object",
  properties: { sku: { type: "string" } },
  required: ["sku"],
};
const url =
  "https://www.tilebar.com/product/portmore-aqua-3x8-glazed-ceramic-tile.html";

describe("exa adapter", () => {
  it("searches with Exa's field names", async () => {
    const { fetch, calls } = fakeFetch({
      body: {
        results: [
          {
            url: "https://a.test",
            title: "A",
            publishedDate: "2026-01-01",
            text: "body",
          },
        ],
      },
    });
    const web = new Fieldwork({ adapter: exa({ apiKey: "k", fetch }) });
    const response = await web.search("tile", {
      limit: 5,
      publishedAfter: "2026-01-01",
      category: "pdf",
      content: true,
    });
    expect(calls[0]!.headers["x-api-key"]).toBe("k");
    expect(calls[0]!.body).toStrictEqual({
      query: "tile",
      numResults: 5,
      category: "pdf",
      startPublishedDate: "2026-01-01",
      contents: { text: true },
    });
    expect(response.results).toStrictEqual([
      {
        url: "https://a.test",
        title: "A",
        content: "body",
        publishedAt: "2026-01-01",
      },
    ]);
  });

  it("parses a schema summary from /contents", async () => {
    const { fetch, calls } = fakeFetch({
      body: {
        results: [{ url, summary: '{"sku":"TLPRSRNAQU3X8"}' }],
        statuses: [{ id: url, status: "success" }],
      },
    });
    const web = new Fieldwork({ adapter: exa({ apiKey: "k", fetch }) });
    const result = await web.extract<{ sku: string }>(url, {
      schema,
      prompt: "the selected tile",
    });
    expect(result.data.sku).toBe("TLPRSRNAQU3X8");
    expect(calls[0]!.body).toMatchObject({
      urls: [url],
      summary: { query: "the selected tile", schema },
    });
  });

  it("reports a page Exa could not read", async () => {
    const { fetch } = fakeFetch({
      body: {
        results: [],
        statuses: [
          { id: url, status: "error", error: { tag: "CRAWL_NOT_FOUND" } },
        ],
      },
    });
    const web = new Fieldwork({ adapter: exa({ apiKey: "k", fetch }) });
    await expect(web.read(url)).rejects.toMatchObject({ code: "NotFound" });
  });

  it("polls an agent run and keeps its grounding", async () => {
    const { fetch, calls } = fakeFetch(
      { body: { id: "run_1", status: "running" } },
      { body: { id: "run_1", status: "running" } },
      {
        body: {
          id: "run_1",
          status: "completed",
          output: {
            structured: { sku: "TLPRSRNAQU3X8" },
            grounding: [
              {
                field: "structured.sku",
                citations: [{ url, title: "Portmore" }],
                confidence: "high",
              },
            ],
          },
        },
      }
    );
    const web = new Fieldwork({ adapter: exa({ apiKey: "k", fetch }) });
    const run = await web.research<{ sku: string }>("Portmore SKU", {
      schema,
      effort: "low",
      interval: 1,
    });
    expect(run.output.sku).toBe("TLPRSRNAQU3X8");
    expect(run.fields).toStrictEqual([
      {
        field: "structured.sku",
        citations: [{ url, title: "Portmore" }],
        confidence: "high",
      },
    ]);
    expect(run.sources).toStrictEqual([{ url, title: "Portmore" }]);
    expect(
      calls.map((call) => `${call.method} ${call.url.pathname}`)
    ).toStrictEqual([
      "POST /agent/runs",
      "GET /agent/runs/run_1",
      "GET /agent/runs/run_1",
    ]);
  });
});

describe("firecrawl adapter", () => {
  it("reads a page with extra formats", async () => {
    const { fetch, calls } = fakeFetch({
      body: {
        success: true,
        data: {
          markdown: "# Portmore",
          rawHtml: "<html>",
          links: ["https://a.test"],
          metadata: { title: "Portmore", sourceURL: url },
        },
      },
    });
    const web = new Fieldwork({ adapter: firecrawl({ apiKey: "k", fetch }) });
    const page = await web.read(url, {
      include: ["rawHtml", "links"],
      maxAge: 0,
    });
    expect(calls[0]!.headers.authorization).toBe("Bearer k");
    expect(calls[0]!.body).toStrictEqual({
      url,
      formats: ["markdown", "rawHtml", "links"],
      maxAge: 0,
    });
    expect(page).toMatchObject({
      url,
      title: "Portmore",
      markdown: "# Portmore",
      rawHtml: "<html>",
      links: ["https://a.test"],
    });
  });

  it("reads product variants without a model", async () => {
    const { fetch, calls } = fakeFetch({
      body: {
        success: true,
        data: {
          product: {
            title: "Portmore",
            brand: "TileBar",
            variants: [
              {
                sku: "TLPRSRNAQU3X8",
                values: { color: "Aqua", size: "3x8" },
                price: { amount: "53.53", currency: "USD" },
                availability: { inStock: true },
              },
            ],
          },
        },
      },
    });
    const web = new Fieldwork({ adapter: firecrawl({ apiKey: "k", fetch }) });
    const product = await web.product(url);
    expect(calls[0]!.body).toMatchObject({ formats: ["product"] });
    expect(product.variants).toStrictEqual([
      {
        sku: "TLPRSRNAQU3X8",
        values: { color: "Aqua", size: "3x8" },
        price: { amount: "53.53", currency: "USD" },
        inStock: true,
      },
    ]);
  });

  it("follows crawl pages until the last batch", async () => {
    const { fetch, calls } = fakeFetch(
      { body: { success: true, id: "c1" } },
      { body: { status: "scraping" } },
      {
        body: {
          status: "completed",
          data: [{ markdown: "a", metadata: { url: "https://s.test/a" } }],
          next: "https://api.firecrawl.dev/v2/crawl/c1?skip=1",
        },
      },
      {
        body: {
          status: "completed",
          data: [{ markdown: "b", metadata: { url: "https://s.test/b" } }],
        },
      }
    );
    const web = new Fieldwork({ adapter: firecrawl({ apiKey: "k", fetch }) });
    const crawl = await web.crawl("https://s.test", { limit: 2, interval: 1 });
    expect(crawl.pages.map((page) => page.url)).toStrictEqual([
      "https://s.test/a",
      "https://s.test/b",
    ]);
    expect(calls[3]!.url.pathname + calls[3]!.url.search).toBe(
      "/v2/crawl/c1?skip=1"
    );
  });

  it("closes the browser session after running a script", async () => {
    const { fetch, calls } = fakeFetch(
      { body: { success: true, id: "s1" } },
      {
        body: {
          success: true,
          stdout: "4x4\n",
          stderr: "",
          result: "",
          exitCode: 0,
        },
      },
      { body: { success: true } }
    );
    const web = new Fieldwork({ adapter: firecrawl({ apiKey: "k", fetch }) });
    const result = await web.act("console.log('4x4')", { ttl: 60 });
    expect(result).toMatchObject({ stdout: "4x4\n", exitCode: 0 });
    expect(
      calls.map((call) => `${call.method} ${call.url.pathname}`)
    ).toStrictEqual([
      "POST /v2/interact",
      "POST /v2/interact/s1/execute",
      "DELETE /v2/interact/s1",
    ]);
  });

  it("uploads a document to parse as multipart", async () => {
    const { fetch, calls } = fakeFetch({
      body: {
        success: true,
        data: {
          markdown: "care",
          pages: [{ pageNumber: 1, markdown: "care" }],
          blocks: [],
        },
      },
    });
    const web = new Fieldwork({ adapter: firecrawl({ apiKey: "k", fetch }) });
    const parsed = await web.parse(
      { data: new Uint8Array([37, 80, 68, 70]), name: "care.pdf" },
      { pages: true, blocks: true }
    );
    expect(calls[0]!.body).toBeInstanceOf(FormData);
    const form = calls[0]!.body as FormData;
    expect((form.get("file") as File).name).toBe("care.pdf");
    expect(JSON.parse(form.get("options") as string)).toStrictEqual({
      formats: ["markdown"],
      parsers: [{ type: "pdf", pages: true, blocks: true }],
    });
    expect(parsed.pages).toStrictEqual([{ pageNumber: 1, markdown: "care" }]);
  });
});

describe("tavily adapter", () => {
  it("searches with Tavily's field names and returns its answer", async () => {
    const { fetch, calls } = fakeFetch({
      body: {
        answer: "Blue",
        results: [
          { url: "https://a.test", title: "A", content: "snippet", score: 0.9 },
        ],
      },
    });
    const web = new Fieldwork({ adapter: tavily({ apiKey: "k", fetch }) });
    const response = await web.search("tile", {
      topic: "news",
      answer: true,
      includeDomains: ["tilebar.com"],
    });
    expect(calls[0]!.body).toStrictEqual({
      query: "tile",
      topic: "news",
      include_answer: true,
      include_domains: ["tilebar.com"],
    });
    expect(response.answer).toBe("Blue");
    expect(response.results[0]).toStrictEqual({
      url: "https://a.test",
      title: "A",
      snippet: "snippet",
      score: 0.9,
    });
  });

  it("throws when Tavily returns the URL as failed", async () => {
    const { fetch } = fakeFetch({
      body: { results: [], failed_results: [{ url, error: "timeout" }] },
    });
    const web = new Fieldwork({ adapter: tavily({ apiKey: "k", fetch }) });
    await expect(web.read(url)).rejects.toThrow(/timeout/u);
  });

  it("polls research until it completes", async () => {
    const { fetch } = fakeFetch(
      { status: 201, body: { request_id: "r1", status: "pending" } },
      { status: 202, body: { status: "in_progress" } },
      {
        body: {
          status: "completed",
          content: { sku: "TLPRSRNAQU3X8" },
          sources: [{ url, title: "Portmore" }],
        },
      }
    );
    const web = new Fieldwork({ adapter: tavily({ apiKey: "k", fetch }) });
    const run = await web.research<{ sku: string }>("SKU", {
      schema,
      interval: 1,
    });
    expect(run).toMatchObject({
      id: "r1",
      output: { sku: "TLPRSRNAQU3X8" },
      sources: [{ url, title: "Portmore" }],
    });
  });
});

describe("parallel adapter", () => {
  it("extracts through a Task run and keeps its basis", async () => {
    const { fetch, calls } = fakeFetch(
      { body: { run_id: "trun_1", status: "queued" } },
      {
        body: {
          run: { run_id: "trun_1", status: "completed" },
          output: {
            type: "json",
            content: { sku: "TLPRSRNAQU3X8" },
            basis: [
              {
                field: "sku",
                citations: [{ url, excerpts: ["SKU TLPRSRNAQU3X8"] }],
                confidence: "high",
              },
            ],
          },
        },
      }
    );
    const web = new Fieldwork({ adapter: parallel({ apiKey: "k", fetch }) });
    const result = await web.extract<{ sku: string }>(url, { schema });
    expect(calls[0]!.body).toMatchObject({
      processor: "base",
      input: { url },
      source_policy: {
        include_domains: [
          "www.tilebar.com/product/portmore-aqua-3x8-glazed-ceramic-tile.html",
        ],
      },
      task_spec: { output_schema: { type: "json", json_schema: schema } },
    });
    expect(calls[1]!.url.pathname).toBe("/v1/tasks/runs/trun_1/result");
    expect(result.data.sku).toBe("TLPRSRNAQU3X8");
    expect(result.fields).toStrictEqual([
      {
        field: "sku",
        citations: [{ url, excerpts: ["SKU TLPRSRNAQU3X8"] }],
        confidence: "high",
      },
    ]);
  });

  it("asks for the result again while the run is still going", async () => {
    const { fetch, calls } = fakeFetch(
      { body: { run_id: "trun_2" } },
      { status: 408, body: { error: "still running" } },
      {
        body: {
          run: { status: "completed" },
          output: { type: "text", content: "Blue" },
        },
      }
    );
    const web = new Fieldwork({ adapter: parallel({ apiKey: "k", fetch }) });
    const run = await web.research<string>("What colorway?");
    expect(run.output).toBe("Blue");
    expect(calls).toHaveLength(3);
  });

  it("reads full content with Extract", async () => {
    const { fetch, calls } = fakeFetch({
      body: {
        results: [{ url, title: "Portmore", full_content: "# Portmore" }],
        errors: [],
      },
    });
    const web = new Fieldwork({ adapter: parallel({ apiKey: "k", fetch }) });
    const page = await web.read(url);
    expect(calls[0]!.body).toStrictEqual({
      urls: [url],
      advanced_settings: { full_content: true },
    });
    expect(page.markdown).toBe("# Portmore");
  });
});

describe("perplexity adapter", () => {
  it("converts dates and excluded domains to Perplexity's forms", async () => {
    const { fetch, calls } = fakeFetch({
      body: {
        results: [
          {
            url: "https://a.test",
            title: "A",
            snippet: "s",
            date: "2026-02-01",
          },
        ],
      },
    });
    const web = new Fieldwork({ adapter: perplexity({ apiKey: "k", fetch }) });
    await web.search("tile", {
      publishedAfter: "2026-01-31",
      includeDomains: ["tilebar.com"],
      excludeDomains: ["pinterest.com"],
    });
    expect(calls[0]!.body).toStrictEqual({
      query: "tile",
      search_domain_filter: ["tilebar.com", "-pinterest.com"],
      search_after_date_filter: "01/31/2026",
    });
  });

  it("needs a model for research", async () => {
    const web = new Fieldwork({
      adapter: perplexity({ apiKey: "k", fetch: fakeFetch().fetch }),
    });
    await expect(web.research("q")).rejects.toMatchObject({
      code: "InvalidRequest",
    });
  });

  it("parses structured output and collects fetched sources", async () => {
    const { fetch } = fakeFetch({
      body: {
        id: "resp_1",
        status: "completed",
        output: [
          {
            type: "fetch_url_results",
            contents: [{ url, title: "Portmore", snippet: "SKU" }],
          },
          {
            type: "message",
            content: [{ type: "output_text", text: '{"sku":"TLPRSRNAQU3X8"}' }],
          },
        ],
      },
    });
    const web = new Fieldwork({
      adapter: perplexity({ apiKey: "k", model: "openai/gpt-6-luna", fetch }),
    });
    const run = await web.research<{ sku: string }>("SKU", { schema });
    expect(run.output.sku).toBe("TLPRSRNAQU3X8");
    expect(run.sources).toStrictEqual([{ url, title: "Portmore" }]);
  });
});
