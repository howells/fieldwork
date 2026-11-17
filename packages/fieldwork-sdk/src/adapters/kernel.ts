// The Kernel adapter: read (a page loaded in a real Chromium, so JavaScript
// runs) and browser sessions. A read creates a session, runs a script in it
// and deletes it whether or not the script succeeded, under a deadline of its
// own. kernel/response.ts holds the response schemas.

import TurndownService from "turndown";
import * as z from "zod/mini";

import { defineAdapter } from "../adapter.js";
import {
  byteLimit,
  checkFileUrl,
  header,
  MIB,
  presentFile,
  tooLarge,
} from "../download.js";
import { FieldworkError, invalidRequest } from "../errors.js";
import { createRawClient, requireKey, segment } from "../http.js";
import type { RawClient } from "../http.js";
import type {
  BrowserSession,
  CallOptions,
  DownloadedFile,
  DownloadOptions,
  Page,
} from "../types.js";
import {
  callSettings,
  compact,
  meta,
  presentPage,
  requireJobId,
} from "../util.js";
import {
  BrowserResponse,
  ExecuteResponse,
  FetchedFile,
  RenderedPage,
} from "./kernel/response.js";
import { inSession, sessionBody, sessionMeta } from "./kernel/session.js";

/** Settings for `kernel()`. */
export interface KernelConfig {
  /** Defaults to the KERNEL_API_KEY environment variable. */
  apiKey?: string;
  /** Defaults to https://api.onkernel.com. */
  baseUrl?: string;
  /** Defaults to the global `fetch`. A test passes a fake. */
  fetch?: typeof fetch;
  /** Repeats of a request that can succeed on repeat; 2 unless set. `0` turns retrying off. */
  retries?: number;
}

/** A saved browser profile (cookies, storage), by id or by name. */
export type KernelProfile =
  | { id: string; name?: undefined }
  | { name: string; id?: undefined };

/**
 * Where the browser's traffic leaves: a proxy of the project, by id or name,
 * or `direct` for no proxy. Without it, a stealth browser uses Kernel's
 * stealth proxy and any other browser goes direct.
 */
export type KernelProxy =
  | { id: string; name?: undefined; mode?: undefined }
  | { name: string; id?: undefined; mode?: undefined }
  | { mode: "direct"; id?: undefined; name?: undefined };

/**
 * Options for `read`, which loads an http or https URL in a new headless
 * browser, waits for it to render and deletes the browser. The session bills
 * for the seconds it ran, reported as `meta.usage.units.uptime_ms`. When the
 * browser cannot be deleted, the page still comes back, without the billed
 * time, and `meta.warnings` names the browser, which bills until its
 * 60-second idle timeout. Throws `InvalidRequest`, before creating a browser,
 * for a URL that is not http or https.
 */
export interface KernelReadOptions extends CallOptions {
  /**
   * "markdown" converts the rendered page to Markdown (`Page.markdown`),
   * leaving out the nav, header, footer and aside elements that are not
   * inside a main or article element; a page with neither loses all four.
   * "raw" returns the rendered HTML (`Page.rawHtml`). Defaults to "markdown".
   */
  format?: "markdown" | "raw";
  /** Kernel's stealth mode and CAPTCHA solver, for sites that block automated browsers. */
  stealth?: boolean;
  /** Load a saved profile's cookies and storage. The read never saves to it. */
  profile?: KernelProfile;
  proxy?: KernelProxy;
}

/** Options for `browser.open`. The session bills while it runs, until `browser.close` or its idle timeout. */
export interface KernelOpenOptions extends CallOptions {
  /** A browser without a screen: cheaper, but with no live view. Kernel defaults to false. */
  headless?: boolean;
  /** Kernel's stealth mode and CAPTCHA solver. */
  stealth?: boolean;
  /**
   * Seconds without a CDP or live-view connection before Kernel closes the
   * session, 10 to 259200. Kernel defaults to 60.
   */
  idleTimeout?: number;
  /** Load a saved profile; `saveChanges` writes this session's state back to it when the session ends. */
  profile?: KernelProfile & { saveChanges?: boolean };
  proxy?: KernelProxy;
  viewport?: { width: number; height: number };
  /** Start-Up and Enterprise plans only. Kernel defaults to us-east. */
  region?: "us-east" | "us-west" | "eu-west" | "ap-southeast";
}

/**
 * Options for `download`, which fetches the file with Playwright's request
 * client inside a new headless Kernel browser, without rendering a page, and
 * deletes the browser. The bytes never leave Kernel when the file is over
 * the limit. The session bills for the seconds it ran, reported as
 * `meta.usage.units.uptime_ms`. Kernel's ceiling here is 50 MiB.
 */
export interface KernelDownloadOptions extends DownloadOptions {
  /** Send a saved profile's cookies with the request. The download never saves to it. */
  profile?: KernelProfile;
}

/** What the Kernel adapter offers. */
export interface KernelOperations {
  read: (url: string, options?: KernelReadOptions) => Promise<Page>;
  /** Fetches a file's bytes inside a Kernel browser, up to 50 MiB. */
  download: (
    url: string,
    options?: KernelDownloadOptions
  ) => Promise<DownloadedFile>;
  browser: {
    open: (options?: KernelOpenOptions) => Promise<BrowserSession>;
    /** Deletes the session, so it stops billing. */
    close: (id: string, options?: CallOptions) => Promise<void>;
  };
}

/** Seconds Kernel gives the read script, within its 300-second limit. */
const READ_SCRIPT_SECONDS = 120;

/** The largest file `download` returns: what Kernel's script results carry reliably. */
const DOWNLOAD_CEILING = 50 * MIB;

/** Seconds Kernel gives the download script, within its 300-second limit. */
const DOWNLOAD_SCRIPT_SECONDS = 240;

/**
 * The Playwright script `download` runs in the browser's VM. It fetches with
 * the context's request client (the profile's cookies, no page), follows
 * redirects, and returns the body as Base64 only when the response is 2xx
 * and within the limit, so an oversized file never leaves Kernel.
 */
const downloadScript = (url: string, limit: number) => `
const response = await context.request.get(${JSON.stringify(url)}, { failOnStatusCode: false, maxRedirects: 20, timeout: 200000 });
const result = { headers: response.headers(), status: response.status(), url: response.url() };
if (!response.ok()) return result;
const declared = Number(result.headers["content-length"]);
if (Number.isFinite(declared) && declared > ${limit}) return { ...result, tooLarge: declared };
const body = await response.body();
if (body.length > ${limit}) return { ...result, tooLarge: body.length };
return { ...result, data: body.toString("base64") };
`;

/** The elements that hold a page's content, inside which site chrome is kept. */
const CONTENT = new Set(["main", "article"]);

/** Site chrome: removed from the Markdown unless it is inside a main or article element. */
const CHROME = new Set(["nav", "header", "footer", "aside"]);

/**
 * The Playwright script `read` runs in the browser. It waits for the DOM and
 * then up to 3 seconds for the network to go quiet: pages that poll or
 * stream never do, and their content has rendered by then. It reads the HTML,
 * title and URL in one call into the page, because each call waits its turn
 * behind the page's own scripts, seconds on a busy page.
 */
const readScript = (url: string) => `
const response = await page.goto(${JSON.stringify(url)}, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => undefined);
const rendered = await page.evaluate(() => ({
  html: (document.doctype ? new XMLSerializer().serializeToString(document.doctype) : "") + document.documentElement.outerHTML,
  title: document.title,
  url: location.href,
}));
return { ...rendered, status: response?.status() ?? null };
`;

/** The parts of a parsed HTML node that `inContent` reads. */
interface HtmlNode {
  nodeName: string;
  parentNode: HtmlNode | null;
}

/** Whether the node has a main or article element among its ancestors. */
const inContent = (node: HtmlNode): boolean =>
  node.parentNode !== null &&
  (CONTENT.has(node.parentNode.nodeName.toLowerCase()) ||
    inContent(node.parentNode));

/**
 * The rendered page as Markdown, without the site's navigation, header,
 * footer and sidebars, which on a retailer's page can be most of the text.
 * Those elements are kept inside a main or article element, where they are
 * the content's own; a page with neither loses all of them.
 */
const markdownOf = (html: string): string => {
  const service = new TurndownService({
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    headingStyle: "atx",
  });
  // Turndown parses the document as a fragment, which drops <head> but keeps
  // its <title>. The title is returned as `title`, so it is removed here.
  service.remove([
    "title",
    "script",
    "style",
    "noscript",
    "template",
    "iframe",
  ]);
  service.remove(
    (node: HtmlNode) =>
      CHROME.has(node.nodeName.toLowerCase()) && !inContent(node)
  );
  return service.turndown(html).trim();
};

/**
 * Throws `InvalidRequest` unless the URL parses and is http or https, so no
 * session is created for a URL the browser should not open.
 */
const checkUrl = (provider: string, url: string) => {
  const parsed = URL.parse(url);
  if (parsed === null) {
    throw invalidRequest(provider, `cannot read ${url}: it is not a URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw invalidRequest(
      provider,
      `reads only http and https URLs, not ${parsed.protocol} (${url})`
    );
  }
};

/**
 * Runs the read script in the session and returns the rendered page with its
 * HTML and Kernel's reply. Throws `ProviderError` when the script failed or
 * returned no HTML.
 */
const render = async (
  raw: RawClient,
  id: string,
  url: string,
  call: CallOptions
) => {
  const { provider } = raw;
  const response = await raw.request(
    "POST",
    `/browsers/${segment(id)}/playwright/execute`,
    {
      ...call,
      body: { code: readScript(url), timeout_sec: READ_SCRIPT_SECONDS },
    }
  );
  const body = z.parse(ExecuteResponse, response);
  if (body.success !== true) {
    throw new FieldworkError(
      "ProviderError",
      `kernel could not load ${url}: ${body.error ?? "the script failed without an error"}`,
      { cause: response, provider }
    );
  }
  const page = z.parse(RenderedPage, body.result);
  if (page.html === undefined) {
    throw new FieldworkError(
      "ProviderError",
      `kernel loaded ${url} but the script returned no HTML`,
      { cause: response, provider }
    );
  }
  return { html: page.html, page, response };
};

/** Loads the page in a new session and builds the result. */
const readPage = async (
  raw: RawClient,
  url: string,
  options: KernelReadOptions | undefined
): Promise<Page> => {
  const { provider } = raw;
  const { call, rest: o } = callSettings(options);
  checkUrl(provider, url);
  const format = o.format ?? "markdown";
  const { billed, created, id, value } = await inSession(
    raw,
    o,
    call,
    async (session) => await render(raw, session, url, call)
  );
  const { html, page, response } = value;
  const markdown = format === "markdown" ? markdownOf(html) : undefined;
  return presentPage(
    provider,
    compact({
      markdown,
      meta: meta({
        requestId: id,
        units: { uptime_ms: billed.uptimeMs },
        warnings: [
          billed.warning,
          markdown === ""
            ? `kernel rendered ${url} but it has no text to convert to Markdown`
            : undefined,
        ].filter((warning) => warning !== undefined),
      }),
      raw: { browser: created, execute: response },
      rawHtml: format === "raw" ? html : undefined,
      statusCode: page.status,
      title: page.title,
      url: page.url ?? url,
    })
  );
};

/** Fetches the file in a new session and checks it. */
const downloadFile = async (
  raw: RawClient,
  url: string,
  options: KernelDownloadOptions | undefined
): Promise<DownloadedFile> => {
  const { provider } = raw;
  const { call, rest: o } = callSettings(options);
  checkFileUrl(provider, url);
  const limit = byteLimit(provider, DOWNLOAD_CEILING, o.maxBytes);
  const { billed, created, id, value } = await inSession(
    raw,
    { profile: o.profile },
    call,
    async (session) => {
      const response = await raw.request(
        "POST",
        `/browsers/${segment(session)}/playwright/execute`,
        {
          ...call,
          body: {
            code: downloadScript(url, limit),
            timeout_sec: DOWNLOAD_SCRIPT_SECONDS,
          },
        }
      );
      const body = z.parse(ExecuteResponse, response);
      if (body.success !== true) {
        throw new FieldworkError(
          "ProviderError",
          `kernel could not download ${url}: ${body.error ?? "the script failed without an error"}`,
          { cause: response, provider }
        );
      }
      return { file: z.parse(FetchedFile, body.result), response };
    }
  );
  const { file, response } = value;
  const billedMeta = sessionMeta(id, billed);
  if (file.tooLarge !== undefined) {
    throw tooLarge(provider, url, file.tooLarge, limit, billedMeta);
  }
  const ok =
    file.status !== undefined && file.status >= 200 && file.status <= 299;
  if (ok && file.data === undefined) {
    throw new FieldworkError(
      "ProviderError",
      `kernel downloaded ${url} but the script returned no bytes`,
      { cause: response, meta: billedMeta, provider }
    );
  }
  const { headers } = file;
  return presentFile(
    provider,
    {
      body: { base64: file.data ?? "" },
      contentType: header(headers, "content-type"),
      headers,
      meta: billedMeta,
      raw: { browser: created, execute: response },
      requested: url,
      statusCode: file.status,
      url: file.url ?? url,
    },
    limit
  );
};

/**
 * An adapter for Kernel: read, download and browser. Pass it to `new Fieldwork({ adapter })`.
 *
 * Throws `Unauthorized` when neither `apiKey` nor `KERNEL_API_KEY` is set.
 */
export const kernel = (config: KernelConfig = {}) => {
  const provider = "kernel";
  const raw = createRawClient({
    baseUrl: config.baseUrl ?? "https://api.onkernel.com",
    fetch: config.fetch,
    headers: {
      Authorization: `Bearer ${requireKey(provider, config.apiKey, "KERNEL_API_KEY")}`,
    },
    provider,
    retries: config.retries,
  });

  const operations: KernelOperations = {
    browser: {
      async close(id, options) {
        const { call } = callSettings(options);
        await raw.request("DELETE", `/browsers/${segment(id)}`, call);
      },

      async open(options) {
        const { call, rest: o } = callSettings(options);
        const response = await raw.request("POST", "/browsers", {
          creates: true,
          ...call,
          body: compact({
            headless: o.headless,
            region: o.region,
            stealth: o.stealth,
            timeout_seconds: o.idleTimeout,
            viewport: o.viewport,
            ...sessionBody(o),
          }),
        });
        const session = z.parse(BrowserResponse, response);
        return compact({
          cdpUrl: session.cdp_ws_url,
          id: requireJobId(provider, session.session_id),
          liveViewUrl: session.browser_live_view_url,
          raw: response,
        });
      },
    },

    download: async (url, options) => await downloadFile(raw, url, options),

    read: async (url, options) => await readPage(raw, url, options),
  };

  return defineAdapter({ name: provider, operations, raw });
};
