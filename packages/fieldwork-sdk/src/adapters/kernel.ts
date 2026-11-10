// The Kernel adapter: read (a page loaded in a real Chromium, so JavaScript
// runs) and browser sessions. kernel/response.ts holds the response schemas.

import TurndownService from "turndown";
import * as z from "zod/mini";

import { defineAdapter } from "../adapter.js";
import { FieldworkError } from "../errors.js";
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
 * Options for `read`, which loads the page in a new headless browser, waits
 * for it to render and closes the browser. The session bills for the seconds
 * it ran, reported as `meta.usage.units.uptime_ms`.
 */
export interface KernelReadOptions extends CallOptions {
  /**
   * "markdown" converts the rendered page to Markdown (`Page.markdown`),
   * leaving out its nav, header, footer and aside elements.
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

/**
 * The Playwright script `read` runs in the browser. It waits for the DOM and
 * then up to 10 seconds for the network to go quiet: pages that poll or
 * stream never do, and their content has rendered by then.
 */
const readScript = (url: string) => `
const response = await page.goto(${JSON.stringify(url)}, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => undefined);
return { html: await page.content(), status: response?.status() ?? null, title: await page.title(), url: page.url() };
`;

/**
 * The rendered page as Markdown, without the site's navigation, header,
 * footer and sidebars, which on a retailer's page can be most of the text.
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
    "nav",
    "header",
    "footer",
    "aside",
  ]);
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

/** Deletes a session. */
const deleteSession = async (raw: RawClient, id: string, call: CallOptions) => {
  await raw.request("DELETE", `/browsers/${segment(id)}`, call);
};

/**
 * The deleted session's billed time, which Kernel reports about a second after
 * deletion. A failure to get it does not fail the read: the page is already
 * read and billed, so the result carries a warning instead.
 */
const billedTime = async (raw: RawClient, id: string, call: CallOptions) => {
  try {
    const found = await runJob(
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
        finish: (body) => body,
        start: async () => id,
      },
      {
        interval: 500,
        resume: id,
        retries: call.retries,
        signal: call.signal,
        timeout: 15_000,
      }
    );
    return { uptimeMs: found.usage?.uptime_ms };
  } catch (error) {
    return {
      warning: `could not get the session's billed time: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
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

  /** Runs the read script and returns Kernel's reply, or throws when the script failed. */
  const render = async (id: string, url: string, call: CallOptions) => {
    const response = await raw.request(
      "POST",
      `/browsers/${segment(id)}/playwright/execute`,
      {
        ...call,
        body: { code: readScript(url), timeout_sec: READ_SCRIPT_SECONDS },
        creates: true,
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
    return { page: z.parse(RenderedPage, body.result), response };
  };

  const operations: KernelOperations = {
    browser: {
      async close(id, options) {
        const { call } = callSettings(options);
        await deleteSession(raw, id, call);
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

    async read(url, options) {
      const { call, rest: o } = callSettings(options);
      const format = o.format ?? "markdown";
      const created = await raw.request("POST", "/browsers", {
        creates: true,
        ...call,
        body: compact({
          headless: true,
          stealth: o.stealth,
          timeout_seconds: 60,
          ...sessionBody({ profile: o.profile, proxy: o.proxy }),
        }),
      });
      const id = requireJobId(
        provider,
        z.parse(BrowserResponse, created).session_id
      );
      let rendered: Awaited<ReturnType<typeof render>>;
      try {
        rendered = await render(id, url, call);
      } catch (error) {
        // The call's own deadline may be what stopped it, so the session is
        // deleted without it. A failed delete is reported with the first error.
        try {
          await deleteSession(raw, id, { retries: call.retries });
        } catch (closeError) {
          throw new FieldworkError(
            "ProviderError",
            `${error instanceof Error ? error.message : String(error)}; also could not delete browser ${id}, which bills until its 60-second idle timeout: ${closeError instanceof Error ? closeError.message : String(closeError)}`,
            { cause: error, provider }
          );
        }
        throw error;
      }
      await deleteSession(raw, id, call);
      const billed = await billedTime(raw, id, call);
      const { page } = rendered;
      const html = page.html ?? "";
      return presentPage(
        provider,
        compact({
          markdown: format === "markdown" ? markdownOf(html) : undefined,
          meta: meta({
            requestId: id,
            units: { uptime_ms: billed.uptimeMs },
            warnings: billed.warning,
          }),
          raw: { browser: created, execute: rendered.response },
          rawHtml: format === "raw" ? html : undefined,
          statusCode: page.status,
          title: page.title,
          url: page.url ?? url,
        })
      );
    },
  };

  return defineAdapter({ name: provider, operations, raw });
};
