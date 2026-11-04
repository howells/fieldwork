import { describe, expect, it } from "vitest";

import { exa } from "../src/adapters/exa.js";
import { firecrawl } from "../src/adapters/firecrawl.js";
import { parallel } from "../src/adapters/parallel.js";
import { perplexity } from "../src/adapters/perplexity.js";
import { tavily } from "../src/adapters/tavily.js";
import {
  Fieldwork,
  FieldworkError,
  router,
  runtimeRouter,
} from "../src/index.js";
import { fakeFetch, nth } from "./helpers.js";

describe("a Fieldwork instance", () => {
  it("exposes only the capabilities its provider offers", () => {
    const web = new Fieldwork({
      adapter: tavily({ apiKey: "k", fetch: fakeFetch().fetch, retries: 0 }),
    });
    expect(web.provider).toBe("tavily");
    expect(web.capabilities).toStrictEqual({
      act: false,
      answer: true,
      browser: false,
      crawl: true,
      decide: false,
      discover: false,
      extract: false,
      images: true,
      map: true,
      monitor: false,
      parse: false,
      product: false,
      read: true,
      readMany: true,
      research: true,
      search: true,
      usage: true,
    });
    expect(web.supports("act")).toBe(false);
  });

  it("refuses an unsupported capability at runtime instead of falling back", async () => {
    const { fetch, calls } = fakeFetch();
    const web = new Fieldwork({
      adapter: tavily({ apiKey: "k", fetch, retries: 0 }),
    });
    // @ts-expect-error Tavily has no browser, so act does not exist on this instance.
    // oxlint-disable-next-line typescript/no-unsafe-call -- calling the missing method is the point of the test
    const attempt = web.act("return 1");
    await expect(attempt).rejects.toMatchObject({
      code: "Unsupported",
      provider: "tavily",
    });
    expect(calls).toHaveLength(0);
  });

  it("types each call with its provider's own options", () => {
    const web = new Fieldwork({
      adapter: exa({ apiKey: "k", fetch: fakeFetch().fetch, retries: 0 }),
    });
    // @ts-expect-error Exa search has no `topic`; that is a Tavily option.
    void web.search("tiles", { topic: "news" }).catch(() => null);
    // @ts-expect-error Exa has no crawl.
    expect(web.crawl).toBeTypeOf("function");
  });

  it("needs an API key", () => {
    const saved = process.env.EXA_API_KEY;
    delete process.env.EXA_API_KEY;
    expect(() => exa()).toThrow(FieldworkError);
    if (saved !== undefined) {
      process.env.EXA_API_KEY = saved;
    }
  });

  it("maps provider HTTP failures to normalized codes", async () => {
    const { fetch } = fakeFetch(
      {
        body: { error: "slow down" },
        headers: { "retry-after": "3" },
        status: 429,
      },
      { body: { detail: { error: "plan limit" } }, status: 432 },
      { body: { message: "bad key" }, status: 401 }
    );
    const web = new Fieldwork({
      adapter: tavily({ apiKey: "k", fetch, retries: 0 }),
    });
    await expect(web.search("a")).rejects.toMatchObject({
      code: "RateLimited",
      retryAfter: 3,
      status: 429,
    });
    await expect(web.search("a")).rejects.toMatchObject({
      code: "RateLimited",
      status: 432,
    });
    await expect(web.search("a")).rejects.toMatchObject({
      code: "Unauthorized",
      status: 401,
    });
  });
});

describe("routing by capability", () => {
  it("sends each capability to its named adapter and nothing else", async () => {
    const searchFetch = fakeFetch({
      body: {
        results: [{ excerpts: ["x"], title: "A", url: "https://a.test" }],
      },
    });
    const readFetch = fakeFetch({
      body: {
        data: { markdown: "# A", metadata: { url: "https://a.test" } },
        success: true,
      },
    });
    const web = new Fieldwork({
      adapter: router({
        read: firecrawl({ apiKey: "f", fetch: readFetch.fetch, retries: 0 }),
        search: parallel({ apiKey: "p", fetch: searchFetch.fetch, retries: 0 }),
      }),
    });
    const found = await web.search("a");
    const page = await web.read(nth(found.results, 0).url);
    expect(page.markdown).toBe("# A");
    expect(nth(searchFetch.calls, 0).url.hostname).toBe("api.parallel.ai");
    expect(nth(readFetch.calls, 0).url.hostname).toBe("api.firecrawl.dev");
    expect(web.capabilities.research).toBe(false);
    expect(Object.keys(web.raw).toSorted()).toStrictEqual([
      "firecrawl",
      "parallel",
    ]);
  });

  it("rejects a route to an adapter that lacks the capability", () => {
    expect(() =>
      router({
        // @ts-expect-error Perplexity has no crawl.
        crawl: perplexity({
          apiKey: "k",
          fetch: fakeFetch().fetch,
          retries: 0,
        }),
      })
    ).toThrow(/does not offer crawl/u);
  });

  it("checks routes built at run time when the router is built", () => {
    const routes = {
      crawl: perplexity({ apiKey: "k", fetch: fakeFetch().fetch, retries: 0 }),
    };
    expect(() => runtimeRouter(routes)).toThrow(/does not offer crawl/u);
    const web = new Fieldwork({
      adapter: runtimeRouter({
        read: firecrawl({ apiKey: "k", fetch: fakeFetch().fetch, retries: 0 }),
      }),
    });
    expect(web.providerFor("read")).toBe("firecrawl");
  });

  it("shares one adapter across routes but refuses two of one provider", () => {
    const shared = exa({ apiKey: "k", fetch: fakeFetch().fetch, retries: 0 });
    const web = new Fieldwork({
      adapter: router({ read: shared, search: shared }),
    });
    expect(Object.keys(web.raw)).toStrictEqual(["exa"]);
    expect(() =>
      router({
        read: exa({ apiKey: "a", fetch: fakeFetch().fetch, retries: 0 }),
        search: exa({ apiKey: "b", fetch: fakeFetch().fetch, retries: 0 }),
      })
    ).toThrow(/two exa adapters/u);
  });
});
