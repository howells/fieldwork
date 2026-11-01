import { afterEach, describe, expect, it, vi } from "vitest";

import { exa } from "../src/adapters/exa.js";
import { Fieldwork } from "../src/index.js";
import { fakeFetch } from "./helpers.js";

const now = { headers: { "retry-after": "0" } };
const ok = { body: { results: [] } };

const connect = (replies: Parameters<typeof fakeFetch>, retries?: number) => {
  const { calls, fetch } = fakeFetch(...replies);
  return {
    calls,
    web: new Fieldwork({ adapter: exa({ apiKey: "k", fetch, retries }) }),
  };
};

describe("retries", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("repeats a rate limit or a 5xx twice by default, then succeeds", async () => {
    const { calls, web } = connect([
      { ...now, status: 429 },
      { ...now, status: 503 },
      ok,
    ]);
    await expect(web.search("tiles")).resolves.toMatchObject({ results: [] });
    expect(calls).toHaveLength(3);
  });

  it("throws the last failure once the attempts are used up", async () => {
    const { calls, web } = connect([
      { ...now, status: 503 },
      { ...now, status: 503 },
      { ...now, body: { error: "still down" }, status: 503 },
    ]);
    await expect(web.search("tiles")).rejects.toMatchObject({
      code: "ProviderError",
      message: expect.stringContaining("still down"),
      status: 503,
    });
    expect(calls).toHaveLength(3);
  });

  it("takes its count from the adapter, and a call overrides it", async () => {
    const adapter = connect([{ ...now, status: 503 }, ok], 1);
    await expect(adapter.web.search("tiles")).resolves.toBeDefined();
    expect(adapter.calls).toHaveLength(2);

    const call = connect([{ ...now, status: 503 }], 3);
    await expect(
      call.web.search("tiles", { retries: 0 })
    ).rejects.toMatchObject({ status: 503 });
    expect(call.calls).toHaveLength(1);
  });

  it.each([400, 401, 404])("does not repeat a %i", async (status) => {
    const { calls, web } = connect([{ status }]);
    await expect(web.search("tiles")).rejects.toMatchObject({ status });
    expect(calls).toHaveLength(1);
  });

  it("repeats a request that creates something only after a rate limit", async () => {
    const limited = connect([{ ...now, status: 429 }, { body: { id: "r_1" } }]);
    await expect(
      limited.web.raw.request("POST", "/agent/runs", { creates: true })
    ).resolves.toStrictEqual({ id: "r_1" });
    expect(limited.calls).toHaveLength(2);

    const failed = connect([{ ...now, status: 500 }]);
    await expect(
      failed.web.raw.request("POST", "/agent/runs", { creates: true })
    ).rejects.toMatchObject({ status: 500 });
    expect(failed.calls).toHaveLength(1);
  });

  it("returns a rate limit at once when the provider asks for a long wait", async () => {
    const { calls, web } = connect([
      { headers: { "retry-after": "120" }, status: 429 },
    ]);
    await expect(web.search("tiles")).rejects.toMatchObject({
      code: "RateLimited",
      retryAfter: 120,
    });
    expect(calls).toHaveLength(1);
  });

  it("backs off exponentially when the provider gives no wait", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(1);
    const { calls, web } = connect([{ status: 502 }, { status: 502 }, ok]);
    const search = web.search("tiles");
    // 500 ms, then 1000 ms: random() of 1 takes the top of each jitter range.
    await vi.advanceTimersByTimeAsync(499);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    await expect(search).resolves.toBeDefined();
    expect(calls).toHaveLength(3);
  });

  it("stops waiting to retry when the call is cancelled", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const { calls, web } = connect([
      { headers: { "retry-after": "5" }, status: 503 },
    ]);
    const search = web.search("tiles", { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(1000);
    controller.abort();
    await expect(search).rejects.toMatchObject({ code: "Aborted" });
    expect(calls).toHaveLength(1);
  });
});
