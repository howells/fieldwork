import { describe, expect, it } from "vitest";

import { exa } from "../src/adapters/exa.js";
import { firecrawl } from "../src/adapters/firecrawl.js";
import { parallel } from "../src/adapters/parallel.js";
import { tavily } from "../src/adapters/tavily.js";
import { FieldworkError } from "../src/errors.js";
import { retryAfterSeconds } from "../src/http.js";
import { Fieldwork } from "../src/index.js";
import { fakeFetch } from "./helpers.js";

describe("retrying and recovering", () => {
  it("marks transient failures retryable and permanent ones not", () => {
    expect(new FieldworkError("RateLimited", "slow down").retryable).toBe(true);
    expect(
      new FieldworkError("ProviderError", "down", { status: 503 }).retryable
    ).toBe(true);
    expect(
      new FieldworkError("InvalidRequest", "bad", { status: 400 }).retryable
    ).toBe(false);
    expect(new FieldworkError("Unauthorized", "no key").retryable).toBe(false);
  });

  it("never marks an error with a job id retryable, because repeating would start a second job", () => {
    const error = new FieldworkError("Timeout", "late", { jobId: "run_1" });
    expect(error.retryable).toBe(false);
    expect(error.toJSON()).toMatchObject({ code: "Timeout", jobId: "run_1" });
  });

  it("reads Retry-After as seconds or as an HTTP date", () => {
    const now = Date.parse("2026-11-01T00:00:00Z");
    expect(retryAfterSeconds("30", now)).toBe(30);
    expect(retryAfterSeconds("Sun, 01 Nov 2026 00:01:00 GMT", now)).toBe(60);
    expect(retryAfterSeconds("soon", now)).toBeUndefined();
  });

  it("keeps the run id when an Exa research run outlasts the timeout", async () => {
    const { fetch } = fakeFetch(
      { body: { id: "run_9" } },
      { body: { id: "run_9", status: "running" } }
    );
    const web = new Fieldwork({
      adapter: exa({ apiKey: "k", fetch, retries: 0 }),
    });
    const attempt = web.research("Which tiles are frost resistant?", {
      interval: 5,
      timeout: 1,
    });
    await expect(attempt).rejects.toMatchObject({
      code: "Timeout",
      jobId: "run_9",
      retryable: false,
    });
  });

  it("resumes an Exa run instead of starting another", async () => {
    const { fetch, calls } = fakeFetch({
      body: {
        id: "run_9",
        output: { text: "Porcelain." },
        status: "completed",
      },
    });
    const web = new Fieldwork({
      adapter: exa({ apiKey: "k", fetch, retries: 0 }),
    });
    const research = await web.research("ignored", { resume: "run_9" });
    expect(research.output).toBe("Porcelain.");
    expect(
      calls.map((call) => `${call.method} ${call.url.pathname}`)
    ).toStrictEqual(["GET /agent/runs/run_9"]);
  });

  it("attaches the job id to a provider error raised while waiting", async () => {
    const { fetch } = fakeFetch(
      { body: { request_id: "req_4" } },
      { body: { error: "bad gateway" }, status: 502 }
    );
    const web = new Fieldwork({
      adapter: tavily({ apiKey: "k", fetch, retries: 0 }),
    });
    await expect(web.research("question")).rejects.toMatchObject({
      code: "ProviderError",
      jobId: "req_4",
      retryable: false,
      status: 502,
    });
  });

  it("resumes a Firecrawl crawl", async () => {
    const { fetch, calls } = fakeFetch(
      {
        body: {
          data: [{ markdown: "# Home", metadata: { url: "https://a.test/" } }],
          status: "completed",
        },
      },
      { body: { errors: [], robotsBlocked: [] } }
    );
    const web = new Fieldwork({
      adapter: firecrawl({ apiKey: "k", fetch, retries: 0 }),
    });
    const crawl = await web.crawl("https://a.test/", { resume: "crawl_2" });
    expect(crawl.pages[0]?.markdown).toBe("# Home");
    expect(calls[0]?.url.pathname).toBe("/v2/crawl/crawl_2");
    expect(calls[1]?.url.pathname).toBe("/v2/crawl/crawl_2/errors");
  });

  it("keeps the Parallel run id when the result never arrives", async () => {
    const { fetch } = fakeFetch(
      { body: { run_id: "trun_7" } },
      { body: { error: "expired key" }, status: 401 }
    );
    const web = new Fieldwork({
      adapter: parallel({ apiKey: "k", fetch, retries: 0 }),
    });
    await expect(web.research("question")).rejects.toMatchObject({
      code: "Unauthorized",
      jobId: "trun_7",
    });
  });
});
