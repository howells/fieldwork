import { afterEach, describe, expect, it, vi } from "vitest";

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

/**
 * A Kernel client whose fetch fails as a real one does when its signal has
 * stopped, and that records the signal each request was sent with. The
 * controller aborts just before request number `abortBefore` is sent.
 */
const stoppedAt = (
  controller: AbortController,
  abortBefore: number,
  ...replies: Parameters<typeof fakeFetch>
) => {
  const fake = fakeFetch(...replies);
  const signals: (AbortSignal | undefined)[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    if (signals.length === abortBefore) {
      controller.abort();
    }
    signals.push(init?.signal ?? undefined);
    if (init?.signal?.aborted === true) {
      throw init.signal.reason;
    }
    return await fake.fetch(input, init);
  };
  const web = new Fieldwork({
    adapter: kernel({ apiKey: "kernel-key", fetch, retries: 0 }),
  });
  return { calls: fake.calls, signals, web };
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

/** The Markdown `read` makes of the HTML. */
const markdownFor = async (html: string) => {
  const { web } = client(
    created,
    executed({ html, status: 200 }),
    deleted,
    billed
  );
  const page = await web.read(URL_READ);
  return page.markdown;
};

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
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("markdown", () => {
    it("keeps the header and aside of an article", async () => {
      const markdown = await markdownFor(
        "<article><header><h1>Real Title</h1><p>By Ann</p></header><p>Body</p></article><aside><h2>Specs</h2><p>3x8 mm</p></aside>"
      );
      expect(markdown).toBe("# Real Title\n\nBy Ann\n\nBody");
    });

    it("keeps an aside inside main", async () => {
      const markdown = await markdownFor(
        "<main><p>Body</p><aside><h2>Specs</h2><p>3x8 mm</p></aside></main>"
      );
      expect(markdown).toBe("Body\n\n## Specs\n\n3x8 mm");
    });

    it("leaves out the site's header, nav, footer and aside beside main", async () => {
      const markdown = await markdownFor(
        '<header><a href="/">Shop</a></header><nav><a href="/tiles">Tiles</a></nav><main><p>Body</p></main><aside>Offers</aside><footer>Contact</footer>'
      );
      expect(markdown).toBe("Body");
    });
  });

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

    it("names the browser it could not delete after a failure, keeping the failure's code", async () => {
      const { web } = client(
        created,
        {
          body: { message: "slow down" },
          headers: { "retry-after": "7" },
          status: 429,
        },
        { body: { message: "down" }, status: 500 }
      );
      await expect(web.read(URL_READ)).rejects.toMatchObject({
        cause: { code: "RateLimited", status: 429 },
        code: "RateLimited",
        message: expect.stringContaining(
          "could not delete browser s1, which bills until its 60-second idle timeout"
        ),
        provider: "kernel",
        retryAfter: 7,
        retryable: true,
        status: 429,
      });
    });

    it("rethrows the failure unchanged when Kernel says the browser is already gone", async () => {
      const { web, calls } = client(
        created,
        { body: { error: "boom", success: false } },
        { body: { message: "no such browser" }, status: 404 }
      );
      await expect(web.read(URL_READ)).rejects.toMatchObject({
        code: "ProviderError",
        message: "kernel could not load https://shop.test/tile: boom",
      });
      expect(calls).toHaveLength(3);
    });

    it("returns the page when the browser is already gone", async () => {
      const { web, calls } = client(
        created,
        executed({ html: HTML, status: 200 }),
        { body: { message: "gone" }, status: 410 },
        billed
      );
      const page = await web.read(URL_READ);
      expect(page.markdown).toContain("Portmore Sand");
      expect(page.meta).toStrictEqual({
        requestId: "s1",
        usage: { units: { uptime_ms: 4200 } },
      });
      expect(calls).toHaveLength(4);
    });

    it("returns the page with a warning when the browser cannot be deleted, and skips the billed time", async () => {
      const { web, calls } = client(
        created,
        executed({ html: HTML, status: 200 }),
        { body: { message: "down" }, status: 500 }
      );
      const page = await web.read(URL_READ);
      expect(page.markdown).toContain("Portmore Sand");
      expect(page.meta?.warnings).toStrictEqual([
        "could not delete browser s1, which bills until its 60-second idle timeout: kernel DELETE /browsers/s1 returned 500: down",
      ]);
      expect(page.meta?.usage).toBeUndefined();
      expect(calls).toHaveLength(3);
    });

    it("deletes the browser and returns the page when the call is stopped after the page was read", async () => {
      const controller = new AbortController();
      const { web, calls, signals } = stoppedAt(
        controller,
        2,
        created,
        executed({ html: HTML, status: 200 }),
        deleted
      );
      const page = await web.read(URL_READ, { signal: controller.signal });
      expect(page.markdown).toContain("Portmore Sand");
      expect(nth(calls, 2).method).toBe("DELETE");
      expect(nth(signals, 2)?.aborted).toBe(false);
      expect(page.meta?.warnings?.[0]).toMatch(/billed time/u);
    });

    it("deletes the browser and rethrows Aborted when the call is stopped during the read", async () => {
      const controller = new AbortController();
      const { web, calls } = stoppedAt(controller, 1, created, deleted);
      await expect(
        web.read(URL_READ, { signal: controller.signal })
      ).rejects.toMatchObject({
        code: "Aborted",
        message: "kernel request stopped: cancelled",
      });
      expect(nth(calls, 1).method).toBe("DELETE");
      expect(calls).toHaveLength(2);
    });

    it("gives the delete a deadline of its own when the call has none", async () => {
      const { web, signals } = stoppedAt(
        new AbortController(),
        -1,
        created,
        executed({ html: HTML, status: 200 }),
        deleted,
        billed
      );
      await web.read(URL_READ);
      expect(nth(signals, 2)).toBeInstanceOf(AbortSignal);
    });

    it("deletes nothing when Kernel returns no session id", async () => {
      const { web, calls } = client({ body: { cdp_ws_url: "wss://x" } });
      await expect(web.read(URL_READ)).rejects.toMatchObject({
        code: "ProviderError",
        message: "kernel did not return a job id",
      });
      expect(calls).toHaveLength(1);
    });

    it("repeats the script after a 5xx but never the session create", async () => {
      const { web, calls } = client(
        created,
        { body: { message: "busy" }, status: 503 },
        executed({ html: HTML, status: 200 }),
        deleted,
        billed
      );
      const page = await web.read(URL_READ, { retries: 1 });
      expect(page.markdown).toContain("Portmore Sand");
      expect(nth(calls, 2).url.pathname).toBe(
        "/browsers/s1/playwright/execute"
      );
      const failedCreate = client({ body: { message: "busy" }, status: 503 });
      await expect(
        failedCreate.web.read(URL_READ, { retries: 1 })
      ).rejects.toMatchObject({ status: 503 });
      expect(failedCreate.calls).toHaveLength(1);
    });

    it("refuses a URL that is not http or https before creating a browser", async () => {
      const { web, calls } = client();
      await expect(web.read("file:///etc/passwd")).rejects.toMatchObject({
        code: "InvalidRequest",
        message: expect.stringContaining("file:"),
      });
      await expect(web.read("not a url")).rejects.toMatchObject({
        code: "InvalidRequest",
      });
      expect(calls).toHaveLength(0);
    });

    it("fails, after deleting the browser, when the script returns no HTML", async () => {
      const execute = { result: null, success: true };
      const { web, calls } = client(created, { body: execute }, deleted);
      await expect(web.read(URL_READ)).rejects.toMatchObject({
        cause: execute,
        code: "ProviderError",
        message: expect.stringContaining("returned no HTML"),
      });
      expect(nth(calls, 2).method).toBe("DELETE");
      expect(calls).toHaveLength(3);
    });

    it("warns when the rendered page has no text", async () => {
      const { web } = client(
        created,
        executed({
          html: "<html><body><script>x()</script></body></html>",
          status: 200,
        }),
        deleted,
        billed
      );
      const page = await web.read(URL_READ);
      expect(page.markdown).toBe("");
      expect(page.meta?.warnings).toStrictEqual([
        "kernel rendered https://shop.test/tile but it has no text to convert to Markdown",
      ]);
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

    it("says plainly when Kernel does not report the billed time in time", async () => {
      vi.useFakeTimers();
      const pending = { body: { usage_status: "pending" } };
      const { web } = client(
        created,
        executed({ html: HTML, status: 200 }),
        deleted,
        ...Array.from({ length: 40 }, () => pending)
      );
      const reading = web.read(URL_READ);
      await vi.advanceTimersByTimeAsync(16_000);
      const page = await reading;
      expect(page.meta?.warnings).toStrictEqual([
        "kernel did not report the session's billed time within 15 seconds",
      ]);
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
