// The package's public surface: the stdio MCP server, the flags and provider
// configuration that build it, and the HTTP gateway (JSON API and remote MCP).

export {
  createFieldworkServer,
  type FieldworkServerOptions,
} from "./server.js";
export {
  type ApiKeys,
  fieldworkFor,
  parseArgs,
  type Provider,
  PROVIDERS,
  type ServerConfig,
} from "./config.js";
export { gatewayFromEnvironment } from "./gateway/environment.js";
export {
  createFieldworkGateway,
  type FieldworkGatewayOptions,
} from "./gateway/http.js";
export type { GatewayAgent } from "./gateway/auth.js";
export type { GatewayCall } from "./gateway/execute.js";
