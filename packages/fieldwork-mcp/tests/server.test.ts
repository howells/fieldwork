import { Fieldwork } from "@howells/fieldwork-sdk";
import { firecrawl } from "@howells/fieldwork-sdk/firecrawl";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it } from "vitest";

import { fieldworkFor, parseArgs } from "../src/config.js";
import { createFieldworkServer } from "../src/server.js";

const closers: (() => Promise<void>)[] = [];

/** Answers each request with the next reply and records the URLs requested. */
function replies(...bodies: unknown[]) {
  const urls: string[] = [];
  const queue = [...bodies];
  const fetchImpl = async (input: URL | string) => {
    urls.push(String(input));
    return Response.json(queue.shift() ?? {});
  };
  return { fetch: fetchImpl as typeof fetch, urls };
}

async function connect(
  web: Parameters<typeof createFieldworkServer>[0],
  allowAct = false
) {
  const server = createFieldworkServer(web, {
    capabilities: allowAct ? ["read", "act"] : undefined,
  });
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
}

describe("the Fieldwork MCP server", () => {
  afterEach(async () => {
    await Promise.all(
      closers.splice(0).map(async (close) => {
        await close();
      })
    );
  });

  it("lists one annotated tool per capability, without the browser tool unless allowed", async () => {
    const web = new Fieldwork({
      adapter: firecrawl({ apiKey: "k", fetch: replies().fetch }),
    });
    const client = await connect(web);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).not.toContain("run_browser_script");
    const read = tools.find((tool) => tool.name === "read_page");
    expect(read?.annotations).toMatchObject({
      readOnlyHint: true,
      openWorldHint: true,
    });
    expect(read?.inputSchema).toMatchObject({ required: ["url"] });
    expect(read?.outputSchema).toMatchObject({ required: ["url"] });

    const withAct = await connect(web, true);
    const allowed = await withAct.listTools();
    expect(allowed.tools.map((tool) => tool.name)).toStrictEqual([
      "read_page",
      "run_browser_script",
    ]);
  });

  it("returns a page as structured content", async () => {
    const { fetch, urls } = replies({
      success: true,
      data: {
        markdown: "# Portmore",
        metadata: { title: "Portmore", url: "https://a.test/p" },
      },
    });
    const web = new Fieldwork({ adapter: firecrawl({ apiKey: "k", fetch }) });
    const client = await connect(web);
    const result = await client.callTool({
      name: "read_page",
      arguments: { url: "https://a.test/p" },
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toStrictEqual({
      url: "https://a.test/p",
      title: "Portmore",
      markdown: "# Portmore",
    });
    expect(urls).toStrictEqual(["https://api.firecrawl.dev/v2/scrape"]);
  });

  it("reports bad input as a tool error a model can read", async () => {
    const { fetch, urls } = replies();
    const web = new Fieldwork({ adapter: firecrawl({ apiKey: "k", fetch }) });
    const client = await connect(web);
    const result = await client.callTool({
      name: "search_web",
      arguments: { query: "tiles", publishedAfter: "2026-01-01" },
    });
    expect(result.isError).toBe(true);
    const [content] = result.content as { text: string }[];
    expect(JSON.parse(content?.text ?? "{}")).toMatchObject({
      code: "InvalidRequest",
      retryable: false,
    });
    expect(urls).toHaveLength(0);
  });
});

describe("the command line", () => {
  it("reads a provider per capability", () => {
    expect(
      parseArgs(["--search", "parallel", "--read", "firecrawl", "--allow-act"])
    ).toMatchObject({
      routes: { search: "parallel", read: "firecrawl" },
      allowAct: true,
    });
  });

  it("refuses an unknown provider and a route the provider cannot serve", () => {
    expect(() => parseArgs(["--provider", "bing"])).toThrow(/needs one of/u);
    process.env.TAVILY_API_KEY ??= "test";
    expect(() => fieldworkFor(parseArgs(["--act", "tavily"]))).toThrow(
      /does not offer act/u
    );
  });
});
