import {
  CAPABILITIES,
  Fieldwork,
  FieldworkError,
  router,
} from "@howells/fieldwork-sdk";
import type { AnyAdapter, Capability } from "@howells/fieldwork-sdk";
import { exa } from "@howells/fieldwork-sdk/exa";
import { firecrawl } from "@howells/fieldwork-sdk/firecrawl";
import { parallel } from "@howells/fieldwork-sdk/parallel";
import { perplexity } from "@howells/fieldwork-sdk/perplexity";
import { tavily } from "@howells/fieldwork-sdk/tavily";

export const PROVIDERS = [
  "exa",
  "firecrawl",
  "tavily",
  "parallel",
  "perplexity",
] as const;
type Provider = (typeof PROVIDERS)[number];

export interface ServerConfig {
  /** One provider for every capability it offers. */
  provider?: Provider;
  /** A provider per capability, which builds a router. */
  routes: Partial<Record<Capability, Provider>>;
  allowAct: boolean;
  maxCharacters?: number;
  perplexityModel?: string;
  help: boolean;
  version: boolean;
}

export const USAGE = `Usage: fieldwork-mcp [options]

Serves Fieldwork's tools over MCP on stdin and stdout.

Choose providers with one of:
  --provider <name>            Every capability the provider offers.
  --<capability> <name>        One provider per capability, for example
                               --search parallel --read firecrawl.
                               Capabilities: ${CAPABILITIES.join(", ")}.

Providers: ${PROVIDERS.join(", ")}.
Keys come from EXA_API_KEY, FIRECRAWL_API_KEY, TAVILY_API_KEY,
PARALLEL_API_KEY and PERPLEXITY_API_KEY.

Options:
  --allow-act                  Offer run_browser_script, which runs code in a
                               remote browser. Off unless given.
  --max-characters <n>         Long text one result may return. Default 20000.
  --perplexity-model <id>      The model Perplexity research runs on.
  --help                       Show this text.
  --version                    Show the version.`;

function invalid(message: string) {
  return new FieldworkError("InvalidRequest", `${message}\n\n${USAGE}`);
}

function provider(value: string | undefined, flag: string): Provider {
  const found = PROVIDERS.find((name) => name === value);
  if (!found) {
    throw invalid(`${flag} needs one of ${PROVIDERS.join(", ")}`);
  }
  return found;
}

/** Reads the command line. Configuration is flags only; the environment holds keys. */
export function parseArgs(argv: readonly string[]): ServerConfig {
  const config: ServerConfig = {
    routes: {},
    allowAct: false,
    help: false,
    version: false,
  };
  const args = [...argv];
  while (args.length > 0) {
    const flag = args.shift() ?? "";
    const name = flag.replace(/^--/u, "");
    if (flag === "--help" || flag === "-h") {
      config.help = true;
    } else if (flag === "--version") {
      config.version = true;
    } else if (flag === "--allow-act") {
      config.allowAct = true;
    } else if (flag === "--provider") {
      config.provider = provider(args.shift(), flag);
    } else if (flag === "--perplexity-model") {
      config.perplexityModel = args.shift();
    } else if (flag === "--max-characters") {
      const value = Number(args.shift());
      if (!Number.isInteger(value) || value < 1) {
        throw invalid("--max-characters needs a whole number above 0");
      }
      config.maxCharacters = value;
    } else if ((CAPABILITIES as readonly string[]).includes(name)) {
      config.routes[name as Capability] = provider(args.shift(), flag);
    } else {
      throw invalid(`Unknown option ${flag}`);
    }
  }
  return config;
}

function adapterFor(name: Provider, config: ServerConfig): AnyAdapter {
  const factories: Record<Provider, () => AnyAdapter> = {
    exa: () => exa(),
    firecrawl: () => firecrawl(),
    tavily: () => tavily(),
    parallel: () => parallel(),
    perplexity: () => perplexity({ model: config.perplexityModel }),
  };
  return factories[name]();
}

/** Builds the Fieldwork instance the configuration names. */
export function fieldworkFor(config: ServerConfig): Fieldwork<AnyAdapter> {
  const routed = Object.entries(config.routes);
  if (config.provider && routed.length > 0) {
    throw invalid("Use --provider or per-capability options, not both");
  }
  if (config.provider) {
    return new Fieldwork({ adapter: adapterFor(config.provider, config) });
  }
  if (routed.length === 0) {
    throw invalid("Choose a provider");
  }
  const adapters = new Map<Provider, AnyAdapter>();
  const routes = Object.fromEntries(
    routed.map(([capability, name]) => {
      const adapter = adapters.get(name) ?? adapterFor(name, config);
      adapters.set(name, adapter);
      return [capability, adapter];
    })
  );
  // The routes are only known at run time; router() checks each one and
  // throws Unsupported for a provider that lacks the capability.
  return new Fieldwork({ adapter: router(routes as never) as AnyAdapter });
}
