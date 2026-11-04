// Builds a gateway from environment variables: provider keys decide which clients
// exist, and FIELDWORK_* keys name the agents. Wraps createFieldworkGateway.

import { Fieldwork } from "@howells/fieldwork-sdk";

import { adapterFor, PROVIDERS } from "../config.js";
import type { Provider } from "../config.js";
import type { GatewayAgent } from "./auth.js";
import type { GatewayDefaults } from "./catalog.js";
import type { GatewayCall } from "./execute.js";
import { createFieldworkGateway } from "./http.js";

/** The variable that holds each provider's key; the stdio server reads the same ones. */
const KEY_NAMES: Record<Provider, string> = {
  brave: "BRAVE_API_KEY",
  browserbase: "BROWSERBASE_API_KEY",
  exa: "EXA_API_KEY",
  firecrawl: "FIRECRAWL_API_KEY",
  llamaparse: "LLAMA_CLOUD_API_KEY",
  parallel: "PARALLEL_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  reducto: "REDUCTO_API_KEY",
  serpapi: "SERPAPI_API_KEY",
  tavily: "TAVILY_API_KEY",
};

/**
 * Configuration is code; the environment contains credentials only. A default
 * applies only when the environment has that provider's key; otherwise a call
 * must name a provider.
 */
const DEFAULTS: GatewayDefaults = {
  answer: "exa",
  crawl: "firecrawl",
  decide: "parallel",
  discover: "parallel",
  extract: "firecrawl",
  images: "brave",
  map: "firecrawl",
  parse: "firecrawl",
  product: "firecrawl",
  read: "firecrawl",
  readMany: "firecrawl",
  research: "exa",
  search: "exa",
  usage: "firecrawl",
};

/**
 * `FIELDWORK_API_KEY` is the agent `owner`; `FIELDWORK_AGENT_<NAME>_API_KEY` is
 * `<name>`, lower-cased with `_` as `-`. An unset or empty variable adds no
 * agent, which is how a key is revoked.
 */
const agentsFrom = (environment: NodeJS.ProcessEnv): GatewayAgent[] => {
  const agents: GatewayAgent[] = [];
  const owner = environment.FIELDWORK_API_KEY;
  if (owner !== undefined && owner !== "") {
    agents.push({ apiKey: owner, id: "owner" });
  }
  for (const [name, apiKey] of Object.entries(environment)) {
    const id =
      /^FIELDWORK_AGENT_(?<id>[A-Z0-9]+(?:_[A-Z0-9]+)*)_API_KEY$/u.exec(name)
        ?.groups?.id;
    if (id !== undefined && apiKey !== undefined && apiKey !== "") {
      agents.push({ apiKey, id: id.toLowerCase().replaceAll("_", "-") });
    }
  }
  return agents;
};

/**
 * Builds the gateway from the environment, as the handler `createFieldworkGateway`
 * returns. Only providers whose key is set are constructed or advertised, and
 * the browser, act and monitor tools are never offered. Every provider and
 * agent key is redacted from error messages.
 *
 * Throws when an agent key is shorter than 32 characters, holds whitespace, or
 * repeats another's, or two agents share an id. With no agent keys set it
 * starts and refuses every request with 401.
 *
 * `onCall` receives each tool call's log entry; without it, only an unexpected
 * error is written, to stderr.
 */
export const gatewayFromEnvironment = (
  environment: NodeJS.ProcessEnv,
  onCall?: (entry: GatewayCall) => void
) => {
  const keys: string[] = [];
  const clients = PROVIDERS.flatMap((provider) => {
    const apiKey = environment[KEY_NAMES[provider]];
    if (apiKey === undefined || apiKey === "") {
      return [];
    }
    keys.push(apiKey);
    return [new Fieldwork({ adapter: adapterFor(provider, apiKey) })];
  });
  const agents = agentsFrom(environment);
  return createFieldworkGateway({
    agents,
    clients,
    defaults: DEFAULTS,
    onCall,
    secrets: [...keys, ...agents.map((agent) => agent.apiKey)],
  });
};
