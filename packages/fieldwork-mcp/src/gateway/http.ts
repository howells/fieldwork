// The gateway's request handler: it gates every request (key, origin, query string,
// body), routes it to the JSON API or remote MCP, and shapes every response. The
// siblings do the parts: auth.ts, body.ts, catalog.ts, execute.ts, mcp.ts, openapi.ts.

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
import { gatewayExecutor, redact, safeError } from "./execute.js";
import type { CallContext, GatewayCall } from "./execute.js";
import { serveGatewayMcp } from "./mcp.js";
import { gatewayOpenApi } from "./openapi.js";

/**
 * What `createFieldworkGateway` serves and who may call it. As a `ToolsOptions`,
 * it also picks the tools: the browser, act and monitor tools stay off unless
 * `allow` names them.
 */
export interface FieldworkGatewayOptions extends ToolsOptions {
  /**
   * The callers allowed in, each with a bearer key. Checked when the gateway is
   * built. An empty list refuses every request with 401.
   */
  agents: readonly GatewayAgent[];
  /**
   * One Fieldwork instance per provider to serve. Building the gateway throws
   * when two of them offer the same tool.
   */
  clients: readonly Fieldwork<AnyAdapter>[];
  /** The provider a call uses when it names none. A capability without one needs `provider` on every call. */
  defaults: GatewayDefaults;
  /** Where the JSON API is mounted, without a final slash. Defaults to `/api/v1`. */
  apiPath?: string;
  /** Where remote MCP is mounted, without a final slash. Defaults to `/mcp`. */
  mcpPath?: string;
  /** The most bytes of a request body, JSON API and MCP alike. Defaults to 2,097,152 (2 MiB). */
  maxBodyBytes?: number;
  /** The longest wait for one call, in milliseconds, and the wait when the call sets no `timeout`. Defaults to 45,000. */
  maxTimeout?: number;
  /**
   * Receives one entry when each tool call ends, whether it succeeded or not.
   * The entry has no input or result. Requests refused before a tool is
   * chosen (key, origin, query string, content type, size, route) and
   * `GET /tools` are not reported. A throw from it is written to stderr and
   * never changes the response. Without it, only an unexpected error is
   * written, to stderr.
   */
  onCall?: (entry: GatewayCall) => void;
  /**
   * Strings replaced with `[redacted]` in every error message, in the response
   * and in the log. Matches the exact text only. The agents' keys are always
   * included; pass the provider keys, as `gatewayFromEnvironment` does.
   */
  secrets?: readonly string[];
}

/** What each code means and what to do, for an agent that reads headers. */
const ERRORS_DOC = "https://fieldwork-sdk.dev/docs/http-gateway#errors";

/**
 * The HTTP status for a failed call. A provider's `Unauthorized` is 502, not
 * 401: it means the gateway's own provider key was refused, and a 401 would
 * tell the caller its bearer key is wrong. Anything not listed, including
 * `JobFailed` and `Aborted`, is 502.
 */
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

/**
 * Renders an error as `{ error, requestId }`. A gateway refusal keeps its own
 * status; a `FieldworkError` takes `statusFor`, plus `Retry-After` when the
 * provider asked for a wait. Anything else is a 500 with a fixed message, and
 * its own message, redacted, goes to stderr only: an unexpected failure's text
 * never reaches the caller.
 */
const errorResponse = (
  error: Error | null,
  requestId: string,
  secrets: readonly string[]
): Response => {
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
  const expected = error instanceof FieldworkError;
  if (!expected) {
    process.stderr.write(
      `fieldwork-gateway: request ${requestId} failed: ${redact(error?.message ?? "unknown", secrets)}\n`
    );
  }
  const safe = safeError(error, secrets);
  const headers =
    safe.retryAfter === undefined
      ? undefined
      : { "retry-after": String(safe.retryAfter) };
  return Response.json(
    { error: toolError(safe), requestId },
    { headers, status: expected ? statusFor(safe) : 500 }
  );
};

/**
 * The gate every route except the OpenAPI description passes, before any
 * routing or body handling. The checks run in this order, so a caller without
 * a valid key learns nothing else about the gateway:
 *
 * 1. A bearer key that names an agent (401). The agent's id is returned.
 * 2. An `Origin` header, which browsers send, must match the request URL's
 *    origin (403). Servers and CLIs send none and pass. The gateway sends no
 *    CORS headers; this refuses the request on the server too.
 * 3. No query string (400): input is JSON only.
 */
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

/** Adds the headers every response carries, errors and the public OpenAPI route included. */
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

/**
 * The JSON API under `apiPath`: `GET /tools` lists the tools and
 * `POST /tools/{name}` runs one. Any other method gets 405 whatever the path.
 * A name that is not a tool fails in the catalog as `Unsupported` (400), not 404.
 */
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

/**
 * Builds one web-standard handler (`Request` in, `Response` out) for the JSON
 * API under `apiPath` and remote MCP at `mcpPath`.
 *
 * Each request passes these steps in order, and no provider is called before
 * the last:
 *
 * 1. `GET {apiPath}/openapi.json` is answered at once, with no key. It is the
 *    only public route.
 * 2. The gate in `protect`: bearer key, then origin, then query string.
 * 3. Routing: `mcpPath`, `{apiPath}/…`, or 404. One final slash is ignored.
 * 4. For a `POST`, a JSON body within `maxBodyBytes` (see `gatewayBody`).
 * 5. The tool runs for the authenticated agent, under the call's deadline.
 *
 * The handler does not throw; every failure becomes a response with the shape
 * in `errorResponse`. Building it throws when an agent is malformed or
 * repeated, or two clients offer the same tool.
 */
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
  // The agents' keys are always redacted, whatever the caller passes.
  const secrets = [
    ...(options.secrets ?? []),
    ...options.agents.map((agent) => agent.apiKey),
  ];
  const execute = gatewayExecutor(catalog, maxTimeout, options.onCall, secrets);
  return async (request: Request): Promise<Response> => {
    const requestId = randomUUID();
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/u, "");
    if (request.method === "GET" && path === `${apiPath}/openapi.json`) {
      // Public, so an agent can learn the API before it holds a key. It lists the
      // tools and providers served, so it shows what the operator has keys for.
      return responseHeaders(
        Response.json(gatewayOpenApi(catalog.tools, { apiPath, mcpPath })),
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
        errorResponse(
          error instanceof Error ? error : null,
          requestId,
          secrets
        ),
        requestId
      );
    }
  };
};
