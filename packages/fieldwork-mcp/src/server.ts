import type { AnyAdapter, Fieldwork, JsonSchema } from "@howells/fieldwork-sdk";
import { toolError, toolsFor } from "@howells/fieldwork-sdk/tools";
import type { ToolArguments, ToolsOptions } from "@howells/fieldwork-sdk/tools";
import { McpServer } from "@modelcontextprotocol/server";
import type { StandardSchemaWithJSON } from "@modelcontextprotocol/server";

export interface FieldworkServerOptions extends ToolsOptions {
  /** Reported to clients as the server's version. */
  version?: string;
}

const isArguments = (value: unknown): value is ToolArguments =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Advertises a Fieldwork JSON Schema to MCP clients and passes every input
 * object through: the tool's own `execute` checks it, and its errors name the
 * field, the problem and the inputs the provider accepts.
 */
const schemaOf = (
  schema: JsonSchema
): StandardSchemaWithJSON<ToolArguments> => ({
  "~standard": {
    jsonSchema: { input: () => schema, output: () => schema },
    validate: (value) =>
      isArguments(value)
        ? { value }
        : { issues: [{ message: "input must be a JSON object" }] },
    vendor: "fieldwork",
    version: 1,
  },
});

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
    version: options.version ?? "0.0.0",
  });
  for (const tool of toolsFor(web, options)) {
    server.registerTool(
      tool.name,
      {
        _meta: {
          "fieldwork/capability": tool.capability,
          "fieldwork/method": tool.method,
          "fieldwork/provider": tool.provider,
        },
        annotations: tool.annotations,
        description: tool.description,
        inputSchema: schemaOf(tool.inputSchema),
        outputSchema: schemaOf(tool.outputSchema),
        title: tool.annotations.title,
      },
      async (input, context) => {
        try {
          const result = await tool.execute(input, {
            signal: context.mcpReq.signal,
          });
          return {
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
