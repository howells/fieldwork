import { describe, expect, it } from "vitest";

import type { ProviderId, ProviderInfo } from "@/lib/providers";
import { routesFor, usablePreferences } from "@/lib/routing";
import { providerCatalogue } from "@/server/providers";

const providers: ProviderInfo[] = providerCatalogue();

const keyed = (...ids: ProviderId[]) => new Set<ProviderId>(ids);

describe(routesFor, () => {
  it("routes each capability to the first keyed provider that has it", () => {
    const routes = routesFor(
      providers,
      keyed("exa", "firecrawl", "tavily", "brave")
    );
    expect(routes.search).toBe("brave");
    expect(routes.read).toBe("firecrawl");
    expect(routes.answer).toBe("exa");
    expect(routes.research).toBe("tavily");
  });

  it("leaves out a capability no keyed provider offers, rather than falling back", () => {
    const routes = routesFor(
      providers,
      keyed("exa", "firecrawl", "tavily", "brave")
    );
    expect(routes.discover).toBeUndefined();
    expect(routes.decide).toBeUndefined();
  });

  it("honours a pick, and refuses one the provider can't serve", () => {
    expect(
      routesFor(providers, keyed("exa", "firecrawl"), { read: "exa" }).read
    ).toBe("exa");
    expect(() =>
      routesFor(providers, keyed("brave"), { read: "brave" })
    ).toThrow("brave can't serve read");
  });

  it("drops a stored pick whose key has gone", () => {
    expect(
      usablePreferences(providers, keyed("firecrawl"), { read: "exa" })
    ).toStrictEqual({});
    expect(
      usablePreferences(providers, keyed("exa"), { read: "exa" })
    ).toStrictEqual({ read: "exa" });
  });
});
