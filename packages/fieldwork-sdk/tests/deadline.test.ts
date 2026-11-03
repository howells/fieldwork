import { once } from "node:events";

import { describe, expect, it } from "vitest";

import { reducto } from "../src/adapters/reducto.js";
import { createRawClient } from "../src/http.js";
import { Fieldwork } from "../src/index.js";

const sheet = { data: new Uint8Array([37, 80, 68, 70]), name: "sheet.pdf" };

/**
 * A fetch that answers the first `answered` requests and then never answers,
 * rejecting only when the request's signal aborts, as a real fetch does.
 */
const stallingFetch = (...answered: unknown[]): typeof fetch => {
  const queue = [...answered];
  return async (_input, init = {}) => {
    const next = queue.shift();
    if (next !== undefined) {
      return Response.json(next);
    }
    const { signal } = init;
    if (!signal) {
      throw new Error("a stalled request needs a signal to stop it");
    }
    await once(signal, "abort");
    throw new Error("aborted", { cause: signal.reason });
  };
};

const client = (fetchImpl: typeof fetch) =>
  createRawClient({
    baseUrl: "https://api.test",
    fetch: fetchImpl,
    headers: {},
    provider: "test",
    retries: 1,
  });

describe("a call's timeout", () => {
  it("bounds every request of a job, and keeps the job id", async () => {
    const web = new Fieldwork({
      adapter: reducto({
        apiKey: "k",
        fetch: stallingFetch(
          { file_id: "reducto://f.pdf" },
          { job_id: "job-1" }
        ),
        retries: 0,
      }),
    });
    const started = Date.now();
    await expect(
      web.parse(sheet, { interval: 1, timeout: 50 })
    ).rejects.toMatchObject({ code: "Timeout", jobId: "job-1" });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("reports a cancellation as Aborted, not Timeout", async () => {
    const controller = new AbortController();
    const raw = createRawClient({
      baseUrl: "https://api.test",
      fetch: stallingFetch(),
      headers: {},
      provider: "test",
    });
    const pending = raw.request("GET", "/slow", { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "Aborted" });
  });
});

describe("reading a response", () => {
  it("turns a connection lost mid-body into a Fieldwork error", async () => {
    const broken = new ReadableStream({
      pull(controller) {
        controller.error(new TypeError("terminated"));
      },
    });
    const raw = client(async () => new Response(broken));
    await expect(raw.request("GET", "/x")).rejects.toMatchObject({
      code: "ProviderError",
      retryable: true,
    });
  });

  it("fails loudly on a 2xx body that is not JSON", async () => {
    const raw = client(async () => new Response("<html>gateway</html>"));
    await expect(raw.request("GET", "/x")).rejects.toMatchObject({
      code: "ProviderError",
      status: 200,
    });
  });

  it("retries a 408 from the server", async () => {
    let calls = 0;
    const raw = client(async () => {
      calls += 1;
      return calls === 1
        ? new Response("slow", { headers: { "retry-after": "0" }, status: 408 })
        : Response.json({ ok: true });
    });
    await expect(raw.request("GET", "/x")).resolves.toStrictEqual({ ok: true });
    expect(calls).toBe(2);
  });
});
