import { describe, expect, it, vi } from "vitest";
import * as z from "zod/mini";

import { gatewayCatalog } from "../src/gateway/catalog.js";
import { gatewayFromEnvironment } from "../src/gateway/environment.js";
import { createFieldworkGateway } from "../src/gateway/http.js";
import { ACCESS_KEY, fixture, request } from "./gateway-helpers.js";

const Branches = z.object({
  oneOf: z.array(z.object({ properties: z.record(z.string(), z.json()) })),
});

describe("gateway configuration and advertised options", () => {
  it("keeps provider-only search options in their own schema branch", () => {
    const { clients } = fixture();
    const catalog = gatewayCatalog(clients, { search: "exa" }, 45_000);
    const search = catalog.tools.find((tool) => tool.name === "search_web");
    const { oneOf } = z.parse(Branches, search?.inputSchema);
    const exa = oneOf.find(
      (branch) =>
        z.safeParse(
          z.object({ const: z.literal("exa") }),
          branch.properties.provider
        ).success
    );
    const firecrawl = oneOf.find(
      (branch) =>
        z.safeParse(
          z.object({ const: z.literal("firecrawl") }),
          branch.properties.provider
        ).success
    );
    expect(exa?.properties).toHaveProperty("maxAge");
    expect(firecrawl?.properties).not.toHaveProperty("maxAge");
    expect(firecrawl?.properties).toHaveProperty("recency");
    expect(exa?.properties).not.toHaveProperty("recency");
    expect(oneOf).toHaveLength(3);
  });

  it("requires an override when the configured default is unavailable, without substituting another provider", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("No network in this test"));
    try {
      const handle = gatewayFromEnvironment({
        EXA_API_KEY: "test-exa-key",
        FIELDWORK_AGENT_CODEX_API_KEY: ACCESS_KEY,
      });
      const response = await handle(
        request("/api/v1/tools/read_page", { url: "https://example.test/page" })
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "Unsupported" },
      });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });

  it("rejects duplicate agent identities or credentials", () => {
    const { clients } = fixture();
    expect(() =>
      createFieldworkGateway({
        agents: [
          { apiKey: ACCESS_KEY, id: "one" },
          { apiKey: ACCESS_KEY, id: "two" },
        ],
        clients,
        defaults: {},
      })
    ).toThrow("distinct IDs and access keys");
  });

  it("fails closed when no gateway access keys are configured", async () => {
    const handle = gatewayFromEnvironment({ EXA_API_KEY: "test-exa-key" });
    const response = await handle(request("/api/v1/tools"));
    expect(response.status).toBe(401);
  });
});
