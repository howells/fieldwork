// The two places the playground hands work to the SDK: the agent's tools and
// the compare view's reads. Each runs against the real Exa adapter with a
// fake fetch, so the test sees the request Exa would receive.
import { Fieldwork } from "@howells/fieldwork-sdk";
import { exa } from "@howells/fieldwork-sdk/exa";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { fieldworkTools } from "@/mastra/tools/fieldwork-tools";
import { readOnce } from "@/server/read-once";

import { fakeFetch } from "./fake-fetch";

const PAGE = "https://www.toppstiles.co.uk/metro/metro-white-tile";

const refuseKey = async (): Promise<Response> =>
  await Promise.resolve(Response.json({ error: "bad key" }, { status: 401 }));

const BodySchema = z.record(z.string(), z.json());

describe("the agent's tools", () => {
  it("send what the model asked for, without the options it left out", async () => {
    const { fetch, sent } = fakeFetch({
      costDollars: { total: 0.005 },
      results: [{ title: "Metro", url: PAGE }],
    });
    const web = new Fieldwork({
      adapter: exa({ apiKey: "test", fetch, retries: 0 }),
    });
    const tools = fieldworkTools(web);
    const search = tools.search_web;
    expect(search).toBeDefined();
    const result = await search?.execute?.(
      { country: undefined, limit: 3, query: "metro white tile" },
      {}
    );
    const [request] = sent;
    expect(request?.url.pathname).toBe("/search");
    const body = BodySchema.parse(JSON.parse(request?.body ?? "{}"));
    expect(body).toMatchObject({ numResults: 3, query: "metro white tile" });
    expect(body).not.toHaveProperty("userLocation");
    expect(JSON.stringify(result)).toContain(PAGE);
  });

  it("offer only the capabilities the provider has", () => {
    const web = new Fieldwork({ adapter: exa({ apiKey: "test" }) });
    const names = Object.keys(fieldworkTools(web));
    expect(names).toContain("search_web");
    expect(names).not.toContain("read_product");
  });
});

describe("a compare read", () => {
  it("measures one provider's read of the page", async () => {
    const { fetch, sent } = fakeFetch({
      costDollars: { total: 0.001 },
      results: [
        {
          text: "# Metro White Gloss Tile\n\n![tile](https://x.test/a.jpg) £14.50 per m²",
          title: "Metro",
          url: PAGE,
        },
      ],
      statuses: [{ id: PAGE, status: "success" }],
    });
    const web = new Fieldwork({
      adapter: exa({ apiKey: "test", fetch, retries: 0 }),
    });
    const outcome = await readOnce(
      "exa",
      async (url, options) => await web.read(url, options),
      PAGE
    );
    expect(sent[0]?.url.pathname).toBe("/contents");
    expect(outcome).toMatchObject({
      images: 1,
      ok: true,
      provider: "exa",
      usage: { costUsd: 0.001 },
      words: 9,
    });
  });

  it("turns a failed read into a typed failure instead of throwing", async () => {
    const web = new Fieldwork({
      adapter: exa({ apiKey: "test", fetch: refuseKey, retries: 0 }),
    });
    const outcome = await readOnce(
      "exa",
      async (url, options) => await web.read(url, options),
      PAGE
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/^Unauthorized/u);
  });
});
