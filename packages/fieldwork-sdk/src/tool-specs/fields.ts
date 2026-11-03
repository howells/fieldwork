import { choice, date, object, text, texts, url, whole } from "./schema.js";
import type { Field, ProviderName } from "./types.js";

/**
 * Inputs that several tools share. Each helper takes the providers whose
 * options type has the option with this meaning.
 */

const RESUME_DESCRIPTION =
  "The jobId from an earlier call's error, when that call timed out or was cancelled. Waits for that job instead of starting and paying for a new one.";

export const urlField = (description: string): Field => ({
  name: "url",
  required: true,
  schema: url(description),
});

export const PAGE_URL = "The page's full URL, including https://.";

export const resume = (providers: readonly ProviderName[]): Field => ({
  name: "resume",
  providers,
  schema: text(RESUME_DESCRIPTION),
});

export const limit = (
  description: string,
  maximum: number,
  providers?: readonly ProviderName[]
): Field => ({
  name: "limit",
  providers,
  schema: whole(description, 1, maximum),
});

const NOT_TOGETHER =
  "Firecrawl, Parallel and Perplexity refuse includeDomains and excludeDomains together.";

export const includeDomains = (
  noun: string,
  providers: readonly ProviderName[],
  note = ""
): Field => ({
  name: "includeDomains",
  providers,
  schema: texts(
    `Only use ${noun} from these domains, such as example.com. ${NOT_TOGETHER} ${note}`.trim()
  ),
});

export const excludeDomains = (
  noun: string,
  providers: readonly ProviderName[],
  note = ""
): Field => ({
  name: "excludeDomains",
  providers,
  schema: texts(
    `Leave out ${noun} from these domains, such as example.com. ${NOT_TOGETHER} ${note}`.trim()
  ),
});

export const publishedAfter = (providers: readonly ProviderName[]): Field => ({
  name: "publishedAfter",
  providers,
  schema: date("Only pages published on or after this date, YYYY-MM-DD."),
});

export const publishedBefore = (providers: readonly ProviderName[]): Field => ({
  name: "publishedBefore",
  providers,
  schema: date("Only pages published before this date, YYYY-MM-DD."),
});

/** The providers whose adapters refuse recency with a date bound, as each one's API does. */
const RECENCY_REFUSERS = new Map<ProviderName, string>([
  ["brave", "Brave"],
  ["firecrawl", "Firecrawl"],
  ["serpapi", "SerpApi"],
]);

/** Names the refusers among `providers`, so a model is told only what applies. */
const recencyNote = (providers: readonly ProviderName[]) => {
  const names = providers.flatMap((name) => {
    const label = RECENCY_REFUSERS.get(name);
    return label === undefined ? [] : [label];
  });
  if (names.length === 0) {
    return "";
  }
  const list =
    names.length === 1
      ? names.join("")
      : `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
  return ` ${list} refuse it together with publishedAfter or publishedBefore.`;
};

/**
 * `withHour` providers accept all five windows; `fromDay` providers have no
 * hour window. Two fields with one name, because the accepted values differ.
 */
export const recency = (
  withHour: readonly ProviderName[],
  fromDay: readonly ProviderName[]
): Field[] =>
  [
    {
      name: "recency",
      providers: withHour,
      schema: choice(
        `Only pages from the last hour, day, week, month or year.${recencyNote(withHour)}`,
        ["hour", "day", "week", "month", "year"]
      ),
    },
    {
      name: "recency",
      providers: fromDay,
      schema: choice(
        `Only pages from the last day, week, month or year.${recencyNote(fromDay)}`,
        ["day", "week", "month", "year"]
      ),
    },
  ].filter((field) => field.providers.length > 0);

export const country = (
  providers: readonly ProviderName[],
  what = "Prefer results for"
): Field => ({
  name: "country",
  providers,
  schema: text(`${what} this country, as a two-letter ISO code such as GB.`, {
    pattern: "^[A-Za-z]{2}$",
  }),
});

export const language = (providers: readonly ProviderName[]): Field => ({
  name: "language",
  providers,
  schema: text(
    "Prefer pages in this language, as an ISO 639-1 code such as en."
  ),
});

export const continueFrom = (providers: readonly ProviderName[]): Field => ({
  name: "continueFrom",
  providers,
  schema: text(
    "The continuationId of an earlier result, to ask a follow-up in the same thread instead of starting over."
  ),
});

export const schemaField = (
  description: string,
  providers?: readonly ProviderName[],
  required = false
): Field => ({
  name: "schema",
  providers,
  required,
  schema: { description, type: "object" },
});

const CACHE =
  "Use a cached copy of the page if it is no older than this many seconds.";

/** Providers that can fetch fresh: 0 always does. */
export const maxAge = (providers: readonly ProviderName[]): Field => ({
  name: "maxAge",
  providers,
  schema: whole(`${CACHE} 0 always fetches a fresh copy.`, 0),
});

/** Parallel never fetches fresh: it refuses a maximum age under 600 seconds. */
export const maxAgeAtLeast600 = (): Field => ({
  name: "maxAge",
  providers: ["parallel"],
  schema: whole(
    `${CACHE} At least 600: Parallel cannot always fetch fresh.`,
    600
  ),
});

export const monitorId: Field = {
  name: "id",
  required: true,
  schema: text("The monitor's id, from create_monitor or list_monitors."),
};

export const condition = object(
  {
    description: text("The condition in plain words."),
    name: text("A short name for the condition."),
  },
  ["name", "description"]
);
