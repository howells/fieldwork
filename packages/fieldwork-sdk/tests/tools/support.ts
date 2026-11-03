import type { AnyAdapter } from "../../src/adapter.js";
import { brave } from "../../src/adapters/brave.js";
import { browserbase } from "../../src/adapters/browserbase.js";
import { exa } from "../../src/adapters/exa.js";
import { firecrawl } from "../../src/adapters/firecrawl.js";
import { llamaparse } from "../../src/adapters/llamaparse.js";
import { parallel } from "../../src/adapters/parallel.js";
import { perplexity } from "../../src/adapters/perplexity.js";
import { reducto } from "../../src/adapters/reducto.js";
import { serpapi } from "../../src/adapters/serpapi.js";
import { tavily } from "../../src/adapters/tavily.js";
import { Fieldwork } from "../../src/fieldwork.js";
import type { Field, Spec } from "../../src/tool-specs/types.js";
import { EXCLUDED_BY_DEFAULT, toolsFor } from "../../src/tools.js";
import { isJsonObject, isList, isText } from "../../src/tools/json.js";
import type { JsonObject, JsonValue } from "../../src/tools/json.js";
import type { Capability } from "../../src/types.js";
import { fakeFetch } from "../helpers.js";
import type { RecordedCall } from "../helpers.js";

type Fetch = typeof fetch;
type Factory = (fetchImpl: Fetch) => AnyAdapter;

/** Every provider, built with a fake fetch and no network. */
const FACTORIES = new Map<string, Factory>([
  [
    "brave",
    (fetchImpl) => brave({ apiKey: "k", fetch: fetchImpl, retries: 0 }),
  ],
  [
    "browserbase",
    (fetchImpl) =>
      browserbase({
        apiKey: "k",
        fetch: fetchImpl,
        projectId: "p",
        retries: 0,
      }),
  ],
  ["exa", (fetchImpl) => exa({ apiKey: "k", fetch: fetchImpl, retries: 0 })],
  [
    "firecrawl",
    (fetchImpl) => firecrawl({ apiKey: "k", fetch: fetchImpl, retries: 0 }),
  ],
  [
    "llamaparse",
    (fetchImpl) => llamaparse({ apiKey: "k", fetch: fetchImpl, retries: 0 }),
  ],
  [
    "parallel",
    (fetchImpl) => parallel({ apiKey: "k", fetch: fetchImpl, retries: 0 }),
  ],
  [
    "perplexity",
    (fetchImpl) => perplexity({ apiKey: "k", fetch: fetchImpl, retries: 0 }),
  ],
  [
    "reducto",
    (fetchImpl) => reducto({ apiKey: "k", fetch: fetchImpl, retries: 0 }),
  ],
  [
    "serpapi",
    (fetchImpl) => serpapi({ apiKey: "k", fetch: fetchImpl, retries: 0 }),
  ],
  [
    "tavily",
    (fetchImpl) => tavily({ apiKey: "k", fetch: fetchImpl, retries: 0 }),
  ],
]);

/** A Fieldwork instance for one provider, on the given fetch. */
export const webFor = (
  provider: string,
  fetchImpl: Fetch
): Fieldwork<AnyAdapter> => {
  const factory = FACTORIES.get(provider);
  if (factory === undefined) {
    throw new Error(`unknown provider ${provider}`);
  }
  return new Fieldwork({ adapter: factory(fetchImpl) });
};

/** The providers that have a capability, read from the adapters themselves. */
export const providersWith = (capability: Capability): string[] =>
  [...FACTORIES.keys()].filter((name) =>
    webFor(name, fakeFetch().fetch).supports(capability)
  );

/** The fields of a spec that a provider is offered. */
export const offeredFields = (spec: Spec, provider: string): Field[] =>
  spec.fields.filter(
    (field) =>
      field.providers === undefined ||
      field.providers.some((name) => name === provider)
  );

export const isRequired = (field: Field, provider: string): boolean =>
  field.required === true ||
  field.requiredFor?.some((name) => name === provider) === true;

const SCHEMA: JsonValue = {
  properties: { width: { type: "string" } },
  type: "object",
};

/** Valid values by field name, or by `tool.field` where a tool needs its own. */
const SAMPLES = new Map<string, JsonValue>([
  ["code", "console.log(1)"],
  ["conditions", [{ description: "Sells stone tile", name: "tile" }]],
  ["content", true],
  ["contentBase64", "aGVsbG8="],
  ["context", "A limestone quarry in Vermont"],
  ["continueFrom", "prior-1"],
  ["country", "GB"],
  ["create_monitor.name", "Watch tiles"],
  ["create_monitor.schema", SCHEMA],
  ["create_monitor.urls", ["https://a.test/watch"]],
  ["cursor", "20"],
  ["entityType", "companies"],
  ["excludeDomains", ["b.test"]],
  ["find_entities.limit", 20],
  ["id", "id-1"],
  ["includeDomains", ["a.test"]],
  ["language", "en"],
  ["limit", 3],
  ["list_monitor_events.limit", 5],
  ["maxAge", 3600],
  ["objective", "tile makers in Europe"],
  ["pages", true],
  ["parse_document.name", "sheet.pdf"],
  ["prompt", "the widths"],
  ["publishedAfter", "2025-01-01"],
  ["publishedBefore", "2026-01-01"],
  ["query", "oak flooring"],
  ["question", "How wide is the plank?"],
  ["questions", { fit: { question: "Is it oak?", type: "yesno" } }],
  ["recency", "week"],
  ["resume", "job-1"],
  ["run_browser_script.language", "python"],
  ["schedule", { every: "day" }],
  ["schema", SCHEMA],
  ["ttl", 120],
  ["url", "https://a.test/p"],
  ["urls", ["https://a.test/1"]],
  ["webhookUrl", "https://hook.test/in"],
]);

/** Different valid values for required fields, to show the field is sent. */
const ALTERNATES = new Map<string, JsonValue>([
  ["contentBase64", "d29ybGQ="],
  ["questions", { fit: { question: "Is it pine?", type: "yesno" } }],
  ["schema", { properties: { depth: { type: "string" } }, type: "object" }],
]);

/**
 * Extra inputs a call needs beside the field under test, keyed
 * `tool.field@provider`, `field@provider` or `tool@provider`.
 */
const COMPANIONS = new Map<string, JsonObject>([
  ["create_monitor.query@firecrawl", { urls: ["https://a.test/watch"] }],
  ["create_monitor@firecrawl", { query: "price drops" }],
  ["publishedBefore@brave", { publishedAfter: "2025-01-01" }],
]);

const lookup = <T>(
  table: Map<string, T>,
  tool: string,
  field: string
): T | undefined => table.get(`${tool}.${field}`) ?? table.get(field);

export const sample = (tool: string, field: string): JsonValue => {
  const value = lookup(SAMPLES, tool, field);
  if (value === undefined) {
    throw new Error(`no sample for ${tool}.${field}`);
  }
  return value;
};

const vary = (value: JsonValue): JsonValue => {
  if (isText(value)) {
    return `${value}x`;
  }
  if (isList(value)) {
    return value.map((item) => vary(item));
  }
  if (isJsonObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        item === undefined ? item : vary(item),
      ])
    );
  }
  return value;
};

/** A different valid value for a required field, to show the field is sent. */
export const alternate = (tool: string, field: string): JsonValue => {
  const given = lookup(ALTERNATES, tool, field);
  if (given !== undefined) {
    return given;
  }
  const value = sample(tool, field);
  return isList(value)
    ? [...value, ...value.map((item) => vary(item))]
    : vary(value);
};

export const companions = (
  tool: string,
  field: string,
  provider: string
): JsonObject =>
  COMPANIONS.get(`${tool}.${field}@${provider}`) ??
  COMPANIONS.get(`${field}@${provider}`) ??
  COMPANIONS.get(`${tool}@${provider}`) ??
  {};

/** The inputs a provider needs for a tool, without any optional field. */
export const baseInput = (spec: Spec, provider: string): JsonObject =>
  Object.fromEntries(
    offeredFields(spec, provider)
      .filter((field) => isRequired(field, provider))
      .map((field) => [field.name, sample(spec.name, field.name)])
  );

/**
 * A reply that satisfies every provider's "job created" and "session opened"
 * check, so a call goes on to its second request. It has no status, so a job
 * is never finished and polling ends at the call's timeout.
 */
const CREATED: JsonObject = {
  findall_id: "job-1",
  id: "job-1",
  job_id: "job-1",
  run_id: "job-1",
  success: true,
};

export interface Recorded {
  body: string;
  method: string;
  url: string;
}

/** A request body as comparable text: JSON as sent, or a multipart form's parts. */
const bodyText = async (call: RecordedCall): Promise<string> => {
  const { body } = call;
  if (!(body instanceof FormData)) {
    return JSON.stringify(body) ?? "";
  }
  const parts = await Promise.all(
    [...body.entries()].map(async ([key, part]) => [
      key,
      // A file part's name reaches the provider too.
      part instanceof File
        ? { name: part.name, text: await part.text(), type: part.type }
        : part,
    ])
  );
  return JSON.stringify(parts);
};

/**
 * Runs one tool on one provider against a fake fetch and returns the requests
 * the provider received. A reply the adapter cannot read ends the call with
 * an error, which does not matter here: only the requests are compared.
 */
export const requestsFor = async (
  provider: string,
  toolName: string,
  input: JsonObject
): Promise<Recorded[]> => {
  const { calls, fetch: fetchImpl } = fakeFetch(
    ...Array.from({ length: 12 }, () => ({ body: CREATED }))
  );
  const tool = toolsFor(webFor(provider, fetchImpl), {
    allow: [...EXCLUDED_BY_DEFAULT],
  }).find((candidate) => candidate.name === toolName);
  if (tool === undefined) {
    throw new Error(`${provider} has no tool ${toolName}`);
  }
  try {
    await tool.execute(input, { timeout: 50 });
  } catch {
    // The reply is not a real result; the requests are what is compared.
  }
  return await Promise.all(
    calls.map(async (call) => ({
      body: await bodyText(call),
      method: call.method,
      url: call.url.href,
    }))
  );
};
