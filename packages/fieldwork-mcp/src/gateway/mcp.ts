// Remote MCP for the gateway: the same tools as the JSON API, run through the same
// executor. http.ts calls it only after the request has passed the gate.

import type { ToolInput } from "@howells/fieldwork-sdk/tools";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";

import { registerTool } from "../register.js";
import { VERSION } from "../version.js";
import type { GatewayTool } from "./catalog.js";
import type { CallContext, gatewayExecutor } from "./execute.js";

/**
 * A new server for each request, with the caller's `context` bound into every
 * tool, so each call is attributed to the right agent and request and is
 * cancelled with them.
 */
const serverFor = (
  tools: readonly GatewayTool[],
  execute: ReturnType<typeof gatewayExecutor>,
  context: CallContext
) => {
  const server = new McpServer({
    name: "fieldwork",
    title: "Fieldwork",
    version: VERSION,
  });
  for (const tool of tools) {
    registerTool(server, tool, async (input, signal) => {
      const { provider, result } = await execute(tool.name, input, {
        ...context,
        signal: AbortSignal.any([context.signal, signal]),
      });
      return {
        meta: {
          "fieldwork/provider": provider,
          "fieldwork/requestId": context.requestId,
        },
        result,
      };
    });
  }
  return server;
};

/**
 * The SDK serves both modern per-request MCP and legacy stateless clients.
 *
 * `body` is the JSON that `gatewayBody` already read and bounded, passed on as
 * `parsedBody`; the SDK's own size limit does not apply to a parsed body. It
 * is undefined for any method but `POST`. Replies are plain JSON, not event
 * streams.
 */
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
