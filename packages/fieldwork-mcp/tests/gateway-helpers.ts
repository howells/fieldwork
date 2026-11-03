import { Fieldwork } from "@howells/fieldwork-sdk";
import { exa } from "@howells/fieldwork-sdk/exa";
import { firecrawl } from "@howells/fieldwork-sdk/firecrawl";
import type { ToolArguments } from "@howells/fieldwork-sdk/tools";
import * as z from "zod/mini";

import type { GatewayCall } from "../src/gateway/execute.js";
import { createFieldworkGateway } from "../src/gateway/http.js";

export const ACCESS_KEY = "test-agent-access-key-at-least-32-characters";
export const SECOND_KEY = "test-second-agent-key-at-least-32-characters";

export const fixture = () => {
  const requests: { body: string; url: string }[] = [];
  const log: GatewayCall[] = [];
  const fakeFetch: typeof fetch = async (url, init) => {
    const target = url instanceof Request ? url.url : new URL(url).href;
    requests.push({
      body: z.parse(z.optional(z.string()), init?.body) ?? "",
      url: target,
    });
    if (target.includes("exa.ai")) {
      return Response.json({
        results: [
          { text: "Exa page", title: "Exa", url: "https://example.test/page" },
        ],
      });
    }
    return Response.json({
      data: {
        markdown: "Firecrawl page",
        metadata: { title: "Firecrawl", url: "https://example.test/page" },
      },
      success: true,
    });
  };
  const clients = [
    new Fieldwork({
      adapter: exa({ apiKey: "test-exa-key", fetch: fakeFetch, retries: 0 }),
    }),
    new Fieldwork({
      adapter: firecrawl({
        apiKey: "test-firecrawl-key",
        fetch: fakeFetch,
        retries: 0,
      }),
    }),
  ];
  const handle = createFieldworkGateway({
    agents: [
      { apiKey: ACCESS_KEY, id: "codex" },
      { apiKey: SECOND_KEY, id: "mastra" },
    ],
    clients,
    defaults: { read: "firecrawl", research: "exa", search: "exa" },
    onCall: (entry) => {
      log.push(entry);
    },
  });
  return { clients, handle, log, requests };
};

export const request = (
  path: string,
  input?: ToolArguments,
  extra: RequestInit["headers"] = {}
): Request => {
  const headers = new Headers({
    authorization: `Bearer ${ACCESS_KEY}`,
    "content-type": "application/json",
  });
  for (const [name, value] of new Headers(extra)) {
    headers.set(name, value);
  }
  return new Request(`https://fieldwork.test${path}`, {
    body: input === undefined ? undefined : JSON.stringify(input),
    headers,
    method: input === undefined ? "GET" : "POST",
  });
};
