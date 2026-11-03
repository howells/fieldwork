import { afterEach, describe, expect, it, vi } from "vitest";

import { brave } from "../../src/adapters/brave.js";
import { Fieldwork } from "../../src/index.js";
import { fakeFetch, nth } from "../helpers.js";

const setup = (...replies: Parameters<typeof fakeFetch>) => {
  const { fetch, calls } = fakeFetch(...replies);
  const web = new Fieldwork({
    adapter: brave({ apiKey: "k", fetch, retries: 0 }),
  });
  return { calls, web };
};

const webBody = {
  discussions: {
    results: [{ title: "Oak vs maple", url: "https://forum.test/1" }],
    type: "search",
  },
  locations: {
    results: [
      {
        coordinates: [51.5, -0.12],
        postal_address: { displayAddress: "1 High St, London" },
        rating: { bestRating: 5, ratingValue: 4.5, reviewCount: 12 },
        title: "Oak Supply",
        url: "https://oak.test",
      },
    ],
    type: "locations",
  },
  news: {
    results: [
      {
        description: "Prices rose",
        page_age: "2026-10-01T10:00:00",
        title: "Oak prices",
        url: "https://news.test/oak",
      },
    ],
    type: "news",
  },
  query: {
    altered: "oak flooring",
    original: "oak flooring",
    show_strict_warning: true,
  },
  type: "search",
  videos: {
    results: [
      {
        thumbnail: { src: "https://imgs.test/v" },
        title: "Laying oak",
        url: "https://video.test/1",
      },
    ],
    type: "videos",
  },
  web: {
    results: [
      {
        description: "Solid oak",
        extra_snippets: ["Engineered too", "Finishes"],
        meta_url: { favicon: "https://imgs.test/a.ico" },
        page_age: "2026-03-01T00:00:00",
        thumbnail: {
          original: "https://a.test/t.jpg",
          src: "https://imgs.test/proxy",
        },
        title: "Oak floors",
        url: "https://a.test/oak",
      },
      { description: "no url, dropped" },
    ],
    type: "search",
  },
};

const chunk = (content: string) =>
  `data: ${JSON.stringify({
    choices: [{ delta: { content }, index: 0 }],
    id: "c1",
    object: "chat.completion.chunk",
  })}`;

describe("brave adapter", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("needs a key from the options or BRAVE_API_KEY", () => {
    vi.stubEnv("BRAVE_API_KEY", "");
    expect(() => brave()).toThrow(/BRAVE_API_KEY/u);
    vi.stubEnv("BRAVE_API_KEY", "from-env");
    expect(() => brave()).not.toThrow();
  });

  it("offers search, images and answer, and refuses the rest", async () => {
    const { web } = setup();
    expect(web.capabilities).toMatchObject({
      answer: true,
      images: true,
      read: false,
      research: false,
      search: true,
      usage: false,
    });
    // Untyped JavaScript can still reach for a method Brave lacks.
    const untyped: Pick<typeof web, "supports"> & {
      read?: (url: string) => Promise<unknown>;
    } = web;
    await expect(untyped.read?.("https://a.test")).rejects.toMatchObject({
      code: "Unsupported",
    });
  });

  describe("search", () => {
    it("sends a web search with Brave's parameters", async () => {
      const { web, calls } = setup({ body: webBody });
      await web.search("oak flooring", {
        country: "gb",
        extraSnippets: true,
        language: "EN-GB",
        limit: 5,
        offset: 1,
        operators: false,
        recency: "month",
        resultTypes: ["web", "news"],
        safesearch: "strict",
        spellcheck: false,
        uiLanguage: "en-GB",
        units: "metric",
      });
      const call = nth(calls, 0);
      expect(call.method).toBe("GET");
      expect(call.url.pathname).toBe("/res/v1/web/search");
      expect(call.headers["x-subscription-token"]).toBe("k");
      expect(call.body).toBeUndefined();
      expect(Object.fromEntries(call.url.searchParams)).toStrictEqual({
        count: "5",
        country: "GB",
        extra_snippets: "true",
        freshness: "pm",
        offset: "1",
        operators: "false",
        q: "oak flooring",
        result_filter: "web,news",
        safesearch: "strict",
        search_lang: "en-gb",
        spellcheck: "false",
        text_decorations: "false",
        ui_lang: "en-GB",
        units: "metric",
      });
    });

    it("asks for plain snippets unless told otherwise", async () => {
      const { web, calls } = setup({ body: webBody }, { body: webBody });
      await web.search("oak");
      await web.search("oak", { textDecorations: true });
      expect(nth(calls, 0).url.searchParams.get("text_decorations")).toBe(
        "false"
      );
      expect(nth(calls, 1).url.searchParams.get("text_decorations")).toBe(
        "true"
      );
    });

    it("normalizes web, news, discussion, video and place results", async () => {
      const { web } = setup({ body: webBody });
      const response = await web.search("oak flooring", {
        extraSnippets: true,
      });
      expect(response.results).toStrictEqual([
        {
          favicon: "https://imgs.test/a.ico",
          image: "https://a.test/t.jpg",
          kind: "web",
          publishedAt: "2026-03-01T00:00:00",
          snippet: "Solid oak\n\nEngineered too\n\nFinishes",
          title: "Oak floors",
          url: "https://a.test/oak",
        },
        {
          kind: "news",
          publishedAt: "2026-10-01T10:00:00",
          snippet: "Prices rose",
          title: "Oak prices",
          url: "https://news.test/oak",
        },
        {
          kind: "discussion",
          title: "Oak vs maple",
          url: "https://forum.test/1",
        },
        {
          image: "https://imgs.test/v",
          kind: "video",
          title: "Laying oak",
          url: "https://video.test/1",
        },
        {
          kind: "place",
          place: {
            address: "1 High St, London",
            latitude: 51.5,
            longitude: -0.12,
          },
          rating: 4.5,
          reviewCount: 12,
          title: "Oak Supply",
          url: "https://oak.test",
        },
      ]);
      expect(response.meta).toStrictEqual({
        warnings: [
          'brave searched the spell-corrected query "oak flooring"',
          "strict safe search hid some results",
        ],
      });
      expect(response.raw).toStrictEqual(webBody);
    });

    it("returns no meta when Brave sends nothing to report", async () => {
      const { web } = setup({
        body: { query: { original: "x" }, web: { results: [] } },
      });
      const response = await web.search("x");
      expect(response.results).toStrictEqual([]);
      expect(response.meta).toBeUndefined();
    });

    it("turns publishedAfter and publishedBefore into Brave's date range", async () => {
      const { web, calls } = setup({ body: webBody });
      await web.search("oak", {
        publishedAfter: "2026-01-01",
        publishedBefore: "2026-03-31",
      });
      expect(nth(calls, 0).url.searchParams.get("freshness")).toBe(
        "2026-01-01to2026-03-31"
      );
    });

    it("ends the range today when only publishedAfter is given", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
      const { web, calls } = setup({ body: webBody });
      await web.search("oak", { publishedAfter: "2026-10-01" });
      expect(nth(calls, 0).url.searchParams.get("freshness")).toBe(
        "2026-10-01to2026-11-01"
      );
    });

    it("maps each recency window and has none for an hour", async () => {
      const { web, calls } = setup(
        { body: webBody },
        { body: webBody },
        { body: webBody }
      );
      await web.search("a", { recency: "day" });
      await web.search("a", { recency: "week" });
      await web.search("a", { recency: "year" });
      expect(
        calls.map((c) => c.url.searchParams.get("freshness"))
      ).toStrictEqual(["pd", "pw", "py"]);
      await expect(
        // @ts-expect-error Brave has no hour recency
        web.search("a", { recency: "hour" })
      ).rejects.toMatchObject({ code: "InvalidRequest" });
    });

    it("refuses date options Brave cannot combine, before sending", async () => {
      const { web, calls } = setup();
      await expect(
        web.search("a", { publishedAfter: "2026-01-01", recency: "week" })
      ).rejects.toMatchObject({ code: "InvalidRequest" });
      await expect(
        web.search("a", { publishedBefore: "2026-01-01", recency: "week" })
      ).rejects.toMatchObject({ code: "InvalidRequest" });
      await expect(
        web.search("a", { publishedBefore: "2026-01-01" })
      ).rejects.toMatchObject({ code: "InvalidRequest" });
      await expect(
        web.search("a", { publishedAfter: "January" })
      ).rejects.toMatchObject({ code: "InvalidRequest" });
      expect(calls).toHaveLength(0);
    });

    it("repeats goggles once per value and allows at most three", async () => {
      const { web, calls } = setup({ body: webBody });
      await web.search("oak", {
        goggles: ["https://gist.github.com/x/1", "$boost=3,site=dev.to"],
      });
      expect(nth(calls, 0).url.searchParams.getAll("goggles")).toStrictEqual([
        "https://gist.github.com/x/1",
        "$boost=3,site=dev.to",
      ]);
      await expect(
        web.search("oak", { goggles: ["a", "b", "c", "d"] })
      ).rejects.toMatchObject({ code: "InvalidRequest" });
      expect(calls).toHaveLength(1);
    });

    it("searches news on its own endpoint", async () => {
      const { web, calls } = setup({
        body: {
          query: { original: "oak" },
          results: [
            {
              description: "Prices rose",
              extra_snippets: ["More"],
              page_age: "2026-10-01T10:00:00",
              thumbnail: { src: "https://imgs.test/n" },
              title: "Oak prices",
              type: "news_result",
              url: "https://news.test/oak",
            },
          ],
          type: "news",
        },
      });
      const response = await web.search("oak", {
        extraSnippets: true,
        goggles: "$boost=2,site=bbc.co.uk",
        limit: 30,
        recency: "day",
        vertical: "news",
      });
      expect(nth(calls, 0).url.pathname).toBe("/res/v1/news/search");
      expect(Object.fromEntries(nth(calls, 0).url.searchParams)).toStrictEqual({
        count: "30",
        extra_snippets: "true",
        freshness: "pd",
        goggles: "$boost=2,site=bbc.co.uk",
        q: "oak",
      });
      expect(response.results).toStrictEqual([
        {
          image: "https://imgs.test/n",
          kind: "news",
          publishedAt: "2026-10-01T10:00:00",
          snippet: "Prices rose\n\nMore",
          title: "Oak prices",
          url: "https://news.test/oak",
        },
      ]);
    });

    it("searches videos on its own endpoint", async () => {
      const { web, calls } = setup({
        body: {
          query: { altered: "oak tree", original: "oak" },
          results: [
            {
              description: "How to",
              title: "Laying oak",
              type: "video_result",
              url: "https://video.test/1",
              video: { duration: "10:00" },
            },
          ],
        },
      });
      const response = await web.search("oak", {
        country: "us",
        offset: 2,
        vertical: "videos",
      });
      expect(nth(calls, 0).url.pathname).toBe("/res/v1/videos/search");
      expect(nth(calls, 0).url.searchParams.get("offset")).toBe("2");
      expect(nth(calls, 0).url.searchParams.get("country")).toBe("US");
      expect(response.results).toStrictEqual([
        {
          kind: "video",
          snippet: "How to",
          title: "Laying oak",
          url: "https://video.test/1",
        },
      ]);
      expect(response.meta?.warnings).toStrictEqual([
        'brave searched the spell-corrected query "oak tree"',
      ]);
    });

    it("refuses options an endpoint does not take, before sending", async () => {
      const { web, calls } = setup();
      await expect(
        // @ts-expect-error the types refuse this combination
        web.search("oak", { goggles: "x", vertical: "videos" })
      ).rejects.toThrow(/videos search does not accept goggles/u);
      await expect(
        // @ts-expect-error the types refuse this combination
        web.search("oak", { resultTypes: ["web"], vertical: "news" })
      ).rejects.toThrow(/news search does not accept resultTypes/u);
      await expect(
        // @ts-expect-error the types refuse this combination
        web.search("oak", { vertical: "maps" })
      ).rejects.toMatchObject({ code: "InvalidRequest" });
      expect(calls).toHaveLength(0);
    });

    it("returns page text through the LLM context endpoint when content is asked for", async () => {
      const { web, calls } = setup({
        body: {
          grounding: {
            generic: [
              {
                snippets: ["Oak is hard.", "Oak is durable."],
                title: "Oak floors",
                url: "https://a.test/oak",
              },
            ],
            map: [
              {
                name: "Oak Supply",
                snippets: ["Open daily"],
                title: "Oak Supply",
                url: "https://oak.test",
              },
            ],
            poi: null,
          },
          sources: {
            "https://a.test/oak": {
              age: [],
              description: "About oak",
              favicon: "https://imgs.test/a.ico",
              hostname: "a.test",
              thumbnail: "https://imgs.test/a.jpg",
              title: "Oak floors (source)",
            },
          },
        },
      });
      const response = await web.search("oak flooring", {
        content: true,
        country: "gb",
        goggles: "$boost=3,site=a.test",
        language: "en",
        limit: 10,
        maxTokens: 2048,
        maxTokensPerUrl: 1024,
        recency: "week",
        relevance: "strict",
        safesearch: "off",
        sourceMetadata: true,
      });
      expect(nth(calls, 0).method).toBe("GET");
      expect(nth(calls, 0).url.pathname).toBe("/res/v1/llm/context");
      expect(nth(calls, 0).headers["x-subscription-token"]).toBe("k");
      expect(Object.fromEntries(nth(calls, 0).url.searchParams)).toStrictEqual({
        context_threshold_mode: "strict",
        count: "10",
        country: "GB",
        enable_source_metadata: "true",
        freshness: "pw",
        goggles: "$boost=3,site=a.test",
        maximum_number_of_tokens: "2048",
        maximum_number_of_tokens_per_url: "1024",
        maximum_number_of_urls: "10",
        q: "oak flooring",
        safesearch: "off",
        search_lang: "en",
      });
      expect(response.results).toStrictEqual([
        {
          content: "Oak is hard.\n\nOak is durable.",
          favicon: "https://imgs.test/a.ico",
          image: "https://imgs.test/a.jpg",
          kind: "web",
          snippet: "About oak",
          title: "Oak floors",
          url: "https://a.test/oak",
        },
        {
          content: "Open daily",
          kind: "place",
          title: "Oak Supply",
          url: "https://oak.test",
        },
      ]);
    });

    it("refuses web-only options on a content search, before sending", async () => {
      const { web, calls } = setup();
      await expect(
        // @ts-expect-error the types refuse this combination
        web.search("oak", { content: true, offset: 1 })
      ).rejects.toThrow(/context search does not accept offset/u);
      await expect(
        // @ts-expect-error the types refuse this combination
        web.search("oak", { content: true, vertical: "news" })
      ).rejects.toThrow(/context search does not accept vertical/u);
      expect(calls).toHaveLength(0);
    });

    it("maps a rate limit to RateLimited with the wait", async () => {
      const { web } = setup({
        body: { error: { detail: "Rate limit exceeded", status: 429 } },
        headers: { "retry-after": "2" },
        status: 429,
      });
      await expect(web.search("oak")).rejects.toMatchObject({
        code: "RateLimited",
        provider: "brave",
        retryAfter: 2,
        retryable: true,
      });
    });

    it("maps an invalid request to InvalidRequest", async () => {
      const { web } = setup({
        body: { error: { detail: "count must be at most 20", status: 422 } },
        status: 422,
      });
      await expect(web.search("oak", { limit: 99 })).rejects.toMatchObject({
        code: "InvalidRequest",
      });
    });
  });

  describe("images", () => {
    const imageBody = {
      extra: { might_be_offensive: false },
      query: { altered: "oak wood", original: "oak" },
      results: [
        {
          properties: {
            height: 1200,
            placeholder: "https://imgs.test/p.jpg",
            url: "https://a.test/oak.jpg",
            width: 2000,
          },
          source: "a.test",
          thumbnail: {
            height: 300,
            src: "https://imgs.test/t.jpg",
            width: 500,
          },
          title: "Oak grain",
          type: "image_result",
          url: "https://a.test/page",
        },
        {
          thumbnail: { src: "https://imgs.test/x.jpg" },
          title: "Only a thumbnail",
        },
      ],
      type: "images",
    };

    it("sends an image search with Brave's parameters", async () => {
      const { web, calls } = setup({ body: imageBody });
      await web.images("oak", {
        country: "gb",
        language: "en",
        limit: 100,
        safesearch: "off",
        spellcheck: false,
      });
      expect(nth(calls, 0).method).toBe("GET");
      expect(nth(calls, 0).url.pathname).toBe("/res/v1/images/search");
      expect(nth(calls, 0).headers["x-subscription-token"]).toBe("k");
      expect(Object.fromEntries(nth(calls, 0).url.searchParams)).toStrictEqual({
        count: "100",
        country: "GB",
        q: "oak",
        safesearch: "off",
        search_lang: "en",
        spellcheck: "false",
      });
    });

    it("normalizes images and reports the ones without an image URL", async () => {
      const { web } = setup({ body: imageBody });
      const response = await web.images("oak");
      expect(response.results).toStrictEqual([
        {
          height: 1200,
          sourceUrl: "https://a.test/page",
          thumbnailUrl: "https://imgs.test/t.jpg",
          title: "Oak grain",
          url: "https://a.test/oak.jpg",
          width: 2000,
        },
      ]);
      expect(response.meta?.warnings).toStrictEqual([
        'brave searched the spell-corrected query "oak wood"',
        "1 results had no image URL and were left out",
      ]);
      expect(response.raw).toStrictEqual(imageBody);
    });
  });

  describe("answer", () => {
    const stream = [
      chunk("Oak is "),
      chunk('hard<citation>{"start_index":0,"end_index":11,"number":1,'),
      chunk('"url":"https://a.test/oak","favicon":"https://imgs.test/a.ico",'),
      chunk('"snippet":"Oak is a hardwood"}</citation>'),
      chunk(
        ' and durable.<citation>{"number":2,"url":"https://b.test/oak","snippet":"Durable"}</citation>'
      ),
      chunk(
        '<citation>{"number":3,"url":"https://a.test/oak","snippet":"Janka 1290"}</citation>'
      ),
      chunk(
        `<usage>${JSON.stringify({
          "X-Request-Queries": 1,
          "X-Request-Requests": 1,
          "X-Request-Tokens-In": 1200,
          "X-Request-Tokens-Out": 80,
          "X-Request-Total-Cost": 0.0122,
        })}</usage>`
      ),
      "data: [DONE]",
      "",
    ].join("\n\n");

    it("asks Brave's answer endpoint for a cited stream", async () => {
      const { web, calls } = setup({ text: stream });
      await web.answer("Is oak hard?", {
        country: "gb",
        language: "EN",
        maxTokens: 500,
        model: "brave",
        safesearch: "strict",
        searchContextSize: "high",
        userLocation: {
          city: "London",
          country: "gb",
          timezone: "Europe/London",
        },
      });
      expect(nth(calls, 0).method).toBe("POST");
      expect(nth(calls, 0).url.pathname).toBe("/res/v1/chat/completions");
      expect(nth(calls, 0).headers["x-subscription-token"]).toBe("k");
      expect(nth(calls, 0).body).toStrictEqual({
        country: "GB",
        enable_citations: true,
        language: "en",
        max_completion_tokens: 500,
        messages: [{ content: "Is oak hard?", role: "user" }],
        model: "brave",
        safesearch: "strict",
        stream: true,
        web_search_options: {
          search_context_size: "high",
          user_location: {
            approximate: {
              city: "London",
              country: "GB",
              timezone: "Europe/London",
            },
            type: "approximate",
          },
        },
      });
    });

    it("sends only the required fields by default", async () => {
      const { web, calls } = setup({ text: stream });
      await web.answer("Is oak hard?");
      expect(nth(calls, 0).body).toStrictEqual({
        enable_citations: true,
        messages: [{ content: "Is oak hard?", role: "user" }],
        stream: true,
      });
    });

    it("joins the stream, lifts out citations and reads the cost", async () => {
      const { web } = setup({ text: stream });
      const response = await web.answer("Is oak hard?");
      expect(response.answer).toBe("Oak is hard and durable.");
      expect(response.citations).toStrictEqual([
        {
          excerpts: ["Oak is a hardwood", "Janka 1290"],
          url: "https://a.test/oak",
        },
        { excerpts: ["Durable"], url: "https://b.test/oak" },
      ]);
      expect(response.meta).toStrictEqual({
        usage: {
          costUsd: 0.0122,
          units: { queries: 1, requests: 1, tokensIn: 1200, tokensOut: 80 },
        },
      });
      expect(response.raw).toBe(stream);
    });

    it("reads a usage tag whose JSON is itself a string", async () => {
      const body = [
        chunk("Yes."),
        chunk(
          `<usage>${JSON.stringify(JSON.stringify({ "X-Request-Total-Cost": 0.5 }))}</usage>`
        ),
        "data: [DONE]",
      ].join("\n\n");
      const { web } = setup({ text: body });
      const response = await web.answer("q");
      expect(response.answer).toBe("Yes.");
      expect(response.citations).toStrictEqual([]);
      expect(response.meta).toStrictEqual({ usage: { costUsd: 0.5 } });
    });

    it("reads a plain completion body when Brave sends one", async () => {
      const { web } = setup({
        body: {
          choices: [{ message: { content: "Yes.", role: "assistant" } }],
        },
      });
      const response = await web.answer("q");
      expect(response.answer).toBe("Yes.");
      expect(response.meta).toBeUndefined();
    });

    it("fails when the stream holds no answer text", async () => {
      const { web } = setup({ text: "data: [DONE]\n\n" });
      await expect(web.answer("q")).rejects.toMatchObject({
        code: "ProviderError",
        provider: "brave",
      });
    });

    it("maps a plan error to a Fieldwork error", async () => {
      const { web } = setup({
        body: { error: { detail: "Answers plan required", status: 402 } },
        status: 402,
      });
      await expect(web.answer("q")).rejects.toMatchObject({
        provider: "brave",
        status: 402,
      });
    });
  });
});
