import type { AnyAdapter, Fieldwork, JsonSchema } from "@howells/fieldwork-sdk";
import { toolError, toolsFor } from "@howells/fieldwork-sdk/tools";
import type { ToolsOptions } from "@howells/fieldwork-sdk/tools";
import { McpServer } from "@modelcontextprotocol/server";
import type { StandardSchemaWithJSON } from "@modelcontextprotocol/server";

export interface FieldworkServerOptions extends ToolsOptions {
  /** Reported to clients as the server's version. */
  version?: string;
}

/**
 * Advertises a Fieldwork JSON Schema to MCP clients and passes every input
 * through: the tool's own `execute` checks it, and its errors name the field,
 * the problem and the inputs the provider accepts.
 */
function schemaOf(
  schema: JsonSchema
): StandardSchemaWithJSON<Record<string, unknown>> {
  return {
    "~standard": {
      version: 1,
      vendor: "fieldwork",
      validate: (value) => ({ value: value as Record<string, unknown> }),
      jsonSchema: { input: () => schema, output: () => schema },
    },
  };
}

/**
 * An MCP server with one tool per capability the Fieldwork instance offers.
 * Tool errors come back as results with `isError: true` and a structured
 * body, so a model can read the code and decide what to do next.
 */
export function createFieldworkServer(
  web: Fieldwork<AnyAdapter>,
  options: FieldworkServerOptions = {}
): McpServer {
  const server = new McpServer({
    name: "fieldwork",
    title: "Fieldwork",
    version: options.version ?? "0.0.0",
  });
  for (const tool of toolsFor(web, options)) {
    server.registerTool(
      tool.name,
      {
        title: tool.annotations.title,
        description: tool.description,
        inputSchema: schemaOf(tool.inputSchema),
        outputSchema: schemaOf(tool.outputSchema),
        annotations: tool.annotations,
        _meta: {
          "fieldwork/provider": tool.provider,
          "fieldwork/capability": tool.capability,
        },
      },
      async (input, context) => {
        try {
          const result = (await tool.execute(input, {
            signal: context.mcpReq.signal,
          })) as Record<string, unknown>;
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result,
          };
        } catch (error) {
          const body = toolError(error);
          return {
            isError: true,
            content: [{ type: "text", text: JSON.stringify(body) }],
          };
        }
      }
    );
  }
  return server;
}
