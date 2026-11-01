import { describe, expect, it } from "vitest";

import { browserbase } from "../../src/adapters/browserbase.js";
import { Fieldwork } from "../../src/index.js";
import { fakeFetch } from "../helpers.js";

const client = (
  replies: Parameters<typeof fakeFetch>,
  config: { projectId?: string } = {}
) => {
  const { fetch, calls } = fakeFetch(...replies);
  const web = new Fieldwork({
    adapter: browserbase({ apiKey: "bb-key", fetch, ...config }),
  });
  return { calls, web };
};

describe("browserbase adapter", () => {
  it("has exactly the capabilities Browserbase offers", () => {
    const { web } = client([]);
    const offered = ["search", "read", "browser", "usage"] as const;
    const lacking = ["act", "extract", "research", "crawl"] as const;
    expect(offered.map((name) => web.providerFor(name))).toStrictEqual(
      offered.map(() => "browserbase")
    );
    expect(lacking.some((name) => web.supports(name))).toBe(false);
  });

  describe("search", () => {
    it("sends the query with the Browserbase key header", async () => {
      const { web, calls } = client([
        { body: { query: "q", requestId: "r1", results: [] } },
      ]);
      await web.search("browserbase", {
        limit: 5,
        mode: "deep-lite",
        provider: "exa",
      });
      expect(calls[0]?.method).toBe("POST");
      expect(calls[0]?.url.pathname).toBe("/v1/search");
      expect(calls[0]?.headers["x-bb-api-key"]).toBe("bb-key");
      expect(calls[0]?.body).toStrictEqual({
        mode: "deep-lite",
        numResults: 5,
        provider: "exa",
        query: "browserbase",
      });
    });

    it("sends only the query when no options are set", async () => {
      const { web, calls } = client([
        { body: { requestId: "r", results: [] } },
      ]);
      await web.search("x");
      expect(calls[0]?.body).toStrictEqual({ query: "x" });
    });

    it("normalizes results and meta", async () => {
      const { web } = client([
        {
          body: {
            query: "q",
            requestId: "req-1",
            results: [
              {
                author: "Ann",
                favicon: "https://a.example/f.ico",
                id: "a",
                image: "https://a.example/i.png",
                publishedDate: "2026-01-02T00:00:00Z",
                title: "A",
                url: "https://a.example",
              },
              { id: "b", title: "B", url: "https://b.example" },
            ],
          },
        },
      ]);
      const response = await web.search("q");
      expect(response.results).toStrictEqual([
        {
          author: "Ann",
          favicon: "https://a.example/f.ico",
          image: "https://a.example/i.png",
          publishedAt: "2026-01-02T00:00:00Z",
          title: "A",
          url: "https://a.example",
        },
        { title: "B", url: "https://b.example" },
      ]);
      expect(response.meta).toStrictEqual({ requestId: "req-1" });
      expect(response.raw).toMatchObject({ requestId: "req-1" });
    });

    it("refuses a mode without a provider before sending", async () => {
      const { web, calls } = client([]);
      // @ts-expect-error mode needs provider
      await expect(web.search("q", { mode: "fast" })).rejects.toMatchObject({
        code: "InvalidRequest",
      });
      expect(calls).toHaveLength(0);
    });

    it("refuses a mode the provider does not offer before sending", async () => {
      const { web, calls } = client([]);
      await expect(
        // @ts-expect-error parallel has no deep mode
        web.search("q", { mode: "deep", provider: "parallel" })
      ).rejects.toMatchObject({ code: "InvalidRequest" });
      expect(calls).toHaveLength(0);
    });

    it("maps a rate limit to RateLimited with retry-after", async () => {
      const { web } = client([
        {
          body: {
            error: "Too Many Requests",
            message: "slow",
            statusCode: 429,
          },
          headers: { "retry-after": "7" },
          status: 429,
        },
      ]);
      await expect(web.search("q")).rejects.toMatchObject({
        code: "RateLimited",
        retryAfter: 7,
        retryable: true,
      });
    });
  });

  describe("read", () => {
    it("fetches Markdown by default", async () => {
      const { web, calls } = client([
        {
          body: {
            content: "# Hi",
            contentType: "text/html",
            encoding: "utf-8",
            headers: {},
            id: "f1",
            statusCode: 200,
          },
        },
      ]);
      await web.read("https://example.com");
      expect(calls[0]?.method).toBe("POST");
      expect(calls[0]?.url.pathname).toBe("/v1/fetch");
      expect(calls[0]?.body).toStrictEqual({
        format: "markdown",
        url: "https://example.com",
      });
    });

    it("sends every fetch option", async () => {
      const { web, calls } = client([
        {
          body: {
            content: "x",
            contentType: "text/html",
            encoding: "utf-8",
            headers: {},
            id: "f",
            statusCode: 200,
          },
        },
      ]);
      await web.read("https://example.com", {
        allowInsecureSsl: true,
        allowRedirects: true,
        contextId: "ctx-1",
        proxies: {
          geolocation: { city: "New York", country: "US", state: "NY" },
        },
      });
      expect(calls[0]?.body).toStrictEqual({
        allowInsecureSsl: true,
        allowRedirects: true,
        contextId: "ctx-1",
        format: "markdown",
        proxies: {
          geolocation: { city: "New York", country: "US", state: "NY" },
        },
        url: "https://example.com",
      });
    });

    it("turns country into a proxy geolocation", async () => {
      const { web, calls } = client([
        {
          body: {
            content: "x",
            contentType: "text/plain",
            encoding: "utf-8",
            headers: {},
            id: "f",
            statusCode: 200,
          },
        },
      ]);
      await web.read("https://example.com", { country: "gb" });
      expect(calls[0]?.body).toMatchObject({
        proxies: { geolocation: { country: "GB" } },
      });
    });

    it("refuses country with proxies before sending", async () => {
      const { web, calls } = client([]);
      await expect(
        web.read("https://example.com", { country: "GB", proxies: true })
      ).rejects.toMatchObject({ code: "InvalidRequest" });
      expect(calls).toHaveLength(0);
    });

    it("refuses a proxy state outside the US before sending", async () => {
      const { web, calls } = client([]);
      await expect(
        web.read("https://example.com", {
          proxies: { geolocation: { country: "GB", state: "NY" } },
        })
      ).rejects.toMatchObject({ code: "InvalidRequest" });
      expect(calls).toHaveLength(0);
    });

    it("normalizes a Markdown page with meta", async () => {
      const { web } = client([
        {
          body: {
            content: "# Title",
            contentType: "text/html",
            encoding: "utf-8",
            headers: { "Content-Type": "text/html" },
            id: "fetch-9",
            statusCode: 200,
          },
        },
      ]);
      const page = await web.read("https://example.com");
      expect(page).toMatchObject({
        markdown: "# Title",
        meta: { requestId: "fetch-9" },
        statusCode: 200,
        url: "https://example.com",
      });
      expect(page.rawHtml).toBeUndefined();
      expect(page.raw).toMatchObject({ id: "fetch-9" });
    });

    it("returns raw HTML as rawHtml, and other types only in raw", async () => {
      const html = client([
        {
          body: {
            content: "<p>x</p>",
            contentType: "text/html; charset=utf-8",
            encoding: "utf-8",
            headers: {},
            id: "1",
            statusCode: 200,
          },
        },
      ]);
      const page = await html.web.read("https://example.com", {
        format: "raw",
      });
      expect(html.calls[0]?.body).toMatchObject({ format: "raw" });
      expect(page.rawHtml).toBe("<p>x</p>");
      expect(page.markdown).toBeUndefined();

      const json = client([
        {
          body: {
            content: '{"a":1}',
            contentType: "application/json",
            encoding: "utf-8",
            headers: {},
            id: "2",
            statusCode: 200,
          },
        },
      ]);
      const data = await json.web.read("https://example.com/a.json", {
        format: "raw",
      });
      expect(data.rawHtml).toBeUndefined();
      expect(data.raw).toMatchObject({ content: '{"a":1}' });
    });

    it("warns about binary content instead of mapping it", async () => {
      const { web } = client([
        {
          body: {
            content: "AAEC",
            contentType: "image/png",
            encoding: "base64",
            headers: {},
            id: "3",
            statusCode: 200,
          },
        },
      ]);
      const page = await web.read("https://example.com/i.png", {
        format: "raw",
      });
      expect(page.markdown).toBeUndefined();
      expect(page.rawHtml).toBeUndefined();
      expect(page.meta?.warnings).toHaveLength(1);
    });

    it("keeps the upstream status code when the page itself failed", async () => {
      const { web } = client([
        {
          body: {
            content: "not found",
            contentType: "text/html",
            encoding: "utf-8",
            headers: {},
            id: "4",
            statusCode: 404,
          },
        },
      ]);
      const page = await web.read("https://example.com/x");
      expect(page.statusCode).toBe(404);
    });

    it("maps a 502 (too large) to a provider error", async () => {
      const { web } = client([
        {
          body: {
            error: "Bad Gateway",
            message:
              "The response body exceeded the maximum allowed size of 5MB.",
            statusCode: 502,
          },
          status: 502,
        },
      ]);
      await expect(web.read("https://example.com")).rejects.toMatchObject({
        code: "ProviderError",
        retryable: true,
        status: 502,
      });
    });
  });

  describe("browser", () => {
    const created = {
      connectUrl: "wss://connect.browserbase.com?signingKey=k",
      expiresAt: "2026-11-01T12:00:00.000Z",
      id: "sess-1",
      seleniumRemoteUrl: "https://connect.browserbase.com/webdriver",
      signingKey: "k",
      status: "RUNNING",
    };

    it("creates a session with every option in Browserbase's shape", async () => {
      const { web, calls } = client(
        [
          { body: created, status: 201 },
          {
            body: {
              debuggerFullscreenUrl: "https://live/full",
              debuggerUrl: "https://live/d",
              pages: [],
              wsUrl: "wss://x",
            },
          },
        ],
        { projectId: "proj-1" }
      );
      await web.browser.open({
        allowedDomains: ["example.com"],
        blockAds: true,
        context: { id: "ctx-1", persist: true },
        extensionId: "ext-1",
        ignoreCertificateErrors: true,
        keepAlive: true,
        logSession: false,
        os: "mac",
        proxies: [
          {
            domainPattern: "*.example.com",
            geolocation: { city: "London", country: "GB" },
            type: "browserbase",
          },
        ],
        recordSession: false,
        region: "eu-central-1",
        riskPolicyId: "policy-1",
        solveCaptchas: false,
        ttl: 900,
        userMetadata: { job: "a" },
        verified: true,
        viewport: { height: 800, width: 1280 },
      });
      expect(calls[0]?.method).toBe("POST");
      expect(calls[0]?.url.pathname).toBe("/v1/sessions");
      expect(calls[0]?.headers["x-bb-api-key"]).toBe("bb-key");
      expect(calls[0]?.body).toStrictEqual({
        browserSettings: {
          allowedDomains: ["example.com"],
          blockAds: true,
          context: { id: "ctx-1", persist: true },
          extensionId: "ext-1",
          ignoreCertificateErrors: true,
          logSession: false,
          os: "mac",
          recordSession: false,
          riskPolicyId: "policy-1",
          solveCaptchas: false,
          verified: true,
          viewport: { height: 800, width: 1280 },
        },
        keepAlive: true,
        projectId: "proj-1",
        proxies: [
          {
            domainPattern: "*.example.com",
            geolocation: { city: "London", country: "GB" },
            type: "browserbase",
          },
        ],
        region: "eu-central-1",
        timeout: 900,
        userMetadata: { job: "a" },
      });
    });

    it("sends an empty body when nothing is set and no project is known", async () => {
      const { web, calls } = client([
        { body: created, status: 201 },
        { body: { debuggerFullscreenUrl: "https://live/full", pages: [] } },
      ]);
      await web.browser.open();
      expect(calls[0]?.body).toStrictEqual({});
    });

    it("returns the connection URL, live view URL and expiry", async () => {
      const { web, calls } = client([
        { body: created, status: 201 },
        {
          body: {
            debuggerFullscreenUrl: "https://live/full",
            debuggerUrl: "https://live/d",
            pages: [],
            wsUrl: "wss://x",
          },
        },
      ]);
      const session = await web.browser.open();
      expect(calls[1]?.method).toBe("GET");
      expect(calls[1]?.url.pathname).toBe("/v1/sessions/sess-1/debug");
      expect(session).toMatchObject({
        cdpUrl: created.connectUrl,
        expiresAt: created.expiresAt,
        id: "sess-1",
        liveViewUrl: "https://live/full",
      });
      expect(session.meta).toBeUndefined();
      expect(session.raw).toMatchObject({ id: "sess-1", signingKey: "k" });
    });

    it("still returns the session when the live view lookup fails", async () => {
      const { web } = client([
        { body: created, status: 201 },
        { body: { message: "boom" }, status: 500 },
      ]);
      const session = await web.browser.open();
      expect(session.id).toBe("sess-1");
      expect(session.liveViewUrl).toBeUndefined();
      expect(session.meta?.warnings?.[0]).toContain("live view");
    });

    it("fails when the provider returns no session id", async () => {
      const { web } = client([{ body: {}, status: 201 }]);
      await expect(web.browser.open()).rejects.toMatchObject({
        code: "ProviderError",
      });
    });

    it("closes a session by requesting its release", async () => {
      const { web, calls } = client([
        { body: { id: "sess-1", status: "COMPLETED" } },
      ]);
      await expect(web.browser.close("sess-1")).resolves.toBeUndefined();
      expect(calls[0]?.method).toBe("POST");
      expect(calls[0]?.url.pathname).toBe("/v1/sessions/sess-1");
      expect(calls[0]?.body).toStrictEqual({ status: "REQUEST_RELEASE" });
    });

    it("reports a session that does not exist", async () => {
      const { web } = client([
        { body: { message: "no session" }, status: 404 },
      ]);
      await expect(web.browser.close("nope")).rejects.toMatchObject({
        code: "NotFound",
      });
    });
  });

  describe("usage", () => {
    it("reads the configured project's usage", async () => {
      const { web, calls } = client(
        [{ body: { browserMinutes: 42, proxyBytes: 1024 } }],
        { projectId: "proj-1" }
      );
      const usage = await web.usage();
      expect(calls).toHaveLength(1);
      expect(calls[0]?.method).toBe("GET");
      expect(calls[0]?.url.pathname).toBe("/v1/projects/proj-1/usage");
      expect(usage.breakdown).toStrictEqual({
        browserMinutes: 42,
        proxyBytes: 1024,
      });
      expect(usage.raw).toStrictEqual({ browserMinutes: 42, proxyBytes: 1024 });
    });

    it("uses the key's only project when none is configured", async () => {
      const { web, calls } = client([
        { body: [{ id: "only", name: "p" }] },
        { body: { browserMinutes: 1, proxyBytes: 0 } },
      ]);
      await web.usage();
      expect(calls[0]?.url.pathname).toBe("/v1/projects");
      expect(calls[1]?.url.pathname).toBe("/v1/projects/only/usage");
    });

    it("asks for a project id when the key has several", async () => {
      const { web, calls } = client([{ body: [{ id: "a" }, { id: "b" }] }]);
      await expect(web.usage()).rejects.toMatchObject({
        code: "InvalidRequest",
      });
      expect(calls).toHaveLength(1);
    });
  });

  it("refuses to build without an API key", () => {
    const saved = process.env.BROWSERBASE_API_KEY;
    delete process.env.BROWSERBASE_API_KEY;
    try {
      expect(() => browserbase()).toThrow(/BROWSERBASE_API_KEY/u);
    } finally {
      if (saved !== undefined) {
        process.env.BROWSERBASE_API_KEY = saved;
      }
    }
  });
});
