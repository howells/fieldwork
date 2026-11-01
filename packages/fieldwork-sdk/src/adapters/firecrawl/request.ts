import type { RequestOptions } from "../../http.js";
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
import { country, invalid, provider } from "./shared.js";

/** The largest file `/parse` takes. */
const MAX_PARSE_BYTES = 50 * 1024 * 1024;
/** Longest script `/interact/{id}/execute` runs, in seconds. */
const MAX_SCRIPT_SECONDS = 300;
/** Milliseconds the request outlives the script's own limit, so a killed script reports back. */
const SCRIPT_GRACE_MS = 10_000;
/** The most monitors or checks Firecrawl returns per request. */
export const PAGE_SIZE = 100;
/** The longest query a search monitor takes. */
const MAX_MONITOR_QUERY = 256;

const MEDIA_TYPES = new Map<string, string>(
  Object.entries({
    csv: "text/csv",
    doc: "application/msword",
    docm: "application/vnd.ms-word.document.macroEnabled.12",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    epub: "application/epub+zip",
    htm: "text/html",
    html: "text/html",
    odp: "application/vnd.oasis.opendocument.presentation",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    odt: "application/vnd.oasis.opendocument.text",
    pdf: "application/pdf",
    ppt: "application/vnd.ms-powerpoint",
    pptm: "application/vnd.ms-powerpoint.presentation.macroEnabled.12",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    rtf: "application/rtf",
    xhtml: "application/xhtml+xml",
    xls: "application/vnd.ms-excel",
    xlsb: "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
    xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
);

const RECENCY = {
  day: "d",
  hour: "h",
  month: "m",
  week: "w",
  year: "y",
} as const satisfies Record<Recency, string>;

const DATE = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u;

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

export const readBody = (o: FirecrawlReadSettings) => ({
  formats: readFormats(o),
  ...pageBody(o),
});

const usDate = (value: string): string => {
  const groups = DATE.exec(value)?.groups;
  if (!groups) {
    throw invalid(`firecrawl needs dates as YYYY-MM-DD, got "${value}"`);
  }
  return `${groups.month}/${groups.day}/${groups.year}`;
};

type SearchSettings = Omit<FirecrawlSearchOptions, keyof CallOptions>;

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

export const searchBody = (query: string, o: SearchSettings) => {
  refuseTogether(provider, o, "includeDomains", "excludeDomains");
  if (o.categories?.includes("gov") === true && o.categories.length > 1) {
    throw invalid(
      "firecrawl searches the gov category on its own; do not combine it with another category"
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
    schema: o.schema,
    strictConstrainToURLs: o.strictConstrainToURLs,
    threadId: o.continueFrom,
    urls: o.urls,
  });

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
    throw invalid(
      `firecrawl runs a script for at most ${MAX_SCRIPT_SECONDS} seconds`
    );
  }
  return seconds;
};

export const scriptRequest = (
  code: string,
  language: FirecrawlActOptions["language"],
  call: CallOptions,
  seconds: number | undefined
): RequestOptions => ({
  body: compact({ code, language: language ?? "node", timeout: seconds }),
  signal: call.signal,
  timeout:
    call.timeout === undefined ? undefined : call.timeout + SCRIPT_GRACE_MS,
});

export const parseForm = (
  document: DocumentInput,
  o: Omit<FirecrawlParseOptions, keyof CallOptions>
): FormData => {
  const extension = document.name.split(".").pop()?.toLowerCase() ?? "";
  const mediaType = MEDIA_TYPES.get(extension);
  if (mediaType === undefined) {
    throw invalid(
      `firecrawl parses ${[...MEDIA_TYPES.keys()].join(", ")} files, not "${document.name}"`
    );
  }
  const size =
    document.data instanceof Blob
      ? document.data.size
      : document.data.byteLength;
  if (size > MAX_PARSE_BYTES) {
    throw invalid(
      `firecrawl parses files up to 50 MB; ${document.name} is ${(size / 1024 / 1024).toFixed(1)} MB`
    );
  }
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
    JSON.stringify({ formats: ["markdown"], parsers: [parser] })
  );
  // A Uint8Array may sit on a SharedArrayBuffer, which a Blob part does not
  // type; copying it puts the bytes on an ArrayBuffer.
  const part =
    document.data instanceof Uint8Array
      ? new Uint8Array(document.data)
      : document.data;
  form.set("file", new Blob([part], { type: mediaType }), document.name);
  return form;
};

const monitorTarget = (o: Omit<FirecrawlMonitorOptions, keyof CallOptions>) => {
  const searchOnly = [
    o.searchWindow,
    o.maxResults,
    o.includeDomains,
    o.excludeDomains,
  ].some((value) => value !== undefined);
  if (o.urls && o.urls.length > 0) {
    if (searchOnly) {
      throw invalid(
        "firecrawl applies searchWindow, maxResults and the domain lists to search monitors, which take a query and no urls"
      );
    }
    return { type: "scrape", urls: o.urls };
  }
  if (o.query === undefined || o.query === "") {
    throw invalid("firecrawl monitors need urls to watch or a query");
  }
  if (o.query.length > MAX_MONITOR_QUERY) {
    throw invalid(
      `firecrawl searches queries of up to ${MAX_MONITOR_QUERY} characters; pass urls to watch pages with a longer query`
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
