import type { JsonSchema } from "@howells/fieldwork-sdk";
import { toolError } from "@howells/fieldwork-sdk/tools";
import type { ToolInput } from "@howells/fieldwork-sdk/tools";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import type { StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import * as z from "zod/mini";

import type { GatewayTool } from "./catalog.js";
import type { CallContext, gatewayExecutor } from "./execute.js";

export const GATEWAY_VERSION = "1.0.0";

const schemaOf = (schema: JsonSchema): StandardSchemaWithJSON<ToolInput> => ({
  "~standard": {
    jsonSchema: { input: () => schema, output: () => schema },
    validate: (value) => {
      const parsed = z.safeParse(z.record(z.string(), z.json()), value);
      return parsed.success
        ? { value: parsed.data }
        : { issues: [{ message: "Input must be a JSON object" }] };
    },
    vendor: "fieldwork",
    version: 1,
  },
});

const serverFor = (
  tools: readonly GatewayTool[],
  execute: ReturnType<typeof gatewayExecutor>,
  context: CallContext
) => {
  const server = new McpServer({
    name: "fieldwork",
    title: "Fieldwork",
    version: GATEWAY_VERSION,
  });
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        annotations: tool.annotations,
        description: tool.description,
        inputSchema: schemaOf(tool.inputSchema),
        outputSchema: schemaOf(tool.outputSchema),
        title: tool.annotations.title,
      },
      async (input, call) => {
        try {
          const { provider, result } = await execute(tool.name, input, {
            ...context,
            signal: AbortSignal.any([context.signal, call.mcpReq.signal]),
          });
          return {
            _meta: {
              "fieldwork/provider": provider,
              "fieldwork/requestId": context.requestId,
            },
            content: [{ text: JSON.stringify(result), type: "text" }],
            structuredContent: result,
          };
        } catch (error) {
          return {
            content: [{ text: JSON.stringify(toolError(error)), type: "text" }],
            isError: true,
          };
        }
      }
    );
  }
  return server;
};

/** The SDK serves both modern per-request MCP and legacy stateless clients. */
export const serveGatewayMcp = async (
  request: Request,
  body: ToolInput | undefined,
  tools: readonly GatewayTool[],
  execute: ReturnType<typeof gatewayExecutor>,
  context: CallContext,
  maxBytes: number
) =>
  await createMcpHandler(() => serverFor(tools, execute, context), {
    legacy: "stateless",
    maxRequestBodySize: maxBytes,
    maxSubscriptions: 0,
    responseMode: "json",
  }).fetch(request, { parsedBody: body });
