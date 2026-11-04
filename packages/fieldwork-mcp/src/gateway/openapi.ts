import type { FieldworkErrorCode, JsonSchema } from "@howells/fieldwork-sdk";

import { VERSION } from "../version.js";
import type { GatewayTool } from "./catalog.js";

/** Every code, keyed so the compiler finds one the SDK adds. */
const ERROR_CODES: Record<FieldworkErrorCode, true> = {
  Aborted: true,
  InvalidRequest: true,
  JobFailed: true,
  NotFound: true,
  ProviderError: true,
  RateLimited: true,
  Timeout: true,
  Unauthorized: true,
  Unsupported: true,
};

const ERROR: JsonSchema = {
  properties: {
    error: {
      properties: {
        code: { enum: Object.keys(ERROR_CODES), type: "string" },
        jobId: {
          description:
            "A job that was already started. Pass it as resume instead of repeating the call.",
          type: "string",
        },
        message: { type: "string" },
        provider: { type: "string" },
        retryAfter: { description: "Seconds to wait.", type: "number" },
        retryable: {
          description: "Whether repeating the same call can succeed.",
          type: "boolean",
        },
      },
      required: ["code", "message", "retryable"],
      type: "object",
    },
    requestId: { type: "string" },
  },
  required: ["error"],
  type: "object",
};

const json = (schema: JsonSchema, description: string) => ({
  content: { "application/json": { schema } },
  description,
});

const errorResponse = {
  $ref: "#/components/responses/Error",
};

const toolOperation = (tool: GatewayTool) => ({
  post: {
    description: tool.description,
    operationId: tool.name,
    requestBody: {
      content: { "application/json": { schema: tool.inputSchema } },
      required: true,
    },
    responses: {
      "200": json(
        {
          properties: {
            provider: { enum: tool.providers, type: "string" },
            requestId: { type: "string" },
            result: tool.outputSchema,
          },
          required: ["provider", "requestId", "result"],
          type: "object",
        },
        "The provider that ran the call and its normalized result."
      ),
      default: errorResponse,
    },
    summary: tool.name,
    tags: [tool.capability],
    "x-fieldwork-providers": tool.providers,
  },
});

/** The OpenAPI 3.1 description of one running gateway: only the tools it serves. */
export const gatewayOpenApi = (
  tools: readonly GatewayTool[],
  paths: { apiPath: string; mcpPath: string; origin: string }
) => ({
  components: {
    responses: {
      Error: {
        ...json(
          ERROR,
          "A refusal or a failed call. Branch on error.code; never parse the message."
        ),
        headers: {
          Link: {
            description: "rel=help: what each code means and what to do.",
            schema: { type: "string" },
          },
          "Retry-After": {
            description: "Seconds to wait, after a rate limit.",
            schema: { type: "integer" },
          },
        },
      },
    },
    securitySchemes: {
      bearer: {
        description:
          "A Fieldwork gateway key, issued per agent by the operator. Send it as Authorization: Bearer <key>.",
        scheme: "bearer",
        type: "http",
      },
    },
  },
  info: {
    description:
      "Fieldwork's tools over HTTP. Every request needs a bearer key. Each response carries x-request-id. A call that returns an error with jobId has started a provider job: pass jobId as resume to collect it instead of repeating the call. The same tools are served as MCP over Streamable HTTP.",
    title: "Fieldwork gateway",
    version: VERSION,
  },
  openapi: "3.1.0",
  paths: {
    [`${paths.apiPath}/openapi.json`]: {
      get: {
        operationId: "getOpenApi",
        responses: { "200": json({ type: "object" }, "This document.") },
        security: [],
        summary: "This description",
        tags: ["gateway"],
      },
    },
    [`${paths.apiPath}/tools`]: {
      get: {
        operationId: "listTools",
        responses: {
          "200": json(
            {
              properties: {
                tools: { items: { type: "object" }, type: "array" },
                version: { type: "string" },
              },
              required: ["tools", "version"],
              type: "object",
            },
            "Each tool's name, providers, input schema and output schema."
          ),
          default: errorResponse,
        },
        summary: "List the tools",
        tags: ["gateway"],
      },
    },
    ...Object.fromEntries(
      tools.map((tool) => [
        `${paths.apiPath}/tools/${tool.name}`,
        toolOperation(tool),
      ])
    ),
    [paths.mcpPath]: {
      post: {
        description:
          "The same tools as an MCP server over Streamable HTTP, answering with JSON.",
        operationId: "mcp",
        requestBody: {
          content: { "application/json": { schema: { type: "object" } } },
          required: true,
        },
        responses: {
          "200": json({ type: "object" }, "A JSON-RPC response."),
          default: errorResponse,
        },
        summary: "MCP",
        tags: ["gateway"],
      },
    },
  },
  security: [{ bearer: [] }],
  servers: [{ url: paths.origin }],
});
