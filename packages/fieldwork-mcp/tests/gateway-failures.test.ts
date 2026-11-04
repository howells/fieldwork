import { Fieldwork } from "@howells/fieldwork-sdk";
import { exa } from "@howells/fieldwork-sdk/exa";
import { afterEach, describe, expect, it, vi } from "vitest";

import { gatewayBody } from "../src/gateway/body.js";
import { createFieldworkGateway } from "../src/gateway/http.js";
import { ACCESS_KEY, fixture, request } from "./gateway-helpers.js";

const stderr = () => vi.spyOn(process.stderr, "write").mockReturnValue(true);

const exaGateway = (fetch: typeof globalThis.fetch, onCall?: () => void) =>
  createFieldworkGateway({
    agents: [{ apiKey: ACCESS_KEY, id: "test" }],
    clients: [
      new Fieldwork({
        adapter: exa({ apiKey: "test-key", fetch, retries: 0 }),
      }),
    ],
    defaults: { read: "exa", research: "exa" },
    onCall,
  });

describe("gateway failures that are not the provider's", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps a successful result when the call log throws", async () => {
    const write = stderr();
    const handle = exaGateway(
      async () =>
        Response.json({
          results: [{ text: "Page", url: "https://example.test/page" }],
        }),
      () => {
        throw new Error("log sink down");
      }
    );
    const response = await handle(
      request("/api/v1/tools/read_page", { url: "https://example.test/page" })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: { markdown: "Page" },
    });
    expect(String(write.mock.calls[0]?.[0])).toContain("log sink down");
  });

  it("keeps a started job's id when the call log throws", async () => {
    stderr();
    const handle = exaGateway(
      async (_url, init) =>
        Response.json(
          init?.method === "POST" ? { id: "run_hosted" } : { status: "running" }
        ),
      () => {
        throw new Error("log sink down");
      }
    );
    const response = await handle(
      request("/api/v1/tools/research_question", {
        question: "Research tiles",
        timeout: 10,
      })
    );
    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "Timeout", jobId: "run_hosted" },
    });
  });

  it.each(["not_a_tool", "run_browser_script"])(
    "reports %s, which the gateway does not serve, as NotFound",
    async (name) => {
      const { handle, requests } = fixture();
      const response = await handle(
        request(`/api/v1/tools/${name}`, { url: "https://example.test/page" })
      );
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "NotFound" },
      });
      expect(requests).toHaveLength(0);
    }
  );

  it("hides an unexpected failure's text and the agent's key", async () => {
    const write = stderr();
    const { handle } = fixture();
    const body = new ReadableStream({
      start: (controller) => {
        controller.error(new Error(`stream broke near ${ACCESS_KEY}`));
      },
    });
    const response = await handle(
      new Request("https://fieldwork.test/api/v1/tools/read_page", {
        body,
        duplex: "half",
        headers: {
          authorization: `Bearer ${ACCESS_KEY}`,
          "content-type": "application/json",
        },
        method: "POST",
      })
    );
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(text).not.toMatch(/stream broke|test-agent-access/u);
    expect(String(write.mock.calls[0]?.[0])).toMatch(
      /stream broke near \[redacted\]/u
    );
  });

  it("refuses a body that does not arrive in time with 408", async () => {
    const body = new ReadableStream();
    await expect(
      gatewayBody(
        new Request("https://fieldwork.test/api/v1/tools/read_page", {
          body,
          duplex: "half",
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
        1024,
        10
      )
    ).rejects.toMatchObject({ code: "Timeout", status: 408 });
  });
});
