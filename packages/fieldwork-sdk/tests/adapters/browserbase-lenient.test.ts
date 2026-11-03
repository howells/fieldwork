import { describe, expect, it } from "vitest";

import { browserbase } from "../../src/adapters/browserbase.js";
import { Fieldwork } from "../../src/index.js";
import { fakeFetch } from "../helpers.js";

const setup = (...replies: Parameters<typeof fakeFetch>) => {
  const { fetch } = fakeFetch(...replies);
  return new Fieldwork({
    adapter: browserbase({ apiKey: "k", fetch, projectId: "p1", retries: 0 }),
  });
};

describe("browserbase adapter with a response of the wrong shape", () => {
  it("omits a search field of the wrong type and keeps the call working", async () => {
    const body = {
      requestId: 12,
      results: [
        { author: 5, title: ["x"], url: "https://a.test/oak" },
        "not an object",
      ],
    };
    const response = await setup({ body }).search("oak");
    expect(response.results).toStrictEqual([
      { url: "https://a.test/oak" },
      { url: "" },
    ]);
    expect(response.meta).toStrictEqual({ requestId: "12" });
    expect(response.raw).toStrictEqual(body);
  });

  it("fails loudly on a body that is not JSON", async () => {
    await expect(setup({ text: "oops" }).search("oak")).rejects.toMatchObject({
      code: "ProviderError",
    });
  });

  it("reads a fetch whose content and status are of the wrong type", async () => {
    const body = { content: 5, contentType: ["text/html"], statusCode: "200" };
    const page = await setup({ body }).read("https://a.test");
    expect(page.markdown).toBeUndefined();
    expect(page.statusCode).toBeUndefined();
    expect(page.url).toBe("https://a.test");
    expect(page.raw).toStrictEqual(body);
  });

  it("opens a session whose id is a number and whose links are of the wrong type", async () => {
    const created = { connectUrl: 7, id: 99 };
    const session = await setup(
      { body: created },
      { body: { debuggerUrl: false } }
    ).browser.open();
    expect(session.id).toBe("99");
    expect(session.cdpUrl).toBeUndefined();
    expect(session.liveViewUrl).toBeUndefined();
    expect(session.raw).toStrictEqual(created);
  });

  it("reports a session without an id as a provider error carrying the id as it arrived", async () => {
    await expect(
      setup({ body: { id: { nested: 1 } } }).browser.open()
    ).rejects.toMatchObject({
      cause: { nested: 1 },
      code: "ProviderError",
    });
  });

  it("reads usage whose numbers are strings as absent", async () => {
    const usage = await setup({
      body: { browserMinutes: "9", proxyBytes: 4 },
    }).usage();
    expect(usage.breakdown).toStrictEqual({ proxyBytes: 4 });
  });
});
