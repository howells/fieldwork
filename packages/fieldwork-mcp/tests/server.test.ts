import { Fieldwork } from "@howells/fieldwork-sdk";
import type { AnyAdapter, Capability } from "@howells/fieldwork-sdk";
import { firecrawl } from "@howells/fieldwork-sdk/firecrawl";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it } from "vitest";

import { PROVIDERS, USAGE, fieldworkFor, parseArgs } from "../src/config.js";
import { createFieldworkServer } from "../src/server.js";
import type { FieldworkServerOptions } from "../src/server.js";

const closers: (() => Promise<void>)[] = [];

/** Answers each request with the next reply and records the requests made. */
const replies = (...bodies: unknown[]) => {
  const requests: string[] = [];
  const queue = [...bodies];
  const fetchImpl = async (
    input: Request | URL | string,
    init?: RequestInit
  ) => {
    const url = input instanceof Request ? input.url : String(input);
    requests.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);
    return Response.json(queue.shift() ?? {});
  };
  return { fetch: fetchImpl, requests };
};

const connect = async (
  web: Fieldwork<AnyAdapter>,
  options: FieldworkServerOptions = {}
) => {
  const server = createFieldworkServer(web, options);
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientSide);
  closers.push(
    async () => {
      await client.close();
    },
    async () => {
      await server.close();
    }
  );
  return client;
};

const firecrawlWeb = (fetchImpl: typeof fetch) =>
  new Fieldwork({ adapter: firecrawl({ apiKey: "k", fetch: fetchImpl }) });

const toolNames = async (client: Client) => {
  const { tools } = await client.listTools();
  return tools.map((tool) => tool.name);
};

describe("the Fieldwork MCP server", () => {
  afterEach(async () => {
    await Promise.all(
      closers.splice(0).map(async (close) => {
        await close();
      })
    );
  });

  it("lists one annotated tool per capability, without the tools that start browsers or monitors", async () => {
    const client = await connect(firecrawlWeb(replies().fetch));
    const { tools } = await client.listTools();
    const listed = tools.map((tool) => tool.name);
    expect(listed).toStrictEqual([
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
    const read = tools.find((tool) => tool.name === "read_page");
    expect(read?.annotations).toMatchObject({
      openWorldHint: true,
      readOnlyHint: true,
    });
    expect(read?.inputSchema).toMatchObject({ required: ["url"] });
    expect(read?.outputSchema).toMatchObject({ required: ["url"] });
  });

  it("lists the browser and monitor tools when they are allowed", async () => {
    const client = await connect(firecrawlWeb(replies().fetch), {
      allow: ["act", "browser", "monitor"],
    });
    const listed = await toolNames(client);
    expect(listed).toStrictEqual([
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
  });

  it("marks the tools that change or destroy something", async () => {
    const client = await connect(firecrawlWeb(replies().fetch), {
      allow: ["act", "browser", "monitor"],
    });
    const { tools } = await client.listTools();
    const hints = new Map(tools.map((tool) => [tool.name, tool.annotations]));
    expect(hints.get("create_monitor")).toMatchObject({
      destructiveHint: false,
      idempotentHint: false,
      readOnlyHint: false,
    });
    expect(hints.get("delete_monitor")).toMatchObject({
      destructiveHint: true,
    });
    expect(hints.get("close_browser")).toMatchObject({ destructiveHint: true });
    expect(hints.get("open_browser")).toMatchObject({
      destructiveHint: true,
      readOnlyHint: false,
    });
  });

  it("returns a page as structured content", async () => {
    const { fetch, requests } = replies({
      data: {
        markdown: "# Portmore",
        metadata: { title: "Portmore", url: "https://a.test/p" },
      },
      success: true,
    });
    const client = await connect(firecrawlWeb(fetch));
    const result = await client.callTool({
      arguments: { url: "https://a.test/p" },
      name: "read_page",
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toStrictEqual({
      markdown: "# Portmore",
      title: "Portmore",
      url: "https://a.test/p",
    });
    expect(requests).toStrictEqual(["POST /v2/scrape"]);
  });

  it("returns a list of monitors as an object, and a deletion as a confirmation", async () => {
    const { fetch, requests } = replies(
      { data: [{ id: "mon_1", status: "active" }] },
      {}
    );
    const client = await connect(firecrawlWeb(fetch), { allow: ["monitor"] });
    const listed = await client.callTool({
      arguments: {},
      name: "list_monitors",
    });
    expect(listed.isError).toBeFalsy();
    expect(listed.structuredContent).toMatchObject({
      monitors: [{ id: "mon_1", status: "active" }],
    });
    const deleted = await client.callTool({
      arguments: { id: "mon_1" },
      name: "delete_monitor",
    });
    expect(deleted.structuredContent).toStrictEqual({
      deleted: true,
      id: "mon_1",
    });
    expect(requests).toStrictEqual([
      "GET /v2/monitor",
      "DELETE /v2/monitor/mon_1",
    ]);
  });

  it("reports bad input as a tool error a model can read", async () => {
    const { fetch, requests } = replies();
    const client = await connect(firecrawlWeb(fetch));
    const result = await client.callTool({
      arguments: { publishedAfter: "26-01-01", query: "tiles" },
      name: "search_web",
    });
    expect(result.isError).toBe(true);
    const [content] = result.content;
    expect(
      JSON.parse(content?.type === "text" ? content.text : "{}")
    ).toMatchObject({
      code: "InvalidRequest",
      retryable: false,
    });
    expect(requests).toHaveLength(0);
  });
});

describe("the command line", () => {
  it("reads a provider per capability", () => {
    expect(
      parseArgs(["--search", "parallel", "--read", "firecrawl"])
    ).toMatchObject({
      allow: [],
      routes: { read: "firecrawl", search: "parallel" },
    });
  });

  it("reads which capabilities left out by default to allow", () => {
    expect(parseArgs(["--allow-act"]).allow).toStrictEqual(["act"]);
    expect(
      parseArgs(["--allow-monitor", "--allow-browser", "--allow-act"]).allow
    ).toStrictEqual(["monitor", "browser", "act"]);
    expect(parseArgs(["--allow-act", "--allow-act"]).allow).toStrictEqual([
      "act",
    ]);
  });

  it("refuses an unknown provider, an unknown option and a conflicting choice", () => {
    expect(() => parseArgs(["--provider", "bing"])).toThrow(/needs one of/u);
    expect(() => parseArgs(["--allow-everything"])).toThrow(/Unknown option/u);
    expect(() =>
      fieldworkFor(parseArgs(["--provider", "exa", "--search", "exa"]), {
        exa: "k",
      })
    ).toThrow(/not both/u);
    expect(() => fieldworkFor(parseArgs([]))).toThrow(/Choose a provider/u);
  });

  it("refuses a route to a provider that lacks the capability", () => {
    expect(() =>
      fieldworkFor(parseArgs(["--act", "tavily"]), { tavily: "k" })
    ).toThrow(/does not offer act/u);
    expect(() =>
      fieldworkFor(parseArgs(["--monitor", "tavily"]), { tavily: "k" })
    ).toThrow(/does not offer monitor/u);
  });

  it("routes monitors to Firecrawl and browsers to Browserbase", async () => {
    const web = fieldworkFor(
      parseArgs([
        "--search",
        "brave",
        "--monitor",
        "firecrawl",
        "--browser",
        "browserbase",
        "--allow-monitor",
        "--allow-browser",
      ]),
      { brave: "k", browserbase: "k", firecrawl: "k" }
    );
    const capabilities: Capability[] = ["monitor", "browser", "search"];
    expect(
      capabilities.map((capability) => web.providerFor(capability))
    ).toStrictEqual(["firecrawl", "browserbase", "brave"]);
    const client = await connect(web, {
      allow: parseArgs(["--allow-monitor", "--allow-browser"]).allow,
    });
    const { tools } = await client.listTools();
    const providers = new Map(
      tools.map((tool) => [tool.name, tool._meta?.["fieldwork/provider"]])
    );
    expect(Object.fromEntries(providers)).toMatchObject({
      create_monitor: "firecrawl",
      open_browser: "browserbase",
      search_web: "brave",
    });
    expect(providers.has("run_browser_script")).toBe(false);
  });

  it("builds a server for each of the eight providers", () => {
    expect(PROVIDERS).toHaveLength(8);
    for (const provider of PROVIDERS) {
      const web = fieldworkFor(parseArgs(["--provider", provider]), {
        [provider]: "k",
      });
      expect(web.provider).toBe(provider);
    }
  });

  it("says in its usage text how to allow each tool group and which keys it reads", () => {
    const mentioned = [
      "--allow-act",
      "--allow-browser",
      "--allow-monitor",
      "--max-characters",
      "EXA_API_KEY",
      "FIRECRAWL_API_KEY",
      "TAVILY_API_KEY",
      "PARALLEL_API_KEY",
      "PERPLEXITY_API_KEY",
      "BRAVE_API_KEY",
      "SERPAPI_API_KEY",
      "BROWSERBASE_API_KEY",
      "BROWSERBASE_PROJECT_ID",
      "--monitor firecrawl",
      "--browser browserbase",
    ];
    expect(mentioned.filter((text) => !USAGE.includes(text))).toStrictEqual([]);
  });
});
