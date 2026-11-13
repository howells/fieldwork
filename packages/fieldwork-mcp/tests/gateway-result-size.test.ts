import { Fieldwork } from "@howells/fieldwork-sdk";
import { tavily } from "@howells/fieldwork-sdk/tavily";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";

import type { GatewayCall } from "../src/gateway/execute.js";
import { createFieldworkGateway } from "../src/gateway/http.js";
import { ACCESS_KEY, request } from "./gateway-helpers.js";

const fixture = () => {
  const requests: string[] = [];
  const log: GatewayCall[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    requests.push(
      `${init?.method} ${input instanceof Request ? input.url : new URL(input).href}`
    );
    return Response.json(
      init?.method === "POST"
        ? { request_id: "billed-job", status: "pending" }
        : {
            content: {
              details: Array.from({ length: 2000 }, () => "x".repeat(499)),
              report: "\0".repeat(200_000),
            },
            request_id: "billed-job",
            sources: [],
            status: "completed",
            usage: { credits: 16 },
          }
    );
  };
  const handle = createFieldworkGateway({
    agents: [{ apiKey: ACCESS_KEY, id: "test" }],
    clients: [
      new Fieldwork({
        adapter: tavily({ apiKey: "fake-key", fetch: fakeFetch, retries: 0 }),
      }),
    ],
    defaults: { research: "tavily" },
    onCall: (entry) => {
      log.push(entry);
    },
  });
  return { handle, log, requests };
};

const args = {
  maxCharacters: 200_000,
  question: "Research a product",
};

describe("oversized completed jobs", () => {
  it("keeps the jobId in HTTP errors and logs, then resumes with a smaller budget", async () => {
    const { handle, log, requests } = fixture();
    const refused = await handle(
      request("/api/v1/tools/research_question", args)
    );
    expect({
      body: await refused.json(),
      status: refused.status,
    }).toMatchObject({
      body: { error: { code: "InvalidRequest", jobId: "billed-job" } },
      status: 400,
    });
    expect(log[0]).toMatchObject({
      errorCode: "InvalidRequest",
      jobId: "billed-job",
      outcome: "error",
    });
    const resumed = await handle(
      request("/api/v1/tools/research_question", {
        ...args,
        maxCharacters: 1000,
        resume: "billed-job",
      })
    );
    expect(resumed.status).toBe(200);
    await expect(resumed.json()).resolves.toMatchObject({
      result: {
        id: "billed-job",
        truncated: [{ length: 200_000, path: "output.report", shown: 1000 }],
      },
    });
    expect(requests.map((entry) => entry.split(" ")[0])).toStrictEqual([
      "POST",
      "GET",
      "GET",
    ]);
  });

  it("keeps the jobId in remote MCP errors and logs, then resumes with a smaller budget", async () => {
    const { handle, log, requests } = fixture();
    const client = new Client({ name: "size-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL("https://fieldwork.test/mcp"),
      {
        fetch: async (input, init) => await handle(new Request(input, init)),
        requestInit: { headers: { authorization: `Bearer ${ACCESS_KEY}` } },
      }
    );
    try {
      await client.connect(transport);
      const refused = await client.callTool({
        arguments: args,
        name: "research_question",
      });
      expect(refused).toMatchObject({
        content: [
          {
            text: expect.stringContaining('"jobId":"billed-job"'),
            type: "text",
          },
        ],
        isError: true,
      });
      expect(log[0]).toMatchObject({
        errorCode: "InvalidRequest",
        jobId: "billed-job",
        outcome: "error",
      });
      const resumed = await client.callTool({
        arguments: { ...args, maxCharacters: 1000, resume: "billed-job" },
        name: "research_question",
      });
      expect(resumed.isError).not.toBe(true);
      expect(resumed.structuredContent).toMatchObject({
        id: "billed-job",
        truncated: [{ length: 200_000, path: "output.report", shown: 1000 }],
      });
      expect(requests.map((entry) => entry.split(" ")[0])).toStrictEqual([
        "POST",
        "GET",
        "GET",
      ]);
    } finally {
      await client.close();
    }
  });
});
