// Builds adapters from the keys a request carries. When the browser sends no
// key for a provider, the adapter is built without one and the SDK reads the
// provider's own environment variable, which is how local development works.
// A key is only ever handed to its own provider's adapter; nothing here logs
// or returns one.
import {
  CAPABILITIES,
  Fieldwork,
  FieldworkError,
  runtimeRouter,
} from "@howells/fieldwork-sdk";
import type {
  AnyAdapter,
  Routes as AdapterRoutes,
} from "@howells/fieldwork-sdk";
import { brave } from "@howells/fieldwork-sdk/brave";
import { browserbase } from "@howells/fieldwork-sdk/browserbase";
import { exa } from "@howells/fieldwork-sdk/exa";
import { firecrawl } from "@howells/fieldwork-sdk/firecrawl";
import { parallel } from "@howells/fieldwork-sdk/parallel";
import { perplexity } from "@howells/fieldwork-sdk/perplexity";
import { serpapi } from "@howells/fieldwork-sdk/serpapi";
import { tavily } from "@howells/fieldwork-sdk/tavily";

import { PROVIDER_IDS, PROVIDER_LABELS } from "@/lib/providers";
import type { ProviderId, ProviderInfo } from "@/lib/providers";
import { routesFor } from "@/lib/routing";
import type { Preferences, Routes } from "@/lib/routing";
import type { ReadPage } from "@/mastra/context";

/** The browser's key for a provider, or undefined to use the server's environment. */
export type BrowserKeys = Partial<Record<ProviderId, string>>;

interface KeyOption {
  apiKey?: string;
}

const keyOption = (key: string | undefined): KeyOption =>
  key === undefined ? {} : { apiKey: key };

const FACTORIES: Readonly<
  Record<ProviderId, (option: KeyOption) => AnyAdapter>
> = {
  brave: (option) => brave(option),
  browserbase: (option) => browserbase(option),
  exa: (option) => exa(option),
  firecrawl: (option) => firecrawl(option),
  parallel: (option) => parallel(option),
  perplexity: (option) => perplexity(option),
  serpapi: (option) => serpapi(option),
  tavily: (option) => tavily(option),
};

// Building an adapter needs a key; this one is never sent, because reading
// `capabilities` makes no request.
const CAPABILITY_PROBE = { apiKey: "capabilities-only" };

/** True when the SDK finds the provider's key in the server's environment. */
const hasServerKey = (id: ProviderId): boolean => {
  try {
    FACTORIES[id]({});
    return true;
  } catch (error) {
    if (error instanceof FieldworkError && error.code === "Unauthorized") {
      return false;
    }
    throw error;
  }
};

/** Every provider, what it can do, and whether the server holds its key. */
export const providerCatalogue = (): ProviderInfo[] =>
  PROVIDER_IDS.map((id) => ({
    capabilities: new Fieldwork({ adapter: FACTORIES[id](CAPABILITY_PROBE) })
      .capabilities,
    id,
    label: PROVIDER_LABELS[id],
    serverKey: hasServerKey(id),
  }));

/**
 * The providers a request can use: those whose key the browser sent, and
 * those the server holds a key for. Undefined means "use the server's".
 */
export const usableKeys = (
  browserKeys: BrowserKeys
): Map<ProviderId, string | undefined> => {
  const usable = new Map<ProviderId, string | undefined>();
  for (const provider of providerCatalogue()) {
    const key = (browserKeys[provider.id] ?? "").trim();
    if (key !== "") {
      usable.set(provider.id, key);
    } else if (provider.serverKey) {
      usable.set(provider.id, undefined);
    }
  }
  return usable;
};

export const adapterFor = (
  id: ProviderId,
  key: string | undefined
): AnyAdapter => FACTORIES[id](keyOption(key));

export interface RoutedWeb {
  routes: Routes;
  web: Fieldwork<AnyAdapter>;
}

/** A Fieldwork instance whose capabilities each go to one usable provider. */
export const routedWeb = (
  keys: ReadonlyMap<ProviderId, string | undefined>,
  preferences: Preferences = {}
): RoutedWeb => {
  const routes = routesFor(
    providerCatalogue(),
    new Set(keys.keys()),
    preferences
  );
  const adapters = new Map<ProviderId, AnyAdapter>();
  const adapterRoutes: AdapterRoutes = {};
  for (const capability of CAPABILITIES) {
    const id = routes[capability];
    if (id !== undefined) {
      const adapter = adapters.get(id) ?? adapterFor(id, keys.get(id));
      adapters.set(id, adapter);
      adapterRoutes[capability] = adapter;
    }
  }
  return {
    routes,
    web: new Fieldwork({ adapter: runtimeRouter(adapterRoutes) }),
  };
};

export const READ_PROVIDERS = [
  "exa",
  "firecrawl",
  "tavily",
  "parallel",
  "browserbase",
] as const;
export type ReadProvider = (typeof READ_PROVIDERS)[number];

export const isReadProvider = (id: ProviderId): id is ReadProvider =>
  READ_PROVIDERS.some((provider) => provider === id);

const READERS: Readonly<Record<ReadProvider, (option: KeyOption) => ReadPage>> =
  {
    browserbase: (option) => {
      const web = new Fieldwork({ adapter: browserbase(option) });
      return async (url, options) => await web.read(url, options);
    },
    exa: (option) => {
      const web = new Fieldwork({ adapter: exa(option) });
      return async (url, options) => await web.read(url, options);
    },
    firecrawl: (option) => {
      const web = new Fieldwork({ adapter: firecrawl(option) });
      return async (url, options) => await web.read(url, options);
    },
    parallel: (option) => {
      const web = new Fieldwork({ adapter: parallel(option) });
      return async (url, options) => await web.read(url, options);
    },
    tavily: (option) => {
      const web = new Fieldwork({ adapter: tavily(option) });
      return async (url, options) => await web.read(url, options);
    },
  };

export const readerFor = (
  id: ReadProvider,
  key: string | undefined
): ReadPage => READERS[id](keyOption(key));

export const MONITOR_PROVIDERS = ["exa", "firecrawl", "parallel"] as const;
export type MonitorProvider = (typeof MONITOR_PROVIDERS)[number];

export const isMonitorProvider = (id: ProviderId): id is MonitorProvider =>
  MONITOR_PROVIDERS.some((provider) => provider === id);

const MONITOR_DELETERS: Readonly<
  Record<MonitorProvider, (option: KeyOption, id: string) => Promise<void>>
> = {
  exa: async (option, id) => {
    await new Fieldwork({ adapter: exa(option) }).monitor.delete(id);
  },
  firecrawl: async (option, id) => {
    await new Fieldwork({ adapter: firecrawl(option) }).monitor.delete(id);
  },
  parallel: async (option, id) => {
    await new Fieldwork({ adapter: parallel(option) }).monitor.delete(id);
  },
};

export const deleteMonitor = async (
  provider: MonitorProvider,
  key: string | undefined,
  id: string
): Promise<void> => {
  await MONITOR_DELETERS[provider](keyOption(key), id);
};
