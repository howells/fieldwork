import type { AnyAdapter, Fieldwork } from "@howells/fieldwork-sdk";
import { toolsFor } from "@howells/fieldwork-sdk/tools";
import type { ToolsOptions } from "@howells/fieldwork-sdk/tools";
import { McpServer } from "@modelcontextprotocol/server";

import { registerTool } from "./register.js";
import { VERSION } from "./version.js";

export type FieldworkServerOptions = ToolsOptions;

/**
 * An MCP server with one tool per capability, or per method of a group
 * capability, the Fieldwork instance offers. Tool errors come back as results
 * with `isError: true` and a structured body, so a model can read the code
 * and decide what to do next.
 */
export const createFieldworkServer = (
  web: Fieldwork<AnyAdapter>,
  options: FieldworkServerOptions = {}
): McpServer => {
  const server = new McpServer({
    name: "fieldwork",
    title: "Fieldwork",
    version: VERSION,
  });
  for (const tool of toolsFor(web, options)) {
    registerTool(
      server,
      {
        annotations: tool.annotations,
        description: tool.description,
        inputSchema: tool.inputSchema,
        meta: {
          "fieldwork/capability": tool.capability,
          "fieldwork/method": tool.method,
          "fieldwork/provider": tool.provider,
        },
        name: tool.name,
        outputSchema: tool.outputSchema,
      },
      async (input, signal) => ({
        result: await tool.execute(input, { signal }),
      })
    );
  }
  return server;
};
