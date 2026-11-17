import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { browserbase } from "../../src/adapters/browserbase.js";
import { exa } from "../../src/adapters/exa.js";
import { firecrawl } from "../../src/adapters/firecrawl.js";
import { kernel } from "../../src/adapters/kernel.js";
import { Fieldwork } from "../../src/index.js";
import { fakeFetch, nth } from "../helpers.js";

/** A real provider response, recorded 2026-11-17: `firecrawl` and `browserbase-*` download W3C's dummy.pdf (cookies and request ids removed), `firecrawl-html` scrapes example.com. */
const recorded = (name: string) => ({
  text: readFileSync(
    new URL(`fixtures/download-${name}.json`, import.meta.url),
    "utf-8"
  ),
});

const PDF_URL =
  "http://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
const FINAL_URL = PDF_URL.replace("http:", "https:");
const PDF_SHA256 =
  "3df79d34abbca99308e79cb94461c1893582604d68329a41fd4bec1885e6adb4";

const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

const firecrawlWith = (...replies: Parameters<typeof fakeFetch>) => {
  const { fetch, calls } = fakeFetch(...replies);
  return {
    calls,
    web: new Fieldwork({
      adapter: firecrawl({ apiKey: "fc-key", fetch, retries: 0 }),
    }),
  };
};

const browserbaseWith = (...replies: Parameters<typeof fakeFetch>) => {
  const { fetch, calls } = fakeFetch(...replies);
  return {
    calls,
    web: new Fieldwork({
      adapter: browserbase({ apiKey: "bb-key", fetch, retries: 0 }),
    }),
  };
};

const created = { body: { session_id: "s1" } };
const deleted = { text: "" };
const billed = { body: { usage: { uptime_ms: 2100 }, usage_status: "ready" } };

const kernelWith = (...replies: Parameters<typeof fakeFetch>) => {
  const { fetch, calls } = fakeFetch(...replies);
  return {
    calls,
    web: new Fieldwork({
      adapter: kernel({ apiKey: "kernel-key", fetch, retries: 0 }),
    }),
  };
};

describe("firecrawl download", () => {
  it("scrapes the file as rawBase64 with no parser and returns its bytes", async () => {
    const { calls, web } = firecrawlWith(recorded("firecrawl"));
    const file = await web.download(PDF_URL, { maxAge: 0, proxy: "basic" });
    expect(nth(calls, 0).body).toStrictEqual({
      formats: ["rawBase64"],
      maxAge: 0,
      parsers: [],
      proxy: "basic",
      url: PDF_URL,
    });
    expect(sha256(file.bytes)).toBe(PDF_SHA256);
    expect(file).toMatchObject({
      contentType: "application/pdf; qs=0.001",
      meta: { usage: { credits: 1 } },
      size: 13_264,
      statusCode: 200,
      url: FINAL_URL,
    });
  });

  it("reports Firecrawl's size refusal as TooLarge", async () => {
    const refusal = {
      body: {
        code: "SCRAPE_UNSUPPORTED_FILE_ERROR",
        error:
          "The URL returned a file type that Firecrawl cannot process: File exceeds size limit of 50 MiB.",
        success: false,
      },
      status: 500,
    };
    const { web } = firecrawlWith(refusal, refusal);
    await expect(web.download(PDF_URL)).rejects.toMatchObject({
      code: "TooLarge",
      retryable: false,
    });
    // Firecrawl refused the scrape and billed nothing.
    await expect(web.download(PDF_URL)).rejects.not.toHaveProperty(
      "meta.usage"
    );
  });

  it("refuses a file over maxBytes", async () => {
    const { web } = firecrawlWith(recorded("firecrawl"));
    await expect(
      web.download(PDF_URL, { maxBytes: 1000 })
    ).rejects.toMatchObject({
      code: "TooLarge",
      message: expect.stringContaining("13264 bytes"),
      meta: { usage: { credits: 1 } },
    });
  });

  it("refuses a web page as NotAFile, with the credit Firecrawl billed for it", async () => {
    // https://example.com/ scraped with rawBase64, recorded 2026-11-17.
    const { web } = firecrawlWith(recorded("firecrawl-html"));
    await expect(web.download("https://example.com/")).rejects.toMatchObject({
      code: "NotAFile",
      meta: { usage: { credits: 1 } },
    });
  });

  it("refuses a missing file as NotFound", async () => {
    const { web } = firecrawlWith({
      body: {
        data: {
          metadata: { contentType: "application/pdf", statusCode: 404 },
          rawBase64: "",
        },
        success: true,
      },
    });
    await expect(web.download(PDF_URL)).rejects.toMatchObject({
      code: "NotFound",
    });
  });

  it("refuses maxBytes above the ceiling and non-http URLs before sending", async () => {
    const { calls, web } = firecrawlWith();
    await expect(
      web.download(PDF_URL, { maxBytes: 51 * 1024 * 1024 })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    await expect(web.download("ftp://example.com/a.pdf")).rejects.toMatchObject(
      { code: "InvalidRequest" }
    );
    expect(calls).toHaveLength(0);
  });

  it("carries no usage on an error before the scrape", async () => {
    const { web } = firecrawlWith();
    await expect(
      web.download("ftp://example.com/a.pdf")
    ).rejects.not.toHaveProperty("meta.usage");
  });
});

describe("browserbase download", () => {
  it("follows the redirect with a second Fetch and returns the final URL", async () => {
    const { calls, web } = browserbaseWith(
      recorded("browserbase-301"),
      recorded("browserbase-200")
    );
    const file = await web.download(PDF_URL, { country: "gb" });
    expect(calls.map((call) => call.body)).toStrictEqual([
      {
        allowRedirects: false,
        format: "raw",
        proxies: { geolocation: { country: "GB" } },
        url: PDF_URL,
      },
      {
        allowRedirects: false,
        format: "raw",
        proxies: { geolocation: { country: "GB" } },
        url: FINAL_URL,
      },
    ]);
    expect(sha256(file.bytes)).toBe(PDF_SHA256);
    expect(file).toMatchObject({
      contentType: "application/pdf; qs=0.001",
      etag: '"33d0-438b181451e00"',
      lastModified: "Mon, 27 Aug 2007 17:15:36 GMT",
      size: 13_264,
      url: FINAL_URL,
    });
    expect(file.raw).toHaveLength(2);
  });

  it("returns a UTF-8 text file as its bytes", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg">é</svg>';
    const { web } = browserbaseWith({
      body: {
        content: svg,
        contentType: "image/svg+xml",
        encoding: "utf-8",
        headers: {},
        id: "f1",
        statusCode: 200,
      },
    });
    const file = await web.download("https://example.com/logo.svg");
    expect(new TextDecoder().decode(file.bytes)).toBe(svg);
    expect(file.size).toBe(new TextEncoder().encode(svg).byteLength);
  });

  it("reports Fetch's 5 MB refusal as TooLarge", async () => {
    const { web } = browserbaseWith({
      body: {
        error: "Bad Gateway",
        message:
          "The response body exceeded the maximum allowed size of 5MB. Use a browser session to handle large responses.",
        statusCode: 502,
      },
      status: 502,
    });
    await expect(web.download(PDF_URL)).rejects.toMatchObject({
      code: "TooLarge",
    });
  });

  it("stops after ten redirects", async () => {
    const loop = {
      body: {
        content: "",
        contentType: "text/html",
        encoding: "utf-8",
        headers: { Location: "/again" },
        statusCode: 302,
      },
    };
    const { calls, web } = browserbaseWith(
      ...Array.from({ length: 11 }, () => loop)
    );
    await expect(
      web.download("https://example.com/start")
    ).rejects.toMatchObject({
      code: "ProviderError",
    });
    expect(calls).toHaveLength(11);
  });
});

describe("kernel download", () => {
  it("fetches in a session with the limit in the script, deletes it and returns the bytes", async () => {
    const { calls, web } = kernelWith(
      created,
      recorded("kernel"),
      deleted,
      billed
    );
    const file = await web.download(PDF_URL, { maxBytes: 20_000 });
    expect(nth(calls, 1).body).toMatchObject({
      code: expect.stringContaining("context.request.get"),
    });
    expect(nth(calls, 1).body).toMatchObject({
      code: expect.stringContaining("> 20000"),
    });
    expect(nth(calls, 2).method).toBe("DELETE");
    expect(sha256(file.bytes)).toBe(PDF_SHA256);
    expect(file).toMatchObject({
      contentType: "application/pdf; qs=0.001",
      etag: '"33d0-438b181451e00"',
      meta: { requestId: "s1", usage: { units: { uptime_ms: 2100 } } },
      url: FINAL_URL,
    });
  });

  it("reports the script's size refusal as TooLarge, after deleting the session", async () => {
    const { calls, web } = kernelWith(
      created,
      {
        body: {
          result: {
            headers: { "content-type": "application/pdf" },
            status: 200,
            tooLarge: 60_000_000,
            url: FINAL_URL,
          },
          success: true,
        },
      },
      deleted,
      billed
    );
    await expect(web.download(PDF_URL)).rejects.toMatchObject({
      code: "TooLarge",
      meta: { requestId: "s1", usage: { units: { uptime_ms: 2100 } } },
    });
    expect(nth(calls, 2).method).toBe("DELETE");
  });

  it("refuses a 404 as NotFound", async () => {
    const { web } = kernelWith(
      created,
      {
        body: {
          result: { headers: { "content-type": "text/html" }, status: 404 },
          success: true,
        },
      },
      deleted,
      billed
    );
    await expect(web.download(PDF_URL)).rejects.toMatchObject({
      code: "NotFound",
    });
  });
});

describe("download on a provider without it", () => {
  it("is refused as Unsupported", async () => {
    const web = new Fieldwork({ adapter: exa({ apiKey: "exa-key" }) });
    expect(web.supports("download")).toBe(false);
    // @ts-expect-error Exa has no download, so the method does not exist on this instance.
    // oxlint-disable-next-line typescript/no-unsafe-call -- calling the missing method is the point of the test
    const attempt = web.download(PDF_URL);
    await expect(attempt).rejects.toMatchObject({ code: "Unsupported" });
  });
});
