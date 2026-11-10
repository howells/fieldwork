import { getEventListeners } from "node:events";

import { describe, expect, it } from "vitest";

import { exa } from "../src/adapters/exa.js";
import { serpapi } from "../src/adapters/serpapi.js";
import { segment, sleep } from "../src/http.js";
import { Fieldwork } from "../src/index.js";
import { fakeFetch } from "./helpers.js";

const KEY = "secret-key";

describe("redirects", () => {
  it("asks fetch not to follow redirects itself", async () => {
    const modes: RequestInit["redirect"][] = [];
    const fetch: typeof globalThis.fetch = async (_input, init = {}) => {
      modes.push(init.redirect);
      return Response.json({ results: [] });
    };
    const web = new Fieldwork({
      adapter: exa({ apiKey: KEY, fetch, retries: 0 }),
    });
    await web.search("tiles");
    expect(modes).toStrictEqual(["manual"]);
  });

  it("refuses a redirect to another host without sending the key there", async () => {
    const { calls, fetch } = fakeFetch({
      headers: { location: "https://elsewhere.test/search" },
      status: 302,
    });
    const web = new Fieldwork({
      adapter: exa({ apiKey: KEY, fetch, retries: 0 }),
    });
    await expect(web.search("tiles")).rejects.toMatchObject({
      code: "ProviderError",
      message: expect.stringContaining("https://elsewhere.test"),
      retryable: false,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.origin).toBe("https://api.exa.ai");
  });

  it("refuses a downgrade from https to http on the same host", async () => {
    const { calls, fetch } = fakeFetch({
      headers: { location: "http://api.exa.ai/search" },
      status: 301,
    });
    const web = new Fieldwork({
      adapter: exa({ apiKey: KEY, fetch, retries: 0 }),
    });
    await expect(web.search("tiles")).rejects.toMatchObject({
      code: "ProviderError",
    });
    expect(calls).toHaveLength(1);
  });

  it("keeps a key sent in the query on the provider's host", async () => {
    const { calls, fetch } = fakeFetch({
      headers: { location: "https://elsewhere.test/search" },
      status: 307,
    });
    const web = new Fieldwork({
      adapter: serpapi({ apiKey: KEY, fetch, retries: 0 }),
    });
    await expect(web.search("tiles")).rejects.toMatchObject({
      code: "ProviderError",
    });
    expect(calls.map((call) => call.url.origin)).toStrictEqual([
      "https://serpapi.com",
    ]);
  });

  it("follows a 307 within the provider's origin with the same method, body and key", async () => {
    const { calls, fetch } = fakeFetch(
      { headers: { location: "/v2/search" }, status: 307 },
      { body: { results: [{ url: "https://a.test" }] } }
    );
    const web = new Fieldwork({
      adapter: exa({ apiKey: KEY, fetch, retries: 0 }),
    });
    const { results } = await web.search("tiles");
    expect(results[0]?.url).toBe("https://a.test");
    expect(calls).toHaveLength(2);
    expect(calls[1]?.method).toBe("POST");
    expect(calls[1]?.url.href).toBe("https://api.exa.ai/v2/search");
    expect(calls[1]?.body).toStrictEqual(calls[0]?.body);
    expect(calls[1]?.headers["x-api-key"]).toBe(KEY);
  });

  it("turns a 303 into a GET without a body", async () => {
    const { calls, fetch } = fakeFetch(
      { headers: { location: "/result/1" }, status: 303 },
      { body: { results: [] } }
    );
    const web = new Fieldwork({
      adapter: exa({ apiKey: KEY, fetch, retries: 0 }),
    });
    await web.search("tiles");
    expect(calls[1]).toMatchObject({ body: undefined, method: "GET" });
  });

  it("stops after five redirects", async () => {
    const loop = { headers: { location: "/search" }, status: 302 };
    const { calls, fetch } = fakeFetch(loop, loop, loop, loop, loop, loop);
    const web = new Fieldwork({
      adapter: exa({ apiKey: KEY, fetch, retries: 0 }),
    });
    await expect(web.search("tiles")).rejects.toMatchObject({
      code: "ProviderError",
      message: expect.stringContaining("more than 5"),
    });
    expect(calls).toHaveLength(6);
  });
});

describe(sleep, () => {
  it("leaves no abort listener on the signal after waiting", async () => {
    const controller = new AbortController();
    for (let count = 0; count < 5; count += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each sleep must finish before the next, as polls do
      await sleep(1, controller.signal);
    }
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });

  it("resolves early when the signal aborts, and at once when it already has", async () => {
    const controller = new AbortController();
    const started = Date.now();
    const waiting = sleep(10_000, controller.signal);
    controller.abort();
    await expect(waiting).resolves.toBeUndefined();
    await expect(sleep(10_000, controller.signal)).resolves.toBeUndefined();
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe(segment, () => {
  it.each(["", ".", ".."])("refuses %j, which is no id", (id) => {
    expect(() => segment(id)).toThrow(
      expect.objectContaining({ code: "InvalidRequest" })
    );
  });

  it("encodes an id with a slash as one segment", () => {
    expect(segment("a/../b")).toBe("a%2F..%2Fb");
  });
});
