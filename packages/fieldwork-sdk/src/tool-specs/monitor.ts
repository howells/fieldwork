import {
  country,
  excludeDomains,
  includeDomains,
  limit,
  monitorId,
  publishedAfter,
  schemaField,
} from "./fields.js";
import {
  DELETE_MONITOR_OUTPUT,
  MONITORS_OUTPUT,
  MONITOR_EVENTS_OUTPUT,
  MONITOR_OUTPUT,
  USAGE_OUTPUT,
} from "./outputs.js";
import { flag, text, url } from "./schema.js";
import type { FieldSchema } from "./schema.js";
import type { Field, ProviderName, Spec } from "./types.js";

/** A named interval or a whole number of hours or days, as `MonitorSchedule`'s `every`. */
const EVERY = "^(hour|day|week|[1-9][0-9]*h|[1-9][0-9]*d)$";

const every: FieldSchema = {
  properties: {
    every: text(
      'How often: "hour", "day", "week", or a whole number of hours or days such as "6h" or "3d".',
      { pattern: EVERY }
    ),
  },
  required: ["every"],
  type: "object",
};

const cron: FieldSchema = {
  properties: {
    cron: text(
      'A cron expression with five fields, such as "0 9 * * 1" for Mondays at 09:00.'
    ),
  },
  required: ["cron"],
  type: "object",
};

const closed = (schema: FieldSchema): FieldSchema => ({
  ...schema,
  additionalProperties: false,
});

const SCHEDULE_NOTE =
  "How often the monitor checks. Give exactly one of every or cron.";

/**
 * The `schedule` input in the two forms providers take: Exa and Parallel an
 * `every` interval only, Firecrawl an interval or a cron expression. Two fields
 * of one name, because the accepted values differ.
 */
const schedules: Field[] = [
  {
    name: "schedule",
    providers: ["exa", "parallel"],
    requiredFor: ["parallel"],
    schema: {
      ...closed(every),
      description: `${SCHEDULE_NOTE} This provider takes every only, from one hour (Parallel: up to 30 days); it has no cron.`,
    },
  },
  {
    name: "schedule",
    providers: ["firecrawl"],
    required: true,
    schema: {
      description: `${SCHEDULE_NOTE} Cron checks must be at least 5 minutes apart.`,
      oneOf: [closed(every), closed(cron)],
    },
  },
];

const DOMAIN_NOTE =
  "Firecrawl takes domain lists only for a monitor that searches: give a query and no urls.";

/** Every provider with a monitor. */
const MONITOR_PROVIDERS: readonly ProviderName[] = [
  "exa",
  "firecrawl",
  "parallel",
];

/** The `cursor` input of `list_monitor_events`: the `next` of the previous page. */
const cursor: Field = {
  name: "cursor",
  providers: MONITOR_PROVIDERS,
  schema: text("The next value from the previous page of events."),
};

/**
 * The tools that manage monitors, `create_monitor`, `get_monitor`,
 * `list_monitors`, `delete_monitor` and `list_monitor_events`, which call the
 * methods of the `monitor` group, and `check_usage`, which calls `usage`.
 * `toolsFor` leaves out the monitor tools unless asked, since a monitor keeps
 * running and billing.
 */
export const MONITOR_SPECS: Spec[] = [
  {
    capability: "monitor",
    description:
      "Create a monitor that checks the web on a schedule and records what is new or changed, delivering it to a webhook and to list_monitor_events. A monitor keeps running, and billing, until delete_monitor removes it. Use when the user wants ongoing watching. Do not use for a one-time check (use search_web or read_page).",
    destructive: false,
    fields: [
      {
        name: "query",
        providers: MONITOR_PROVIDERS,
        requiredFor: ["exa", "parallel"],
        schema: text(
          "What to watch for, in plain words. With firecrawl and urls, what counts as a meaningful change; without urls, also the search it runs."
        ),
      },
      {
        name: "urls",
        providers: ["firecrawl"],
        schema: {
          description:
            "Pages to watch. Give urls or a query, or both. Not together with domain lists.",
          items: url("A page's full URL, including https://."),
          minItems: 1,
          type: "array",
        },
      },
      ...schedules,
      {
        name: "webhookUrl",
        providers: MONITOR_PROVIDERS,
        requiredFor: ["exa"],
        schema: url("An https address the provider calls with each event."),
      },
      {
        name: "name",
        providers: ["exa", "firecrawl"],
        schema: text("A name for the monitor."),
      },
      schemaField(
        "A JSON Schema object; each event comes back in this shape as output.",
        ["parallel"]
      ),
      limit("Results to check per run.", 100, ["exa"]),
      includeDomains("results", MONITOR_PROVIDERS, DOMAIN_NOTE),
      excludeDomains("results", MONITOR_PROVIDERS, DOMAIN_NOTE),
      publishedAfter(["parallel"]),
      country(["parallel"], "Search from"),
      {
        name: "content",
        providers: ["exa"],
        schema: flag("Include each result's page text with the event."),
      },
    ],
    idempotent: false,
    method: "create",
    name: "create_monitor",
    output: MONITOR_OUTPUT,
    positional: [],
    readOnly: false,
    title: "Create a monitor",
  },
  {
    capability: "monitor",
    description:
      "Get one monitor's settings and status. Use to check a monitor you created. Do not use to read what it found (use list_monitor_events).",
    destructive: false,
    fields: [monitorId],
    idempotent: true,
    method: "get",
    name: "get_monitor",
    output: MONITOR_OUTPUT,
    positional: ["id"],
    readOnly: true,
    title: "Get a monitor",
  },
  {
    capability: "monitor",
    description:
      "List every monitor on the account with its status. Use to find a monitor's id or to see what is still running and billing.",
    destructive: false,
    fields: [],
    idempotent: true,
    method: "list",
    name: "list_monitors",
    output: MONITORS_OUTPUT,
    positional: [],
    readOnly: true,
    title: "List monitors",
    wrapAs: "monitors",
  },
  {
    capability: "monitor",
    confirmAs: "deleted",
    description:
      "Delete a monitor so it stops running and billing. Its history may go with it, and this cannot be undone. Use when the watching is no longer wanted. Do not use to pause a monitor.",
    destructive: true,
    fields: [monitorId],
    idempotent: true,
    method: "delete",
    name: "delete_monitor",
    output: DELETE_MONITOR_OUTPUT,
    positional: ["id"],
    readOnly: false,
    title: "Delete a monitor",
  },
  {
    capability: "monitor",
    description:
      "List what a monitor found, one event per check or per change, newest first. Use to read a monitor's results. Pass next back as cursor for the following page.",
    destructive: false,
    fields: [
      monitorId,
      cursor,
      limit("How many events to return.", 100, ["exa", "parallel"]),
    ],
    idempotent: true,
    method: "events",
    name: "list_monitor_events",
    output: MONITOR_EVENTS_OUTPUT,
    positional: ["id"],
    readOnly: true,
    title: "List a monitor's events",
  },
  {
    capability: "usage",
    description:
      "Return the account's credits used and remaining in the current period, as the provider reports them. Use before a large job, or to explain a quota error. Changes nothing.",
    destructive: false,
    fields: [],
    idempotent: true,
    name: "check_usage",
    output: USAGE_OUTPUT,
    positional: [],
    readOnly: true,
    title: "Check usage",
  },
];
