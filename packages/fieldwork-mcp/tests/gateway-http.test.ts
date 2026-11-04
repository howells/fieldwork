import { describe, expect, it } from "vitest";
import * as z from "zod/mini";

import { createFieldworkGateway } from "../src/gateway/http.js";
import { ACCESS_KEY, SECOND_KEY, fixture, request } from "./gateway-helpers.js";

describe("the private gateway HTTP API", () => {
  it.each(["", "Bearer wrong", `Basic ${ACCESS_KEY}`])(
    "refuses invalid credentials before reaching a provider: %s",
    async (authorization) => {
      const { handle, log, requests } = fixture();
      const response = await handle(
        request(
          "/api/v1/tools/read_page",
          { url: "https://example.test/page" },
          { authorization }
        )
      );
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain("Bearer");
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "Unauthorized", retryable: false },
      });
      expect(requests).toHaveLength(0);
      expect(log).toHaveLength(0);
    }
  );

  it("uses the configured default and attributes usage without logging inputs or keys", async () => {
    const { handle, log, requests } = fixture();
    const response = await handle(
      request("/api/v1/tools/read_page", { url: "https://example.test/page" })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: { markdown: "Firecrawl page", title: "Firecrawl" },
    });
    expect(requests).toStrictEqual([
      {
        body: expect.stringContaining("https://example.test/page"),
        url: "https://api.firecrawl.dev/v2/scrape",
      },
    ]);
    expect(log).toMatchObject([
      {
        agentId: "codex",
        outcome: "success",
        provider: "firecrawl",
        requestId: response.headers.get("x-request-id"),
        tool: "read_page",
      },
    ]);
    expect(JSON.stringify(log)).not.toMatch(
      /example\.test|Firecrawl page|test-agent-access/u
    );
  });

  it("uses an explicit provider and keeps the other agent's identity", async () => {
    const { handle, log, requests } = fixture();
    const response = await handle(
      request(
        "/api/v1/tools/read_page",
        { provider: "exa", url: "https://example.test/page" },
        { authorization: `Bearer ${SECOND_KEY}` }
      )
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: { markdown: "Exa page" },
    });
    expect(requests).toHaveLength(1);
    expect(requests).toMatchObject([{ url: "https://api.exa.ai/contents" }]);
    expect(log).toMatchObject([{ agentId: "mastra", provider: "exa" }]);
  });

  it.each([
    {
      input: { provider: "brave", url: "https://example.test/page" },
      name: "read_page",
    },
    {
      input: {
        onlyMainContent: true,
        provider: "exa",
        url: "https://example.test/page",
      },
      name: "read_page",
    },
    {
      input: { timeout: 45_001, url: "https://example.test/page" },
      name: "read_page",
    },
    {
      input: { timeout: 0, url: "https://example.test/page" },
      name: "read_page",
    },
    { input: { url: "https://example.test/page" }, name: "run_browser_script" },
  ])(
    "refuses unsupported or invalid calls before sending: $name $input",
    async ({ input, name }) => {
      const { handle, requests } = fixture();
      const response = await handle(request(`/api/v1/tools/${name}`, input));
      expect(response.status).toBe(400);
      expect(requests).toHaveLength(0);
      await expect(response.json()).resolves.toMatchObject({
        error: { retryable: false },
      });
    }
  );

  it("advertises only configured providers and keeps browser/monitor tools private", async () => {
    const { handle } = fixture();
    const response = await handle(request("/api/v1/tools"));
    const text = await response.text();
    expect(text).toContain('"defaultProvider":"firecrawl"');
    expect(text).toContain('"providers":["exa","firecrawl"]');
    expect(text).not.toMatch(
      /open_browser|create_monitor|run_browser_script|test-exa-key|test-agent-access/u
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    {
      code: "Unauthorized",
      headers: { origin: "https://hostile.test" },
      path: "/api/v1/tools/read_page",
      status: 403,
    },
    {
      code: "InvalidRequest",
      headers: {},
      path: "/api/v1/tools/read_page?api_key=anything",
      status: 400,
    },
    {
      code: "InvalidRequest",
      headers: { "content-type": "text/plain" },
      path: "/api/v1/tools/read_page",
      status: 415,
    },
    {
      code: "InvalidRequest",
      headers: { "content-length": "3000000" },
      path: "/api/v1/tools/read_page",
      status: 413,
    },
  ])(
    "refuses the request at the transport boundary: $status",
    async ({ code, headers, path, status }) => {
      const { handle, requests } = fixture();
      const response = await handle(
        request(path, { url: "https://example.test/page" }, headers)
      );
      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toMatchObject({
        error: { code },
      });
      expect(requests).toHaveLength(0);
    }
  );

  it("bounds streamed bytes without trusting Content-Length", async () => {
    const { clients, requests } = fixture();
    const handle = createFieldworkGateway({
      agents: [{ apiKey: ACCESS_KEY, id: "test" }],
      clients,
      defaults: { read: "firecrawl" },
      maxBodyBytes: 24,
    });
    const response = await handle(
      request("/api/v1/tools/read_page", { url: "https://example.test/page" })
    );
    expect(response.status).toBe(413);
    expect(requests).toHaveLength(0);
  });

  it("revokes an omitted agent key while preserving another agent's access", async () => {
    const { clients } = fixture();
    const handle = createFieldworkGateway({
      agents: [{ apiKey: SECOND_KEY, id: "mastra" }],
      clients,
      defaults: {},
    });
    const revoked = await handle(request("/api/v1/tools"));
    const retained = await handle(
      request("/api/v1/tools", undefined, {
        authorization: `Bearer ${SECOND_KEY}`,
      })
    );
    expect(revoked.status).toBe(401);
    expect(retained.status).toBe(200);
  });

  it("reports an unknown route as NotFound", async () => {
    const { handle } = fixture();
    const response = await handle(
      request("/api/v1/nowhere", { url: "https://example.test/page" })
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NotFound" },
    });
  });

  it("describes itself in OpenAPI without a key", async () => {
    const { handle, requests } = fixture();
    const response = await handle(
      new Request("https://fieldwork.test/api/v1/openapi.json")
    );
    expect(response.status).toBe(200);
    const spec = z.parse(
      z.object({ paths: z.record(z.string(), z.json()) }),
      await response.clone().json()
    );
    await expect(response.json()).resolves.toMatchObject({
      components: {
        securitySchemes: { bearer: { scheme: "bearer", type: "http" } },
      },
      openapi: "3.1.0",
      paths: {
        "/api/v1/tools/read_page": { post: { operationId: "read_page" } },
        "/mcp": { post: { operationId: "mcp" } },
      },
      servers: [{ url: "https://fieldwork.test" }],
    });
    expect(Object.keys(spec.paths)).not.toContain("/api/v1/tools/open_browser");
    expect(requests).toHaveLength(0);
  });
});
