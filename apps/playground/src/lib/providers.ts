// Provider names, labels and the capability words the interface uses. Which
// provider offers which capability is read from the SDK on the server (see
// server/providers.ts) and handed to the page, so nothing here can drift
// from the adapters.
import type { Capability } from "@howells/fieldwork-sdk";

export const PROVIDER_IDS = [
  "exa",
  "firecrawl",
  "tavily",
  "parallel",
  "perplexity",
  "brave",
  "serpapi",
  "browserbase",
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export const PROVIDER_LABELS: Readonly<Record<ProviderId, string>> = {
  brave: "Brave",
  browserbase: "Browserbase",
  exa: "Exa",
  firecrawl: "Firecrawl",
  parallel: "Parallel",
  perplexity: "Perplexity",
  serpapi: "SerpApi",
  tavily: "Tavily",
};

export const isProviderId = (value: string): value is ProviderId =>
  PROVIDER_IDS.some((id) => id === value);

/** A provider as the page sees it: what it can do and whether the server has its key. */
export interface ProviderInfo {
  capabilities: Readonly<Record<Capability, boolean>>;
  id: ProviderId;
  label: string;
  /** True when the server's environment holds this provider's key. */
  serverKey: boolean;
}

/** Where a provider's key comes from, as the keys panel shows it. */
export type KeySource = "browser" | "server" | "none";

export const keySource = (
  provider: ProviderInfo,
  browserKeys: Readonly<Record<string, string>>
): KeySource => {
  if ((browserKeys[provider.id] ?? "") !== "") {
    return "browser";
  }
  return provider.serverKey ? "server" : "none";
};

/** The words the interface uses for each capability, from the Paper design. */
export const CAPABILITY_LABELS: Readonly<Record<Capability, string>> = {
  act: "Script",
  answer: "Ask",
  browser: "Browser",
  crawl: "Crawl",
  decide: "Decide",
  discover: "Find",
  extract: "Pull out values",
  images: "Images",
  map: "Map",
  monitor: "Watch",
  parse: "Parse",
  product: "Product",
  read: "Read",
  readMany: "Read many",
  research: "Research",
  search: "Search",
  usage: "Usage",
};

/** "one of four that read many pages at once": what the capability does, as a verb phrase. */
export const CAPABILITY_PHRASES: Readonly<Record<Capability, string>> = {
  act: "run browser scripts",
  answer: "answer in one call",
  browser: "open remote browsers",
  crawl: "crawl whole sites",
  decide: "answer closed questions",
  discover: "find entities",
  extract: "pull out values by schema",
  images: "search for images",
  map: "map a site's URLs",
  monitor: "watch pages on a schedule",
  parse: "parse documents",
  product: "read products and their variants",
  read: "read a page",
  readMany: "read many pages at once",
  research: "run research jobs",
  search: "search the web",
  usage: "report usage",
};
