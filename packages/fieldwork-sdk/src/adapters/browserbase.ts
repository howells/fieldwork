import { defineAdapter } from "../adapter.js";
import { FieldworkError } from "../errors.js";
import { createRawClient, requireKey } from "../http.js";
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
  list,
  meta,
  num,
  presentPage,
  record,
  refuseTogether,
  requireId,
  text,
} from "../util.js";

export interface BrowserbaseConfig {
  /** Defaults to the BROWSERBASE_API_KEY environment variable. */
  apiKey?: string;
  /**
   * The project that new browser sessions belong to and whose usage `usage`
   * reads. Defaults to the BROWSERBASE_PROJECT_ID environment variable.
   * Browserbase infers the project from the API key when it is not set, and
   * `usage` then uses the key's only project.
   */
  projectId?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

/** Where Browserbase's proxy network exits, as a country with optional state and city. */
export interface BrowserbaseGeolocation {
  /** ISO 3166-1 alpha-2 code, such as "US". */
  country: string;
  /** US state code such as "NY". Only valid when `country` is "US". */
  state?: string;
  city?: string;
}

export interface BrowserbaseReadOptions extends CallOptions {
  /**
   * "markdown" converts the page to Markdown (`Page.markdown`). "raw" returns
   * the response body unchanged (`Page.rawHtml` for HTML). Defaults to
   * "markdown". Fetch never runs JavaScript, reads at most 5 MB and cannot
   * convert PDFs.
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
  /** ISO 3166-1 alpha-2 code. Sends the request through a proxy in that country. */
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

export interface BrowserbaseOperations {
  search: (
    query: string,
    options?: BrowserbaseSearchOptions
  ) => Promise<SearchResponse>;
  read: (url: string, options?: BrowserbaseReadOptions) => Promise<Page>;
  browser: {
    open: (options?: BrowserbaseOpenOptions) => Promise<BrowserSession>;
    close: (id: string, options?: CallOptions) => Promise<void>;
  };
  usage: (options?: CallOptions) => Promise<AccountUsage>;
}

const SEARCH_MODES = {
  exa: ["fast", "deep-lite", "deep"],
  parallel: ["fast", "advanced"],
} as const;

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
  });
  // oxlint-disable-next-line no-restricted-properties -- the SDK reads API keys and ids from the environment, like requireKey
  const projectId = config.projectId ?? process.env.BROWSERBASE_PROJECT_ID;

  const invalid: (message: string) => never = (message) => {
    throw new FieldworkError("InvalidRequest", `${provider} ${message}`, {
      provider,
    });
  };

  const fetchProxies = (o: BrowserbaseReadOptions) => {
    refuseTogether(
      provider,
      o as Record<string, unknown>,
      "proxies",
      "country"
    );
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
      invalid("accepts a proxy state only with country US");
    }
    return proxies;
  };

  const liveView = async (id: string, call: CallOptions) => {
    try {
      const urls = record(
        await raw.request(
          "GET",
          `/v1/sessions/${encodeURIComponent(id)}/debug`,
          call
        )
      );
      return {
        url: text(urls.debuggerFullscreenUrl) ?? text(urls.debuggerUrl),
      };
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
        await raw.request("POST", `/v1/sessions/${encodeURIComponent(id)}`, {
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
        const session = record(
          await raw.request("POST", "/v1/sessions", {
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
          })
        );
        const id = requireId(provider, session.id);
        const view = await liveView(id, call);
        return compact({
          cdpUrl: text(session.connectUrl),
          expiresAt: text(session.expiresAt),
          id,
          liveViewUrl: view.url,
          meta: meta({ warnings: view.warning }),
          raw: session,
        });
      },
    },

    async read(url, options) {
      const { call, rest: o } = callSettings(options);
      const format = o.format ?? "markdown";
      const response = record(
        await raw.request("POST", "/v1/fetch", {
          ...call,
          body: compact({
            allowInsecureSsl: o.allowInsecureSsl,
            allowRedirects: o.allowRedirects,
            contextId: o.contextId,
            format,
            proxies: fetchProxies(o),
            url,
          }),
        })
      );
      const content =
        typeof response.content === "string" ? response.content : undefined;
      const binary = response.encoding === "base64";
      const contentType = text(response.contentType) ?? "";
      return presentPage(
        provider,
        compact({
          markdown: format === "markdown" && !binary ? content : undefined,
          meta: meta({
            requestId: response.id,
            warnings: binary
              ? ["the response is binary; its Base64 content is in raw"]
              : undefined,
          }),
          raw: response,
          rawHtml:
            format === "raw" && !binary && contentType.includes("html")
              ? content
              : undefined,
          statusCode: num(response.statusCode),
          url,
        })
      );
    },

    async search(query, options) {
      const { call, rest: o } = callSettings(options);
      if (o.mode !== undefined) {
        if (o.provider === undefined) {
          invalid("accepts a search mode only together with provider");
        }
        const allowed: readonly string[] = SEARCH_MODES[o.provider];
        if (!allowed.includes(o.mode)) {
          invalid(
            `search provider ${o.provider} has no mode ${o.mode}; use ${allowed.join(", ")}`
          );
        }
      }
      const response = record(
        await raw.request("POST", "/v1/search", {
          ...call,
          body: compact({
            mode: o.mode,
            numResults: o.limit,
            provider: o.provider,
            query,
          }),
        })
      );
      return compact({
        meta: meta({ requestId: response.requestId }),
        raw: response,
        results: list(response.results).map((item) => {
          const result = record(item);
          return compact({
            author: text(result.author),
            favicon: text(result.favicon),
            image: text(result.image),
            publishedAt: text(result.publishedDate),
            title: text(result.title),
            url: text(result.url) ?? "",
          });
        }),
      });
    },

    async usage(options) {
      const { call } = callSettings(options);
      const id = projectId ?? (await onlyProject(call));
      const response = record(
        await raw.request(
          "GET",
          `/v1/projects/${encodeURIComponent(id)}/usage`,
          call
        )
      );
      return compact({
        breakdown: compact({
          browserMinutes: num(response.browserMinutes),
          proxyBytes: num(response.proxyBytes),
        }) as Record<string, number>,
        raw: response,
      });
    },
  };

  const onlyProject = async (call: CallOptions): Promise<string> => {
    const projects = list(await raw.request("GET", "/v1/projects", call));
    if (projects.length !== 1) {
      invalid(
        `usage needs a project: pass projectId or set BROWSERBASE_PROJECT_ID (this key has ${projects.length} projects)`
      );
    }
    return requireId(provider, record(projects[0]).id);
  };

  return defineAdapter({ name: provider, operations, raw });
};
