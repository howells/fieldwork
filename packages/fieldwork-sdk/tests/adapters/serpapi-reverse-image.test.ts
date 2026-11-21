import { describe, expect, it } from "vitest";

import { serpapi } from "../../src/adapters/serpapi.js";
import { Fieldwork } from "../../src/index.js";
import { fakeFetch, nth } from "../helpers.js";
import { providersWith, webFor } from "../tools/support.js";

const client = (...replies: Parameters<typeof fakeFetch>) => {
  const { fetch, calls } = fakeFetch(...replies);
  return {
    calls,
    web: new Fieldwork({
      adapter: serpapi({ apiKey: "k", fetch, retries: 0 }),
    }),
  };
};

/** Options as untyped JavaScript could pass them, including ones the types refuse. */
type UntypedOptions = Record<string, string | number | boolean>;

/**
 * Starts a call the types refuse, as untyped JavaScript could make it, on a
 * client that records what it sends.
 */
const refusal = (imageUrl: string, options?: UntypedOptions) => {
  const { calls, fetch } = fakeFetch();
  const web = webFor("serpapi", fetch);
  // oxlint-disable-next-line typescript/no-unsafe-call -- an untyped caller: the types would refuse this call, and the runtime must too
  const attempt = web.reverseImage(imageUrl, options);
  return { attempt, calls };
};

const params = (calls: readonly { url: URL }[], index = 0) =>
  Object.fromEntries(nth(calls, index).url.searchParams);

const metadata = { id: "abc123", status: "Success" };
const IMAGE = "https://a.test/chair.jpg";

describe("serpapi reverseImage: google_lens", () => {
  it("sends the image as url with no engine option, as google_lens", async () => {
    const { web, calls } = client({ body: { search_metadata: metadata } });
    await web.reverseImage(IMAGE);
    expect(nth(calls, 0).method).toBe("GET");
    expect(nth(calls, 0).url.pathname).toBe("/search");
    expect(params(calls)).toStrictEqual({
      api_key: "k",
      engine: "google_lens",
      url: IMAGE,
    });
  });

  it("maps country, language, query, match and noCache", async () => {
    const { web, calls } = client({ body: { search_metadata: metadata } });
    await web.reverseImage(IMAGE, {
      country: "GB",
      language: "en",
      match: "visual",
      noCache: true,
      query: "oak chair",
    });
    expect(params(calls)).toStrictEqual({
      api_key: "k",
      country: "gb",
      engine: "google_lens",
      hl: "en",
      no_cache: "true",
      q: "oak chair",
      type: "visual_matches",
      url: IMAGE,
    });
  });

  it("asks for exact matches and reads them without an image URL", async () => {
    const { web, calls } = client({
      body: {
        exact_matches: [
          {
            actual_image_height: 262,
            actual_image_width: 220,
            link: "https://shop.test/chair",
            position: 1,
            source: "Shop",
            thumbnail: "https://t.test/1.jpg",
            title: "Oak chair",
          },
          { position: 2, title: "No page" },
        ],
        search_metadata: metadata,
      },
    });
    const response = await web.reverseImage(IMAGE, { match: "exact" });
    expect(params(calls).type).toBe("exact_matches");
    expect(response.results).toStrictEqual([
      {
        height: 262,
        kind: "exact",
        siteName: "Shop",
        sourceUrl: "https://shop.test/chair",
        thumbnailUrl: "https://t.test/1.jpg",
        title: "Oak chair",
        width: 220,
      },
    ]);
    expect(response.meta).toStrictEqual({ requestId: "abc123" });
  });

  it("reads visual matches with the page, the matched image and its size", async () => {
    const { web } = client({
      body: {
        search_metadata: metadata,
        visual_matches: [
          {
            exact_matches: true,
            image: "https://cdn.test/chair-large.jpg",
            image_height: 1864,
            image_width: 2216,
            link: "https://blog.test/chairs",
            position: 1,
            thumbnail: "https://t.test/2.jpg",
            title: "Chairs",
          },
          { position: 2, title: "No page" },
        ],
      },
    });
    const response = await web.reverseImage(IMAGE);
    expect(response.results).toStrictEqual([
      {
        height: 1864,
        kind: "visual",
        sourceUrl: "https://blog.test/chairs",
        thumbnailUrl: "https://t.test/2.jpg",
        title: "Chairs",
        url: "https://cdn.test/chair-large.jpg",
        width: 2216,
      },
    ]);
  });

  it("keeps the provider's response in raw", async () => {
    const body = { search_metadata: metadata, visual_matches: [] };
    const { web } = client({ body });
    const response = await web.reverseImage(IMAGE);
    expect(response.raw).toStrictEqual(body);
    expect(response.results).toStrictEqual([]);
  });

  it("warns, and keeps the link, when a match page is a Google redirect", async () => {
    const redirect = "https://lens.google.com/url?sa=t&url=https://shop.test/x";
    const { web } = client({
      body: {
        exact_matches: [
          { link: redirect, title: "Redirected" },
          { link: "https://shop.test/y", title: "Direct" },
        ],
        search_metadata: metadata,
      },
    });
    const response = await web.reverseImage(IMAGE, { match: "exact" });
    expect(response.results.map((match) => match.sourceUrl)).toStrictEqual([
      redirect,
      "https://shop.test/y",
    ]);
    expect(response.meta?.warnings).toStrictEqual([
      "1 sourceUrl is a Google redirect link, not the page itself; a GET on the link redirects to the page",
    ]);
  });

  it("counts Lens /goto links as redirects, and keeps each page's site and date", async () => {
    const goto = "https://www.google.com/goto?url=CAESdgHE&gsessionid=abc";
    const { web } = client({
      body: {
        exact_matches: [
          {
            date: "Sep 23, 2025",
            link: goto,
            source: "Instagram",
            title: "A post",
          },
          {
            link: "https://studio.test/project",
            source: "A Studio",
            title: "Project",
          },
        ],
        search_metadata: metadata,
      },
    });
    const response = await web.reverseImage(IMAGE, { match: "exact" });
    expect(response.results).toStrictEqual([
      {
        kind: "exact",
        publishedAt: "Sep 23, 2025",
        siteName: "Instagram",
        sourceUrl: goto,
        title: "A post",
      },
      {
        kind: "exact",
        siteName: "A Studio",
        sourceUrl: "https://studio.test/project",
        title: "Project",
      },
    ]);
    expect(response.meta?.warnings).toStrictEqual([
      "1 sourceUrl is a Google redirect link, not the page itself; a GET on the link redirects to the page",
    ]);
  });

  it.each([
    ["query with match exact", { match: "exact", query: "chair" }],
    ["a match other than exact or visual", { match: "all" }],
    ["limit, which Lens has no count for", { limit: 5 }],
  ])("refuses %s before sending", async (_name, options) => {
    const { attempt, calls } = refusal(IMAGE, options);
    await expect(attempt).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });

  it.each([["chair.jpg"], ["data:image/png;base64,AAAA"], [""]])(
    "refuses the image URL %j, which is not http or https",
    async (imageUrl) => {
      const { attempt, calls } = refusal(imageUrl);
      await expect(attempt).rejects.toMatchObject({ code: "InvalidRequest" });
      expect(calls).toHaveLength(0);
    }
  );
});

describe("serpapi reverseImage: google_reverse_image", () => {
  it("sends image_url with gl, hl and q", async () => {
    const { web, calls } = client({ body: { search_metadata: metadata } });
    await web.reverseImage(IMAGE, {
      country: "GB",
      engine: "google_reverse_image",
      language: "en",
      noCache: true,
      query: "chair",
    });
    expect(params(calls)).toStrictEqual({
      api_key: "k",
      engine: "google_reverse_image",
      gl: "uk",
      hl: "en",
      image_url: IMAGE,
      no_cache: "true",
      q: "chair",
    });
  });

  it("reads the pages that show the image, then the visual matches", async () => {
    const { web } = client({
      body: {
        image_results: [
          {
            link: "https://news.test/story",
            redirect_link: "https://www.google.com/url?x=1",
            snippet: "A story about chairs.",
            thumbnail: "https://t.test/3.jpg",
            title: "Story",
          },
          { title: "No page" },
        ],
        search_metadata: metadata,
        visual_matches: [
          {
            image: "https://cdn.test/v.jpg",
            link: "https://blog.test/v",
            title: "Visual",
          },
        ],
      },
    });
    const response = await web.reverseImage(IMAGE, {
      engine: "google_reverse_image",
    });
    expect(response.results).toStrictEqual([
      {
        description: "A story about chairs.",
        sourceUrl: "https://news.test/story",
        thumbnailUrl: "https://t.test/3.jpg",
        title: "Story",
      },
      {
        kind: "visual",
        sourceUrl: "https://blog.test/v",
        title: "Visual",
        url: "https://cdn.test/v.jpg",
      },
    ]);
  });

  it.each([
    ["match", { match: "exact" }],
    ["limit", { limit: 3 }],
  ])("refuses %s", async (_name, options) => {
    const { attempt, calls } = refusal(IMAGE, {
      engine: "google_reverse_image",
      ...options,
    });
    await expect(attempt).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });
});

describe("serpapi reverseImage: bing_reverse_image", () => {
  it("sends image_url with count and mkt", async () => {
    const { web, calls } = client({ body: { search_metadata: metadata } });
    await web.reverseImage(IMAGE, {
      engine: "bing_reverse_image",
      limit: 20,
      market: "en-GB",
    });
    expect(params(calls)).toStrictEqual({
      api_key: "k",
      count: "20",
      engine: "bing_reverse_image",
      image_url: IMAGE,
      mkt: "en-GB",
    });
  });

  it("reads pages_with_this_image as exact matches, with source as the page", async () => {
    const { web } = client({
      body: {
        pages_with_this_image: [
          {
            height: 976,
            link: "https://www.bing.com/images/search?view=detailv2",
            original: "https://shop.test/uploads/chair.jpg",
            size: "801 x 976",
            source: "https://shop.test/chair",
            thumbnail: "https://tse.test/th.jpg",
            title: "Chair",
            width: 801,
          },
          { link: "https://www.bing.com/x", title: "No source" },
        ],
        related_content: [
          { link: "https://www.bing.com/y", source: "https://other.test/" },
        ],
        search_metadata: metadata,
      },
    });
    const response = await web.reverseImage(IMAGE, {
      engine: "bing_reverse_image",
    });
    expect(response.results).toStrictEqual([
      {
        height: 976,
        kind: "exact",
        sourceUrl: "https://shop.test/chair",
        thumbnailUrl: "https://tse.test/th.jpg",
        title: "Chair",
        url: "https://shop.test/uploads/chair.jpg",
        width: 801,
      },
    ]);
  });

  it.each([
    ["match", { match: "exact" }],
    ["country", { country: "GB" }],
    ["language", { language: "en" }],
    ["query", { query: "chair" }],
    ["a limit over 150", { limit: 151 }],
    ["a limit under 1", { limit: 0 }],
  ])("refuses %s", async (_name, options) => {
    const { attempt, calls } = refusal(IMAGE, {
      engine: "bing_reverse_image",
      ...options,
    });
    await expect(attempt).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });
});

describe("serpapi reverseImage: yandex_images", () => {
  it("sends the image as url, on the default About tab", async () => {
    const { web, calls } = client({ body: { search_metadata: metadata } });
    await web.reverseImage(IMAGE, { engine: "yandex_images", noCache: true });
    expect(params(calls)).toStrictEqual({
      api_key: "k",
      engine: "yandex_images",
      no_cache: "true",
      url: IMAGE,
    });
  });

  it("reads image_results, whose thumbnail and original are objects", async () => {
    const { web } = client({
      body: {
        image_results: [
          {
            link: "https://avto.test/download",
            original_image: {
              height: 3744,
              link: "https://img.test/orig.jpg",
              width: 5616,
            },
            snippet: "Download wallpaper",
            source: "avto.test",
            thumbnail: {
              height: 100,
              link: "https://avatars.test/i",
              width: 150,
            },
            title: "Wallpaper",
          },
          { title: "No page" },
        ],
        search_metadata: metadata,
      },
    });
    const response = await web.reverseImage(IMAGE, { engine: "yandex_images" });
    expect(response.results).toStrictEqual([
      {
        description: "Download wallpaper",
        height: 3744,
        siteName: "avto.test",
        sourceUrl: "https://avto.test/download",
        thumbnailUrl: "https://avatars.test/i",
        title: "Wallpaper",
        url: "https://img.test/orig.jpg",
        width: 5616,
      },
    ]);
  });

  it.each([
    ["country", { country: "GB" }],
    ["limit", { limit: 3 }],
    ["match", { match: "exact" }],
  ])("refuses %s, which Yandex does not take", async (_name, options) => {
    const { attempt, calls } = refusal(IMAGE, {
      engine: "yandex_images",
      ...options,
    });
    await expect(attempt).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });
});

describe("serpapi reverseImage: errors and setup", () => {
  it("refuses an engine it does not know", async () => {
    const { attempt, calls } = refusal(IMAGE, { engine: "baidu" });
    await expect(attempt).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });

  it("throws a retryable ProviderError for a search whose status is Error", async () => {
    const { web } = client({
      body: {
        error: "Google hasn't returned any results for this query.",
        search_metadata: { id: "x", status: "Error" },
      },
    });
    await expect(web.reverseImage(IMAGE)).rejects.toMatchObject({
      code: "ProviderError",
      retryable: true,
    });
  });

  it("is a capability of SerpApi", () => {
    const { web } = client();
    expect(web.capabilities.reverseImage).toBe(true);
    expect(web.supports("reverseImage")).toBe(true);
  });
});

describe("reverseImage on the other providers", () => {
  it("is offered by SerpApi alone", () => {
    expect(providersWith("reverseImage")).toStrictEqual(["serpapi"]);
  });

  it.each(
    [
      "brave",
      "browserbase",
      "exa",
      "firecrawl",
      "kernel",
      "llamaparse",
      "parallel",
      "perplexity",
      "reducto",
      "tavily",
    ].map((provider) => ({ provider }))
  )(
    "throws Unsupported on $provider and sends nothing",
    async ({ provider }) => {
      const { calls, fetch } = fakeFetch();
      const web = webFor(provider, fetch);
      expect(web.capabilities.reverseImage).toBe(false);
      // oxlint-disable-next-line typescript/no-unsafe-call -- the method is typed away on these providers; the runtime must still refuse it
      const attempt = web.reverseImage(IMAGE);
      await expect(attempt).rejects.toMatchObject({
        code: "Unsupported",
        provider,
      });
      expect(calls).toHaveLength(0);
    }
  );
});
