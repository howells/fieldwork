import { describe, expect, it } from "vitest";

import { kernel } from "../../src/adapters/kernel.js";
import { Fieldwork } from "../../src/index.js";
import { fakeFetch, nth } from "../helpers.js";

const client = (...replies: Parameters<typeof fakeFetch>) => {
  const { fetch, calls } = fakeFetch(...replies);
  const web = new Fieldwork({
    adapter: kernel({ apiKey: "kernel-key", fetch, retries: 0 }),
  });
  return { calls, web };
};

const URL_READ = "https://shop.test/tile";
const HTML =
  '<html><head><title>Tile</title><script>var x = 1;</script><style>p{}</style></head><body><header><nav><a href="/">Shop</a></nav></header><h1>Portmore Sand</h1><p>Size: <strong>3x8</strong></p><ul><li>Glossy</li></ul><footer>Contact</footer></body></html>';

const created = { body: { cdp_ws_url: "wss://cdp.test", session_id: "s1" } };
const executed = (result: Record<string, string | number>) => ({
  body: { result, success: true },
});
// Kernel answers 204; the fake cannot build a 204 with a body, so an empty 200 stands in.
const deleted = { text: "" };
const billed = { body: { usage: { uptime_ms: 4200 }, usage_status: "ready" } };

/** A read whose session reports its billed time on the second check. */
const readPage = async () => {
  const { web, calls } = client(
    created,
    executed({ html: HTML, status: 200, title: "Tile", url: URL_READ }),
    deleted,
    { body: { usage_status: "pending" } },
    billed
  );
  const page = await web.read(URL_READ, {
    profile: { name: "brand" },
    stealth: true,
  });
  return { calls, page };
};

describe("kernel adapter", () => {
  it("has exactly the capabilities Kernel offers", () => {
    const { web } = client();
    expect(web.providerFor("read")).toBe("kernel");
    expect(web.providerFor("browser")).toBe("kernel");
    const lacking = ["search", "act", "extract", "crawl", "usage"] as const;
    expect(lacking.some((name) => web.supports(name))).toBe(false);
  });

  describe("read", () => {
    it("creates a headless browser with the Kernel key", async () => {
      const { calls } = await readPage();
      const create = nth(calls, 0);
      expect(create.method).toBe("POST");
      expect(create.url.href).toBe("https://api.onkernel.com/browsers");
      expect(create.headers.authorization).toBe("Bearer kernel-key");
      expect(create.body).toStrictEqual({
        headless: true,
        profile: { name: "brand" },
        stealth: true,
        timeout_seconds: 60,
      });
    });

    it("loads the page with Playwright, then deletes the browser and reads its billed time", async () => {
      const { calls } = await readPage();
      expect(nth(calls, 1).url.pathname).toBe(
        "/browsers/s1/playwright/execute"
      );
      expect(nth(calls, 1).body).toMatchObject({
        code: expect.stringContaining(`page.goto("${URL_READ}"`),
        timeout_sec: 120,
      });
      expect(nth(calls, 2).method).toBe("DELETE");
      expect(nth(calls, 2).url.pathname).toBe("/browsers/s1");
      expect(nth(calls, 3).url.search).toBe("?include_deleted=true");
    });

    it("returns the rendered page as Markdown with the billed time", async () => {
      const { page } = await readPage();
      expect(page.markdown).toBe(
        "# Portmore Sand\n\nSize: **3x8**\n\n-   Glossy"
      );
      expect(page).toMatchObject({
        statusCode: 200,
        title: "Tile",
        url: URL_READ,
      });
      expect(page.rawHtml).toBeUndefined();
      expect(page.meta).toStrictEqual({
        requestId: "s1",
        usage: { units: { uptime_ms: 4200 } },
      });
      expect(page.raw).toMatchObject({ browser: { session_id: "s1" } });
    });

    it("returns the rendered HTML when format is raw", async () => {
      const { web } = client(
        created,
        executed({ html: HTML, status: 200 }),
        deleted,
        billed
      );
      const page = await web.read(URL_READ, { format: "raw" });
      expect(page.rawHtml).toBe(HTML);
      expect(page.markdown).toBeUndefined();
    });

    it("deletes the browser and fails when the script fails", async () => {
      const { web, calls } = client(
        created,
        {
          body: {
            error: "page.goto: Timeout 90000ms exceeded.",
            success: false,
          },
        },
        deleted
      );
      await expect(web.read(URL_READ)).rejects.toMatchObject({
        code: "ProviderError",
        message: expect.stringContaining("Timeout 90000ms exceeded"),
      });
      expect(nth(calls, 2).method).toBe("DELETE");
      expect(calls).toHaveLength(3);
    });

    it("names the browser it could not delete after a failure", async () => {
      const { web } = client(
        created,
        { body: { error: "boom", success: false } },
        { body: { message: "down" }, status: 500 }
      );
      await expect(web.read(URL_READ)).rejects.toMatchObject({
        message: expect.stringContaining("could not delete browser s1"),
      });
    });

    it("fails as NotFound when the page answers 404", async () => {
      const { web } = client(
        created,
        executed({ html: "<p>gone</p>", status: 404 }),
        deleted,
        billed
      );
      await expect(web.read(URL_READ)).rejects.toMatchObject({
        code: "NotFound",
      });
    });

    it("warns rather than fails when the billed time cannot be read", async () => {
      const { web } = client(
        created,
        executed({ html: HTML, status: 200 }),
        deleted,
        { body: { message: "nope" }, status: 403 }
      );
      const page = await web.read(URL_READ);
      expect(page.markdown).toContain("Portmore Sand");
      expect(page.meta?.warnings?.[0]).toMatch(/billed time/u);
      expect(page.meta?.usage).toBeUndefined();
    });
  });

  describe("browser", () => {
    it("opens a session with Kernel's option names", async () => {
      const { web, calls } = client({
        body: {
          browser_live_view_url: "https://live.test/s2",
          cdp_ws_url: "wss://cdp.test/s2",
          session_id: "s2",
        },
      });
      const session = await web.browser.open({
        idleTimeout: 300,
        profile: { id: "p1", saveChanges: true },
        proxy: { mode: "direct" },
        stealth: true,
        viewport: { height: 800, width: 1280 },
      });
      expect(nth(calls, 0).body).toStrictEqual({
        profile: { id: "p1", save_changes: true },
        proxy: { mode: "direct" },
        stealth: true,
        timeout_seconds: 300,
        viewport: { height: 800, width: 1280 },
      });
      expect(session).toStrictEqual({
        cdpUrl: "wss://cdp.test/s2",
        id: "s2",
        liveViewUrl: "https://live.test/s2",
        raw: {
          browser_live_view_url: "https://live.test/s2",
          cdp_ws_url: "wss://cdp.test/s2",
          session_id: "s2",
        },
      });
    });

    it("fails when Kernel returns no session id", async () => {
      const { web } = client({ body: { cdp_ws_url: "wss://x" } });
      await expect(web.browser.open()).rejects.toMatchObject({
        code: "ProviderError",
      });
    });

    it("closes a session by deleting it", async () => {
      const { web, calls } = client(deleted);
      await web.browser.close("s/3");
      expect(nth(calls, 0).method).toBe("DELETE");
      expect(nth(calls, 0).url.pathname).toBe("/browsers/s%2F3");
    });
  });

  it("needs a key", () => {
    expect(() => kernel({ apiKey: "" })).toThrow(/KERNEL_API_KEY/u);
  });
});
