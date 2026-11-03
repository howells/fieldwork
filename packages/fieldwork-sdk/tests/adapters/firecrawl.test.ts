import { describe, expect, it } from "vitest";

import { firecrawl } from "../../src/adapters/firecrawl.js";
import type {
  FirecrawlReadManyOptions,
  FirecrawlSearchOptions,
} from "../../src/adapters/firecrawl.js";
import { Fieldwork } from "../../src/index.js";
import { fakeFetch, nth } from "../helpers.js";

const url =
  "https://www.tilebar.com/product/portmore-aqua-3x8-glazed-ceramic-tile.html";
const schema = {
  properties: { sku: { type: "string" } },
  required: ["sku"],
  type: "object",
};

const client = (...replies: Parameters<typeof fakeFetch>) => {
  const { fetch, calls } = fakeFetch(...replies);
  return {
    calls,
    web: new Fieldwork({
      adapter: firecrawl({ apiKey: "k", fetch, retries: 0 }),
    }),
  };
};

const requests = (calls: { method: string; url: URL }[]) =>
  calls.map((call) => `${call.method} ${call.url.pathname}`);

const batchReplies = () => [
  { body: { id: "b1", invalidURLs: ["not a url"], success: true } },
  { body: { completed: 1, status: "scraping", total: 3 } },
  {
    body: {
      creditsUsed: 2,
      data: [{ markdown: "a", metadata: { url: "https://s.test/a" } }],
      next: "https://api.firecrawl.dev/v2/batch/scrape/b1?skip=1",
      status: "completed",
      total: 2,
    },
  },
  {
    body: {
      data: [{ markdown: "b", metadata: { url: "https://s.test/b" } }],
      status: "completed",
    },
  },
  {
    body: {
      errors: [{ error: "timed out", id: "e1", url: "https://s.test/c" }],
      robotsBlocked: [],
    },
  },
];

const parsed = () =>
  client({
    body: {
      data: {
        blocks: [],
        markdown: "care",
        metadata: { numPages: 1, scrapeId: "p1", totalPages: 12 },
        pages: [{ markdown: "care", pageNumber: 1 }],
        warning: "page 2 unreadable",
      },
      success: true,
    },
  });

describe("firecrawl search", () => {
  it("sends the documented search body", async () => {
    const { web, calls } = client({ body: { data: {}, success: true } });
    await web.search("glazed tile", {
      categories: ["developer", "pdf"],
      content: true,
      country: "gb",
      includeDomains: ["tilebar.com"],
      limit: 5,
      location: "London,England,United Kingdom",
      recency: "week",
      safe: true,
      sources: ["web", "news"],
    });
    expect(calls[0]).toMatchObject({
      headers: { authorization: "Bearer k" },
      method: "POST",
    });
    expect(nth(calls, 0).url.pathname).toBe("/v2/search");
    expect(nth(calls, 0).body).toStrictEqual({
      categories: [{ type: "developer" }, { type: "pdf" }],
      country: "GB",
      includeDomains: ["tilebar.com"],
      limit: 5,
      location: "London,England,United Kingdom",
      query: "glazed tile",
      safe: true,
      scrapeOptions: { formats: ["markdown"] },
      sources: [{ type: "web" }, { type: "news" }],
      tbs: "qdr:w",
    });
  });

  it("returns web, news and research results with meta", async () => {
    const { web } = client({
      body: {
        creditsUsed: 2,
        data: {
          news: [
            {
              date: "2026-10-30",
              imageUrl: "https://n.test/story.jpg",
              snippet: "Snippet",
              title: "Story",
              url: "https://n.test/story",
            },
          ],
          research: [
            {
              abstract: "An abstract",
              paperId: "p1",
              primaryId: "arxiv:2105.05233",
              score: 0.91,
              title: "Diffusion",
            },
            {
              abstract: "More",
              paperId: "p2",
              primaryId: "pmid:123",
              score: 0.5,
              title: "Cells",
            },
            {
              abstract: "Even more",
              paperId: "p3",
              primaryId: "doi:10.1101/2024.01.01",
              score: 0.4,
              title: "Preprint",
            },
            {
              abstract: "",
              paperId: "web:https://c.test/paper",
              primaryId: "web:https://c.test/paper",
              score: 0.3,
              title: "From the web",
            },
          ],
          web: [
            {
              category: "pdf",
              description: "A spec",
              markdown: "# Spec",
              title: "Spec",
              url: "https://a.test/spec.pdf",
            },
            { description: "plain", title: "B", url: "https://b.test/" },
          ],
        },
        id: "s1",
        success: true,
        warning: "slow",
        warnings: ["research changes on 2026-11-16"],
      },
    });
    const response = await web.search("tile");
    expect(response.results).toStrictEqual([
      {
        content: "# Spec",
        kind: "pdf",
        snippet: "A spec",
        title: "Spec",
        url: "https://a.test/spec.pdf",
      },
      { kind: "web", snippet: "plain", title: "B", url: "https://b.test/" },
      {
        image: "https://n.test/story.jpg",
        kind: "news",
        publishedAt: "2026-10-30",
        snippet: "Snippet",
        title: "Story",
        url: "https://n.test/story",
      },
      {
        kind: "research",
        score: 0.91,
        snippet: "An abstract",
        title: "Diffusion",
        url: "https://arxiv.org/abs/2105.05233",
      },
      {
        kind: "research",
        score: 0.5,
        snippet: "More",
        title: "Cells",
        url: "https://pubmed.ncbi.nlm.nih.gov/123/",
      },
      {
        kind: "research",
        score: 0.4,
        snippet: "Even more",
        title: "Preprint",
        url: "https://doi.org/10.1101/2024.01.01",
      },
      {
        kind: "research",
        score: 0.3,
        title: "From the web",
        url: "https://c.test/paper",
      },
    ]);
    expect(response.meta).toStrictEqual({
      requestId: "s1",
      usage: { credits: 2 },
      warnings: ["slow", "research changes on 2026-11-16"],
    });
    expect(response.images).toBeUndefined();
  });

  it("returns images that come back with the results", async () => {
    const { web, calls } = client({
      body: {
        data: {
          images: [
            {
              imageHeight: 600,
              imageUrl: "https://i.test/tile.jpg",
              imageWidth: 800,
              title: "Tile",
              url: "https://i.test/page",
            },
          ],
          web: [],
        },
        success: true,
      },
    });
    const response = await web.search("tile", { sources: ["web", "images"] });
    expect(nth(calls, 0).body).toMatchObject({
      sources: [{ type: "web" }, { type: "images" }],
    });
    expect(response.images).toStrictEqual([
      {
        height: 600,
        sourceUrl: "https://i.test/page",
        title: "Tile",
        url: "https://i.test/tile.jpg",
        width: 800,
      },
    ]);
  });

  it("sends a date range as a custom time filter", async () => {
    const { web, calls } = client(
      { body: { data: {}, success: true } },
      { body: { data: {}, success: true } }
    );
    await web.search("tile", {
      publishedAfter: "2026-01-05",
      publishedBefore: "2026-03-31",
    });
    await web.search("tile", { publishedAfter: "2026-01-05" });
    expect(nth(calls, 0).body).toHaveProperty(
      "tbs",
      "cdr:1,cd_min:01/05/2026,cd_max:03/31/2026"
    );
    expect(nth(calls, 1).body).toHaveProperty("tbs", "cdr:1,cd_min:01/05/2026");
  });

  const refusals: [string, FirecrawlSearchOptions][] = [
    [
      "include and exclude domains together",
      { excludeDomains: ["b.test"], includeDomains: ["a.test"] },
    ],
    ["gov with another category", { categories: ["gov", "pdf"] }],
    [
      "recency with publishedAfter",
      { publishedAfter: "2026-01-01", recency: "day" },
    ],
    [
      "recency with publishedBefore",
      { publishedBefore: "2026-01-01", recency: "day" },
    ],
    ["tbs with recency", { recency: "day", tbs: "sbd:1" }],
    ["a date that is not YYYY-MM-DD", { publishedAfter: "01/05/2026" }],
  ];

  it.each(refusals)(
    "refuses %s before sending anything",
    async (_name, options) => {
      const { web, calls } = client();
      await expect(web.search("tile", options)).rejects.toMatchObject({
        code: "InvalidRequest",
      });
      expect(calls).toHaveLength(0);
    }
  );
});

describe("firecrawl images", () => {
  it("searches the images source", async () => {
    const { web, calls } = client({
      body: {
        creditsUsed: 2,
        data: {
          images: [
            {
              imageHeight: 900,
              imageUrl: "https://i.test/t.jpg",
              imageWidth: 1200,
              position: 1,
              title: "Terrazzo",
              url: "https://i.test/p",
            },
            { title: "No image url", url: "https://i.test/q" },
          ],
        },
        id: "i1",
        success: true,
      },
    });
    const response = await web.images("terrazzo", {
      country: "us",
      limit: 3,
      safe: true,
    });
    expect(nth(calls, 0).url.pathname).toBe("/v2/search");
    expect(nth(calls, 0).body).toStrictEqual({
      country: "US",
      limit: 3,
      query: "terrazzo",
      safe: true,
      sources: [{ type: "images" }],
    });
    expect(response.results).toStrictEqual([
      {
        height: 900,
        sourceUrl: "https://i.test/p",
        title: "Terrazzo",
        url: "https://i.test/t.jpg",
        width: 1200,
      },
    ]);
    expect(response.meta).toStrictEqual({
      requestId: "i1",
      usage: { credits: 2 },
    });
  });
});

describe("firecrawl read", () => {
  it("reads a page with extra formats", async () => {
    const { web, calls } = client({
      body: {
        data: {
          links: ["https://a.test"],
          markdown: "# Portmore",
          metadata: { sourceURL: url, title: "Portmore" },
          rawHtml: "<html>",
        },
        success: true,
      },
    });
    const page = await web.read(url, {
      include: ["rawHtml", "links"],
      maxAge: 0,
    });
    expect(nth(calls, 0).headers.authorization).toBe("Bearer k");
    expect(nth(calls, 0).body).toStrictEqual({
      formats: ["markdown", "rawHtml", "links"],
      maxAge: 0,
      url,
    });
    expect(page).toMatchObject({
      links: ["https://a.test"],
      markdown: "# Portmore",
      rawHtml: "<html>",
      title: "Portmore",
      url,
    });
  });

  it("sends page settings in Firecrawl's units and names", async () => {
    const { web, calls } = client({ body: { data: {}, success: true } });
    await web.read(url, {
      actions: [
        { selector: "#more", type: "click" },
        { milliseconds: 500, type: "wait" },
      ],
      excludeTags: ["nav"],
      include: ["screenshot", "summary", "html", "images"],
      includeTags: ["main"],
      location: { country: "DE", languages: ["de-DE"] },
      maxAge: 3600,
      mobile: true,
      onlyMainContent: false,
      parsers: [{ maxPages: 5, mode: "fast", type: "pdf" }],
      proxy: "enhanced",
      waitFor: 1500,
    });
    expect(nth(calls, 0).body).toStrictEqual({
      actions: [
        { selector: "#more", type: "click" },
        { milliseconds: 500, type: "wait" },
      ],
      excludeTags: ["nav"],
      formats: ["markdown", "screenshot", "summary", "html", "images"],
      includeTags: ["main"],
      location: { country: "DE", languages: ["de-DE"] },
      maxAge: 3_600_000,
      mobile: true,
      onlyMainContent: false,
      parsers: [{ maxPages: 5, mode: "fast", type: "pdf" }],
      proxy: "enhanced",
      url,
      waitFor: 1500,
    });
  });

  it("normalizes what the page and Firecrawl report", async () => {
    const { web } = client({
      body: {
        data: {
          images: ["https://a.test/1.jpg"],
          markdown: "# Portmore",
          metadata: {
            author: "TileBar",
            creditsUsed: 2,
            description: "Glazed ceramic",
            favicon: "https://a.test/favicon.ico",
            language: "en-US",
            ogImage: "https://a.test/og.jpg",
            publishedTime: "2026-02-01",
            scrapeId: "sc1",
            sourceURL: url,
            statusCode: 200,
            title: ["Portmore", "Other"],
            url: "https://www.tilebar.com/final",
          },
          screenshot: "https://shots.test/1.png",
          summary: "A tile",
          warning: "partly rendered",
        },
        success: true,
      },
    });
    const page = await web.read(url);
    expect(page).toMatchObject({
      author: "TileBar",
      description: "Glazed ceramic",
      favicon: "https://a.test/favicon.ico",
      image: "https://a.test/og.jpg",
      images: ["https://a.test/1.jpg"],
      language: "en",
      meta: {
        requestId: "sc1",
        usage: { credits: 2 },
        warnings: ["partly rendered"],
      },
      publishedAt: "2026-02-01",
      screenshot: "https://shots.test/1.png",
      statusCode: 200,
      summary: "A tile",
      title: "Portmore",
      url: "https://www.tilebar.com/final",
    });
  });

  it("answers a query with highlights, or a question on request", async () => {
    const { web, calls } = client(
      {
        body: {
          data: { highlights: "The tile is 3x8.", markdown: "x" },
          success: true,
        },
      },
      {
        body: { data: { answer: "3x8 inches", markdown: "x" }, success: true },
      }
    );
    const highlighted = await web.read(url, { query: "What size?" });
    const answered = await web.read(url, {
      query: "What size?",
      queryFormat: "question",
    });
    expect(nth(calls, 0).body).toHaveProperty("formats", [
      "markdown",
      { query: "What size?", type: "highlights" },
    ]);
    expect(nth(calls, 1).body).toHaveProperty("formats", [
      "markdown",
      { question: "What size?", type: "question" },
    ]);
    expect(highlighted.excerpts).toStrictEqual(["The tile is 3x8."]);
    expect(answered.excerpts).toStrictEqual(["3x8 inches"]);
  });

  it("fails as NotFound when the page answered 404 or 410, as Exa does", async () => {
    const { web } = client(
      {
        body: {
          data: {
            markdown: "Sorry, we couldn't find anything here",
            metadata: { statusCode: 404, title: "Not found", url },
          },
          success: true,
        },
      },
      {
        body: {
          data: { markdown: "Gone", metadata: { statusCode: 410, url } },
          success: true,
        },
      }
    );
    await expect(web.read(url)).rejects.toMatchObject({
      code: "NotFound",
      provider: "firecrawl",
      status: 404,
    });
    await expect(web.read(url)).rejects.toMatchObject({
      code: "NotFound",
      status: 410,
    });
  });
});

describe("firecrawl readMany", () => {
  const urls = [
    "https://s.test/a",
    "https://s.test/b",
    "https://s.test/c",
    "not a url",
  ];
  const settings = {
    include: ["links"],
    interval: 1,
    maxAge: 60,
    maxConcurrency: 2,
  } satisfies FirecrawlReadManyOptions;

  it("starts a batch scrape job and follows it to its last page of results", async () => {
    const { web, calls } = client(...batchReplies());
    await web.readMany(urls, settings);
    expect(requests(calls)).toStrictEqual([
      "POST /v2/batch/scrape",
      "GET /v2/batch/scrape/b1",
      "GET /v2/batch/scrape/b1",
      "GET /v2/batch/scrape/b1",
      "GET /v2/batch/scrape/b1/errors",
    ]);
    expect(calls[0]?.body).toStrictEqual({
      formats: ["markdown", "links"],
      maxAge: 60_000,
      maxConcurrency: 2,
      urls,
    });
    expect(calls[3]?.url.search).toBe("?skip=1");
  });

  it("returns every page, the URLs that failed, and the job's credits", async () => {
    const { web } = client(...batchReplies());
    const batch = await web.readMany(urls, settings);
    expect(batch.pages.map((page) => page.url)).toStrictEqual([
      "https://s.test/a",
      "https://s.test/b",
    ]);
    expect(batch).toMatchObject({
      failed: [
        { error: "timed out", url: "https://s.test/c" },
        { error: "invalid URL", url: "not a url" },
      ],
      id: "b1",
      meta: { requestId: "b1", usage: { credits: 2 } },
    });
  });

  it("lists a page that answered 404 as failed, not as a page", async () => {
    const { web } = client(
      {
        body: {
          data: [
            {
              markdown: "a",
              metadata: { statusCode: 200, url: "https://s.test/a" },
            },
            {
              markdown: "gone",
              metadata: { statusCode: 404, url: "https://s.test/b" },
            },
          ],
          status: "completed",
        },
      },
      { body: { errors: [] } }
    );
    const batch = await web.readMany([], { resume: "b8" });
    expect(batch.pages.map((page) => page.url)).toStrictEqual([
      "https://s.test/a",
    ]);
    expect(batch.failed).toStrictEqual([
      { error: "the page returned 404", url: "https://s.test/b" },
    ]);
  });

  it("resumes a job by id without starting another", async () => {
    const { web, calls } = client(
      {
        body: {
          data: [{ markdown: "a", metadata: { url: "https://s.test/a" } }],
          status: "completed",
        },
      },
      { body: { errors: [] } }
    );
    const batch = await web.readMany([], { resume: "b9" });
    expect(batch.pages).toHaveLength(1);
    expect(requests(calls)).toStrictEqual([
      "GET /v2/batch/scrape/b9",
      "GET /v2/batch/scrape/b9/errors",
    ]);
  });

  it("keeps the job id when the batch fails", async () => {
    const { web } = client({ body: { status: "failed" } });
    await expect(web.readMany([], { resume: "b10" })).rejects.toMatchObject({
      code: "JobFailed",
      jobId: "b10",
    });
  });
});

describe("firecrawl extract", () => {
  it("asks for the json format and returns the values", async () => {
    const { web, calls } = client({
      body: {
        data: {
          json: { sku: "TLPRSRNAQU3X8" },
          metadata: { creditsUsed: 5, scrapeId: "sc2" },
          warning: "one field guessed",
        },
        success: true,
      },
    });
    const result = await web.extract<{ sku: string }>(url, {
      onlyMainContent: true,
      prompt: "the sku",
      schema,
    });
    expect(nth(calls, 0).body).toStrictEqual({
      formats: [{ prompt: "the sku", schema, type: "json" }],
      onlyMainContent: true,
      url,
    });
    expect(result.data).toStrictEqual({ sku: "TLPRSRNAQU3X8" });
    expect(result.meta).toStrictEqual({
      requestId: "sc2",
      usage: { credits: 5 },
      warnings: ["one field guessed"],
    });
  });

  it("throws when Firecrawl returns no values", async () => {
    const { web } = client({
      body: { data: { warning: "page too long" }, success: true },
    });
    await expect(web.extract(url, { schema })).rejects.toThrow(
      /no JSON.*page too long/u
    );
  });
});

describe("firecrawl product", () => {
  it("reads product variants without a model", async () => {
    const { web, calls } = client({
      body: {
        data: {
          product: {
            brand: "TileBar",
            title: "Portmore",
            variants: [
              {
                availability: { inStock: true },
                price: { amount: "53.53", currency: "USD" },
                sku: "TLPRSRNAQU3X8",
                values: { color: "Aqua", size: "3x8" },
              },
            ],
          },
        },
        success: true,
      },
    });
    const product = await web.product(url);
    expect(nth(calls, 0).body).toMatchObject({ formats: ["product"] });
    expect(product.variants).toStrictEqual([
      {
        inStock: true,
        price: { amount: "53.53", currency: "USD" },
        sku: "TLPRSRNAQU3X8",
        values: { color: "Aqua", size: "3x8" },
      },
    ]);
  });

  it("keeps image captions, prices, sale price, availability and barcode", async () => {
    const { web } = client({
      body: {
        data: {
          metadata: { scrapeId: "sc3" },
          product: {
            title: "Headphones",
            url: "https://shop.test/headphones",
            variants: [
              {
                availability: { inStock: false, text: "Ships in 2-3 weeks" },
                gtin13: 5_012_345_678_900,
                id: "black",
                images: [
                  { alt: "Front", url: "https://shop.test/b1.jpg" },
                  { url: "https://shop.test/b2.jpg" },
                ],
                price: {
                  amount: 199.99,
                  currency: "USD",
                  formatted: "$199.99",
                },
                sale: {
                  originalPrice: { amount: 249.99, formatted: "$249.99" },
                },
                title: "Black",
              },
              {
                availability: { inStock: true },
                gtin: "00012345678905",
                id: "white",
                images: [
                  { alt: "Front", url: "https://shop.test/b1.jpg" },
                  { alt: "White", url: "https://shop.test/w1.jpg" },
                ],
              },
            ],
          },
          warning: "currency not stated",
        },
        success: true,
      },
    });
    const product = await web.product("https://shop.test/headphones");
    expect(product.variants[0]).toStrictEqual({
      availability: "Ships in 2-3 weeks",
      gtin: "5012345678900",
      id: "black",
      images: [
        { alt: "Front", url: "https://shop.test/b1.jpg" },
        { url: "https://shop.test/b2.jpg" },
      ],
      inStock: false,
      originalPrice: { amount: "249.99", formatted: "$249.99" },
      price: { amount: "199.99", currency: "USD", formatted: "$199.99" },
      title: "Black",
    });
    expect(nth(product.variants, 1).gtin).toBe("00012345678905");
    expect(product.images).toStrictEqual([
      { alt: "Front", url: "https://shop.test/b1.jpg" },
      { url: "https://shop.test/b2.jpg" },
      { alt: "White", url: "https://shop.test/w1.jpg" },
    ]);
    expect(product.meta).toStrictEqual({
      requestId: "sc3",
      warnings: ["currency not stated"],
    });
  });

  it("reports a page with no product, with Firecrawl's reason", async () => {
    const { web } = client({
      body: { data: { warning: "No product found on page" }, success: true },
    });
    await expect(web.product(url)).rejects.toMatchObject({
      code: "NotFound",
      message: expect.stringContaining("No product found on page"),
    });
  });

  it.each([false, "", 0, "none", []])(
    "reports a product of %j as NotFound",
    async (product) => {
      const { web } = client({ body: { data: { product }, success: true } });
      await expect(web.product(url)).rejects.toMatchObject({
        code: "NotFound",
      });
    }
  );
});

describe("firecrawl map", () => {
  it("sends the map options and returns links", async () => {
    const { web, calls } = client({
      body: {
        links: [
          { description: "Page A", title: "A", url: "https://s.test/a" },
          "https://s.test/b",
        ],
        success: true,
      },
    });
    const map = await web.map("https://s.test", {
      ignoreCache: true,
      ignoreQueryParameters: false,
      includeSubdomains: false,
      limit: 50,
      location: { country: "GB" },
      search: "tile",
      sitemap: "only",
    });
    expect(nth(calls, 0).url.pathname).toBe("/v2/map");
    expect(nth(calls, 0).body).toStrictEqual({
      ignoreCache: true,
      ignoreQueryParameters: false,
      includeSubdomains: false,
      limit: 50,
      location: { country: "GB" },
      search: "tile",
      sitemap: "only",
      url: "https://s.test",
    });
    expect(map.links).toStrictEqual([
      { description: "Page A", title: "A", url: "https://s.test/a" },
      { url: "https://s.test/b" },
    ]);
  });
});

describe("firecrawl crawl", () => {
  it("follows crawl pages until the last batch", async () => {
    const { web, calls } = client(
      { body: { id: "c1", success: true } },
      { body: { status: "scraping" } },
      {
        body: {
          creditsUsed: 2,
          data: [{ markdown: "a", metadata: { url: "https://s.test/a" } }],
          next: "https://api.firecrawl.dev/v2/crawl/c1?skip=1",
          status: "completed",
          total: 2,
        },
      },
      {
        body: {
          data: [{ markdown: "b", metadata: { url: "https://s.test/b" } }],
          status: "completed",
        },
      },
      { body: { errors: [] } }
    );
    const crawl = await web.crawl("https://s.test", { interval: 1, limit: 2 });
    expect(crawl.pages.map((page) => page.url)).toStrictEqual([
      "https://s.test/a",
      "https://s.test/b",
    ]);
    expect(nth(calls, 3).url.pathname + nth(calls, 3).url.search).toBe(
      "/v2/crawl/c1?skip=1"
    );
    expect(nth(calls, 4).url.pathname).toBe("/v2/crawl/c1/errors");
  });

  it("sends the crawl options by Firecrawl's names", async () => {
    const { web, calls } = client(
      { body: { id: "c2", success: true } },
      { body: { data: [], status: "completed" } },
      { body: { errors: [] } }
    );
    await web.crawl("https://s.test", {
      allowSubdomains: true,
      crawlEntireDomain: true,
      excludePaths: ["^/blog/.*"],
      includePaths: ["^/products/.*"],
      interval: 1,
      limit: 20,
      maxDiscoveryDepth: 3,
      prompt: "only product pages",
      scrapeOptions: { include: ["links"], maxAge: 10, onlyMainContent: true },
      sitemap: "include",
    });
    expect(nth(calls, 0).body).toStrictEqual({
      allowSubdomains: true,
      crawlEntireDomain: true,
      excludePaths: ["^/blog/.*"],
      includePaths: ["^/products/.*"],
      limit: 20,
      maxDiscoveryDepth: 3,
      prompt: "only product pages",
      scrapeOptions: {
        formats: ["markdown", "links"],
        maxAge: 10_000,
        onlyMainContent: true,
      },
      sitemap: "include",
      url: "https://s.test",
    });
  });

  it("reports failed pages, robots blocks, totals and credits", async () => {
    const { web } = client(
      { body: { id: "c3", success: true } },
      {
        body: {
          completed: 2,
          creditsUsed: 3,
          data: [{ markdown: "a", metadata: { url: "https://s.test/a" } }],
          status: "completed",
          total: 3,
        },
      },
      {
        body: {
          errors: [{ error: "403", id: "e", url: "https://s.test/x" }],
          robotsBlocked: ["https://s.test/private"],
        },
      }
    );
    const crawl = await web.crawl("https://s.test", { interval: 1 });
    expect(crawl).toMatchObject({
      failed: [{ error: "403", url: "https://s.test/x" }],
      id: "c3",
      meta: { requestId: "c3", usage: { credits: 3 } },
      robotsBlocked: ["https://s.test/private"],
      total: 3,
    });
  });

  it("keeps the job id when the crawl ends failed or cancelled", async () => {
    const { web } = client(
      { body: { id: "c4", success: true } },
      { body: { status: "cancelled" } }
    );
    await expect(
      web.crawl("https://s.test", { interval: 1 })
    ).rejects.toMatchObject({ code: "JobFailed", jobId: "c4" });
  });

  it("resumes a crawl by job id", async () => {
    const { web, calls } = client(
      { body: { data: [], status: "completed" } },
      { body: { errors: [] } }
    );
    await web.crawl("https://s.test", { resume: "c5" });
    expect(requests(calls)).toStrictEqual([
      "GET /v2/crawl/c5",
      "GET /v2/crawl/c5/errors",
    ]);
  });
});

describe("firecrawl research", () => {
  it("starts an agent run with Firecrawl's names and returns its thread", async () => {
    const { web, calls } = client(
      { body: { id: "r1", success: true, threadId: "t1", threadTurn: 1 } },
      { body: { status: "processing", success: true } },
      {
        body: {
          creditsUsed: 120,
          data: { sku: "X" },
          status: "completed",
          success: true,
          threadId: "t1",
        },
      }
    );
    const run = await web.research<{ sku: string }>("find the sku", {
      continueFrom: "t0",
      country: "gb",
      effort: "low",
      interval: 1,
      maxCredits: 500,
      model: "spark-2",
      schema,
      strictConstrainToURLs: true,
      urls: [url],
    });
    expect(nth(calls, 0).url.pathname).toBe("/v2/agent");
    expect(nth(calls, 0).body).toStrictEqual({
      effort: "low",
      location: { country: "GB" },
      maxCredits: 500,
      model: "spark-2",
      prompt: "find the sku",
      schema,
      strictConstrainToURLs: true,
      threadId: "t0",
      urls: [url],
    });
    expect(run).toMatchObject({
      continuationId: "t1",
      id: "r1",
      meta: { requestId: "r1", usage: { credits: 120 } },
      output: { sku: "X" },
      sources: [],
      status: "completed",
    });
    expect(run.stopReason).toBeUndefined();
  });

  it("returns what a run found before its credit limit as partial", async () => {
    const { web } = client(
      { body: { id: "r2", success: true } },
      {
        body: {
          creditsUsed: 500,
          error: "Credit limit reached",
          message: "Two of five pages read",
          partial: { rows: [1, 2] },
          partialSchemaValid: false,
          status: "failed",
          stopReason: "credit_limit_reached",
          success: true,
          threadId: "t2",
        },
      }
    );
    const run = await web.research("rows", { interval: 1 });
    expect(run).toMatchObject({
      continuationId: "t2",
      id: "r2",
      meta: {
        usage: { credits: 500 },
        warnings: [
          "Two of five pages read",
          "the partial output does not match the schema",
        ],
      },
      output: { rows: [1, 2] },
      status: "partial",
      stopReason: "credit_limit_reached",
    });
  });

  it("throws JobFailed with the job id when a failed run has no output", async () => {
    const { web } = client(
      { body: { id: "r3", success: true } },
      { body: { error: "site blocked", status: "failed" } }
    );
    await expect(web.research("x", { interval: 1 })).rejects.toMatchObject({
      code: "JobFailed",
      jobId: "r3",
      message: expect.stringContaining("site blocked"),
    });
  });

  it("resumes a run by id without starting another", async () => {
    const { web, calls } = client({
      body: { data: { ok: true }, status: "completed" },
    });
    const run = await web.research("x", { resume: "r4" });
    expect(requests(calls)).toStrictEqual(["GET /v2/agent/r4"]);
    expect(run.output).toStrictEqual({ ok: true });
  });
});

describe("firecrawl act", () => {
  it("closes the browser session after running a script", async () => {
    const { web, calls } = client(
      { body: { id: "s1", success: true } },
      {
        body: {
          exitCode: 0,
          result: "",
          stderr: "",
          stdout: "4x4\n",
          success: true,
        },
      },
      { body: { creditsBilled: 2, success: true } }
    );
    const result = await web.act("console.log('4x4')", { ttl: 60 });
    expect(result).toMatchObject({
      exitCode: 0,
      meta: { usage: { credits: 2 } },
      stdout: "4x4\n",
    });
    expect(result.sessionId).toBeUndefined();
    expect(requests(calls)).toStrictEqual([
      "POST /v2/interact",
      "POST /v2/interact/s1/execute",
      "DELETE /v2/interact/s1",
    ]);
    expect(nth(calls, 0).body).toStrictEqual({ activityTtl: 60, ttl: 60 });
    expect(nth(calls, 1).body).toStrictEqual({
      code: "console.log('4x4')",
      language: "node",
    });
  });

  it("reports a failed or killed script instead of passing it off as success", async () => {
    const { web } = client(
      { body: { id: "s2", success: true } },
      {
        body: {
          error: "ReferenceError: x is not defined",
          exitCode: 1,
          stderr: "boom",
          stdout: "",
          success: true,
        },
      },
      { body: { success: true } },
      { body: { id: "s3", success: true } },
      { body: { exitCode: null, killed: true, stdout: "", success: false } },
      { body: { success: true } }
    );
    const failed = await web.act("x");
    expect(failed).toMatchObject({
      error: "ReferenceError: x is not defined",
      exitCode: 1,
      stderr: "boom",
    });
    const killed = await web.act("while(true){}", { timeout: 2000 });
    expect(killed.killed).toBe(true);
    expect(killed.error).toMatch(/did not succeed/u);
  });

  it("sends the script's time limit in seconds and gives the request room to report", async () => {
    const { web, calls } = client(
      { body: { id: "s4", success: true } },
      { body: { stdout: "", success: true } },
      { body: { success: true } }
    );
    await web.act("1", { language: "python", timeout: 2500 });
    expect(nth(calls, 1).body).toStrictEqual({
      code: "1",
      language: "python",
      timeout: 3,
    });
    await expect(web.act("1", { timeout: 301_000 })).rejects.toMatchObject({
      code: "InvalidRequest",
    });
    expect(calls).toHaveLength(3);
  });

  it("keeps the session open and returns its id", async () => {
    const { web, calls } = client(
      { body: { id: "s5", success: true } },
      { body: { stdout: "a", success: true } }
    );
    const result = await web.act("1", {
      country: "de",
      keepSession: true,
      profile: { name: "p" },
    });
    expect(result.sessionId).toBe("s5");
    expect(requests(calls)).toStrictEqual([
      "POST /v2/interact",
      "POST /v2/interact/s5/execute",
    ]);
    expect(nth(calls, 0).body).toStrictEqual({
      location: { country: "DE" },
      profile: { name: "p" },
    });
  });

  it("runs in an existing session and leaves it open", async () => {
    const { web, calls } = client({ body: { stdout: "b", success: true } });
    const result = await web.act("1", { session: "s6" });
    expect(requests(calls)).toStrictEqual(["POST /v2/interact/s6/execute"]);
    expect(result.sessionId).toBe("s6");
  });

  it("closes a session it opened when the script request fails", async () => {
    const { web, calls } = client(
      { body: { id: "s7", success: true } },
      { body: { error: "bad gateway" }, status: 502 },
      { body: { success: true } }
    );
    await expect(web.act("1", { keepSession: true })).rejects.toMatchObject({
      status: 502,
    });
    expect(requests(calls).at(-1)).toBe("DELETE /v2/interact/s7");
  });

  it("refuses session settings for a session that already exists", async () => {
    const { web, calls } = client();
    await expect(
      web.act("1", { session: "s8", ttl: 60 })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });
});

describe("firecrawl browser", () => {
  it("opens a session and returns its CDP and live view URLs", async () => {
    const { web, calls } = client({
      body: {
        cdpUrl: "wss://cdp.test/b1",
        expiresAt: "2026-11-01T12:00:00.000Z",
        id: "b1",
        interactiveLiveViewUrl: "https://live.test/b1/i",
        liveViewUrl: "https://live.test/b1",
        success: true,
      },
    });
    const session = await web.browser.open({
      country: "gb",
      profile: { name: "shop", saveChanges: false },
      ttl: 120,
    });
    expect(nth(calls, 0).method).toBe("POST");
    expect(nth(calls, 0).url.pathname).toBe("/v2/interact");
    expect(nth(calls, 0).body).toStrictEqual({
      activityTtl: 120,
      location: { country: "GB" },
      profile: { name: "shop", saveChanges: false },
      ttl: 120,
    });
    expect(session).toMatchObject({
      cdpUrl: "wss://cdp.test/b1",
      expiresAt: "2026-11-01T12:00:00.000Z",
      id: "b1",
      liveViewUrl: "https://live.test/b1",
    });
  });

  it("closes a session by id", async () => {
    const { web, calls } = client({ body: { success: true } });
    await web.browser.close("b1");
    expect(requests(calls)).toStrictEqual(["DELETE /v2/interact/b1"]);
  });
});

describe("firecrawl parse", () => {
  const care = { data: new Uint8Array([37, 80, 68, 70]), name: "care.pdf" };

  it("uploads a document to parse as multipart", async () => {
    const { web, calls } = parsed();
    await web.parse(care, {
      blocks: true,
      maxPages: 1,
      mode: "fast",
      pageMarkers: true,
      pages: true,
    });
    const form = calls[0]?.body;
    expect(form).toBeInstanceOf(FormData);
    if (!(form instanceof FormData)) {
      return;
    }
    const file = form.get("file");
    expect(file).toMatchObject({ name: "care.pdf", type: "application/pdf" });
    await expect(
      new Response(form.get("options")).json()
    ).resolves.toStrictEqual({
      formats: ["markdown"],
      parsers: [
        {
          blocks: true,
          maxPages: 1,
          mode: "fast",
          pageMarkers: true,
          pages: true,
          type: "pdf",
        },
      ],
    });
  });

  it("returns the pages, the file's page count and what Firecrawl reported", async () => {
    const { web } = parsed();
    const document = await web.parse(care);
    expect(document.pages).toStrictEqual([{ markdown: "care", pageNumber: 1 }]);
    expect(document).toMatchObject({
      meta: { requestId: "p1", warnings: ["page 2 unreadable"] },
      pageCount: 12,
    });
  });

  it("sends each documented file type with its content type", async () => {
    const types = {
      csv: "text/csv",
      doc: "application/msword",
      docm: "application/vnd.ms-word.document.macroEnabled.12",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      epub: "application/epub+zip",
      htm: "text/html",
      html: "text/html",
      odp: "application/vnd.oasis.opendocument.presentation",
      ods: "application/vnd.oasis.opendocument.spreadsheet",
      odt: "application/vnd.oasis.opendocument.text",
      pdf: "application/pdf",
      ppt: "application/vnd.ms-powerpoint",
      pptm: "application/vnd.ms-powerpoint.presentation.macroEnabled.12",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      rtf: "application/rtf",
      xhtml: "application/xhtml+xml",
      xls: "application/vnd.ms-excel",
      xlsb: "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
      xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
    const names = Object.keys(types);
    const { web, calls } = client(
      ...names.map(() => ({ body: { data: { markdown: "" }, success: true } }))
    );
    for (const extension of names) {
      await web.parse({
        data: new Blob(["x"]),
        name: `File.${extension.toUpperCase()}`,
      });
    }
    expect(
      calls.map((call) =>
        call.body instanceof FormData ? call.body.get("file") : undefined
      )
    ).toMatchObject(
      // A Blob stores its content type in lower case, which MIME types allow.
      Object.values(types).map((type) => ({ type: type.toLowerCase() }))
    );
  });

  it("sends the call's timeout as Firecrawl's own limit, up to 300 seconds", async () => {
    const { web, calls } = parsed();
    await web.parse(care, { timeout: 120_000 });
    const form = calls[0]?.body;
    if (!(form instanceof FormData)) {
      throw new TypeError("expected a multipart body");
    }
    await expect(
      new Response(form.get("options")).json()
    ).resolves.toMatchObject({ timeout: 120_000 });
    await expect(web.parse(care, { timeout: 300_001 })).rejects.toMatchObject({
      code: "InvalidRequest",
    });
    expect(calls).toHaveLength(1);
  });

  it("refuses files over 50 MB and unknown types before uploading", async () => {
    const { web, calls } = client();
    await expect(
      web.parse({
        data: new Uint8Array(50 * 1024 * 1024 + 1),
        name: "huge.pdf",
      })
    ).rejects.toMatchObject({
      code: "InvalidRequest",
      message: expect.stringContaining("50 MB"),
    });
    await expect(
      web.parse({ data: new Uint8Array(1), name: "photo.png" })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });
});

describe("firecrawl monitor", () => {
  const created = {
    data: {
      createdAt: "2026-11-01T00:00:00.000Z",
      goal: "the price changes",
      id: "m1",
      name: "Price watch",
      schedule: { cron: "0 */6 * * *", timezone: "UTC" },
      status: "active",
      targets: [{ type: "scrape", urls: [url] }],
      webhook: { url: "https://hooks.test/fw" },
    },
    success: true,
  };

  it("creates a page monitor with a cron schedule and webhook", async () => {
    const { web, calls } = client({ body: created });
    const monitor = await web.monitor.create({
      name: "Price watch",
      query: "the price changes",
      retentionDays: 14,
      schedule: { every: "6h" },
      timezone: "Europe/London",
      urls: [url],
      webhookUrl: "https://hooks.test/fw",
    });
    expect(nth(calls, 0).method).toBe("POST");
    expect(nth(calls, 0).url.pathname).toBe("/v2/monitor");
    expect(nth(calls, 0).body).toStrictEqual({
      goal: "the price changes",
      name: "Price watch",
      retentionDays: 14,
      schedule: { cron: "0 */6 * * *", timezone: "Europe/London" },
      targets: [{ type: "scrape", urls: [url] }],
      webhook: { url: "https://hooks.test/fw" },
    });
    expect(monitor).toMatchObject({
      createdAt: "2026-11-01T00:00:00.000Z",
      id: "m1",
      schedule: "0 */6 * * *",
      status: "active",
      watch: "the price changes",
      webhookUrl: "https://hooks.test/fw",
    });
  });

  it("creates a search monitor from a query alone", async () => {
    const { web, calls } = client({ body: created });
    await web.monitor.create({
      includeDomains: ["a.test"],
      maxResults: 20,
      query: "new terrazzo collections",
      schedule: { cron: "*/5 * * * *" },
      searchWindow: "24h",
    });
    expect(nth(calls, 0).body).toStrictEqual({
      goal: "new terrazzo collections",
      name: "new terrazzo collections",
      schedule: { cron: "*/5 * * * *" },
      targets: [
        {
          includeDomains: ["a.test"],
          maxResults: 20,
          queries: ["new terrazzo collections"],
          searchWindow: "24h",
          type: "search",
        },
      ],
    });
  });

  it("turns named intervals into cron and refuses what cron cannot express", async () => {
    const { web, calls } = client(
      { body: created },
      { body: created },
      { body: created },
      { body: created }
    );
    for (const every of ["hour", "day", "week", "1h"] as const) {
      await web.monitor.create({ schedule: { every }, urls: [url] });
    }
    expect(calls.map((call) => call.body)).toMatchObject(
      ["0 * * * *", "0 0 * * *", "0 0 * * 0", "0 * * * *"].map((cron) => ({
        schedule: { cron },
      }))
    );
    const refused = { code: "InvalidRequest" };
    for (const schedule of [
      { every: "5h" },
      { every: "3d" },
      { cron: "* * * * *" },
      { cron: "*/2 * * * *" },
      { cron: "0,3 * * * *" },
      { cron: "0 0 * *" },
    ] as const) {
      await expect(
        web.monitor.create({ schedule, urls: [url] })
      ).rejects.toMatchObject(refused);
    }
    await expect(
      web.monitor.create({ schedule: { every: "day" } })
    ).rejects.toMatchObject(refused);
    await expect(
      web.monitor.create({
        schedule: { every: "day" },
        searchWindow: "1h",
        urls: [url],
      })
    ).rejects.toMatchObject(refused);
    expect(calls).toHaveLength(4);
  });

  it("gets, lists and deletes monitors", async () => {
    const { web, calls } = client(
      { body: created },
      { body: { data: [created.data], success: true } },
      { body: { success: true } }
    );
    const monitor = await web.monitor.get("m1");
    const all = await web.monitor.list();
    await web.monitor.delete("m1");
    expect(monitor.id).toBe("m1");
    expect(all.map((item) => item.id)).toStrictEqual(["m1"]);
    expect(requests(calls)).toStrictEqual([
      "GET /v2/monitor/m1",
      "GET /v2/monitor",
      "DELETE /v2/monitor/m1",
    ]);
    expect(nth(calls, 1).url.searchParams.get("limit")).toBe("100");
    expect(nth(calls, 1).url.searchParams.get("offset")).toBe("0");
  });

  it("reads the monitor's checks as events", async () => {
    const { web, calls } = client({
      body: {
        data: [
          {
            finishedAt: "2026-11-01T06:00:05.000Z",
            id: "k1",
            status: "completed",
            summary: {
              changed: 1,
              error: 0,
              new: 1,
              removed: 0,
              same: 2,
              totalPages: 4,
            },
          },
          {
            createdAt: "2026-11-01T00:00:00.000Z",
            error: "no credits",
            id: "k2",
            status: "failed",
          },
        ],
        success: true,
      },
    });
    const events = await web.monitor.events("m1", { cursor: "100" });
    expect(nth(calls, 0).url.pathname).toBe("/v2/monitor/m1/checks");
    expect(nth(calls, 0).url.searchParams.get("offset")).toBe("100");
    expect(events.events).toMatchObject([
      {
        at: "2026-11-01T06:00:05.000Z",
        id: "k1",
        summary: "completed: 1 changed, 1 new, 0 removed, 0 error of 4 pages",
      },
      {
        at: "2026-11-01T00:00:00.000Z",
        id: "k2",
        summary: "failed: no credits",
      },
    ]);
    expect(events.next).toBeUndefined();
  });
});

describe("firecrawl usage", () => {
  it("reads the team's credit usage", async () => {
    const { web, calls } = client({
      body: {
        data: {
          billingPeriodEnd: "2026-11-30T23:59:59Z",
          billingPeriodStart: "2026-11-01T00:00:00Z",
          planCredits: 1000,
          remainingCredits: 900,
        },
        success: true,
      },
    });
    const usage = await web.usage();
    expect(nth(calls, 0).method).toBe("GET");
    expect(nth(calls, 0).url.pathname).toBe("/v2/team/credit-usage");
    expect(usage).toMatchObject({
      limit: 1000,
      periodEnd: "2026-11-30T23:59:59Z",
      remaining: 900,
    });
    expect(usage.used).toBeUndefined();
  });
});
