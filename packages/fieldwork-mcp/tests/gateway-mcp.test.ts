import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";

import { ACCESS_KEY, fixture } from "./gateway-helpers.js";

describe("remote MCP", () => {
  it("connects a real MCP client, lists conditional schemas and executes an override", async () => {
    const { handle, log, requests } = fixture();
    const transport = new StreamableHTTPClientTransport(
      new URL("https://fieldwork.test/mcp"),
      {
        fetch: async (input, init) => await handle(new Request(input, init)),
        requestInit: { headers: { authorization: `Bearer ${ACCESS_KEY}` } },
      }
    );
    const client = new Client({ name: "gateway-test", version: "1.0.0" });
    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      const read = tools.find((tool) => tool.name === "read_page");
      expect(read?.inputSchema).toMatchObject({
        oneOf: expect.arrayContaining([
          expect.objectContaining({
            properties: expect.objectContaining({
              provider: { const: "exa", type: "string" },
            }),
            required: expect.arrayContaining(["provider", "url"]),
          }),
          expect.objectContaining({
            properties: expect.objectContaining({
              provider: { const: "firecrawl", type: "string" },
            }),
          }),
        ]),
      });
      const result = await client.callTool({
        arguments: {
          maxCharacters: 200_000,
          provider: "exa",
          url: "https://example.test/page",
        },
        name: "read_page",
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ markdown: "Exa page" });
      expect(requests).toHaveLength(1);
      expect(log).toMatchObject([{ agentId: "codex", provider: "exa" }]);
    } finally {
      await client.close();
    }
  });

  it("accepts the cap with escaped text and rejects larger budgets before a provider call", async () => {
    const { handle, requests } = fixture("\0".repeat(200_000));
    const transport = new StreamableHTTPClientTransport(
      new URL("https://fieldwork.test/mcp"),
      {
        fetch: async (input, init) => await handle(new Request(input, init)),
        requestInit: { headers: { authorization: `Bearer ${ACCESS_KEY}` } },
      }
    );
    const client = new Client({ name: "gateway-cap-test", version: "1.0.0" });
    try {
      await client.connect(transport);
      const full = await client.callTool({
        arguments: { maxCharacters: 200_000, url: "https://example.test/page" },
        name: "read_page",
      });
      expect(full.isError).not.toBe(true);
      expect(full.structuredContent).toMatchObject({
        markdown: "\0".repeat(200_000),
      });
      const refused = await client.callTool({
        arguments: { maxCharacters: 200_001, url: "https://example.test/page" },
        name: "read_page",
      });
      expect(refused.isError).toBe(true);
      expect(JSON.stringify(refused.content)).toContain("InvalidRequest");
      expect(requests).toHaveLength(1);
    } finally {
      await client.close();
    }
  });

  it("answers server/discover as the 2026-07-28 revision requires", async () => {
    const { handle } = fixture();
    const response = await handle(
      new Request("https://fieldwork.test/mcp", {
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "server/discover",
          params: {
            _meta: {
              "io.modelcontextprotocol/clientCapabilities": {},
              "io.modelcontextprotocol/clientInfo": {
                name: "discover-test",
                version: "1.0.0",
              },
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            },
          },
        }),
        headers: {
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${ACCESS_KEY}`,
          "content-type": "application/json",
          "mcp-method": "server/discover",
          "mcp-protocol-version": "2026-07-28",
        },
        method: "POST",
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: {
        _meta: {
          "io.modelcontextprotocol/serverInfo": { name: "fieldwork" },
        },
        capabilities: { tools: {} },
        supportedVersions: expect.arrayContaining(["2026-07-28"]),
      },
    });
  });
});
