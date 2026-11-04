import { randomUUID } from "node:crypto";

import { FieldworkError } from "@howells/fieldwork-sdk";
import type { AnyAdapter, Fieldwork } from "@howells/fieldwork-sdk";
import { toolError } from "@howells/fieldwork-sdk/tools";
import type { ToolsOptions } from "@howells/fieldwork-sdk/tools";

import { VERSION } from "../version.js";
import { agentAuthenticator } from "./auth.js";
import type { GatewayAgent } from "./auth.js";
import { GatewayRejectionError, gatewayBody } from "./body.js";
import { gatewayCatalog } from "./catalog.js";
import type { GatewayDefaults } from "./catalog.js";
import { gatewayExecutor } from "./execute.js";
import type { CallContext, GatewayCall } from "./execute.js";
import { serveGatewayMcp } from "./mcp.js";
import { gatewayOpenApi } from "./openapi.js";

export interface FieldworkGatewayOptions extends ToolsOptions {
  agents: readonly GatewayAgent[];
  clients: readonly Fieldwork<AnyAdapter>[];
  defaults: GatewayDefaults;
  /** URL paths, excluding any final slash. */
  apiPath?: string;
  mcpPath?: string;
  maxBodyBytes?: number;
  maxTimeout?: number;
  onCall?: (entry: GatewayCall) => void;
  /** Credentials to remove from provider error messages. They are never logged. */
  secrets?: readonly string[];
}

/** What each code means and what to do, for an agent that reads headers. */
const ERRORS_DOC = "https://fieldwork-sdk.dev/docs/http-gateway#errors";

const statusFor = (error: FieldworkError): number => {
  if (error.code === "Timeout") {
    return 504;
  }
  if (error.code === "RateLimited") {
    return 429;
  }
  if (error.code === "InvalidRequest" || error.code === "Unsupported") {
    return 400;
  }
  return error.code === "NotFound" ? 404 : 502;
};

const errorResponse = (error: Error | null, requestId: string): Response => {
  if (error instanceof GatewayRejectionError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          retryable: false,
        },
        requestId,
      },
      { status: error.status }
    );
  }
  const detail = toolError(error);
  const status = error instanceof FieldworkError ? statusFor(error) : 500;
  const retryAfter =
    error instanceof FieldworkError ? error.retryAfter : undefined;
  const headers =
    retryAfter === undefined
      ? undefined
      : { "retry-after": String(retryAfter) };
  return Response.json({ error: detail, requestId }, { headers, status });
};

const protect = (
  request: Request,
  authenticate: ReturnType<typeof agentAuthenticator>
): string => {
  const agent = authenticate(request);
  if (agent === undefined) {
    throw new GatewayRejectionError(
      401,
      "Unauthorized",
      "A valid Fieldwork bearer key is required"
    );
  }
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== new URL(request.url).origin) {
    throw new GatewayRejectionError(
      403,
      "Unauthorized",
      "Cross-origin browser requests are not enabled"
    );
  }
  if (new URL(request.url).search !== "") {
    throw new GatewayRejectionError(
      400,
      "InvalidRequest",
      "Use JSON input; query parameters are not accepted"
    );
  }
  return agent;
};

const responseHeaders = (response: Response, requestId: string): Response => {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-request-id", requestId);
  headers.set("x-fieldwork-version", VERSION);
  if (response.status === 401) {
    headers.set("www-authenticate", 'Bearer realm="fieldwork"');
  }
  if (response.status >= 400) {
    headers.set("link", `<${ERRORS_DOC}>; rel="help"`);
  }
  return new Response(response.body, { headers, status: response.status });
};

const serveApi = async (
  request: Request,
  path: string,
  catalog: ReturnType<typeof gatewayCatalog>,
  execute: ReturnType<typeof gatewayExecutor>,
  context: CallContext,
  maxBytes: number
): Promise<Response> => {
  if (request.method === "GET" && path === "/tools") {
    return Response.json({ tools: catalog.tools, version: VERSION });
  }
  const match = /^\/tools\/(?<name>[a-z_]+)$/u.exec(path);
  if (request.method !== "POST") {
    throw new GatewayRejectionError(
      405,
      "InvalidRequest",
      "Use GET for /tools and POST for /tools/{name}"
    );
  }
  const name = match?.groups?.name;
  if (name === undefined) {
    throw new GatewayRejectionError(404, "NotFound", "Gateway route not found");
  }
  const input = await gatewayBody(request, maxBytes);
  const result = await execute(name, input, context);
  return Response.json({ requestId: context.requestId, ...result });
};

/** One authenticated web-standard handler for the HTTP API and remote MCP. */
export const createFieldworkGateway = (options: FieldworkGatewayOptions) => {
  const authenticate = agentAuthenticator(options.agents);
  const maxTimeout = options.maxTimeout ?? 45_000;
  const maxBytes = options.maxBodyBytes ?? 2_097_152;
  const apiPath = options.apiPath ?? "/api/v1";
  const mcpPath = options.mcpPath ?? "/mcp";
  const catalog = gatewayCatalog(
    options.clients,
    options.defaults,
    maxTimeout,
    options
  );
  const execute = gatewayExecutor(
    catalog,
    maxTimeout,
    options.onCall,
    options.secrets
  );
  return async (request: Request): Promise<Response> => {
    const requestId = randomUUID();
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/u, "");
    if (request.method === "GET" && path === `${apiPath}/openapi.json`) {
      // Public, so an agent can learn the API before it holds a key.
      return responseHeaders(
        Response.json(
          gatewayOpenApi(catalog.tools, {
            apiPath,
            mcpPath,
            origin: url.origin,
          })
        ),
        requestId
      );
    }
    try {
      const context = {
        agentId: protect(request, authenticate),
        requestId,
        signal: request.signal,
      };
      let response: Response;
      if (path === mcpPath) {
        const body =
          request.method === "POST"
            ? await gatewayBody(request, maxBytes)
            : undefined;
        response = await serveGatewayMcp(
          request,
          body,
          catalog.tools,
          execute,
          context,
          maxBytes
        );
      } else if (path.startsWith(`${apiPath}/`)) {
        response = await serveApi(
          request,
          path.slice(apiPath.length),
          catalog,
          execute,
          context,
          maxBytes
        );
      } else {
        throw new GatewayRejectionError(
          404,
          "NotFound",
          "Gateway route not found"
        );
      }
      return responseHeaders(response, requestId);
    } catch (error) {
      return responseHeaders(
        errorResponse(error instanceof Error ? error : null, requestId),
        requestId
      );
    }
  };
};
