import { FieldworkError } from "@howells/fieldwork-sdk";
import type {
  AnyAdapter,
  Capability,
  Fieldwork,
  JsonSchema,
} from "@howells/fieldwork-sdk";
import { toolsFor } from "@howells/fieldwork-sdk/tools";
import type { FieldworkTool, ToolsOptions } from "@howells/fieldwork-sdk/tools";
import * as z from "zod/mini";

export type GatewayDefaults = Partial<Record<Capability, string>>;

export interface GatewayTool {
  annotations: FieldworkTool["annotations"];
  capability: Capability;
  defaultProvider?: string;
  description: string;
  inputSchema: JsonSchema;
  name: string;
  outputSchema: JsonSchema;
  providers: string[];
}

const InputSchema = z.object({
  properties: z.record(z.string(), z.json()),
  required: z.optional(z.array(z.string())),
});

const schemaFor = (
  tool: FieldworkTool,
  maxTimeout: number,
  explicit: boolean
): JsonSchema => {
  const schema = z.parse(InputSchema, tool.inputSchema);
  const properties: JsonSchema = {
    ...schema.properties,
    timeout: { maximum: maxTimeout, minimum: 1, type: "integer" },
  };
  if (explicit) {
    properties.provider = { const: tool.provider, type: "string" };
  }
  return {
    additionalProperties: false,
    properties,
    required: [...(schema.required ?? []), ...(explicit ? ["provider"] : [])],
    type: "object",
  };
};

const describe = (
  variants: readonly FieldworkTool[],
  defaults: GatewayDefaults,
  maxTimeout: number
): GatewayTool[] => {
  const [first] = variants;
  if (first === undefined) {
    return [];
  }
  const defaultTool = variants.find(
    (tool) => tool.provider === defaults[tool.capability]
  );
  const providers = variants.map((tool) => tool.provider);
  return [
    {
      annotations: first.annotations,
      capability: first.capability,
      defaultProvider: defaultTool?.provider,
      description: `${first.description} ${defaultTool === undefined ? "Name a provider explicitly." : `Defaults to ${defaultTool.provider}.`} Set provider to choose another supported provider; Fieldwork never switches providers after an error.`,
      inputSchema: {
        oneOf: [
          ...(defaultTool === undefined
            ? []
            : [schemaFor(defaultTool, maxTimeout, false)]),
          ...variants.map((tool) => schemaFor(tool, maxTimeout, true)),
        ],
        properties: {
          provider: { enum: providers, type: "string" },
          timeout: {
            description:
              "Maximum wait in milliseconds. Resume a returned jobId to collect a long job.",
            maximum: maxTimeout,
            minimum: 1,
            type: "integer",
          },
        },
        type: "object",
      },
      name: first.name,
      outputSchema: first.outputSchema,
      providers,
    },
  ];
};

/** Each provider contributes its own schema and executor; no options are merged. */
export const gatewayCatalog = (
  clients: readonly Fieldwork<AnyAdapter>[],
  defaults: GatewayDefaults,
  maxTimeout: number,
  options: ToolsOptions = {}
) => {
  const entries = new Map<string, Map<string, FieldworkTool>>();
  for (const client of clients) {
    for (const tool of toolsFor(client, options)) {
      const variants =
        entries.get(tool.name) ?? new Map<string, FieldworkTool>();
      if (variants.has(tool.provider)) {
        throw new Error(`Duplicate gateway provider for ${tool.name}`);
      }
      variants.set(tool.provider, tool);
      entries.set(tool.name, variants);
    }
  }
  const tools = [...entries.values()].flatMap((variants) =>
    describe([...variants.values()], defaults, maxTimeout)
  );
  const select = (name: string, provider?: string): FieldworkTool => {
    const variants = entries.get(name);
    const advertised = tools.find((tool) => tool.name === name);
    const selected = provider ?? advertised?.defaultProvider;
    const tool = selected === undefined ? undefined : variants?.get(selected);
    if (tool === undefined) {
      throw new FieldworkError(
        "Unsupported",
        `${name} needs a supported provider; available: ${advertised?.providers.join(", ") ?? "none"}`,
        { provider: selected }
      );
    }
    return tool;
  };
  return { select, tools };
};
