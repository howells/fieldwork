// The Kernel adapter: read (a page loaded in a real Chromium, so JavaScript
// runs) and browser sessions. A read creates a session, runs a script in it
// and deletes it whether or not the script succeeded, under a deadline of its
// own. kernel/response.ts holds the response schemas.

import TurndownService from "turndown";
import * as z from "zod/mini";

import { defineAdapter } from "../adapter.js";
import { FieldworkError, invalidRequest } from "../errors.js";
import { createRawClient, requireKey, segment } from "../http.js";
import type { RawClient } from "../http.js";
import { runJob } from "../job.js";
import type { BrowserSession, CallOptions, Page } from "../types.js";
import {
  callSettings,
  compact,
  meta,
  presentPage,
  requireJobId,
} from "../util.js";
import {
  BrowserResponse,
  DeletedBrowserResponse,
  ExecuteResponse,
  RenderedPage,
} from "./kernel/response.js";

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

/** What the Kernel adapter offers. */
export interface KernelOperations {
  read: (url: string, options?: KernelReadOptions) => Promise<Page>;
  browser: {
    open: (options?: KernelOpenOptions) => Promise<BrowserSession>;
    /** Deletes the session, so it stops billing. */
    close: (id: string, options?: CallOptions) => Promise<void>;
  };
}

/** Seconds Kernel gives the read script, within its 300-second limit. */
const READ_SCRIPT_SECONDS = 120;

/** Seconds a read's session may sit idle before Kernel deletes it. */
const READ_IDLE_SECONDS = 60;

/** Milliseconds a read waits for Kernel to delete its session, apart from the call's own deadline. */
const RELEASE_TIMEOUT = 10_000;

/** Milliseconds a read waits for the deleted session's billed time. */
const BILLED_TIME_WAIT = 15_000;

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

/** The session's profile and proxy as Kernel's create body spells them. */
const sessionBody = (o: {
  profile?: KernelProfile & { saveChanges?: boolean };
  proxy?: KernelProxy;
}) => ({
  profile: o.profile
    ? compact({
        id: o.profile.id,
        name: o.profile.name,
        save_changes: o.profile.saveChanges,
      })
    : undefined,
  proxy: o.proxy
    ? compact({ id: o.proxy.id, mode: o.proxy.mode, name: o.proxy.name })
    : undefined,
});

/** Why a session still bills, for a warning or an error. */
const leakText = (id: string, failure: FieldworkError) =>
  `could not delete browser ${id}, which bills until its ${READ_IDLE_SECONDS}-second idle timeout: ${failure.message}`;

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

/** What the work returned, or what it threw. */
const settle = async <T>(
  work: Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> => {
  try {
    return { ok: true, value: await work };
  } catch (error) {
    return { error, ok: false };
  }
};

/**
 * Deletes a read's session under its own 10-second deadline, not the call's,
 * so a read its caller stopped still stops the bill. A 404 or 410 means the
 * session is already gone. Returns why the delete failed, or undefined when
 * it did not, so the caller reports it without losing its own error.
 */
const release = async (
  raw: RawClient,
  id: string,
  retries: number | undefined
): Promise<FieldworkError | undefined> => {
  const deleted = await settle(
    raw.request("DELETE", `/browsers/${segment(id)}`, {
      retries,
      timeout: RELEASE_TIMEOUT,
    })
  );
  if (deleted.ok) {
    return undefined;
  }
  const { error } = deleted;
  if (!(error instanceof FieldworkError)) {
    return new FieldworkError("ProviderError", String(error), {
      cause: error,
      provider: raw.provider,
    });
  }
  return error.status === 404 || error.status === 410 ? undefined : error;
};

/**
 * The deleted session's billed time, which Kernel reports about a second after
 * deletion, waiting up to 15 seconds and no longer than the call's signal
 * allows. A failure to get it does not fail the read: the page is already
 * read and billed, so the result carries a warning instead.
 */
const billedTime = async (
  raw: RawClient,
  id: string,
  call: CallOptions
): Promise<{ uptimeMs?: number; warning?: string }> => {
  try {
    const uptimeMs = await runJob(
      "kernel",
      {
        check: async (sessionId, request) => {
          const body = z.parse(
            DeletedBrowserResponse,
            await raw.request("GET", `/browsers/${segment(sessionId)}`, {
              ...request,
              query: { include_deleted: true },
            })
          );
          return body.usage_status === "ready" ? body : undefined;
        },
        finish: (body) => body.usage?.uptime_ms,
        // The session already exists; its id is the one to wait on.
        start: async () => id,
      },
      {
        retries: call.retries,
        signal: call.signal,
        timeout: BILLED_TIME_WAIT,
      }
    );
    return { uptimeMs };
  } catch (error) {
    // runJob's own wait ran out, rather than the call's signal or a 408.
    const ranOut =
      error instanceof FieldworkError &&
      error.code === "Timeout" &&
      error.status === undefined &&
      call.signal?.aborted !== true;
    return {
      warning: ranOut
        ? `kernel did not report the session's billed time within ${BILLED_TIME_WAIT / 1000} seconds`
        : `could not get the session's billed time: ${error instanceof Error ? error.message : String(error)}`,
    };
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

/**
 * Loads the page in a new session, deletes the session whether or not the
 * script succeeded, and builds the result. A failed read whose session could
 * not be deleted fails with its own error, naming the session that still bills.
 */
const readPage = async (
  raw: RawClient,
  url: string,
  options: KernelReadOptions | undefined
): Promise<Page> => {
  const { provider } = raw;
  const { call, rest: o } = callSettings(options);
  checkUrl(provider, url);
  const format = o.format ?? "markdown";
  const created = await raw.request("POST", "/browsers", {
    creates: true,
    ...call,
    body: compact({
      headless: true,
      stealth: o.stealth,
      timeout_seconds: READ_IDLE_SECONDS,
      ...sessionBody({ profile: o.profile, proxy: o.proxy }),
    }),
  });
  const id = requireJobId(
    provider,
    z.parse(BrowserResponse, created).session_id
  );
  const rendered = await settle(render(raw, id, url, call));
  const unreleased = await release(raw, id, call.retries);
  if (!rendered.ok) {
    const { error } = rendered;
    if (unreleased === undefined) {
      throw error;
    }
    const message = `${error instanceof Error ? error.message : String(error)}; also ${leakText(id, unreleased)}`;
    throw error instanceof FieldworkError
      ? new FieldworkError(error.code, message, {
          cause: error,
          jobId: error.jobId,
          provider: error.provider,
          retryAfter: error.retryAfter,
          retryable: error.retryable,
          status: error.status,
        })
      : new FieldworkError("ProviderError", message, {
          cause: error,
          provider,
        });
  }
  const { html, page, response } = rendered.value;
  const billed =
    unreleased === undefined
      ? await billedTime(raw, id, call)
      : { warning: leakText(id, unreleased) };
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

/**
 * An adapter for Kernel: read and browser. Pass it to `new Fieldwork({ adapter })`.
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

    read: async (url, options) => await readPage(raw, url, options),
  };

  return defineAdapter({ name: provider, operations, raw });
};
