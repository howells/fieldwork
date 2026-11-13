// Request bodies for Firecrawl's v2 API, built from normalized options.
// The adapter in ../firecrawl.ts sends them; responses are parsed in response.ts and shapes.ts.

import {
  documentPart,
  MEDIA_TYPES,
  mediaTypeOf,
  refuseLarger,
} from "../../document.js";
import { FieldworkError, invalidRequest } from "../../errors.js";
import type { RequestOptions } from "../../http.js";
import { jsonSchemaOf } from "../../schema.js";
import type { CallOptions, DocumentInput, Recency } from "../../types.js";
import { compact, refuseTogether } from "../../util.js";
import type { Json } from "../../util.js";
import type {
  FirecrawlActOptions,
  FirecrawlCrawlOptions,
  FirecrawlImagesOptions,
  FirecrawlMapOptions,
  FirecrawlMonitorOptions,
  FirecrawlPageSettings,
  FirecrawlParseOptions,
  FirecrawlReadSettings,
  FirecrawlResearchOptions,
  FirecrawlSearchOptions,
  FirecrawlSessionSettings,
} from "./options.js";
import { cronFor } from "./schedule.js";
import { country, provider } from "./shared.js";

/** The largest file `/parse` takes, in megabytes. */
const MAX_PARSE_MB = 50;
/** Longest script `/interact/{id}/execute` runs, in seconds. */
const MAX_SCRIPT_SECONDS = 300;
/** Longest `/parse` runs, in milliseconds. */
const MAX_PARSE_MS = 300_000;
/** Milliseconds a request outlives Firecrawl's own limit, so Firecrawl reports the timeout itself. */
export const REPORT_GRACE_MS = 10_000;
/** The most monitors or checks Firecrawl returns per request. */
export const PAGE_SIZE = 100;
/** The longest query a search monitor takes. */
const MAX_MONITOR_QUERY = 256;

/** Firecrawl's `qdr:` units, for each named recency window. */
const RECENCY = {
  day: "d",
  hour: "h",
  month: "m",
  week: "w",
  year: "y",
} as const satisfies Record<Recency, string>;

const DATE = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u;

/** The page-fetching fields every scrape takes. `maxAge` goes out in milliseconds, and the rest as they are. */
export const pageBody = (o: FirecrawlPageSettings) =>
  compact({
    actions: o.actions,
    excludeTags: o.excludeTags,
    includeTags: o.includeTags,
    location: o.location,
    maxAge: o.maxAge === undefined ? undefined : Math.round(o.maxAge * 1000),
    mobile: o.mobile,
    onlyMainContent: o.onlyMainContent,
    parsers: o.parsers,
    proxy: o.proxy,
    waitFor: o.waitFor,
  });

/** The formats a read asks for: Markdown always, then `include`, then `query` as highlights (the default) or a question. */
export const readFormats = (o: FirecrawlReadSettings): unknown[] => {
  const query =
    o.query === undefined
      ? []
      : [
          o.queryFormat === "question"
            ? { question: o.query, type: "question" }
            : { query: o.query, type: "highlights" },
        ];
  return ["markdown", ...(o.include ?? []), ...query];
};

/** The scrape body for a read: its formats and page settings. */
export const readBody = (o: FirecrawlReadSettings) => ({
  formats: readFormats(o),
  ...pageBody(o),
});

/** Firecrawl's date filter takes MM/DD/YYYY; the options take YYYY-MM-DD. */
const usDate = (value: string): string => {
  const groups = DATE.exec(value)?.groups;
  if (!groups) {
    throw invalidRequest(provider, `needs dates as YYYY-MM-DD, got "${value}"`);
  }
  return `${groups.month}/${groups.day}/${groups.year}`;
};

type SearchSettings = Omit<FirecrawlSearchOptions, keyof CallOptions>;

/**
 * The `tbs` time filter: `tbs` as given, else `recency` as `qdr:`, else the
 * published dates as a `cdr:1` range with `cd_min` and `cd_max`. Refuses
 * `tbs`, `recency` and the dates in combination.
 */
const timeFilter = (o: SearchSettings): string | undefined => {
  refuseTogether(provider, o, "tbs", "recency", "publishedAfter");
  refuseTogether(provider, o, "tbs", "recency", "publishedBefore");
  if (o.tbs !== undefined) {
    return o.tbs;
  }
  if (o.recency !== undefined) {
    return `qdr:${RECENCY[o.recency]}`;
  }
  if (o.publishedAfter === undefined && o.publishedBefore === undefined) {
    return undefined;
  }
  const after =
    o.publishedAfter === undefined
      ? undefined
      : `cd_min:${usDate(o.publishedAfter)}`;
  const before =
    o.publishedBefore === undefined
      ? undefined
      : `cd_max:${usDate(o.publishedBefore)}`;
  return ["cdr:1", after, before]
    .filter((part) => part !== undefined)
    .join(",");
};

/** The `/search` body. `content` asks for each result's Markdown. Refuses `includeDomains` with `excludeDomains`, and `gov` with another category. */
export const searchBody = (query: string, o: SearchSettings) => {
  refuseTogether(provider, o, "includeDomains", "excludeDomains");
  if (o.categories?.includes("gov") === true && o.categories.length > 1) {
    throw invalidRequest(
      provider,
      "searches the gov category on its own; do not combine it with another category"
    );
  }
  return compact({
    categories: o.categories?.map((type) => ({ type })),
    country: country(o.country),
    excludeDomains: o.excludeDomains,
    ignoreInvalidURLs: o.ignoreInvalidURLs,
    includeDomains: o.includeDomains,
    limit: o.limit,
    location: o.location,
    query,
    safe: o.safe,
    scrapeOptions: o.content === true ? { formats: ["markdown"] } : undefined,
    sources: o.sources?.map((type) => ({ type })),
    tbs: timeFilter(o),
  });
};

/** The `/search` body for images: the `images` source alone. */
export const imagesBody = (
  query: string,
  o: Omit<FirecrawlImagesOptions, keyof CallOptions>
) =>
  compact({
    country: country(o.country),
    limit: o.limit,
    location: o.location,
    query,
    safe: o.safe,
    sources: [{ type: "images" }],
  });

export const mapBody = (
  url: string,
  o: Omit<FirecrawlMapOptions, keyof CallOptions>
) =>
  compact({
    ignoreCache: o.ignoreCache,
    ignoreQueryParameters: o.ignoreQueryParameters,
    includeSubdomains: o.includeSubdomains,
    limit: o.limit,
    location: o.location,
    search: o.search,
    sitemap: o.sitemap,
    url,
  });

/** The `/crawl` body. `scrapeOptions` is built like a read's body. */
export const crawlBody = (
  url: string,
  o: Omit<FirecrawlCrawlOptions, keyof CallOptions>
) =>
  compact({
    allowExternalLinks: o.allowExternalLinks,
    allowSubdomains: o.allowSubdomains,
    crawlEntireDomain: o.crawlEntireDomain,
    delay: o.delay,
    excludePaths: o.excludePaths,
    ignoreQueryParameters: o.ignoreQueryParameters,
    includePaths: o.includePaths,
    limit: o.limit,
    maxConcurrency: o.maxConcurrency,
    maxDiscoveryDepth: o.maxDiscoveryDepth,
    prompt: o.prompt,
    regexOnFullURL: o.regexOnFullURL,
    scrapeOptions: o.scrapeOptions ? readBody(o.scrapeOptions) : undefined,
    sitemap: o.sitemap,
    url,
  });

/** The `/agent` body. `continueFrom` is sent as `threadId`, and `country` as `location`. */
export const researchBody = (
  question: string,
  o: Omit<FirecrawlResearchOptions, keyof CallOptions>
) =>
  compact({
    effort: o.effort,
    location:
      o.country === undefined || o.country === ""
        ? undefined
        : { country: country(o.country) },
    maxCredits: o.maxCredits,
    model: o.model,
    prompt: question,
    schema: o.schema === undefined ? undefined : jsonSchemaOf(o.schema),
    strictConstrainToURLs: o.strictConstrainToURLs,
    threadId: o.continueFrom,
    urls: o.urls,
  });

/** The body that opens a browser session. `activityTtl` falls back to `ttl`. */
export const sessionBody = (o: FirecrawlSessionSettings) =>
  compact({
    activityTtl: o.activityTtl ?? o.ttl,
    location:
      o.country === undefined || o.country === ""
        ? undefined
        : { country: country(o.country) },
    profile: o.profile,
    ttl: o.ttl,
  });

/**
 * Refuses session settings given together with `session`, since that session
 * is already open. Returns the call's `timeout` as whole seconds for the
 * script's limit (at least 1), and refuses one over `MAX_SCRIPT_SECONDS`.
 */
export const checkAct = (
  o: Omit<FirecrawlActOptions, keyof CallOptions>,
  timeout: number | undefined
): number | undefined => {
  for (const name of ["ttl", "activityTtl", "profile", "country"] as const) {
    refuseTogether(provider, o, "session", name);
  }
  if (timeout === undefined) {
    return undefined;
  }
  const seconds = Math.max(1, Math.ceil(timeout / 1000));
  if (seconds > MAX_SCRIPT_SECONDS) {
    throw invalidRequest(
      provider,
      `runs a script for at most ${MAX_SCRIPT_SECONDS} seconds`
    );
  }
  return seconds;
};

/**
 * The request that runs a script. The request waits `REPORT_GRACE_MS` longer
 * than the script's own limit, so Firecrawl reports a timeout before the client
 * gives up.
 */
export const scriptRequest = (
  code: string,
  language: FirecrawlActOptions["language"],
  call: CallOptions,
  seconds: number | undefined
): RequestOptions => ({
  body: compact({ code, language: language ?? "node", timeout: seconds }),
  retries: call.retries,
  signal: call.signal,
  timeout:
    call.timeout === undefined ? undefined : call.timeout + REPORT_GRACE_MS,
});

/**
 * The multipart body of a `/parse` call. Refuses a file type it does not know,
 * a file over `MAX_PARSE_MB` and a `timeout` over `MAX_PARSE_MS`.
 */
export const parseForm = (
  document: DocumentInput,
  o: Omit<FirecrawlParseOptions, keyof CallOptions>,
  timeout: number | undefined
): FormData => {
  if (document.url !== undefined) {
    throw new FieldworkError(
      "Unsupported",
      "firecrawl parse accepts file bytes only; use read_page (SDK read) for a public document URL, or parse_document with llamaparse or reducto",
      { provider }
    );
  }

  if (timeout !== undefined && timeout > MAX_PARSE_MS) {
    throw invalidRequest(
      provider,
      `parses for at most ${MAX_PARSE_MS / 1000} seconds`
    );
  }
  if (mediaTypeOf(document.name) === undefined) {
    throw invalidRequest(
      provider,
      `parses ${[...MEDIA_TYPES.keys()].join(", ")} files, not "${document.name}"`
    );
  }
  refuseLarger(provider, document, MAX_PARSE_MB);
  const parser = compact({
    blocks: o.blocks,
    maxPages: o.maxPages,
    mode: o.mode,
    pageMarkers: o.pageMarkers,
    pages: o.pages,
    type: "pdf",
  });
  // Options go first, as a plain field: Firecrawl reads the parts in
  // order and rejects a second part that carries a filename.
  const form = new FormData();
  form.set(
    "options",
    // Firecrawl stops a parse after 30 seconds unless told otherwise, so the
    // call's own timeout becomes Firecrawl's.
    JSON.stringify(
      compact({ formats: ["markdown"], parsers: [parser], timeout })
    )
  );
  form.set("file", documentPart(document), document.name);
  return form;
};

/**
 * A monitor's target: a scrape of `urls`, or a search for `query`. Refuses
 * search-only options with `urls`, no `urls` and no `query`, and a search query
 * over `MAX_MONITOR_QUERY` characters.
 */
const monitorTarget = (o: Omit<FirecrawlMonitorOptions, keyof CallOptions>) => {
  const searchOnly = [
    o.searchWindow,
    o.maxResults,
    o.includeDomains,
    o.excludeDomains,
  ].some((value) => value !== undefined);
  if (o.urls && o.urls.length > 0) {
    if (searchOnly) {
      throw invalidRequest(
        provider,
        "applies searchWindow, maxResults and the domain lists to search monitors, which take a query and no urls"
      );
    }
    return { type: "scrape", urls: o.urls };
  }
  if (o.query === undefined || o.query === "") {
    throw invalidRequest(provider, "monitors need urls to watch or a query");
  }
  if (o.query.length > MAX_MONITOR_QUERY) {
    throw invalidRequest(
      provider,
      `searches queries of up to ${MAX_MONITOR_QUERY} characters; pass urls to watch pages with a longer query`
    );
  }
  return compact({
    excludeDomains: o.excludeDomains,
    includeDomains: o.includeDomains,
    maxResults: o.maxResults,
    queries: [o.query],
    searchWindow: o.searchWindow,
    type: "search",
  });
};

/** The `/monitor` body. `query` is also the monitor's `goal`, and the name defaults to the query or first URL, cut to 256 characters. */
export const monitorBody = (
  o: Omit<FirecrawlMonitorOptions, keyof CallOptions>
): Json => {
  const target = monitorTarget(o);
  return compact({
    goal: o.query,
    name: (o.name ?? o.query ?? o.urls?.[0] ?? "monitor").slice(0, 256),
    retentionDays: o.retentionDays,
    schedule: compact({ cron: cronFor(o.schedule), timezone: o.timezone }),
    targets: [target],
    webhook:
      o.webhookUrl === undefined || o.webhookUrl === ""
        ? undefined
        : { url: o.webhookUrl },
  });
};
