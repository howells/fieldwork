import { Fieldwork } from "@howells/fieldwork-sdk";
import { llamaparse } from "@howells/fieldwork-sdk/llamaparse";
import { reducto } from "@howells/fieldwork-sdk/reducto";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";

import { createFieldworkGateway } from "../src/gateway/http.js";
import { ACCESS_KEY, request } from "./gateway-helpers.js";

const url = "https://example.test/multi-megabyte.pdf";
const fixture = () => {
  const requests: string[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const target = new URL(input instanceof Request ? input.url : input);
    requests.push(`${init?.method} ${target.pathname}`);
    const llama = target.hostname.includes("llamaindex");
    if (init?.method === "POST") {
      return Response.json(llama ? { id: "job" } : { job_id: "job" });
    }
    if (llama) {
      return Response.json({
        job: { id: "job", status: "COMPLETED" },
        markdown: { pages: [{ markdown: "Specification", page_number: 1 }] },
      });
    }
    return Response.json({
      result: {
        job_id: "job",
        result: {
          chunks: [{ blocks: [], content: "Specification" }],
          type: "full",
        },
      },
      status: "Completed",
    });
  };
  const handle = createFieldworkGateway({
    agents: [{ apiKey: ACCESS_KEY, id: "test" }],
    clients: [
      new Fieldwork({
        adapter: llamaparse({ apiKey: "fake", fetch: fakeFetch, retries: 0 }),
      }),
      new Fieldwork({
        adapter: reducto({ apiKey: "fake", fetch: fakeFetch, retries: 0 }),
      }),
    ],
    defaults: { parse: "llamaparse" },
  });
  return { handle, requests };
};

describe("gateway document URLs and inline body limits", () => {
  it.each(["llamaparse", "reducto"])(
    "parses a URL through HTTP with %s",
    async (provider) => {
      const { handle, requests } = fixture();
      const response = await handle(
        request("/api/v1/tools/parse_document", { provider, url })
      );
      expect({
        body: await response.json(),
        status: response.status,
      }).toMatchObject({
        body: { result: { markdown: "Specification" } },
        status: 200,
      });
      expect(requests).toHaveLength(2);
    }
  );

  it.each(["llamaparse", "reducto"])(
    "parses a URL through remote MCP with %s",
    async (provider) => {
      const { handle, requests } = fixture();
      const client = new Client({ name: "parse-url", version: "1.0.0" });
      try {
        await client.connect(
          new StreamableHTTPClientTransport(
            new URL("https://fieldwork.test/mcp"),
            {
              fetch: async (input, init) =>
                await handle(new Request(input, init)),
              requestInit: {
                headers: { authorization: `Bearer ${ACCESS_KEY}` },
              },
            }
          )
        );
        const result = await client.callTool({
          arguments: { provider, url },
          name: "parse_document",
        });
        expect(result).toMatchObject({
          structuredContent: { markdown: "Specification" },
        });
        expect(result.isError).not.toBe(true);
        expect(requests).toHaveLength(2);
      } finally {
        await client.close();
      }
    }
  );

  it.each([{}, { "content-length": "2400000" }])(
    "refuses an inline 1.8 MB PDF with an actionable InvalidRequest: %j",
    async (headers) => {
      const { handle, requests } = fixture();
      const response = await handle(
        request(
          "/api/v1/tools/parse_document",
          {
            contentBase64: Buffer.alloc(1_800_000).toString("base64"),
            name: "spec.pdf",
          },
          headers
        )
      );
      expect({
        body: await response.json(),
        status: response.status,
      }).toMatchObject({
        body: {
          error: {
            code: "InvalidRequest",
            message: expect.stringMatching(
              /2097152-byte limit.*base64.*parse_document with url.*llamaparse or reducto/u
            ),
          },
        },
        status: 413,
      });
      expect(requests).toHaveLength(0);
    }
  );
});
