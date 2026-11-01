import { describe, expect, it } from "vitest";

import { exa } from "../src/adapters/exa.js";
import { parallel } from "../src/adapters/parallel.js";
import { tavily } from "../src/adapters/tavily.js";
import { Fieldwork, router } from "../src/index.js";
import { SPECS } from "../src/tool-specs/index.js";
import type { Spec } from "../src/tool-specs/types.js";
import { EXCLUDED_BY_DEFAULT, toolError, toolsFor } from "../src/tools.js";
import type { FieldworkTool } from "../src/tools.js";
import { isText } from "../src/tools/json.js";
import { problem } from "../src/tools/validate.js";
import { fakeFetch } from "./helpers.js";
import { rich, undeclared } from "./tools/fixtures.js";
import { baseInput, webFor } from "./tools/support.js";

const names = (tools: { name: string }[]) => tools.map((tool) => tool.name);

const toolNamed = (tools: FieldworkTool[], name: string): FieldworkTool => {
  const found = tools.find((tool) => tool.name === name);
  if (found === undefined) {
    throw new Error(`no tool named ${name}`);
  }
  return found;
};

const specNamed = (name: string): Spec => {
  const found = SPECS.find((spec) => spec.name === name);
  if (found === undefined) {
    throw new Error(`no spec named ${name}`);
  }
  return found;
};

/** A firecrawl instance on a fake fetch that answers with the replies in order. */
const firecrawlWeb = (...replies: Parameters<typeof fakeFetch>) => {
  const { calls, fetch } = fakeFetch(...replies);
  return { calls, web: webFor("firecrawl", fetch) };
};

const requiredFor = (provider: string) =>
  toolNamed(
    toolsFor(webFor(provider, fakeFetch().fetch), { allow: ["monitor"] }),
    "create_monitor"
  ).inputSchema.required;

const propertiesOf = (tool: FieldworkTool) =>
  Object.keys(tool.inputSchema.properties ?? {});

const ALL_CAPABILITIES = [...EXCLUDED_BY_DEFAULT];

describe("which tools exist", () => {
  it("makes a tool for each capability the provider offers, leaving out act, browser and monitor", () => {
    const { web } = firecrawlWeb();
    expect(EXCLUDED_BY_DEFAULT).toStrictEqual(["act", "browser", "monitor"]);
    expect(names(toolsFor(web))).toStrictEqual([
      "search_web",
      "search_images",
      "read_page",
      "read_pages",
      "extract_values",
      "read_product",
      "map_site",
      "crawl_site",
      "research_question",
      "parse_document",
      "check_usage",
    ]);
  });

  it("includes the capabilities left out by default when they are allowed", () => {
    const { web } = firecrawlWeb();
    expect(names(toolsFor(web, { allow: ALL_CAPABILITIES }))).toStrictEqual([
      "search_web",
      "search_images",
      "read_page",
      "read_pages",
      "extract_values",
      "read_product",
      "map_site",
      "crawl_site",
      "research_question",
      "run_browser_script",
      "open_browser",
      "close_browser",
      "parse_document",
      "create_monitor",
      "get_monitor",
      "list_monitors",
      "delete_monitor",
      "list_monitor_events",
      "check_usage",
    ]);
    const onlyMonitor = names(toolsFor(web, { allow: ["monitor"] }));
    expect(onlyMonitor).toContain("create_monitor");
    expect(onlyMonitor).not.toContain("run_browser_script");
    expect(onlyMonitor).not.toContain("open_browser");
  });

  it("makes only the capabilities named, and adds the allowed ones to them", () => {
    const { web } = firecrawlWeb();
    expect(names(toolsFor(web, { capabilities: ["act"] }))).toStrictEqual([
      "run_browser_script",
    ]);
    expect(
      names(toolsFor(web, { allow: ["browser"], capabilities: ["read"] }))
    ).toStrictEqual(["read_page", "open_browser", "close_browser"]);
  });

  it("makes no tool for a capability the provider lacks, even when it is allowed", () => {
    const web = webFor("tavily", fakeFetch().fetch);
    const allowed = names(toolsFor(web, { allow: ALL_CAPABILITIES }));
    expect(allowed).not.toContain("create_monitor");
    expect(allowed).not.toContain("run_browser_script");
    expect(allowed).not.toContain("open_browser");
  });

  it("names the group method on each group tool", () => {
    const { web } = firecrawlWeb();
    const methods = toolsFor(web, { allow: ["browser", "monitor"] })
      .filter((tool) => tool.method !== undefined)
      .map((tool) => `${tool.name}=${tool.capability}.${tool.method}`);
    expect(methods).toStrictEqual([
      "open_browser=browser.open",
      "close_browser=browser.close",
      "create_monitor=monitor.create",
      "get_monitor=monitor.get",
      "list_monitors=monitor.list",
      "delete_monitor=monitor.delete",
      "list_monitor_events=monitor.events",
    ]);
  });

  it("names the routed provider on each tool", () => {
    const web = new Fieldwork({
      adapter: router({
        monitor: exa({ apiKey: "k", fetch: fakeFetch().fetch }),
        read: tavily({ apiKey: "k", fetch: fakeFetch().fetch }),
        search: parallel({ apiKey: "k", fetch: fakeFetch().fetch }),
      }),
    });
    expect(
      toolsFor(web, { allow: ["monitor"] }).map((tool) => [
        tool.name,
        tool.provider,
      ])
    ).toStrictEqual([
      ["search_web", "parallel"],
      ["read_page", "tavily"],
      ["create_monitor", "exa"],
      ["get_monitor", "exa"],
      ["list_monitors", "exa"],
      ["delete_monitor", "exa"],
      ["list_monitor_events", "exa"],
    ]);
  });

  it("has one tool name per spec, in spec order, for a provider with every capability", () => {
    expect(new Set(SPECS.map((spec) => spec.name)).size).toBe(SPECS.length);
    const all = toolsFor(new Fieldwork({ adapter: rich }), {
      allow: ALL_CAPABILITIES,
    });
    expect(names(all)).toStrictEqual(SPECS.map((spec) => spec.name));
  });
});

describe("what each tool says about itself", () => {
  const all = toolsFor(new Fieldwork({ adapter: rich }), {
    allow: ALL_CAPABILITIES,
  });

  it("marks the read-only tools", () => {
    const readOnly = [
      "search_web",
      "search_images",
      "read_page",
      "read_pages",
      "extract_values",
      "read_product",
      "map_site",
      "crawl_site",
      "answer_question",
      "research_question",
      "find_entities",
      "make_decisions",
      "parse_document",
      "get_monitor",
      "list_monitors",
      "list_monitor_events",
      "check_usage",
    ];
    expect(
      all
        .filter((tool) => tool.annotations.readOnlyHint)
        .map((tool) => tool.name)
    ).toStrictEqual(readOnly);
    for (const tool of all.filter((candidate) =>
      readOnly.includes(candidate.name)
    )) {
      expect(tool.annotations, tool.name).toMatchObject({
        destructiveHint: false,
        openWorldHint: true,
      });
    }
  });

  it("marks creating a monitor as a change that is not repeatable, and deleting and closing as destructive", () => {
    expect(toolNamed(all, "create_monitor").annotations).toMatchObject({
      destructiveHint: false,
      idempotentHint: false,
      readOnlyHint: false,
    });
    expect(toolNamed(all, "delete_monitor").annotations).toMatchObject({
      destructiveHint: true,
      readOnlyHint: false,
    });
    expect(toolNamed(all, "close_browser").annotations).toMatchObject({
      destructiveHint: true,
      readOnlyHint: false,
    });
  });

  it("marks running a script and opening a browser as act is marked", () => {
    for (const name of ["run_browser_script", "open_browser"]) {
      expect(toolNamed(all, name).annotations, name).toMatchObject({
        destructiveHint: true,
        idempotentHint: false,
        readOnlyHint: false,
      });
    }
  });

  it("does not call repeating a costly job harmless", () => {
    for (const name of ["crawl_site", "research_question", "find_entities"]) {
      expect(toolNamed(all, name).annotations.idempotentHint, name).toBe(false);
    }
  });

  it("says when to use each tool, and describes every field", () => {
    for (const tool of all) {
      expect(tool.description, tool.name).toMatch(/Use /u);
      for (const [field, schema] of Object.entries(
        tool.inputSchema.properties ?? {}
      )) {
        expect(schema, `${tool.name}.${field}`).toHaveProperty("description");
      }
    }
  });
});

describe("what a tool offers", () => {
  it("offers only the options the provider supports", () => {
    const firecrawlSearch = propertiesOf(
      toolNamed(toolsFor(firecrawlWeb().web), "search_web")
    );
    const exaSearch = propertiesOf(
      toolNamed(toolsFor(webFor("exa", fakeFetch().fetch)), "search_web")
    );
    const parallelSearch = propertiesOf(
      toolNamed(toolsFor(webFor("parallel", fakeFetch().fetch)), "search_web")
    );
    expect(firecrawlSearch).toContain("publishedAfter");
    expect(firecrawlSearch).not.toContain("language");
    expect(exaSearch).toContain("country");
    expect(parallelSearch).not.toContain("publishedBefore");
  });

  it("asks for what the provider needs and no more", () => {
    expect(requiredFor("exa")).toStrictEqual(["query", "webhookUrl"]);
    expect(requiredFor("parallel")).toStrictEqual(["query", "schedule"]);
    expect(requiredFor("firecrawl")).toStrictEqual(["schedule"]);
  });
});

describe("checking input", () => {
  it("rejects an option the provider does not support before sending anything", async () => {
    const { calls, web } = firecrawlWeb();
    const search = toolNamed(toolsFor(web), "search_web");
    await expect(
      search.execute({ language: "en", query: "tiles" })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    await expect(
      search.execute({ limit: 500, query: "tiles" })
    ).rejects.toMatchObject({
      code: "InvalidRequest",
      message: expect.stringContaining(
        "limit must be a whole number from 1 to 20"
      ),
    });
    await expect(search.execute({})).rejects.toMatchObject({
      message: expect.stringContaining("query is required"),
    });
    await expect(search.execute("tiles")).rejects.toMatchObject({
      code: "InvalidRequest",
    });
    expect(calls).toHaveLength(0);
  });

  it("checks nested values and says which one is wrong", async () => {
    const { calls, fetch } = fakeFetch();
    const tools = toolsFor(webFor("parallel", fetch));
    const decide = toolNamed(tools, "make_decisions");
    await expect(
      decide.execute({
        context: "a quarry",
        questions: { fit: { question: "Is it oak?", type: "maybe" } },
      })
    ).rejects.toMatchObject({
      code: "InvalidRequest",
      message: expect.stringContaining("questions.fit"),
    });
    await expect(
      decide.execute({
        context: "a quarry",
        questions: { fit: { question: "Which?", type: "choice" } },
      })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    await expect(
      toolNamed(tools, "find_entities").execute({
        conditions: [{ name: "tile" }],
        entityType: "companies",
        objective: "tile makers",
      })
    ).rejects.toMatchObject({
      message: expect.stringContaining("conditions[0] needs description"),
    });
    expect(calls).toHaveLength(0);
  });

  it("checks a list of URLs", async () => {
    const { calls, fetch } = fakeFetch();
    const readMany = toolNamed(toolsFor(webFor("exa", fetch)), "read_pages");
    await expect(readMany.execute({ urls: [] })).rejects.toMatchObject({
      message: expect.stringContaining("urls needs at least 1 item"),
    });
    await expect(
      readMany.execute({ urls: ["https://a.test/1", "not a url"] })
    ).rejects.toMatchObject({
      message: expect.stringContaining("urls[1] must be a full URL"),
    });
    expect(calls).toHaveLength(0);
  });

  it("takes the schedule a provider can run, and no other", async () => {
    const { calls, web } = firecrawlWeb({ body: { data: { id: "m1" } } });
    const create = toolNamed(
      toolsFor(web, { allow: ["monitor"] }),
      "create_monitor"
    );
    await expect(
      create.execute({
        query: "q",
        schedule: { cron: "0 9 * * 1", every: "day" },
      })
    ).rejects.toMatchObject({
      message: expect.stringContaining("matches none of the allowed forms"),
    });
    await expect(
      create.execute({ query: "q", schedule: { every: "fortnight" } })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
    await create.execute({ query: "q", schedule: { cron: "0 9 * * 1" } });
    expect(calls[0]?.body).toMatchObject({
      schedule: { cron: "0 9 * * 1" },
    });
  });

  it("refuses a cron schedule where the provider has none", async () => {
    const { calls, fetch } = fakeFetch();
    const create = toolNamed(
      toolsFor(webFor("exa", fetch), { allow: ["monitor"] }),
      "create_monitor"
    );
    await expect(
      create.execute({
        query: "q",
        schedule: { cron: "0 9 * * 1" },
        webhookUrl: "https://hook.test/in",
      })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });
});

describe("calling the capability", () => {
  it("returns the result without raw, with long text cut", async () => {
    const { calls, web } = firecrawlWeb({
      body: {
        data: {
          markdown: "x".repeat(2000),
          metadata: { title: "Spec", url: "https://a.test/p" },
        },
        success: true,
      },
    });
    const read = toolNamed(toolsFor(web, { maxCharacters: 1000 }), "read_page");
    const page = await read.execute({ url: "https://a.test/p" });
    expect(page).not.toHaveProperty("raw");
    expect(page).toMatchObject({ title: "Spec" });
    expect(page.markdown).toMatch(
      /^x{1000}\n\n\[cut: 1000 of 2000 characters shown\]$/u
    );
    expect(calls[0]?.body).toMatchObject({ url: "https://a.test/p" });
  });

  it("passes positional fields as arguments and the rest as options", async () => {
    const { calls, web } = firecrawlWeb({
      body: { id: "b1", success: true },
    });
    const readMany = toolNamed(toolsFor(web), "read_pages");
    await expect(
      readMany.execute(
        { query: "widths", urls: ["https://a.test/1", "https://a.test/2"] },
        { timeout: 50 }
      )
    ).rejects.toMatchObject({ jobId: "b1" });
    expect(calls[0]).toMatchObject({
      body: { urls: ["https://a.test/1", "https://a.test/2"] },
      method: "POST",
    });
    expect(calls[0]?.url.pathname).toBe("/v2/batch/scrape");
  });

  it("passes the context and the questions of make_decisions as two arguments", async () => {
    const { calls, fetch } = fakeFetch({
      body: {
        answers: { fit: { noul: 0.9, type: "noul" } },
        citations: [],
        decision_id: "d1",
      },
    });
    const decide = toolNamed(
      toolsFor(webFor("parallel", fetch)),
      "make_decisions"
    );
    const result = await decide.execute({
      context: { stone: "oak" },
      country: "GB",
      questions: { fit: { question: "Is it oak?", type: "yesno" } },
    });
    expect(calls[0]?.body).toMatchObject({
      advanced_settings: { location: "GB" },
      questions: { fit: { instructions: "Is it oak?" } },
      state: { stone: "oak" },
    });
    expect(result).toMatchObject({ answers: { fit: { probability: 0.9 } } });
  });

  it("builds the document for parse_document from its name and bytes", async () => {
    const { calls, web } = firecrawlWeb({
      body: { data: { markdown: "hello" }, success: true },
    });
    const result = await toolNamed(toolsFor(web), "parse_document").execute({
      contentBase64: Buffer.from("hello").toString("base64"),
      name: "sheet.pdf",
    });
    expect(result).toMatchObject({ markdown: "hello" });
    const form = calls[0]?.body;
    expect(form).toBeInstanceOf(FormData);
    const file = form instanceof FormData ? form.get("file") : null;
    expect(file).toBeInstanceOf(File);
    expect(file instanceof File ? file.name : "").toBe("sheet.pdf");
    expect(file instanceof File ? await file.text() : "").toBe("hello");
  });
});

describe("the monitor tools", () => {
  const monitor = { id: "mon_1", status: "active" };

  it("calls each method with its arguments and returns an object", async () => {
    const { calls, fetch } = fakeFetch(
      { body: { data: monitor } },
      { body: { data: [monitor] } },
      { body: {} },
      { body: { data: { checks: [] } } }
    );
    const tools = toolsFor(webFor("firecrawl", fetch), { allow: ["monitor"] });
    await expect(
      toolNamed(tools, "get_monitor").execute({ id: "mon_1" })
    ).resolves.toMatchObject({ id: "mon_1" });
    await expect(
      toolNamed(tools, "list_monitors").execute({})
    ).resolves.toMatchObject({ monitors: [{ id: "mon_1" }] });
    await expect(
      toolNamed(tools, "delete_monitor").execute({ id: "mon_1" })
    ).resolves.toStrictEqual({ deleted: true, id: "mon_1" });
    await expect(
      toolNamed(tools, "list_monitor_events").execute({ id: "mon_1" })
    ).resolves.toMatchObject({ events: [] });
    expect(
      calls.map((call) => `${call.method} ${call.url.pathname}`)
    ).toStrictEqual([
      "GET /v2/monitor/mon_1",
      "GET /v2/monitor",
      "DELETE /v2/monitor/mon_1",
      "GET /v2/monitor/mon_1/checks",
    ]);
  });

  it("creates a monitor from the options the provider takes", async () => {
    const { calls, fetch } = fakeFetch({ body: { data: monitor } });
    const create = toolNamed(
      toolsFor(webFor("firecrawl", fetch), { allow: ["monitor"] }),
      "create_monitor"
    );
    await expect(
      create.execute({
        excludeDomains: ["b.test"],
        query: "price drops",
        schedule: { every: "day" },
        webhookUrl: "https://hook.test/in",
      })
    ).resolves.toMatchObject({ id: "mon_1" });
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url.pathname).toBe("/v2/monitor");
  });
});

describe("the browser and usage tools", () => {
  it("closes a browser by id and confirms it", async () => {
    const { calls, fetch } = fakeFetch({ body: { success: true } });
    const close = toolNamed(
      toolsFor(webFor("firecrawl", fetch), { allow: ["browser"] }),
      "close_browser"
    );
    await expect(close.execute({ id: "sess_1" })).resolves.toStrictEqual({
      closed: true,
      id: "sess_1",
    });
    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.url.pathname).toContain("sess_1");
  });

  it("reports account usage", async () => {
    const { fetch } = fakeFetch({
      body: { account: { plan_credits: 100 }, key: { usage: 10 } },
    });
    const usage = toolNamed(toolsFor(webFor("tavily", fetch)), "check_usage");
    await expect(usage.execute({})).resolves.not.toHaveProperty("raw");
  });

  it("serializes errors for a model without the provider's response", () => {
    expect(toolError(new Error("boom"))).toMatchObject({
      code: "ProviderError",
      message: "boom",
    });
  });
});

describe("what a model sees", () => {
  const tools = toolsFor(new Fieldwork({ adapter: rich }), {
    allow: ALL_CAPABILITIES,
  });

  /** Every tool run once on the adapter that sets every field of every result. */
  const results = async () =>
    await Promise.all(
      tools.map(async (tool) => {
        const spec = specNamed(tool.name);
        return {
          name: tool.name,
          output: spec.output,
          result: await tool.execute(baseInput(spec, "rich")),
        };
      })
    );

  it("never includes the provider's response, except as a value the caller or the page owns", async () => {
    for (const { name, result } of await results()) {
      const text = JSON.stringify(result).replaceAll("kept: ", "");
      expect(text, name).not.toContain("secret");
      expect(text, name).not.toContain('"raw":{');
    }
  });

  it("keeps a field called raw inside extracted values, entity data, outputs and script results", async () => {
    const all = await results();
    const kept = all
      .filter(({ result }) => JSON.stringify(result).includes('"raw":"kept:'))
      .map(({ name }) => name);
    expect(kept).toStrictEqual([
      "extract_values",
      "find_entities",
      "run_browser_script",
      "list_monitor_events",
    ]);
  });

  it("declares every field a tool returns, and returns what it declares", async () => {
    for (const { name, output, result } of await results()) {
      expect(undeclared(output, result, name), name).toStrictEqual([]);
      expect(problem(output, result, name), name).toBeUndefined();
    }
  });

  it("returns the status, stop reason and continuation of a run", async () => {
    await expect(
      toolNamed(tools, "research_question").execute({ question: "How wide?" })
    ).resolves.toMatchObject({
      continuationId: "cont_2",
      status: "partial",
      stopReason: "step limit",
    });
    await expect(
      toolNamed(tools, "find_entities").execute(
        baseInput(specNamed("find_entities"), "rich")
      )
    ).resolves.toMatchObject({ status: "partial", stopReason: "budget" });
  });

  it("returns the URLs a batch could not read, and a page's main image", async () => {
    await expect(
      toolNamed(tools, "read_pages").execute({ urls: ["https://a.test/p"] })
    ).resolves.toMatchObject({
      failed: [{ error: "not found", url: "https://a.test/gone" }],
    });
    await expect(
      toolNamed(tools, "read_page").execute({ url: "https://a.test/p" })
    ).resolves.toMatchObject({ image: "https://a.test/og.png" });
  });

  it("shares one text budget across the fields of a result", async () => {
    const { fetch } = fakeFetch({
      body: {
        data: {
          html: "h".repeat(800),
          markdown: "m".repeat(800),
          metadata: { title: "t".repeat(400), url: "https://a.test/p" },
        },
        success: true,
      },
    });
    const page = await toolNamed(
      toolsFor(webFor("firecrawl", fetch), { maxCharacters: 1000 }),
      "read_page"
    ).execute({ url: "https://a.test/p" });
    const { html, markdown, title } = page;
    expect(title).toBe("t".repeat(400));
    expect(isText(markdown) ? markdown : "").toMatch(/^m{800}$/u);
    expect(isText(html) ? html : "").toMatch(
      /^h{200}\n\n\[cut: 200 of 800 characters shown\]$/u
    );
  });
});
