import { describe, expect, it } from "vitest";

import { exa } from "../../src/adapters/exa.js";
import { Fieldwork } from "../../src/index.js";
import { fakeFetch, nth } from "../helpers.js";

const schema = {
  properties: { sku: { type: "string" } },
  required: ["sku"],
  type: "object",
};
const url =
  "https://www.tilebar.com/product/portmore-aqua-3x8-glazed-ceramic-tile.html";

type Reply = Parameters<typeof fakeFetch>[number];

const started = (id: string): Reply => ({ body: { id, status: "queued" } });

const readFailing = async (error: Record<string, unknown>) =>
  await client({
    body: { results: [], statuses: [{ error, id: url, status: "error" }] },
  }).web.read(url);

const refusesSearch = async (
  web: ReturnType<typeof client>["web"],
  options: Record<string, unknown>,
  pattern: RegExp
) => {
  await expect(web.search("tile", options)).rejects.toMatchObject({
    code: "InvalidRequest",
    message: expect.stringMatching(pattern),
  });
};

const client = (...replies: Parameters<typeof fakeFetch>) => {
  const { fetch, calls } = fakeFetch(...replies);
  return {
    calls,
    web: new Fieldwork({ adapter: exa({ apiKey: "k", fetch }) }),
  };
};

describe("exa search", () => {
  it("sends Exa's current field names and asks for highlights", async () => {
    const { web, calls } = client({ body: { results: [] } });
    await web.search("tile", {
      additionalQueries: ["glazed ceramic"],
      category: "publication",
      content: true,
      country: "GB",
      excludeDomains: ["b.test"],
      includeDomains: ["a.test"],
      limit: 5,
      maxAge: 7200,
      moderation: true,
      publishedAfter: "2026-01-01",
      publishedBefore: "2026-02-01",
      type: "deep",
    });
    expect(nth(calls, 0).method).toBe("POST");
    expect(nth(calls, 0).url.pathname).toBe("/search");
    expect(nth(calls, 0).headers["x-api-key"]).toBe("k");
    expect(nth(calls, 0).body).toStrictEqual({
      additionalQueries: ["glazed ceramic"],
      category: "publication",
      contents: { highlights: true, maxAgeHours: 2, text: true },
      endPublishedDate: "2026-02-01T23:59:59.999Z",
      excludeDomains: ["b.test"],
      includeDomains: ["a.test"],
      moderation: true,
      numResults: 5,
      query: "tile",
      startPublishedDate: "2026-01-01T00:00:00.000Z",
      type: "deep",
      userLocation: { country: "GB" },
    });
  });

  it("never sends the crawl-date or text-match fields Exa ignores or deprecates", async () => {
    const { web, calls } = client({ body: { results: [] } });
    await web.search("tile", {
      // @ts-expect-error Exa's deprecated fields are not in the types
      crawledAfter: "2026-01-01",
      includeText: ["x"],
    });
    expect(nth(calls, 0).body).toStrictEqual({
      contents: { highlights: true },
      query: "tile",
    });
  });

  it("steers highlights and drops them when asked", async () => {
    const steered = client({ body: { results: [] } });
    await steered.web.search("tile", {
      highlights: { maxCharacters: 500, query: "glaze" },
      summary: { query: "who makes it" },
    });
    expect(nth(steered.calls, 0).body).toMatchObject({
      contents: {
        highlights: { maxCharacters: 500, query: "glaze" },
        summary: { query: "who makes it" },
      },
    });
    const plain = client({ body: { results: [] } });
    await plain.web.search("tile", { highlights: false });
    expect(nth(plain.calls, 0).body).toStrictEqual({ query: "tile" });
  });

  it("accepts a legacy type Exa still serves", async () => {
    const { web, calls } = client({ body: { results: [] } });
    await web.search("tile", { type: "fast" });
    expect(nth(calls, 0).body).toMatchObject({ type: "fast" });
  });

  it("normalizes results, meta, warnings and notices", async () => {
    const { web } = client({
      body: {
        costDollars: { total: 0.007 },
        notices: [{ code: "NOTE", message: "y was adjusted", path: "y" }],
        requestId: "req_1",
        results: [
          {
            author: "Ada",
            entities: [{ name: "A Ltd", type: "company" }],
            favicon: "https://a.test/f.ico",
            highlightScores: [0.9, 0.5],
            highlights: ["one", "two"],
            image: "https://a.test/i.png",
            publishedDate: "2026-01-01T00:00:00.000Z",
            summary: "kept in raw",
            text: "body",
            title: "A",
            url: "https://a.test",
          },
        ],
        warnings: [
          { code: "IGNORED_FIELD", message: "x was ignored", path: "x" },
        ],
      },
    });
    const response = await web.search("tile");
    expect(response.results).toStrictEqual([
      {
        author: "Ada",
        content: "body",
        favicon: "https://a.test/f.ico",
        image: "https://a.test/i.png",
        publishedAt: "2026-01-01T00:00:00.000Z",
        snippet: "one … two",
        title: "A",
        url: "https://a.test",
      },
    ]);
    expect(response.meta).toStrictEqual({
      requestId: "req_1",
      usage: { costUsd: 0.007 },
      warnings: ["x was ignored", "y was adjusted"],
    });
    expect(response.answer).toBeUndefined();
    expect(response.raw).toHaveProperty("results.0.entities.length", 1);
  });

  it("fills answer from the generated output", async () => {
    const text = client({
      body: {
        output: { content: "Portmore is glazed ceramic.", grounding: [] },
        results: [],
      },
    });
    const answered = await text.web.search("tile", {
      outputSchema: { description: "one sentence", type: "text" },
      systemPrompt: "Be brief",
    });
    expect(nth(text.calls, 0).body).toMatchObject({
      outputSchema: { description: "one sentence", type: "text" },
      systemPrompt: "Be brief",
    });
    expect(answered.answer).toBe("Portmore is glazed ceramic.");

    const object = client({
      body: {
        output: { content: { sku: "T1" }, grounding: [] },
        results: [],
      },
    });
    const structured = await object.web.search("tile", {
      outputSchema: { properties: { sku: { type: "string" } }, type: "object" },
    });
    expect(structured.answer).toBe('{"sku":"T1"}');
  });

  it("refuses options Exa rejects, before sending anything", async () => {
    const { web, calls } = client();
    const refused = async (
      options: Record<string, unknown>,
      pattern: RegExp
    ) => {
      await refusesSearch(web, options, pattern);
    };
    await refused({ summary: true, type: "lite" }, /lite.*summary/u);
    await refused({ maxAge: 0, type: "lite" }, /lite.*maxAge/u);
    await refused({ additionalQueries: ["x"] }, /additionalQueries/u);
    await refused(
      { additionalQueries: ["x"], type: "fast" },
      /additionalQueries/u
    );
    await refused(
      { category: "company", publishedAfter: "2026-01-01" },
      /company/u
    );
    await refused(
      { category: "people", excludeDomains: ["a.test"] },
      /people/u
    );
    expect(calls).toHaveLength(0);
  });
});

describe("exa read", () => {
  it("reads one URL through /contents", async () => {
    const { web, calls } = client({
      body: {
        results: [{ text: "# Portmore", url }],
        statuses: [{ id: url, source: "cached", status: "success" }],
      },
    });
    await web.read(url, {
      imageLimit: 0,
      linkLimit: 10,
      maxAge: 0,
      maxCharacters: 2000,
      query: "size",
      snapshotAsOf: "2026-01-15",
      summary: { query: "what is it" },
    });
    expect(nth(calls, 0).method).toBe("POST");
    expect(nth(calls, 0).url.pathname).toBe("/contents");
    expect(nth(calls, 0).body).toStrictEqual({
      extras: { links: 10 },
      highlights: { query: "size" },
      maxAgeHours: 0,
      snapshotAsOf: "2026-01-15",
      summary: { query: "what is it" },
      text: { maxCharacters: 2000 },
      urls: [url],
    });
  });

  it("asks for plain text and 100 links and images by default, and converts maxAge to hours", async () => {
    const { web, calls } = client({
      body: { results: [{ url }], statuses: [{ id: url, status: "success" }] },
    });
    await web.read(url, { maxAge: 90_000 });
    expect(nth(calls, 0).body).toStrictEqual({
      extras: { imageLinks: 100, links: 100 },
      maxAgeHours: 25,
      text: true,
      urls: [url],
    });
  });

  it("normalizes the page and its meta", async () => {
    const { web } = client({
      body: {
        costDollars: { total: 0.002 },
        requestId: "req_2",
        results: [
          {
            author: "Tilebar",
            extras: {
              imageLinks: ["https://x.test/i.jpg"],
              links: ["https://x.test"],
            },
            favicon: "https://tilebar.com/f.ico",
            highlights: ["3x8"],
            image: "https://tilebar.com/i.png",
            publishedDate: "2026-02-02",
            summary: "A tile.",
            text: "# Portmore",
            title: "Portmore",
            url,
          },
        ],
        statuses: [{ id: url, status: "success" }],
      },
    });
    const page = await web.read(url);
    expect(page).toMatchObject({
      author: "Tilebar",
      excerpts: ["3x8"],
      favicon: "https://tilebar.com/f.ico",
      image: "https://tilebar.com/i.png",
      images: ["https://x.test/i.jpg"],
      links: ["https://x.test"],
      markdown: "# Portmore",
      meta: { requestId: "req_2", usage: { costUsd: 0.002 } },
      publishedAt: "2026-02-02",
      summary: "A tile.",
      title: "Portmore",
      url,
    });
  });

  it("maps a per-URL failure to an error code", async () => {
    const failing = readFailing;
    await expect(failing({ tag: "CRAWL_NOT_FOUND" })).rejects.toMatchObject({
      code: "NotFound",
    });
    await expect(failing({ tag: "CRAWL_TIMEOUT" })).rejects.toMatchObject({
      code: "Timeout",
    });
    await expect(
      failing({ httpStatusCode: 403, tag: "SOURCE_NOT_AVAILABLE" })
    ).rejects.toMatchObject({
      code: "ProviderError",
      message: expect.stringContaining("SOURCE_NOT_AVAILABLE"),
      status: 403,
    });
    await expect(failing({ httpStatusCode: 404 })).rejects.toMatchObject({
      code: "NotFound",
    });
  });

  it("reports a response with no result at all", async () => {
    const { web } = client({ body: { results: [], statuses: [] } });
    await expect(web.read(url)).rejects.toMatchObject({
      code: "ProviderError",
    });
  });
});

describe("exa readMany", () => {
  const second = "https://example.test/b";

  it("sends every URL in one /contents call", async () => {
    const { web, calls } = client({ body: { results: [], statuses: [] } });
    await web.readMany([url, second], { maxAge: 3600 });
    expect(calls).toHaveLength(1);
    expect(nth(calls, 0).url.pathname).toBe("/contents");
    expect(nth(calls, 0).body).toMatchObject({
      maxAgeHours: 1,
      urls: [url, second],
    });
  });

  it("returns pages and lists per-URL failures instead of throwing", async () => {
    const { web } = client({
      body: {
        costDollars: { total: 0.004 },
        requestId: "req_3",
        results: [{ text: "body", title: "Portmore", url }],
        statuses: [
          { id: url, status: "success" },
          {
            error: { httpStatusCode: 404, tag: "CRAWL_NOT_FOUND" },
            id: second,
            status: "error",
          },
        ],
      },
    });
    const batch = await web.readMany([url, second]);
    expect(batch.pages).toHaveLength(1);
    expect(batch.pages[0]).toMatchObject({
      markdown: "body",
      title: "Portmore",
      url,
    });
    expect(batch.failed).toStrictEqual([
      { error: "CRAWL_NOT_FOUND", url: second },
    ]);
    expect(batch.meta).toStrictEqual({
      requestId: "req_3",
      usage: { costUsd: 0.004 },
    });
  });

  it("refuses an empty list and more than 100 URLs", async () => {
    const { web, calls } = client();
    await expect(web.readMany([])).rejects.toMatchObject({
      code: "InvalidRequest",
    });
    await expect(
      web.readMany(Array.from({ length: 101 }, (_, n) => `https://a.test/${n}`))
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });
});

describe("exa extract", () => {
  it("parses a schema summary from /contents", async () => {
    const { web, calls } = client({
      body: {
        costDollars: { total: 0.001 },
        requestId: "req_4",
        results: [{ summary: '{"sku":"TLPRSRNAQU3X8"}', url }],
        statuses: [{ id: url, status: "success" }],
      },
    });
    const result = await web.extract<{ sku: string }>(url, {
      maxAge: 0,
      prompt: "the selected tile",
      schema,
    });
    expect(result.data.sku).toBe("TLPRSRNAQU3X8");
    expect(result.meta).toStrictEqual({
      requestId: "req_4",
      usage: { costUsd: 0.001 },
    });
    expect(nth(calls, 0).url.pathname).toBe("/contents");
    expect(nth(calls, 0).body).toStrictEqual({
      maxAgeHours: 0,
      summary: { query: "the selected tile", schema },
      urls: [url],
    });
  });

  it("reports a missing summary", async () => {
    const { web } = client({
      body: { results: [{ url }], statuses: [{ id: url, status: "success" }] },
    });
    await expect(web.extract(url, { schema })).rejects.toMatchObject({
      code: "ProviderError",
    });
  });
});

describe("exa answer", () => {
  it("calls /answer and returns the cited answer", async () => {
    const { web, calls } = client({
      body: {
        answer: "Portmore is ceramic.",
        citations: [
          { text: "ignored", title: "Portmore", url },
          { title: "Portmore again", url },
        ],
        costDollars: { total: 0.005 },
        requestId: "req_5",
      },
    });
    const result = await web.answer("What is Portmore?", {
      country: "US",
      model: "exa-pro",
      systemPrompt: "Be brief",
    });
    expect(nth(calls, 0).method).toBe("POST");
    expect(nth(calls, 0).url.pathname).toBe("/answer");
    expect(nth(calls, 0).body).toStrictEqual({
      model: "exa-pro",
      query: "What is Portmore?",
      systemPrompt: "Be brief",
      userLocation: { country: "US" },
    });
    expect(result).toMatchObject({
      answer: "Portmore is ceramic.",
      citations: [{ title: "Portmore", url }],
      meta: { requestId: "req_5", usage: { costUsd: 0.005 } },
    });
    expect(result.output).toBeUndefined();
  });

  it("returns a structured answer as output", async () => {
    const { web, calls } = client({
      body: { answer: { sku: "T1" }, citations: [] },
    });
    const result = await web.answer<{ sku: string }>("SKU?", { schema });
    expect(nth(calls, 0).body).toMatchObject({ outputSchema: schema });
    expect(result.output).toStrictEqual({ sku: "T1" });
    expect(result.answer).toBe('{"sku":"T1"}');
  });
});

describe("exa research", () => {
  const grounded = {
    grounding: [
      {
        citations: [{ title: "Portmore", url }],
        confidence: "high",
        field: "structured.sku",
      },
    ],
    structured: { sku: "TLPRSRNAQU3X8" },
    text: "",
  };
  const costs = {
    costDollars: { total: 0.62 },
    usage: { agentComputeUnits: 3, emails: 0, phoneNumbers: 0, searches: 4 },
  };

  it("starts a run with every option and polls until it completes", async () => {
    const { web, calls } = client(
      { body: { id: "run_1", status: "queued" } },
      { body: { id: "run_1", status: "running" } },
      {
        body: {
          id: "run_1",
          output: grounded,
          status: "completed",
          stopReason: "schema_satisfied",
          ...costs,
        },
      }
    );
    const run = await web.research<{ sku: string }>("Portmore SKU", {
      continueFrom: "run_0",
      effort: "ultra",
      input: { data: [{ name: "Portmore" }], exclusion: [{ name: "Other" }] },
      interval: 1,
      maxCostDollars: 10,
      maxDurationSeconds: 600,
      schema,
      systemPrompt: "Be exact",
    });
    expect(nth(calls, 0).body).toStrictEqual({
      budget: { maxCostDollars: 10, maxDurationSeconds: 600 },
      effort: "ultra",
      input: { data: [{ name: "Portmore" }], exclusion: [{ name: "Other" }] },
      outputSchema: schema,
      previousRunId: "run_0",
      query: "Portmore SKU",
      systemPrompt: "Be exact",
    });
    expect(
      calls.map((call) => `${call.method} ${call.url.pathname}`)
    ).toStrictEqual([
      "POST /agent/runs",
      "GET /agent/runs/run_1",
      "GET /agent/runs/run_1",
    ]);
    expect(run).toMatchObject({
      continuationId: "run_1",
      fields: [
        {
          citations: [{ title: "Portmore", url }],
          confidence: "high",
          field: "structured.sku",
        },
      ],
      id: "run_1",
      meta: {
        usage: {
          costUsd: 0.62,
          units: {
            agentComputeUnits: 3,
            emails: 0,
            phoneNumbers: 0,
            searches: 4,
          },
        },
      },
      output: { sku: "TLPRSRNAQU3X8" },
      sources: [{ title: "Portmore", url }],
      status: "completed",
    });
    expect(run.stopReason).toBeUndefined();
  });

  it("returns report text when no schema was given", async () => {
    const { web } = client(started("run_2"), {
      body: {
        id: "run_2",
        output: { grounding: [], structured: null, text: "A report." },
        status: "completed",
        stopReason: "schema_satisfied",
      },
    });
    const run = await web.research<string>("Report", { interval: 1 });
    expect(run.output).toBe("A report.");
  });

  it.each([
    "budget_reached",
    "time_limit_reached",
    "stopped",
    "iteration_limit_reached",
  ])(
    "returns a completed run that stopped on %s as partial",
    async (stopReason) => {
      const { web } = client(started("run_3"), {
        body: {
          id: "run_3",
          output: grounded,
          status: "completed",
          stopReason,
          ...costs,
        },
      });
      const run = await web.research<{ sku: string }>("Portmore SKU", {
        interval: 1,
        schema,
      });
      expect(run).toMatchObject({
        continuationId: "run_3",
        output: { sku: "TLPRSRNAQU3X8" },
        status: "partial",
        stopReason,
      });
    }
  );

  it("returns a failed run that still has output as partial, without a continuation", async () => {
    const { web } = client(started("run_4"), {
      body: {
        error: {
          code: "TIMEOUT",
          message: "ran too long",
          type: "SERVER_ERROR",
        },
        id: "run_4",
        output: { grounding: [], structured: null, text: "Half a report." },
        status: "failed",
        stopReason: "error",
      },
    });
    const run = await web.research<string>("Report", { interval: 1 });
    expect(run).toMatchObject({
      output: "Half a report.",
      status: "partial",
      stopReason: "error",
    });
    expect(run.continuationId).toBeUndefined();
  });

  it("throws JobFailed with the job id when a run ends with no output", async () => {
    const { web } = client(started("run_5"), {
      body: {
        error: {
          code: "INVALID_OUTPUT_SCHEMA",
          message: "bad schema",
          type: "INVALID_REQUEST",
        },
        id: "run_5",
        output: { grounding: [], structured: null, text: "" },
        status: "failed",
        stopReason: "error",
      },
    });
    await expect(
      web.research("Portmore SKU", { interval: 1, schema })
    ).rejects.toMatchObject({
      code: "JobFailed",
      jobId: "run_5",
      message: expect.stringContaining("INVALID_OUTPUT_SCHEMA"),
    });

    const cancelled = client(started("run_6"), {
      body: {
        id: "run_6",
        output: { grounding: [], structured: null, text: "" },
        status: "cancelled",
        stopReason: "cancelled",
      },
    });
    await expect(
      cancelled.web.research("Report", { interval: 1 })
    ).rejects.toMatchObject({ code: "JobFailed", jobId: "run_6" });
  });

  it("resumes a run by id without starting another", async () => {
    const { web, calls } = client({
      body: {
        id: "run_7",
        output: grounded,
        request: { outputSchema: schema },
        status: "completed",
        stopReason: "schema_satisfied",
      },
    });
    const run = await web.research<{ sku: string }>("ignored", {
      interval: 1,
      resume: "run_7",
    });
    expect(
      calls.map((call) => `${call.method} ${call.url.pathname}`)
    ).toStrictEqual(["GET /agent/runs/run_7"]);
    expect(run.output).toStrictEqual({ sku: "TLPRSRNAQU3X8" });
  });

  it("carries the job id when waiting times out", async () => {
    const { web } = client({ body: { id: "run_8", status: "running" } });
    await expect(
      web.research("Report", { interval: 50, resume: "run_8", timeout: 10 })
    ).rejects.toMatchObject({ code: "Timeout", jobId: "run_8" });
  });

  it("refuses a budget the effort does not take", async () => {
    const { web, calls } = client();
    await expect(
      web.research("Report", { effort: "low", maxCostDollars: 5 })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    await expect(
      web.research("Report", { maxDurationSeconds: 600 })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    await expect(
      web.research("Report", { effort: "auto", maxDurationSeconds: 600 })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });
});

describe("exa monitor", () => {
  const created = {
    createdAt: "2026-11-01T00:00:00Z",
    id: "mon_1",
    name: "Tile news",
    search: { query: "glazed tile launches" },
    status: "active",
    trigger: { period: "1d", type: "interval" },
    webhook: {
      events: ["monitor.run.completed"],
      url: "https://hooks.test/exa",
    },
    webhookSecret: "whsec_1",
  };

  it("creates a monitor and maps the schedule to an interval", async () => {
    const { web, calls } = client({ body: created, status: 201 });
    const info = await web.monitor.create({
      content: true,
      includeDomains: ["a.test"],
      limit: 20,
      metadata: { team: "tiles" },
      name: "Tile news",
      outputSchema: { type: "text" },
      query: "glazed tile launches",
      schedule: { every: "day" },
      webhookEvents: ["monitor.run.completed"],
      webhookUrl: "https://hooks.test/exa",
    });
    expect(nth(calls, 0).method).toBe("POST");
    expect(nth(calls, 0).url.pathname).toBe("/monitors");
    expect(nth(calls, 0).body).toStrictEqual({
      metadata: { team: "tiles" },
      name: "Tile news",
      outputSchema: { type: "text" },
      search: {
        contents: { text: true },
        includeDomains: ["a.test"],
        numResults: 20,
        query: "glazed tile launches",
      },
      trigger: { period: "1d", type: "interval" },
      webhook: {
        events: ["monitor.run.completed"],
        url: "https://hooks.test/exa",
      },
    });
    expect(info).toMatchObject({
      createdAt: "2026-11-01T00:00:00Z",
      id: "mon_1",
      schedule: "1d",
      status: "active",
      watch: "glazed tile launches",
      webhookUrl: "https://hooks.test/exa",
    });
    expect(info.raw).toHaveProperty("webhookSecret", "whsec_1");
  });

  it.each([
    [{ every: "hour" }, "1h"],
    [{ every: "week" }, "7d"],
    [{ every: "6h" }, "6h"],
    [{ every: "3d" }, "3d"],
  ] as const)("maps schedule %j to %s", async (schedule, period) => {
    const { web, calls } = client({ body: created, status: 201 });
    await web.monitor.create({
      query: "q",
      schedule,
      webhookUrl: "https://hooks.test/exa",
    });
    expect(nth(calls, 0).body).toMatchObject({
      trigger: { period, type: "interval" },
    });
  });

  it("creates a manual-only monitor without a schedule", async () => {
    const { web, calls } = client({ body: created, status: 201 });
    await web.monitor.create({
      query: "q",
      webhookUrl: "https://hooks.test/exa",
    });
    expect(nth(calls, 0).body).not.toHaveProperty("trigger");
  });

  it("refuses a schedule Exa cannot express", async () => {
    const { web, calls } = client();
    const create = async (schedule: unknown) =>
      await web.monitor.create({
        query: "q",
        // @ts-expect-error each schedule is one the types refuse
        schedule,
        webhookUrl: "https://hooks.test/exa",
      });
    await expect(create({ cron: "0 9 * * *" })).rejects.toMatchObject({
      code: "InvalidRequest",
    });
    await expect(create({ every: "30m" })).rejects.toMatchObject({
      code: "InvalidRequest",
    });
    await expect(create("daily")).rejects.toMatchObject({
      code: "InvalidRequest",
    });
    await expect(create({ every: "0h" })).rejects.toMatchObject({
      code: "InvalidRequest",
    });
    expect(calls).toHaveLength(0);
  });

  it("gets and deletes a monitor", async () => {
    const { web, calls } = client({ body: created }, { body: created });
    const info = await web.monitor.get("mon_1");
    await web.monitor.delete("mon_1");
    expect(info.id).toBe("mon_1");
    expect(
      calls.map((call) => `${call.method} ${call.url.pathname}`)
    ).toStrictEqual(["GET /monitors/mon_1", "DELETE /monitors/mon_1"]);
  });

  it("lists every page of monitors", async () => {
    const { web, calls } = client(
      { body: { data: [created], hasMore: true, nextCursor: "c1" } },
      { body: { data: [{ ...created, id: "mon_2" }], hasMore: false } }
    );
    const monitors = await web.monitor.list();
    expect(monitors.map((item) => item.id)).toStrictEqual(["mon_1", "mon_2"]);
    expect(nth(calls, 0).url.searchParams.get("limit")).toBe("100");
    expect(nth(calls, 0).url.searchParams.has("cursor")).toBe(false);
    expect(nth(calls, 1).url.searchParams.get("cursor")).toBe("c1");
  });

  it("returns a monitor's runs as events with a cursor", async () => {
    const { web, calls } = client({
      body: {
        data: [
          {
            completedAt: "2026-11-02T00:00:00Z",
            createdAt: "2026-11-01T23:59:00Z",
            id: "run_a",
            monitorId: "mon_1",
            output: {
              content: "Two new lines launched.",
              grounding: [
                { citations: [{ title: "Launch", url }], field: "content" },
              ],
              results: [{ url }],
            },
            status: "completed",
          },
          {
            createdAt: "2026-11-03T00:00:00Z",
            id: "run_b",
            monitorId: "mon_1",
            output: { content: { lines: 2 } },
            status: "completed",
          },
          {
            createdAt: "2026-11-04T00:00:00Z",
            failReason: "search_failed",
            id: "run_c",
            monitorId: "mon_1",
            status: "failed",
          },
        ],
        hasMore: true,
        nextCursor: "c2",
      },
    });
    const events = await web.monitor.events("mon_1", {
      cursor: "c1",
      limit: 3,
    });
    expect(nth(calls, 0).url.pathname).toBe("/monitors/mon_1/runs");
    expect(nth(calls, 0).url.searchParams.get("cursor")).toBe("c1");
    expect(nth(calls, 0).url.searchParams.get("limit")).toBe("3");
    expect(events.next).toBe("c2");
    expect(events.events).toMatchObject([
      {
        at: "2026-11-02T00:00:00Z",
        citations: [{ title: "Launch", url }],
        id: "run_a",
        summary: "Two new lines launched.",
      },
      { at: "2026-11-03T00:00:00Z", id: "run_b", output: { lines: 2 } },
      { id: "run_c", summary: "Run failed: search_failed" },
    ]);
  });

  it("has no next cursor on the last page", async () => {
    const { web } = client({ body: { data: [], hasMore: false } });
    const events = await web.monitor.events("mon_1");
    expect(events.next).toBeUndefined();
  });
});

describe("exa capabilities", () => {
  it("offers only what Exa has", () => {
    const { web } = client();
    expect(web.capabilities).toMatchObject({
      answer: true,
      crawl: false,
      extract: true,
      images: false,
      map: false,
      monitor: true,
      read: true,
      readMany: true,
      research: true,
      search: true,
      usage: false,
    });
  });
});
