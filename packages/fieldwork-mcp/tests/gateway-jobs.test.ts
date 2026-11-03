import { Fieldwork } from "@howells/fieldwork-sdk";
import { exa } from "@howells/fieldwork-sdk/exa";
import { describe, expect, it } from "vitest";

import type { GatewayCall } from "../src/gateway/execute.js";
import { createFieldworkGateway } from "../src/gateway/http.js";
import { ACCESS_KEY, fixture, request } from "./gateway-helpers.js";

describe("provider outcomes through the gateway", () => {
  it("returns rate limits without falling back to another configured provider", async () => {
    const { clients, requests: otherRequests } = fixture();
    const requests: string[] = [];
    const fetch: typeof globalThis.fetch = async (url) => {
      requests.push(url instanceof Request ? url.url : new URL(url).href);
      return Response.json(
        { message: "Slow down" },
        { headers: { "retry-after": "5" }, status: 429 }
      );
    };
    const handle = createFieldworkGateway({
      agents: [{ apiKey: ACCESS_KEY, id: "test" }],
      clients: [
        new Fieldwork({
          adapter: exa({ apiKey: "test-exa-key", fetch, retries: 0 }),
        }),
        ...clients.filter((client) => client.provider === "firecrawl"),
      ],
      defaults: { read: "exa" },
    });
    const response = await handle(
      request("/api/v1/tools/read_page", { url: "https://example.test/page" })
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("5");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "RateLimited", provider: "exa", retryAfter: 5 },
    });
    expect(requests).toHaveLength(1);
    expect(otherRequests).toHaveLength(0);
  });

  it("returns the provider's job ID and resumes without creating or billing a replacement", async () => {
    const requests: string[] = [];
    let completed = false;
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      requests.push(init?.method ?? "GET");
      return Response.json(
        init?.method === "POST"
          ? { id: "run_hosted" }
          : {
              output: { text: "Finished" },
              status: completed ? "completed" : "running",
            }
      );
    };
    const handle = createFieldworkGateway({
      agents: [{ apiKey: ACCESS_KEY, id: "test" }],
      clients: [
        new Fieldwork({
          adapter: exa({ apiKey: "test-exa-key", fetch, retries: 0 }),
        }),
      ],
      defaults: { research: "exa" },
    });
    const timedOut = await handle(
      request("/api/v1/tools/research_question", {
        question: "Research tiles",
        timeout: 10,
      })
    );
    expect(timedOut.status).toBe(504);
    await expect(timedOut.json()).resolves.toMatchObject({
      error: {
        code: "Timeout",
        jobId: "run_hosted",
        provider: "exa",
        retryable: false,
      },
    });
    completed = true;
    const resumed = await handle(
      request("/api/v1/tools/research_question", {
        question: "Research tiles",
        resume: "run_hosted",
      })
    );
    expect(resumed.status).toBe(200);
    await expect(resumed.json()).resolves.toMatchObject({
      provider: "exa",
      result: { output: "Finished", status: "completed" },
    });
    expect(requests).toStrictEqual(["POST", "GET", "GET"]);
  });

  it("logs reported usage in its own units and removes raw provider payloads", async () => {
    const log: GatewayCall[] = [];
    const result = {
      costDollars: { total: 0.004 },
      results: [{ text: "Page", url: "https://example.test/page" }],
    };
    const fetch: typeof globalThis.fetch = async () => Response.json(result);
    const handle = createFieldworkGateway({
      agents: [{ apiKey: ACCESS_KEY, id: "test" }],
      clients: [
        new Fieldwork({
          adapter: exa({ apiKey: "test-key", fetch, retries: 0 }),
        }),
      ],
      defaults: { read: "exa" },
      onCall: (entry) => {
        log.push(entry);
      },
    });
    const response = await handle(
      request("/api/v1/tools/read_page", { url: "https://example.test/page" })
    );
    expect(log).toMatchObject([{ usage: { costUsd: 0.004 } }]);
    const text = await response.text();
    expect(text).not.toContain('"raw"');
    expect(text).toContain('"costUsd":0.004');
  });

  it("redacts credentials echoed in a provider error", async () => {
    const secret = "test-upstream-secret-never-return-this";
    const fetch: typeof globalThis.fetch = async () =>
      Response.json({ message: `Rejected ${secret}` }, { status: 401 });
    const handle = createFieldworkGateway({
      agents: [{ apiKey: ACCESS_KEY, id: "test" }],
      clients: [
        new Fieldwork({ adapter: exa({ apiKey: secret, fetch, retries: 0 }) }),
      ],
      defaults: { read: "exa" },
      secrets: [secret],
    });
    const response = await handle(
      request("/api/v1/tools/read_page", { url: "https://example.test/page" })
    );
    const text = await response.text();
    expect(response.status).toBe(502);
    expect(text).not.toContain(secret);
    expect(text).toContain("[redacted]");
  });
});
