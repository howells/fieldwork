// Which provider serves each capability the agent may use. Each capability
// goes to exactly one keyed provider that offers it, chosen by a fixed order
// of preference, or by the person's own pick. A capability no keyed provider
// offers has no route, so the agent gets no tool for it: nothing falls back.
import type { Capability } from "@howells/fieldwork-sdk";

import type { ProviderId, ProviderInfo } from "./providers";

/**
 * The capabilities Simple mode gives the agent. Crawls, browser scripts,
 * remote browsers and document parsing are left out: none of the tasks here
 * needs them, and crawls and browsers are the easiest way to spend money by
 * accident.
 */
export const AGENT_CAPABILITIES: readonly Capability[] = [
  "search",
  "read",
  "readMany",
  "extract",
  "product",
  "map",
  "answer",
  "research",
  "discover",
  "decide",
  "monitor",
];

/** Cheapest or most complete first, for each capability. */
const PREFERENCE: Readonly<Partial<Record<Capability, readonly ProviderId[]>>> =
  {
    answer: ["exa", "tavily", "parallel", "perplexity", "brave"],
    decide: ["parallel", "perplexity"],
    discover: ["parallel"],
    extract: ["firecrawl", "exa", "parallel"],
    map: ["firecrawl", "tavily"],
    monitor: ["firecrawl", "exa", "parallel"],
    product: ["firecrawl"],
    read: ["firecrawl", "exa", "tavily", "parallel", "browserbase"],
    readMany: ["firecrawl", "exa", "tavily", "parallel"],
    research: ["tavily", "exa", "parallel", "perplexity", "firecrawl"],
    search: [
      "brave",
      "exa",
      "tavily",
      "firecrawl",
      "parallel",
      "perplexity",
      "serpapi",
      "browserbase",
    ],
  };

export type Routes = Partial<Record<Capability, ProviderId>>;
export type Preferences = Partial<Record<Capability, ProviderId>>;

const serves = (
  provider: ProviderInfo | undefined,
  capability: Capability,
  keyed: ReadonlySet<ProviderId>
): provider is ProviderInfo =>
  provider !== undefined &&
  keyed.has(provider.id) &&
  provider.capabilities[capability];

/**
 * One provider per capability. A preference that names a provider without a
 * key or without the capability throws, rather than quietly routing
 * somewhere else.
 */
export const routesFor = (
  providers: readonly ProviderInfo[],
  keyed: ReadonlySet<ProviderId>,
  preferences: Preferences = {}
): Routes => {
  const byId = new Map(providers.map((provider) => [provider.id, provider]));
  const routes: Routes = {};
  for (const capability of AGENT_CAPABILITIES) {
    const preferred = preferences[capability];
    if (preferred !== undefined) {
      if (!serves(byId.get(preferred), capability, keyed)) {
        throw new Error(`${preferred} can't serve ${capability} here`);
      }
      routes[capability] = preferred;
      continue;
    }
    const pick = (PREFERENCE[capability] ?? []).find((id) =>
      serves(byId.get(id), capability, keyed)
    );
    if (pick !== undefined) {
      routes[capability] = pick;
    }
  }
  return routes;
};

/** The person's picks that can still be honoured: a key may have gone since. */
export const usablePreferences = (
  providers: readonly ProviderInfo[],
  keyed: ReadonlySet<ProviderId>,
  preferences: Preferences
): Preferences => {
  const byId = new Map(providers.map((provider) => [provider.id, provider]));
  return Object.fromEntries(
    Object.entries(preferences).filter(([capability, id]) =>
      AGENT_CAPABILITIES.some(
        (allowed) =>
          allowed === capability && serves(byId.get(id), allowed, keyed)
      )
    )
  );
};
