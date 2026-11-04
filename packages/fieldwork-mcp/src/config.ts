// Flag parsing and provider construction for the stdio server. The gateway reuses
// `PROVIDERS` and `adapterFor` to build its clients from the environment.

import {
  CAPABILITIES,
  Fieldwork,
  FieldworkError,
  runtimeRouter,
} from "@howells/fieldwork-sdk";
import type { AnyAdapter, Capability, Routes } from "@howells/fieldwork-sdk";
import { brave } from "@howells/fieldwork-sdk/brave";
import { browserbase } from "@howells/fieldwork-sdk/browserbase";
import { exa } from "@howells/fieldwork-sdk/exa";
import { firecrawl } from "@howells/fieldwork-sdk/firecrawl";
import { llamaparse } from "@howells/fieldwork-sdk/llamaparse";
import { parallel } from "@howells/fieldwork-sdk/parallel";
import { perplexity } from "@howells/fieldwork-sdk/perplexity";
import { reducto } from "@howells/fieldwork-sdk/reducto";
import { serpapi } from "@howells/fieldwork-sdk/serpapi";
import { tavily } from "@howells/fieldwork-sdk/tavily";

/** Every provider the server can serve, by the name its flags use. */
export const PROVIDERS = [
  "exa",
  "firecrawl",
  "tavily",
  "parallel",
  "perplexity",
  "brave",
  "serpapi",
  "browserbase",
  "llamaparse",
  "reducto",
] as const;
/** The name of a provider the server can serve. */
export type Provider = (typeof PROVIDERS)[number];

/** API keys given directly; a provider without one reads its key from the environment. */
export type ApiKeys = Partial<Record<Provider, string>>;

/** The server's settings, as `parseArgs` reads them from the command line. */
export interface ServerConfig {
  /** Capabilities left out by default that the flags ask for. */
  allow: Capability[];
  help: boolean;
  /** Long text one result may return; the tools default to 20,000. */
  maxCharacters?: number;
  /** The Browserbase project new sessions belong to. */
  browserbaseProject?: string;
  /** One provider for every capability it offers. */
  provider?: Provider;
  /** A provider per capability, which builds a router. */
  routes: Partial<Record<Capability, Provider>>;
  version: boolean;
}

/** The `--help` text. Every flag error appends it. */
export const USAGE = `Usage: fieldwork-mcp [options]

Serves Fieldwork's tools over MCP on stdin and stdout.

Choose providers with one of:
  --provider <name>            Every capability the provider offers.
  --<capability> <name>        One provider per capability, for example
                               --search parallel --read firecrawl
                               --monitor firecrawl --browser browserbase.
                               Capabilities: ${CAPABILITIES.join(", ")}.

Providers: ${PROVIDERS.join(", ")}.
Keys come from EXA_API_KEY, FIRECRAWL_API_KEY, TAVILY_API_KEY,
PARALLEL_API_KEY, PERPLEXITY_API_KEY, BRAVE_API_KEY, SERPAPI_API_KEY,
BROWSERBASE_API_KEY, LLAMA_CLOUD_API_KEY and REDUCTO_API_KEY.

Tools that start remote browsers or create lasting, billed resources are off
unless you ask for them:
  --allow-act                  Offer run_browser_script, which runs code in a
                               remote browser.
  --allow-browser              Offer open_browser and close_browser, which
                               keep a remote browser open until it is closed or
                               expires.
  --allow-monitor              Offer create_monitor, get_monitor,
                               list_monitors, delete_monitor and
                               list_monitor_events. A monitor keeps running and
                               billing until it is deleted.

Other options:
  --max-characters <n>         Long text one result may return. Default 20000.
  --browserbase-project <id>   The Browserbase project new sessions belong to.
                               Without it, Browserbase uses the key's project.
  --help                       Show this text.
  --version                    Show the version.`;

const ALLOW_FLAGS = new Map<string, Capability>([
  ["--allow-act", "act"],
  ["--allow-browser", "browser"],
  ["--allow-monitor", "monitor"],
]);

const invalid = (message: string) =>
  new FieldworkError("InvalidRequest", `${message}\n\n${USAGE}`);

const providerFrom = (value: string | undefined, flag: string): Provider => {
  const found = PROVIDERS.find((name) => name === value);
  if (found === undefined) {
    throw invalid(`${flag} needs one of ${PROVIDERS.join(", ")}`);
  }
  return found;
};

/** Applies one flag to the configuration, taking its value from `args` when it has one. */
const readFlag = (config: ServerConfig, flag: string, args: string[]) => {
  const allowed = ALLOW_FLAGS.get(flag);
  const capability = CAPABILITIES.find((name) => `--${name}` === flag);
  if (flag === "--help" || flag === "-h") {
    config.help = true;
  } else if (flag === "--version") {
    config.version = true;
  } else if (allowed !== undefined) {
    config.allow = [...new Set([...config.allow, allowed])];
  } else if (flag === "--provider") {
    config.provider = providerFrom(args.shift(), flag);
  } else if (flag === "--browserbase-project") {
    const value = args.shift();
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw invalid("--browserbase-project needs a project id");
    }
    config.browserbaseProject = value;
  } else if (flag === "--max-characters") {
    const value = Number(args.shift());
    if (!Number.isInteger(value) || value < 1) {
      throw invalid("--max-characters needs a whole number above 0");
    }
    config.maxCharacters = value;
  } else if (capability === undefined) {
    throw invalid(`Unknown option ${flag}`);
  } else {
    config.routes[capability] = providerFrom(args.shift(), flag);
  }
};

/**
 * Reads the command line. Configuration is flags only; the environment holds keys.
 *
 * A flag's value is the next argument; `--flag=value` is not understood. The
 * whole line is read before anything acts on `help` or `version`, so a bad
 * flag throws `InvalidRequest` (with the usage text) even beside `--help`.
 */
export const parseArgs = (argv: readonly string[]): ServerConfig => {
  const config: ServerConfig = {
    allow: [],
    help: false,
    routes: {},
    version: false,
  };
  const args = [...argv];
  while (args.length > 0) {
    readFlag(config, args.shift() ?? "", args);
  }
  return config;
};

/** Settings one provider's adapter takes from the flags. */
export interface AdapterSettings {
  browserbaseProject?: string;
}

const FACTORIES = {
  brave: (apiKey: string | undefined) => brave({ apiKey }),
  browserbase: (apiKey: string | undefined, settings: AdapterSettings) =>
    browserbase({ apiKey, projectId: settings.browserbaseProject }),
  exa: (apiKey: string | undefined) => exa({ apiKey }),
  firecrawl: (apiKey: string | undefined) => firecrawl({ apiKey }),
  llamaparse: (apiKey: string | undefined) => llamaparse({ apiKey }),
  parallel: (apiKey: string | undefined) => parallel({ apiKey }),
  perplexity: (apiKey: string | undefined) => perplexity({ apiKey }),
  reducto: (apiKey: string | undefined) => reducto({ apiKey }),
  serpapi: (apiKey: string | undefined) => serpapi({ apiKey }),
  tavily: (apiKey: string | undefined) => tavily({ apiKey }),
} satisfies Record<
  Provider,
  (apiKey: string | undefined, settings: AdapterSettings) => AnyAdapter
>;

/** One provider's adapter; without `apiKey` it reads the key from the environment. */
export const adapterFor = (
  name: Provider,
  apiKey?: string,
  settings: AdapterSettings = {}
): AnyAdapter => FACTORIES[name](apiKey, settings);

/**
 * Builds the Fieldwork instance the configuration names. A route to a
 * provider that lacks the capability throws `Unsupported`.
 *
 * `keys` gives a provider's key directly; the stdio server passes none, so
 * each adapter reads its own from the environment and throws `Unauthorized`
 * at startup when it is missing. Only the providers the configuration names
 * are built. Throws `InvalidRequest` for `provider` together with per-capability
 * routes, or for neither.
 */
export const fieldworkFor = (
  config: ServerConfig,
  keys: ApiKeys = {}
): Fieldwork<AnyAdapter> => {
  const routed = CAPABILITIES.filter(
    (capability) => config.routes[capability] !== undefined
  );
  if (config.provider !== undefined && routed.length > 0) {
    throw invalid("Use --provider or per-capability options, not both");
  }
  if (config.provider !== undefined) {
    return new Fieldwork({
      adapter: adapterFor(config.provider, keys[config.provider], config),
    });
  }
  if (routed.length === 0) {
    throw invalid("Choose a provider");
  }
  const adapters = new Map<Provider, AnyAdapter>();
  const routes: Routes = {};
  for (const capability of routed) {
    const name = config.routes[capability];
    if (name !== undefined) {
      const adapter =
        adapters.get(name) ?? adapterFor(name, keys[name], config);
      adapters.set(name, adapter);
      routes[capability] = adapter;
    }
  }
  // The routes come from flags, so runtimeRouter() checks each one at run time.
  return new Fieldwork({ adapter: runtimeRouter(routes) });
};
