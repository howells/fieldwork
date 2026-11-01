import { describe, expect, it } from "vitest";

import { exa } from "../src/adapters/exa.js";
import { firecrawl } from "../src/adapters/firecrawl.js";
import { parallel } from "../src/adapters/parallel.js";
import { tavily } from "../src/adapters/tavily.js";
import { Fieldwork, router } from "../src/index.js";
import { toolError, toolsFor } from "../src/tools.js";
import { fakeFetch } from "./helpers.js";

function names(tools: { name: string }[]) {
  return tools.map((tool) => tool.name);
}

describe("agent tools", () => {
  it("makes a tool for each capability the provider offers, leaving out act unless named", () => {
    const web = new Fieldwork({
      adapter: firecrawl({ apiKey: "k", fetch: fakeFetch().fetch }),
    });
    expect(names(toolsFor(web))).toStrictEqual([
      "search_web",
      "read_page",
      "extract_values",
      "read_product",
      "map_site",
      "crawl_site",
      "research_question",
      "parse_document",
    ]);
    const withAct = toolsFor(web, { capabilities: ["act"] });
    expect(names(withAct)).toStrictEqual(["run_browser_script"]);
    expect(withAct[0]?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
  });

  it("offers only the options the provider supports", () => {
    const [firecrawlSearch] = toolsFor(
      new Fieldwork({
        adapter: firecrawl({ apiKey: "k", fetch: fakeFetch().fetch }),
      })
    );
    const [exaSearch] = toolsFor(
      new Fieldwork({ adapter: exa({ apiKey: "k", fetch: fakeFetch().fetch }) })
    );
    expect(
      Object.keys(firecrawlSearch?.inputSchema.properties as object)
    ).not.toContain("publishedAfter");
    expect(Object.keys(exaSearch?.inputSchema.properties as object)).toContain(
      "publishedAfter"
    );
  });

  it("names the routed provider on each tool", () => {
    const web = new Fieldwork({
      adapter: router({
        search: parallel({ apiKey: "k", fetch: fakeFetch().fetch }),
        read: tavily({ apiKey: "k", fetch: fakeFetch().fetch }),
      }),
    });
    expect(
      toolsFor(web).map((tool) => [tool.name, tool.provider])
    ).toStrictEqual([
      ["search_web", "parallel"],
      ["read_page", "tavily"],
    ]);
  });

  it("rejects an option the provider does not support before sending anything", async () => {
    const { fetch, calls } = fakeFetch();
    const [search] = toolsFor(
      new Fieldwork({ adapter: firecrawl({ apiKey: "k", fetch }) })
    );
    await expect(
      search?.execute({ query: "tiles", publishedAfter: "2026-01-01" })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    await expect(
      search?.execute({ query: "tiles", limit: 500 })
    ).rejects.toMatchObject({
      code: "InvalidRequest",
    });
    expect(calls).toHaveLength(0);
  });

  it("calls the capability and returns the result without raw, with long text cut", async () => {
    const { fetch, calls } = fakeFetch({
      body: {
        success: true,
        data: {
          markdown: "x".repeat(2000),
          metadata: { title: "Spec", url: "https://a.test/p" },
        },
      },
    });
    const [, read] = toolsFor(
      new Fieldwork({ adapter: firecrawl({ apiKey: "k", fetch }) }),
      {
        maxCharacters: 1000,
      }
    );
    const page = (await read?.execute({ url: "https://a.test/p" })) as Record<
      string,
      unknown
    >;
    expect(page).not.toHaveProperty("raw");
    expect(page.title).toBe("Spec");
    expect(page.markdown).toMatch(
      /^x{1000}\n\n\[cut: 1000 of 2000 characters shown\]$/u
    );
    expect(calls[0]?.body).toMatchObject({ url: "https://a.test/p" });
  });

  it("serializes errors for a model without the provider's response", () => {
    expect(toolError(new Error("boom"))).toMatchObject({
      code: "ProviderError",
      message: "boom",
    });
  });
});
