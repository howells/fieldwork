import { describe, expect, it } from "vitest";

import { exa } from "../src/adapters/exa.js";
import { serpapi } from "../src/adapters/serpapi.js";
import { Fieldwork } from "../src/index.js";
import { fakeFetch } from "./helpers.js";

const KEY = "secret-key";

describe("redirects", () => {
  it("asks fetch not to follow redirects itself", async () => {
    const modes: RequestInit["redirect"][] = [];
    const fetch = (async (_input: URL | string, init: RequestInit = {}) => {
      modes.push(init.redirect);
      return Response.json({ results: [] });
    }) as typeof globalThis.fetch;
    const web = new Fieldwork({ adapter: exa({ apiKey: KEY, fetch }) });
    await web.search("tiles");
    expect(modes).toStrictEqual(["manual"]);
  });

  it("refuses a redirect to another host without sending the key there", async () => {
    const { calls, fetch } = fakeFetch({
      headers: { location: "https://elsewhere.test/search" },
      status: 302,
    });
    const web = new Fieldwork({ adapter: exa({ apiKey: KEY, fetch }) });
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
    const web = new Fieldwork({ adapter: exa({ apiKey: KEY, fetch }) });
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
    const web = new Fieldwork({ adapter: serpapi({ apiKey: KEY, fetch }) });
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
    const web = new Fieldwork({ adapter: exa({ apiKey: KEY, fetch }) });
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
    const web = new Fieldwork({ adapter: exa({ apiKey: KEY, fetch }) });
    await web.search("tiles");
    expect(calls[1]).toMatchObject({ body: undefined, method: "GET" });
  });

  it("stops after five redirects", async () => {
    const loop = { headers: { location: "/search" }, status: 302 };
    const { calls, fetch } = fakeFetch(loop, loop, loop, loop, loop, loop);
    const web = new Fieldwork({ adapter: exa({ apiKey: KEY, fetch }) });
    await expect(web.search("tiles")).rejects.toMatchObject({
      code: "ProviderError",
      message: expect.stringContaining("more than 5"),
    });
    expect(calls).toHaveLength(6);
  });
});
