// The Browserbase adapter: search, read (Browserbase Fetch, no browser), browser
// sessions and usage. browserbase/response.ts holds the response schemas.

import * as z from "zod/mini";

import { defineAdapter } from "../adapter.js";
import { invalidRequest } from "../errors.js";
import { createRawClient, requireKey, segment } from "../http.js";
import type {
  AccountUsage,
  BrowserSession,
  CallOptions,
  Page,
  SearchResponse,
} from "../types.js";
import {
  callSettings,
  compact,
  meta,
  presentPage,
  refuseTogether,
  requireJobId,
} from "../util.js";
import {
  DebugResponse,
  FetchResponse,
  ProjectsResponse,
  SearchResponse as SearchBodySchema,
  SessionResponse,
  UsageResponse,
} from "./browserbase/response.js";

/** Settings for `browserbase()`. */
export interface BrowserbaseConfig {
  /** Defaults to the BROWSERBASE_API_KEY environment variable. */
  apiKey?: string;
  /**
   * The project that new browser sessions belong to and whose usage `usage`
   * reads. Without it, Browserbase infers the project from the API key, and
   * `usage` uses the key's only project.
   */
  projectId?: string;
  /** Defaults to https://api.browserbase.com. */
  baseUrl?: string;
  /** Defaults to the global `fetch`. A test passes a fake. */
  fetch?: typeof fetch;
  /** Repeats of a request that can succeed on repeat; 2 unless set. `0` turns retrying off. */
  retries?: number;
}

/** Where Browserbase's proxy network exits, as a country with optional state and city. */
export interface BrowserbaseGeolocation {
  /** ISO 3166-1 alpha-2 code, such as "US". */
  country: string;
  /** US state code such as "NY". Only valid when `country` is "US". */
  state?: string;
  city?: string;
}

/** Options for `read`, which fetches the page over HTTP without running a browser. */
export interface BrowserbaseReadOptions extends CallOptions {
  /**
   * "markdown" converts the page to Markdown (`Page.markdown`). "raw" returns
   * the response body unchanged (`Page.rawHtml` for HTML). Defaults to
   * "markdown". Fetch never runs JavaScript, reads at most 5 MB and cannot
   * convert PDFs. A binary response is not converted either: its Base64
   * content stays in `raw`, with a warning.
   */
  format?: "markdown" | "raw";
  /** Follow HTTP redirects. Browserbase defaults to false. */
  allowRedirects?: boolean;
  /** Skip TLS certificate verification, for self-signed or expired certificates. */
  allowInsecureSsl?: boolean;
  /**
   * Send the request through Browserbase's proxy network: `true` for the
   * default exit, or a geolocation. Not combinable with `country`.
   */
  proxies?: boolean | { geolocation?: BrowserbaseGeolocation };
  /** ISO 3166-1 alpha-2 code, upper-cased before sending. Sends the request through a proxy in that country. */
  country?: string;
  /** A context whose saved cookies are sent with the request. */
  contextId?: string;
}

interface BrowserbaseSearchBase extends CallOptions {
  /** Results to return, 1 to 25. */
  limit?: number;
}

/**
 * `mode` is accepted only together with `provider`, and each provider offers
 * its own modes. Without `provider`, Browserbase uses Parallel's `advanced`.
 */
export type BrowserbaseSearchOptions = BrowserbaseSearchBase &
  (
    | { provider?: undefined; mode?: undefined }
    | { provider: "parallel"; mode?: "fast" | "advanced" }
    | { provider: "exa"; mode?: "fast" | "deep-lite" | "deep" }
  );

/**
 * A proxy rule for a browser session: Browserbase's network, your own server,
 * or no proxy. `domainPattern` limits a rule to the domains that match.
 */
export type BrowserbaseProxy =
  | {
      type: "browserbase";
      geolocation?: BrowserbaseGeolocation;
      /** Use this proxy only for domains that match. */
      domainPattern?: string;
    }
  | {
      type: "external";
      server: string;
      username?: string;
      password?: string;
      domainPattern?: string;
    }
  | { type: "none"; domainPattern?: string };

/**
 * Options for `browser.open`. The session is billed until it expires or
 * `browser.close` releases it.
 */
export interface BrowserbaseOpenOptions extends CallOptions {
  region?: "us-west-2" | "us-east-1" | "eu-central-1" | "ap-southeast-1";
  /** Keep the session open after the client disconnects. Hobby plan and above. */
  keepAlive?: boolean;
  /** Seconds the session may live, 60 to 21600. Browserbase defaults to the project's setting. */
  ttl?: number;
  /** A saved login state. `persist` writes changes made in this session back to it. */
  context?: { id: string; persist?: boolean };
  /** `true` for the default Browserbase proxy, or rules per domain. */
  proxies?: boolean | BrowserbaseProxy[];
  viewport?: { width: number; height: number };
  blockAds?: boolean;
  /** Browserbase defaults to true. */
  solveCaptchas?: boolean;
  captchaImageSelector?: string;
  captchaInputSelector?: string;
  /** Browserbase defaults to true. */
  recordSession?: boolean;
  /** Browserbase defaults to true. */
  logSession?: boolean;
  verified?: boolean;
  os?: "windows" | "mac" | "linux" | "mobile" | "tablet";
  /** Plain domains; main-frame navigation is limited to these and their subdomains. */
  allowedDomains?: string[];
  ignoreCertificateErrors?: boolean;
  /** An uploaded browser extension. */
  extensionId?: string;
  /** A navigation policy of the project. */
  riskPolicyId?: string;
  /** Tags stored with the session, searchable in the dashboard. */
  userMetadata?: Record<string, unknown>;
}

/** What the Browserbase adapter offers. */
export interface BrowserbaseOperations {
  search: (
    query: string,
    options?: BrowserbaseSearchOptions
  ) => Promise<SearchResponse>;
  read: (url: string, options?: BrowserbaseReadOptions) => Promise<Page>;
  browser: {
    /**
     * Creates a session. A failure to get its live view URL does not fail the
     * call: the session is billed already, so the result carries a warning.
     */
    open: (options?: BrowserbaseOpenOptions) => Promise<BrowserSession>;
    /** Asks Browserbase to release the session. */
    close: (id: string, options?: CallOptions) => Promise<void>;
  };
  /** Browser minutes and proxy bytes of `projectId`, or of the key's only project. */
  usage: (options?: CallOptions) => Promise<AccountUsage>;
}

/** The modes each search provider takes; `search` refuses any other. */
const SEARCH_MODES = {
  exa: ["fast", "deep-lite", "deep"],
  parallel: ["fast", "advanced"],
} as const;

/**
 * An adapter for Browserbase: search, read, browser and usage. Pass it to `new Fieldwork({ adapter })`.
 *
 * Throws `Unauthorized` when neither `apiKey` nor `BROWSERBASE_API_KEY` is set.
 */
export const browserbase = (config: BrowserbaseConfig = {}) => {
  const provider = "browserbase";
  const raw = createRawClient({
    baseUrl: config.baseUrl ?? "https://api.browserbase.com",
    fetch: config.fetch,
    headers: {
      "x-bb-api-key": requireKey(
        provider,
        config.apiKey,
        "BROWSERBASE_API_KEY"
      ),
    },
    provider,
    retries: config.retries,
  });
  const { projectId } = config;

  /** The `proxies` value to send: as given, or built from `country`. Refuses both together, and a state outside the US. */
  const fetchProxies = (o: BrowserbaseReadOptions) => {
    refuseTogether(provider, o, "proxies", "country");
    const geolocation: BrowserbaseGeolocation | undefined =
      o.country === undefined
        ? undefined
        : { country: o.country.toUpperCase() };
    const proxies: BrowserbaseReadOptions["proxies"] =
      o.proxies ?? (geolocation ? { geolocation } : undefined);
    const place = typeof proxies === "object" ? proxies.geolocation : undefined;
    if (
      place !== undefined &&
      place.state !== undefined &&
      place.state !== "" &&
      place.country.toUpperCase() !== "US"
    ) {
      throw invalidRequest(
        provider,
        "accepts a proxy state only with country US"
      );
    }
    return proxies;
  };

  const liveView = async (id: string, call: CallOptions) => {
    try {
      const urls = z.parse(
        DebugResponse,
        await raw.request("GET", `/v1/sessions/${segment(id)}/debug`, call)
      );
      return { url: urls.debuggerFullscreenUrl ?? urls.debuggerUrl };
    } catch (error) {
      // The session already exists and bills, so a missing watch link must
      // not hide it from the caller.
      return {
        warning: `could not get the live view URL: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  };

  const operations: BrowserbaseOperations = {
    browser: {
      async close(id, options) {
        const { call } = callSettings(options);
        await raw.request("POST", `/v1/sessions/${segment(id)}`, {
          ...call,
          body: { status: "REQUEST_RELEASE" },
        });
      },

      async open(options) {
        const { call, rest: o } = callSettings(options);
        const browserSettings = compact({
          allowedDomains: o.allowedDomains,
          blockAds: o.blockAds,
          captchaImageSelector: o.captchaImageSelector,
          captchaInputSelector: o.captchaInputSelector,
          context: o.context
            ? compact({ id: o.context.id, persist: o.context.persist })
            : undefined,
          extensionId: o.extensionId,
          ignoreCertificateErrors: o.ignoreCertificateErrors,
          logSession: o.logSession,
          os: o.os,
          recordSession: o.recordSession,
          riskPolicyId: o.riskPolicyId,
          solveCaptchas: o.solveCaptchas,
          verified: o.verified,
          viewport: o.viewport,
        });
        const response = await raw.request("POST", "/v1/sessions", {
          creates: true,
          ...call,
          body: compact({
            browserSettings:
              Object.keys(browserSettings).length > 0
                ? browserSettings
                : undefined,
            keepAlive: o.keepAlive,
            projectId,
            proxies: o.proxies,
            region: o.region,
            timeout: o.ttl,
            userMetadata: o.userMetadata,
          }),
        });
        const session = z.parse(SessionResponse, response);
        const id = requireJobId(provider, session.id);
        const view = await liveView(id, call);
        return compact({
          cdpUrl: session.connectUrl,
          expiresAt: session.expiresAt,
          id,
          liveViewUrl: view.url,
          meta: meta({ warnings: view.warning }),
          raw: response,
        });
      },
    },

    async read(url, options) {
      const { call, rest: o } = callSettings(options);
      const format = o.format ?? "markdown";
      const response = await raw.request("POST", "/v1/fetch", {
        ...call,
        body: compact({
          allowInsecureSsl: o.allowInsecureSsl,
          allowRedirects: o.allowRedirects,
          contextId: o.contextId,
          format,
          proxies: fetchProxies(o),
          url,
        }),
      });
      const body = z.parse(FetchResponse, response);
      const { content } = body;
      const binary = body.encoding === "base64";
      const contentType = body.contentType ?? "";
      return presentPage(
        provider,
        compact({
          markdown: format === "markdown" && !binary ? content : undefined,
          meta: meta({
            requestId: body.id,
            warnings: binary
              ? ["the response is binary; its Base64 content is in raw"]
              : undefined,
          }),
          raw: response,
          rawHtml:
            format === "raw" && !binary && contentType.includes("html")
              ? content
              : undefined,
          statusCode: body.statusCode,
          url,
        })
      );
    },

    async search(query, options) {
      const { call, rest: o } = callSettings(options);
      if (o.mode !== undefined) {
        if (o.provider === undefined) {
          throw invalidRequest(
            provider,
            "accepts a search mode only together with provider"
          );
        }
        const allowed: readonly string[] = SEARCH_MODES[o.provider];
        if (!allowed.includes(o.mode)) {
          throw invalidRequest(
            provider,
            `search provider ${o.provider} has no mode ${o.mode}; use ${allowed.join(", ")}`
          );
        }
      }
      const response = await raw.request("POST", "/v1/search", {
        ...call,
        body: compact({
          mode: o.mode,
          numResults: o.limit,
          provider: o.provider,
          query,
        }),
      });
      const body = z.parse(SearchBodySchema, response);
      return compact({
        meta: meta({ requestId: body.requestId }),
        raw: response,
        results: body.results.map((result) =>
          compact({
            author: result.author,
            favicon: result.favicon,
            image: result.image,
            publishedAt: result.publishedDate,
            title: result.title,
            url: result.url ?? "",
          })
        ),
      });
    },

    async usage(options) {
      const { call } = callSettings(options);
      const id = projectId ?? (await onlyProject(call));
      const response = await raw.request(
        "GET",
        `/v1/projects/${segment(id)}/usage`,
        call
      );
      const body = z.parse(UsageResponse, response);
      return compact({
        breakdown: Object.fromEntries(
          Object.entries({
            browserMinutes: body.browserMinutes,
            proxyBytes: body.proxyBytes,
          }).filter(
            (entry): entry is [string, number] => entry[1] !== undefined
          )
        ),
        raw: response,
      });
    },
  };

  /** The key's project when it has exactly one; otherwise refuses rather than guess. */
  const onlyProject = async (call: CallOptions): Promise<string> => {
    const projects = z.parse(
      ProjectsResponse,
      await raw.request("GET", "/v1/projects", call)
    );
    if (projects.length !== 1) {
      throw invalidRequest(
        provider,
        `usage needs a project: pass projectId (this key has ${projects.length} projects)`
      );
    }
    return requireJobId(
      provider,
      projects[0]?.id ?? { original: undefined, value: undefined }
    );
  };

  return defineAdapter({ name: provider, operations, raw });
};
