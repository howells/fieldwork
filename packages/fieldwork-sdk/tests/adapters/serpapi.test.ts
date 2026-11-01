import { describe, expect, it, vi } from "vitest";

import { serpapi } from "../../src/adapters/serpapi.js";
import { FieldworkError } from "../../src/errors.js";
import { Fieldwork } from "../../src/index.js";
import { fakeFetch } from "../helpers.js";

function client(...replies: Parameters<typeof fakeFetch>) {
  const { fetch, calls } = fakeFetch(...replies);
  return {
    calls,
    web: new Fieldwork({ adapter: serpapi({ apiKey: "k", fetch }) }),
  };
}

function params(call: { url: URL } | undefined) {
  return Object.fromEntries(call!.url.searchParams);
}

const metadata = { id: "abc123", status: "Success" };

describe("serpapi adapter: google web search", () => {
  it("sends the key as api_key and Google's parameter names", async () => {
    const { web, calls } = client({ body: { search_metadata: metadata } });
    await web.search("terrazzo tile", {
      country: "GB",
      device: "mobile",
      language: "en",
      location: "London, England, United Kingdom",
      noCache: true,
      recency: "week",
      safe: "active",
      start: 10,
    });
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url.origin + calls[0]!.url.pathname).toBe(
      "https://serpapi.com/search"
    );
    expect(calls[0]!.body).toBeUndefined();
    expect(params(calls[0])).toStrictEqual({
      api_key: "k",
      device: "mobile",
      engine: "google",
      gl: "uk",
      hl: "en",
      location: "London, England, United Kingdom",
      no_cache: "true",
      q: "terrazzo tile",
      safe: "active",
      start: "10",
      tbs: "qdr:w",
    });
  });

  it("converts a date range to a tbs custom range", async () => {
    const { web, calls } = client({ body: { search_metadata: metadata } });
    await web.search("tile", {
      publishedAfter: "2026-01-05",
      publishedBefore: "2026-03-31",
    });
    expect(params(calls[0]).tbs).toBe("cdr:1,cd_min:1/5/2026,cd_max:3/31/2026");
  });

  it("sends one open end of a range on its own", async () => {
    const { web, calls } = client({ body: { search_metadata: metadata } });
    await web.search("tile", { publishedAfter: "2026-01-05" });
    expect(params(calls[0]).tbs).toBe("cdr:1,cd_min:1/5/2026");
  });

  it("normalizes organic results, the answer box and meta", async () => {
    const { web } = client({
      body: {
        answer_box: {
          answer: "Terrazzo is chips set in cement.",
          snippet: "A long featured passage.",
          type: "organic_result",
        },
        organic_results: [
          {
            author: "A. Writer",
            date: "2 days ago",
            favicon: "https://a.test/f.png",
            link: "https://a.test/terrazzo",
            position: 1,
            snippet: "Chips of marble in a binder.",
            thumbnail: "https://a.test/t.png",
            title: "Terrazzo",
          },
          { position: 2, title: "No link" },
        ],
        search_metadata: metadata,
      },
    });
    const response = await web.search("terrazzo");
    expect(response.answer).toBe("Terrazzo is chips set in cement.");
    expect(response.results).toStrictEqual([
      {
        author: "A. Writer",
        favicon: "https://a.test/f.png",
        image: "https://a.test/t.png",
        kind: "web",
        publishedAt: "2 days ago",
        snippet: "Chips of marble in a binder.",
        title: "Terrazzo",
        url: "https://a.test/terrazzo",
      },
    ]);
    expect(response.meta).toStrictEqual({ requestId: "abc123" });
    expect(response.raw).toMatchObject({ organic_results: expect.any(Array) });
  });

  it("reads a calculator answer from result and the first of an answer list", async () => {
    const calculator = client({
      body: {
        answer_box: { result: "3.14159", type: "calculator_result" },
        search_metadata: metadata,
      },
    });
    const calculated = await calculator.web.search("pi");
    expect(calculated.answer).toBe("3.14159");
    const list = client({
      body: {
        answer_box_list: [{ snippet: "First.", type: "organic_result" }],
        search_metadata: metadata,
      },
    });
    const listed = await list.web.search("x");
    expect(listed.answer).toBe("First.");
  });

  it("returns an empty result with the provider's note as a warning", async () => {
    const { web } = client({
      body: {
        error: "Google hasn't returned any results for this query.",
        search_information: { organic_results_state: "Fully empty" },
        search_metadata: metadata,
      },
    });
    const response = await web.search("zzzzqqqq");
    expect(response.results).toStrictEqual([]);
    expect(response.meta).toStrictEqual({
      requestId: "abc123",
      warnings: ["Google hasn't returned any results for this query."],
    });
  });

  it("refuses limit, because SerpApi documents no result count for Google", async () => {
    const { web, calls } = client();
    // @ts-expect-error limit is not an option of the google engine
    await expect(web.search("tile", { limit: 5 })).rejects.toMatchObject({
      code: "InvalidRequest",
    });
    expect(calls).toHaveLength(0);
  });

  it("refuses recency with a date range, which share tbs", async () => {
    const { web, calls } = client();
    await expect(
      web.search("tile", { publishedAfter: "2026-01-01", recency: "day" })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    await expect(
      web.search("tile", { publishedBefore: "2026-01-01", recency: "day" })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });

  it("refuses a date that is not YYYY-MM-DD", async () => {
    const { web, calls } = client();
    await expect(
      web.search("tile", { publishedAfter: "01/05/2026" })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });

  it("refuses an engine it does not know", async () => {
    const { web, calls } = client();
    await expect(
      // @ts-expect-error not an engine
      web.search("tile", { engine: "yahoo" })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });
});

describe("serpapi adapter: other engines", () => {
  it("searches Google News and flattens story groups", async () => {
    const { web, calls } = client({
      body: {
        news_results: [
          {
            date: "11/12/2024, 09:03 AM, +0200 EET",
            iso_date: "2024-11-12T07:09:00Z",
            link: "https://n.test/1",
            position: 1,
            source: {
              authors: ["A. One", "B. Two"],
              icon: "https://n.test/icon.png",
              name: "Daily",
            },
            thumbnail: "https://n.test/1.jpg",
            title: "Flat story",
          },
          {
            highlight: {
              iso_date: "2024-11-20T04:37:00Z",
              link: "https://n.test/2",
              source: { name: "Wire" },
              title: "Lead story",
            },
            position: 2,
            stories: [
              {
                date: "11/19/2024",
                link: "https://n.test/3",
                source: { name: "Other" },
                title: "Related story",
              },
            ],
          },
        ],
        search_metadata: metadata,
      },
    });
    const response = await web.search("pizza", {
      country: "US",
      engine: "google_news",
      language: "en",
    });
    expect(params(calls[0])).toStrictEqual({
      api_key: "k",
      engine: "google_news",
      gl: "us",
      hl: "en",
      q: "pizza",
    });
    expect(response.results).toStrictEqual([
      {
        author: "A. One, B. Two",
        favicon: "https://n.test/icon.png",
        image: "https://n.test/1.jpg",
        kind: "news",
        publishedAt: "2024-11-12T07:09:00Z",
        title: "Flat story",
        url: "https://n.test/1",
      },
      {
        kind: "news",
        publishedAt: "2024-11-20T04:37:00Z",
        title: "Lead story",
        url: "https://n.test/2",
      },
      {
        kind: "news",
        publishedAt: "11/19/2024",
        title: "Related story",
        url: "https://n.test/3",
      },
    ]);
    expect(response.answer).toBeUndefined();
  });

  it("refuses options the news engine does not document", async () => {
    const { web, calls } = client();
    await expect(
      web.search("pizza", {
        engine: "google_news",
        // @ts-expect-error recency is not an option of google_news
        recency: "day",
      })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });

  it("searches Google Shopping with price filters", async () => {
    const { web, calls } = client({
      body: {
        search_metadata: metadata,
        shopping_results: [
          {
            extracted_price: 92,
            position: 1,
            price: "$92.00",
            product_link: "https://www.google.com/search?ibp=oshop&q=zellige",
            rating: 4.3,
            reviews: 64,
            snippet: "Easy to set up",
            source: "Walmart",
            thumbnail: "https://s.test/t.webp",
            title: "Zellige tile",
          },
          {
            extracted_price: 10.5,
            link: "https://shop.test/offer",
            position: 2,
            price: "$10.50",
            title: "Linked offer",
          },
        ],
      },
    });
    const response = await web.search("zellige tile", {
      country: "us",
      engine: "google_shopping",
      freeShipping: true,
      maxPrice: 100,
      minPrice: 5,
      onSale: true,
      smallBusiness: true,
      sortBy: 1,
    });
    expect(params(calls[0])).toStrictEqual({
      api_key: "k",
      engine: "google_shopping",
      free_shipping: "true",
      gl: "us",
      max_price: "100",
      min_price: "5",
      on_sale: "true",
      q: "zellige tile",
      small_business: "true",
      sort_by: "1",
    });
    expect(response.results).toStrictEqual([
      {
        image: "https://s.test/t.webp",
        kind: "shopping",
        price: { amount: "92", formatted: "$92.00" },
        rating: 4.3,
        reviewCount: 64,
        snippet: "Easy to set up",
        title: "Zellige tile",
        url: "https://www.google.com/search?ibp=oshop&q=zellige",
      },
      {
        kind: "shopping",
        price: { amount: "10.5", formatted: "$10.50" },
        title: "Linked offer",
        url: "https://shop.test/offer",
      },
    ]);
  });

  it("falls back to categorized shopping results when the main list is empty", async () => {
    const { web } = client({
      body: {
        categorized_shopping_results: [
          {
            shopping_results: [
              {
                extracted_price: 5,
                price: "$5",
                product_link: "https://g.test/chair",
                title: "Chair",
              },
            ],
            title: "Chairs",
          },
        ],
        search_metadata: metadata,
      },
    });
    const response = await web.search("chair", { engine: "google_shopping" });
    expect(response.results.map((item) => item.title)).toStrictEqual(["Chair"]);
  });

  it("searches Google Maps from coordinates and returns places", async () => {
    const { web, calls } = client({
      body: {
        local_results: [
          {
            address: "1 Broadway, New York, NY 10018",
            description: "Natural stone supplier.",
            gps_coordinates: { latitude: 40.75, longitude: -73.98 },
            place_id: "ChIJabc",
            position: 1,
            rating: 4.5,
            reviews: 120,
            thumbnail: "https://m.test/t.jpg",
            title: "Stone Yard",
            website: "https://stoneyard.test/",
          },
          {
            gps_coordinates: { latitude: 1, longitude: 2 },
            place_id: "ChIJdef",
            position: 2,
            title: "No Site & Co",
          },
          { position: 3, title: "Nothing to link" },
        ],
        search_metadata: metadata,
      },
    });
    const response = await web.search("stone supplier", {
      engine: "google_maps",
      language: "en",
      latitude: 40.7455096,
      longitude: -74.0083012,
      start: 20,
      zoom: 14,
    });
    expect(params(calls[0])).toStrictEqual({
      api_key: "k",
      engine: "google_maps",
      hl: "en",
      lat: "40.7455096",
      lon: "-74.0083012",
      q: "stone supplier",
      start: "20",
      type: "search",
      z: "14",
    });
    expect(response.results).toStrictEqual([
      {
        image: "https://m.test/t.jpg",
        kind: "place",
        place: {
          address: "1 Broadway, New York, NY 10018",
          latitude: 40.75,
          longitude: -73.98,
        },
        rating: 4.5,
        reviewCount: 120,
        snippet: "Natural stone supplier.",
        title: "Stone Yard",
        url: "https://stoneyard.test/",
      },
      {
        kind: "place",
        place: { latitude: 1, longitude: 2 },
        title: "No Site & Co",
        url: "https://www.google.com/maps/search/?api=1&query=No%20Site%20%26%20Co&query_place_id=ChIJdef",
      },
    ]);
  });

  it("reads a single place_results object when the query names one place", async () => {
    const { web } = client({
      body: {
        place_results: {
          gps_coordinates: { latitude: 40.7, longitude: -73.9 },
          place_id: "ChIJT2h",
          title: "Stumptown Coffee Roasters",
          website: "https://stumptown.test/",
        },
        search_metadata: metadata,
      },
    });
    const response = await web.search("stumptown", { engine: "google_maps" });
    expect(response.results).toStrictEqual([
      {
        kind: "place",
        place: { latitude: 40.7, longitude: -73.9 },
        title: "Stumptown Coffee Roasters",
        url: "https://stumptown.test/",
      },
    ]);
  });

  it("sends a Maps location with its zoom", async () => {
    const { web, calls } = client({ body: { search_metadata: metadata } });
    await web.search("tile", {
      engine: "google_maps",
      location: "Austin, Texas",
      zoom: 12,
    });
    expect(params(calls[0])).toMatchObject({
      location: "Austin, Texas",
      z: "12",
    });
  });

  it("refuses Maps origins that are incomplete or conflict", async () => {
    const { web, calls } = client();
    await expect(
      web.search("tile", { engine: "google_maps", location: "Austin" })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    await expect(
      web.search("tile", { engine: "google_maps", latitude: 1, zoom: 3 })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    await expect(
      web.search("tile", { engine: "google_maps", zoom: 3 })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    await expect(
      web.search("tile", {
        engine: "google_maps",
        latitude: 1,
        location: "Austin",
        longitude: 2,
        zoom: 3,
      })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });

  it("searches Google Scholar and keeps results that only have a full-text link", async () => {
    const { web, calls } = client({
      body: {
        organic_results: [
          {
            link: "https://s.test/abstract",
            position: 0,
            publication_info: { summary: "JL Harper - 1977 - cabdirect.org" },
            snippet: "The first chapter is concerned with experiments.",
            title: "Population biology of plants.",
          },
          {
            position: 1,
            resources: [
              {
                file_format: "PDF",
                link: "https://x.edu/ch6.pdf",
                title: "x.edu",
              },
            ],
            title: "Molecular cell biology",
          },
          { position: 2, title: "Circular statistics in biology." },
        ],
        search_metadata: metadata,
      },
    });
    const response = await web.search("biology", {
      engine: "google_scholar",
      language: "en",
      limit: 20,
      safe: "off",
      start: 10,
      yearFrom: 2018,
      yearTo: 2024,
    });
    expect(params(calls[0])).toStrictEqual({
      api_key: "k",
      as_yhi: "2024",
      as_ylo: "2018",
      engine: "google_scholar",
      hl: "en",
      num: "20",
      q: "biology",
      safe: "off",
      start: "10",
    });
    expect(response.results).toStrictEqual([
      {
        kind: "scholar",
        snippet: "The first chapter is concerned with experiments.",
        title: "Population biology of plants.",
        url: "https://s.test/abstract",
      },
      {
        kind: "scholar",
        title: "Molecular cell biology",
        url: "https://x.edu/ch6.pdf",
      },
    ]);
  });

  it("refuses a result count outside the engine's range", async () => {
    const { web, calls } = client();
    await expect(
      web.search("x", { engine: "google_scholar", limit: 21 })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    await expect(
      web.search("x", { engine: "google_patents", limit: 9 })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    await expect(
      web.search("x", { engine: "duckduckgo", limit: 51 })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });

  it("searches Google Patents with publication dates", async () => {
    const { web, calls } = client({
      body: {
        organic_results: [
          {
            assignee: "Kraft Foods",
            inventor: "Bary Lyn Zeller",
            patent_id: "patent/US8110241B2/en",
            patent_link: "https://patents.google.com/patent/US8110241B2/en",
            position: 1,
            publication_date: "2012-02-07",
            snippet: "An instant coffee powder.",
            thumbnail: "https://p.test/t.png",
            title: "Foaming soluble coffee powder",
          },
        ],
        search_metadata: metadata,
      },
    });
    const response = await web.search("(Coffee) OR (Tea)", {
      assignee: "Kraft",
      engine: "google_patents",
      inventor: "Zeller",
      limit: 10,
      page: 2,
      publishedAfter: "2024-01-05",
      publishedBefore: "2025-12-31",
      sort: "new",
      status: "GRANT",
    });
    expect(params(calls[0])).toStrictEqual({
      after: "publication:20240105",
      api_key: "k",
      assignee: "Kraft",
      before: "publication:20251231",
      engine: "google_patents",
      inventor: "Zeller",
      num: "10",
      page: "2",
      q: "(Coffee) OR (Tea)",
      sort: "new",
      status: "GRANT",
    });
    expect(response.results).toStrictEqual([
      {
        author: "Bary Lyn Zeller",
        image: "https://p.test/t.png",
        kind: "patent",
        publishedAt: "2012-02-07",
        snippet: "An instant coffee powder.",
        title: "Foaming soluble coffee powder",
        url: "https://patents.google.com/patent/US8110241B2/en",
      },
    ]);
  });

  it("searches Bing", async () => {
    const { web, calls } = client({
      body: {
        organic_results: [
          {
            link: "https://www.britannica.com/topic/coffee",
            position: 1,
            snippet: "Coffee, beverage brewed from roasted seeds.",
            thumbnail: "https://b.test/t.png",
            title: "Coffee | Britannica",
          },
        ],
        search_metadata: metadata,
      },
    });
    const response = await web.search("coffee", {
      country: "GB",
      device: "tablet",
      engine: "bing",
      first: 11,
      location: "Leeds, England",
      safeSearch: "Strict",
    });
    expect(params(calls[0])).toStrictEqual({
      api_key: "k",
      cc: "gb",
      device: "tablet",
      engine: "bing",
      first: "11",
      location: "Leeds, England",
      q: "coffee",
      safeSearch: "Strict",
    });
    expect(response.results).toStrictEqual([
      {
        image: "https://b.test/t.png",
        kind: "web",
        snippet: "Coffee, beverage brewed from roasted seeds.",
        title: "Coffee | Britannica",
        url: "https://www.britannica.com/topic/coffee",
      },
    ]);
  });

  it("refuses Bing country and market together", async () => {
    const { web, calls } = client();
    await expect(
      web.search("x", { country: "US", engine: "bing", market: "en-US" })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });

  it("searches DuckDuckGo with a count and a date range", async () => {
    const { web, calls } = client({
      body: {
        organic_results: [
          {
            favicon: "https://d.test/apple.ico",
            link: "https://www.apple.com/",
            position: 1,
            snippet: "Shop online.",
            title: "Apple",
          },
        ],
        search_metadata: metadata,
      },
    });
    const response = await web.search("apple inc.", {
      engine: "duckduckgo",
      limit: 25,
      publishedAfter: "2021-06-15",
      publishedBefore: "2024-06-16",
      region: "us-en",
      safe: -2,
      start: 50,
    });
    expect(params(calls[0])).toStrictEqual({
      api_key: "k",
      df: "2021-06-15..2024-06-16",
      engine: "duckduckgo",
      kl: "us-en",
      m: "25",
      q: "apple inc.",
      safe: "-2",
      start: "50",
    });
    expect(response.results).toStrictEqual([
      {
        favicon: "https://d.test/apple.ico",
        kind: "web",
        snippet: "Shop online.",
        title: "Apple",
        url: "https://www.apple.com/",
      },
    ]);
  });

  it("sends a DuckDuckGo recency window", async () => {
    const { web, calls } = client({ body: { search_metadata: metadata } });
    await web.search("apple", { engine: "duckduckgo", recency: "month" });
    expect(params(calls[0]).df).toBe("m");
  });

  it("refuses DuckDuckGo date filters it cannot express", async () => {
    const { web, calls } = client();
    await expect(
      web.search("x", { engine: "duckduckgo", publishedAfter: "2024-01-01" })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    await expect(
      web.search("x", {
        engine: "duckduckgo",
        publishedAfter: "2024-01-01",
        publishedBefore: "2024-02-01",
        recency: "day",
      })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    await expect(
      // @ts-expect-error DuckDuckGo has no hour window
      web.search("x", { engine: "duckduckgo", recency: "hour" })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });
});

describe("serpapi adapter: images", () => {
  it("searches google_images with its filters", async () => {
    const { web, calls } = client({
      body: {
        images_results: [
          {
            link: "https://en.wikipedia.org/wiki/Coffee",
            original: "https://i.test/o.jpg",
            original_height: 2000,
            original_width: 3200,
            position: 1,
            source: "Wikipedia",
            thumbnail: "https://i.test/t.jpg",
            title: "Coffee - Wikipedia",
          },
          { position: 2, title: "No original" },
        ],
        search_metadata: metadata,
      },
    });
    const response = await web.images("coffee", {
      aspectRatio: "w",
      color: "brown",
      country: "GB",
      device: "desktop",
      imageType: "photo",
      language: "en",
      license: "fc",
      location: "Austin, Texas",
      noCache: true,
      page: 1,
      recency: "month",
      safe: "active",
      size: "2mp",
    });
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url.pathname).toBe("/search");
    expect(params(calls[0])).toStrictEqual({
      api_key: "k",
      device: "desktop",
      engine: "google_images",
      gl: "uk",
      hl: "en",
      ijn: "1",
      image_color: "brown",
      image_type: "photo",
      imgar: "w",
      imgsz: "2mp",
      licenses: "fc",
      location: "Austin, Texas",
      no_cache: "true",
      period_unit: "m",
      q: "coffee",
      safe: "active",
    });
    expect(response.results).toStrictEqual([
      {
        height: 2000,
        sourceUrl: "https://en.wikipedia.org/wiki/Coffee",
        thumbnailUrl: "https://i.test/t.jpg",
        title: "Coffee - Wikipedia",
        url: "https://i.test/o.jpg",
        width: 3200,
      },
    ]);
    expect(response.meta).toStrictEqual({ requestId: "abc123" });
  });

  it("converts a date range to YYYYMMDD", async () => {
    const { web, calls } = client({ body: { search_metadata: metadata } });
    await web.images("coffee", {
      publishedAfter: "2024-12-01",
      publishedBefore: "2024-12-31",
    });
    expect(params(calls[0])).toMatchObject({
      end_date: "20241231",
      start_date: "20241201",
    });
  });

  it("refuses recency with a date range", async () => {
    const { web, calls } = client();
    await expect(
      web.images("coffee", { publishedAfter: "2024-12-01", recency: "day" })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });

  it("refuses limit, which google_images does not document", async () => {
    const { web, calls } = client();
    // @ts-expect-error limit is not an option of images
    await expect(web.images("coffee", { limit: 5 })).rejects.toMatchObject({
      code: "InvalidRequest",
    });
    expect(calls).toHaveLength(0);
  });
});

describe("serpapi adapter: usage", () => {
  it("reads the account and leaves out the API key", async () => {
    const { web, calls } = client({
      body: {
        account_email: "demo@serpapi.com",
        account_id: "5ac5",
        account_rate_limit_per_hour: 6000,
        api_key: "k",
        extra_credits: 0,
        last_hour_searches: 42,
        plan_name: "Big Data Plan",
        plan_renewal_date: "2026-11-30",
        plan_searches_left: 5958,
        searches_per_month: 30_000,
        this_hour_searches: 87,
        this_month_usage: 24_042,
        total_searches_left: 5958,
      },
    });
    const usage = await web.usage();
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url.pathname).toBe("/account");
    expect(params(calls[0])).toStrictEqual({ api_key: "k" });
    expect(usage).toMatchObject({
      breakdown: { last_hour_searches: 42, this_hour_searches: 87 },
      limit: 30_000,
      periodEnd: "2026-11-30",
      remaining: 5958,
      used: 24_042,
    });
    expect(JSON.stringify(usage)).not.toContain('"api_key"');
  });

  it("keeps the rest of the account response in raw", async () => {
    const { web } = client({
      body: { api_key: "k", extra_credits: 3, plan_name: "Big Data Plan" },
    });
    const usage = await web.usage();
    expect(usage.raw).toStrictEqual({
      extra_credits: 3,
      plan_name: "Big Data Plan",
    });
  });

  it("leaves periodEnd out for an account with no monthly plan", async () => {
    const { web } = client({
      body: {
        plan_renewal_date: null,
        plan_searches_left: 0,
        searches_per_month: 0,
        this_month_usage: 10,
        total_searches_left: 40,
      },
    });
    const usage = await web.usage();
    expect(usage.periodEnd).toBeUndefined();
    expect(usage.remaining).toBe(0);
  });
});

describe("serpapi adapter: errors and setup", () => {
  it("maps an invalid key to Unauthorized without echoing the key", async () => {
    const { web } = client({
      body: {
        error:
          "Invalid API key. Your API key should be here: https://serpapi.com/manage-api-key",
      },
      status: 401,
    });
    const failure = await web.search("x").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(FieldworkError);
    expect(failure).toMatchObject({ code: "Unauthorized", status: 401 });
    expect((failure as Error).message).not.toContain("api_key=k");
  });

  it("maps a spent allowance to RateLimited", async () => {
    const { web } = client({
      body: { error: "Your account has run out of searches." },
      headers: { "retry-after": "60" },
      status: 429,
    });
    await expect(web.search("x")).rejects.toMatchObject({
      code: "RateLimited",
      retryAfter: 60,
      retryable: true,
    });
  });

  it("maps a missing parameter to InvalidRequest", async () => {
    const { web } = client({
      body: { error: "Missing query `q` parameter." },
      status: 400,
    });
    await expect(web.search("")).rejects.toMatchObject({
      code: "InvalidRequest",
    });
  });

  it("throws a retryable ProviderError for a search whose status is Error", async () => {
    const { web } = client({
      body: {
        error:
          "We couldn't get valid results for this search. Please try again later.",
        search_metadata: { id: "e1", status: "Error" },
      },
    });
    await expect(web.search("x")).rejects.toMatchObject({
      code: "ProviderError",
      retryable: true,
    });
  });

  it("applies the key to raw requests", async () => {
    const { web, calls } = client({ body: [{ id: "1" }] });
    await web.raw.request("GET", "/locations.json", { query: { q: "Austin" } });
    expect(params(calls[0])).toStrictEqual({ api_key: "k", q: "Austin" });
  });

  it("offers search, images and usage, and nothing else", () => {
    const { web } = client();
    expect(web.provider).toBe("serpapi");
    expect(web.capabilities).toMatchObject({
      answer: false,
      images: true,
      read: false,
      research: false,
      search: true,
      usage: true,
    });
  });

  it("needs a key", () => {
    vi.stubEnv("SERPAPI_API_KEY", "");
    expect(() => serpapi()).toThrow(/SERPAPI_API_KEY/u);
    vi.unstubAllEnvs();
  });

  it("reads the key from the environment", async () => {
    vi.stubEnv("SERPAPI_API_KEY", "from-env");
    const { fetch, calls } = fakeFetch({ body: { search_metadata: metadata } });
    const web = new Fieldwork({ adapter: serpapi({ fetch }) });
    await web.search("x");
    expect(params(calls[0]).api_key).toBe("from-env");
    vi.unstubAllEnvs();
  });
});
