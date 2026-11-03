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
        arguments: { provider: "exa", url: "https://example.test/page" },
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
});
