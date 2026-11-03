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

export interface RegisteredTool {
  annotations: FieldworkTool["annotations"];
  description: string;
  inputSchema: JsonSchema;
  /** Listed with the tool. */
  meta?: Record<string, string | undefined>;
  name: string;
  outputSchema: JsonSchema;
}

export interface ToolRun {
  /** Returned with this call's result. */
  meta?: Record<string, string | undefined>;
  result: ToolOutput;
}

/**
 * Registers one tool. A thrown error comes back as a result with
 * `isError: true` and a structured body, so a model can read the code and
 * decide what to do next. `run` receives the client's abort signal.
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
