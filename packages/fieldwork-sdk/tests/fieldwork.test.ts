import { describe, expect, it } from "vitest";

import { exa } from "../src/adapters/exa.js";
import { firecrawl } from "../src/adapters/firecrawl.js";
import { parallel } from "../src/adapters/parallel.js";
import { perplexity } from "../src/adapters/perplexity.js";
import { tavily } from "../src/adapters/tavily.js";
import { Fieldwork, FieldworkError, router } from "../src/index.js";
import { fakeFetch } from "./helpers.js";

describe("a Fieldwork instance", () => {
  it("exposes only the capabilities its provider offers", () => {
    const web = new Fieldwork({
      adapter: tavily({ apiKey: "k", fetch: fakeFetch().fetch }),
    });
    expect(web.provider).toBe("tavily");
    expect(web.capabilities).toStrictEqual({
      search: true,
      read: true,
      extract: false,
      product: false,
      map: true,
      crawl: true,
      research: true,
      act: false,
      parse: false,
    });
    expect(web.supports("act")).toBe(false);
  });

  it("refuses an unsupported capability at runtime instead of falling back", async () => {
    const { fetch, calls } = fakeFetch();
    const web = new Fieldwork({ adapter: tavily({ apiKey: "k", fetch }) });
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
      adapter: exa({ apiKey: "k", fetch: fakeFetch().fetch }),
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
        status: 429,
        body: { error: "slow down" },
        headers: { "retry-after": "3" },
      },
      { status: 432, body: { detail: { error: "plan limit" } } },
      { status: 401, body: { message: "bad key" } }
    );
    const web = new Fieldwork({ adapter: tavily({ apiKey: "k", fetch }) });
    await expect(web.search("a")).rejects.toMatchObject({
      code: "RateLimited",
      status: 429,
      retryAfter: 3,
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
        results: [{ url: "https://a.test", title: "A", excerpts: ["x"] }],
      },
    });
    const readFetch = fakeFetch({
      body: {
        success: true,
        data: { markdown: "# A", metadata: { url: "https://a.test" } },
      },
    });
    const web = new Fieldwork({
      adapter: router({
        search: parallel({ apiKey: "p", fetch: searchFetch.fetch }),
        read: firecrawl({ apiKey: "f", fetch: readFetch.fetch }),
      }),
    });
    const found = await web.search("a");
    const page = await web.read(found.results[0]!.url);
    expect(page.markdown).toBe("# A");
    expect(searchFetch.calls[0]!.url.hostname).toBe("api.parallel.ai");
    expect(readFetch.calls[0]!.url.hostname).toBe("api.firecrawl.dev");
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
        crawl: perplexity({ apiKey: "k", fetch: fakeFetch().fetch }),
      })
    ).toThrow(/does not offer crawl/u);
  });
});
