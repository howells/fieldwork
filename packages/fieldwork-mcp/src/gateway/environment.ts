import { fieldworkFor, PROVIDERS } from "../config.js";
import type { ApiKeys, Provider } from "../config.js";
import type { GatewayAgent } from "./auth.js";
import type { GatewayDefaults } from "./catalog.js";
import type { GatewayCall } from "./execute.js";
import { createFieldworkGateway } from "./http.js";

const KEY_NAMES: Record<Provider, string> = {
  brave: "BRAVE_API_KEY",
  browserbase: "BROWSERBASE_API_KEY",
  exa: "EXA_API_KEY",
  firecrawl: "FIRECRAWL_API_KEY",
  parallel: "PARALLEL_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  serpapi: "SERPAPI_API_KEY",
  tavily: "TAVILY_API_KEY",
};

/** Configuration is code; the environment contains credentials only. */
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

/** Only providers with credentials are constructed or advertised. */
export const gatewayFromEnvironment = (
  environment: NodeJS.ProcessEnv,
  onCall?: (entry: GatewayCall) => void
) => {
  const keys: ApiKeys = {};
  const clients = PROVIDERS.flatMap((provider) => {
    const apiKey = environment[KEY_NAMES[provider]];
    if (apiKey === undefined || apiKey === "") {
      return [];
    }
    keys[provider] = apiKey;
    return [
      fieldworkFor(
        { allow: [], help: false, provider, routes: {}, version: false },
        keys
      ),
    ];
  });
  const agents = agentsFrom(environment);
  return createFieldworkGateway({
    agents,
    clients,
    defaults: DEFAULTS,
    onCall,
    secrets: [...Object.values(keys), ...agents.map((agent) => agent.apiKey)],
  });
};
