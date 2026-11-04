// Registers one tool on an `McpServer` from a Fieldwork JSON Schema. Shared by the
// stdio server (server.ts) and the gateway's remote MCP (gateway/mcp.ts).

import type { JsonSchema } from "@howells/fieldwork-sdk";
import { toolError } from "@howells/fieldwork-sdk/tools";
import type {
  FieldworkTool,
  ToolArguments,
  ToolOutput,
} from "@howells/fieldwork-sdk/tools";
import type {
  McpServer,
  StandardSchemaWithJSON,
} from "@modelcontextprotocol/server";
import * as z from "zod/mini";

const Arguments = z.record(z.string(), z.json());

/**
 * Advertises a Fieldwork JSON Schema to MCP clients and passes every JSON
 * object through: the tool's own `execute` checks it, and its errors name the
 * field, the problem and the inputs the provider accepts.
 */
const schemaOf = (
  schema: JsonSchema
): StandardSchemaWithJSON<ToolArguments> => ({
  "~standard": {
    jsonSchema: { input: () => schema, output: () => schema },
    validate: (value) => {
      const parsed = z.safeParse(Arguments, value);
      return parsed.success
        ? { value: parsed.data }
        : { issues: [{ message: "Input must be a JSON object" }] };
    },
    vendor: "fieldwork",
    version: 1,
  },
});

/** A tool as the MCP server advertises it. */
export interface RegisteredTool {
  annotations: FieldworkTool["annotations"];
  description: string;
  /** Advertised to clients as is; `run` receives any JSON object, and the tool checks it. */
  inputSchema: JsonSchema;
  /** Sent as `_meta` on the tool when clients list tools. */
  meta?: Record<string, string | undefined>;
  name: string;
  outputSchema: JsonSchema;
}

/** What one tool call returns to `registerTool`. */
export interface ToolRun {
  /** Sent as `_meta` on this call's result. */
  meta?: Record<string, string | undefined>;
  result: ToolOutput;
}

/**
 * Registers one tool. A thrown error comes back as a result with
 * `isError: true` and a structured body, so a model can read the code and
 * decide what to do next. `run` receives the client's abort signal.
 *
 * The error body is `toolError(error)`, which passes a plain `Error`'s message
 * through. A caller that serves untrusted clients must make `run` throw only
 * errors it has already sanitised, as the gateway's executor does.
 */
export const registerTool = (
  server: McpServer,
  tool: RegisteredTool,
  run: (input: ToolArguments, signal: AbortSignal) => Promise<ToolRun>
): void => {
  server.registerTool(
    tool.name,
    {
      _meta: tool.meta,
      annotations: tool.annotations,
      description: tool.description,
      inputSchema: schemaOf(tool.inputSchema),
      outputSchema: schemaOf(tool.outputSchema),
      title: tool.annotations.title,
    },
    async (input, context) => {
      try {
        const { meta, result } = await run(input, context.mcpReq.signal);
        return {
          _meta: meta,
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
};
