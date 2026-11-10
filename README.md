# Fieldwork

One API for searching the web, reading pages, extracting values, walking sites, answering and researching questions, finding entities, watching for changes, driving a browser and parsing documents, across Exa, Firecrawl, Tavily, Parallel, Perplexity, Brave, SerpApi, Browserbase, Kernel, LlamaParse and Reducto.

```sh
npm i @howells/fieldwork-sdk
```

```ts
import { Fieldwork } from "@howells/fieldwork-sdk";
import { firecrawl } from "@howells/fieldwork-sdk/firecrawl";

// Reads FIRECRAWL_API_KEY
const web = new Fieldwork({ adapter: firecrawl() });

const { results } = await web.search("TileBar Portmore Aqua 3x8");
const page = await web.read(results[0].url);
const product = await web.product(page.url); // variants, without a model
```

Swap the adapter to switch providers. Everything below the constructor stays the same, as long as the new provider offers the capability.

## Capabilities

Each instance has only the methods its provider offers, so a call the provider cannot serve does not compile. `new Fieldwork({ adapter: tavily() }).act(...)` is a type error, because Tavily has no browser. Untyped JavaScript gets a `FieldworkError` with code `Unsupported`, and no request is sent. Nothing falls back to another provider, and nothing is emulated: a provider without an answer endpoint has no `answer`, even though search plus a model could imitate one.

| Method | Exa | Firecrawl | Tavily | Parallel | Perplexity | Brave | SerpApi | Browserbase | Kernel | LlamaParse | Reducto |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `search(query)` | yes | yes | yes | yes | yes | yes | yes | yes |  |  |  |
| `images(query)` |  | yes | yes | yes |  | yes | yes |  |  |  |  |
| `read(url)` | yes | yes | yes | yes |  |  |  | yes | yes |  |  |
| `readMany(urls)` | yes | yes | yes | yes |  |  |  |  |  |  |  |
| `extract(url, { schema })` | yes | yes |  | yes |  |  |  |  |  |  |  |
| `product(url)` |  | yes |  |  |  |  |  |  |  |  |  |
| `map(url)` |  | yes | yes |  |  |  |  |  |  |  |  |
| `crawl(url)` |  | yes | yes |  |  |  |  |  |  |  |  |
| `answer(question)` | yes |  | yes | yes | yes | yes |  |  |  |  |  |
| `research(question)` | yes | yes | yes | yes | yes |  |  |  |  |  |  |
| `discover(objective, { entityType, conditions })` |  |  |  | yes |  |  |  |  |  |  |  |
| `decide(context, questions)` |  |  |  | yes | yes |  |  |  |  |  |  |
| `act(code)` |  | yes |  |  |  |  |  |  |  |  |  |
| `browser.open()`, `browser.close(id)` |  | yes |  |  |  |  |  | yes | yes |  |  |
| `parse(document)` |  | yes |  |  |  |  |  |  |  | yes | yes |
| `monitor.create()`, `.get`, `.list`, `.delete`, `.events` | yes | yes |  | yes |  |  |  |  |  |  |  |
| `usage()` |  | yes | yes |  |  |  | yes | yes |  |  |  |

`web.capabilities` and `web.supports("crawl")` report the same table at runtime.

- `answer` is a provider's own cited answer, returned in one call. `research` is a longer job of many steps, polled until it finishes.
- `discover` returns a list of entities, such as companies or products, that meet every condition you give.
- `decide` answers closed questions about a context: yes or no, a choice, or a score on a rubric, each with a probability.
- `browser.open()` starts a remote browser and returns its CDP URL for Playwright or Puppeteer; `act(code)` runs one script in a fresh session.
- `monitor` repeats a search or a page check on a schedule and reports what changed. Exa and Parallel monitors watch a query; Firecrawl monitors also watch specific pages (`urls`).

### Options

Options are typed per provider. An option means the same thing under the same name everywhere:

| Option | Meaning |
| --- | --- |
| `limit` | The most results or pages to return. |
| `includeDomains`, `excludeDomains` | Plain domains such as `example.com`. Options that take regular expressions or paths have their own names, such as Firecrawl's `includePaths`. |
| `publishedAfter`, `publishedBefore` | Dates as `YYYY-MM-DD`. |
| `recency` | `"hour"`, `"day"`, `"week"`, `"month"` or `"year"`, narrowed to what the provider supports. |
| `maxAge` | Seconds a cached copy may be old; `0` always fetches the page fresh. |
| `country` | An ISO 3166-1 code such as `"GB"`. |
| `language` | An ISO 639-1 code such as `"de"`. |
| `schema`, `prompt` | A JSON Schema or a Standard Schema such as Zod for structured output, and extraction instructions in plain words. |
| `query` | On `read`: return the passages that answer it as `excerpts`. |
| `content` | On `search`: include each result's page text. |
| `continueFrom` | On `answer` and `research`: the `continuationId` of an earlier result, to ask a follow-up. |
| `resume`, `interval` | On jobs: collect an earlier job by its id, and the milliseconds between status checks (unset: 500, doubling to 2000). |

Options only one provider has keep that provider's meaning and values, such as Tavily's `topic`, Exa's `category`, SerpApi's `engine` or Firecrawl's `proxy`. A combination a provider would reject or silently ignore, such as `includeDomains` with `excludeDomains` on Parallel, throws `InvalidRequest` before anything is sent.

### Structured output

`schema` takes a plain JSON Schema, or a Zod, Valibot or ArkType schema. Any library that implements Standard Schema with JSON Schema support works. Use the full `zod` package: `zod/mini` schemas do not write JSON Schema.

```ts
import { z } from "zod";

const page = await web.extract(url, {
  schema: z.object({ price: z.number(), title: z.string() }),
});
page.data; // { price: number; title: string }
```

Fieldwork turns the schema into the JSON Schema the provider reads, and checks the provider's output against your schema before returning it. Output that does not match throws `ProviderError` with the first paths that failed, such as `price: Invalid input: expected number, received string`. The error carries `jobId` when the call was a job. `data` and `output` are what your schema returns, so defaults and transforms apply.

A plain JSON Schema is sent as written and the output is not checked. Pass the type yourself: `web.extract<{ price: number }>(url, { schema })`. Without one the type is `unknown`. Agent tools take plain JSON Schema only.

Providers differ in which keywords they accept; Exa reads draft 7 and the others draft 2020-12, and Fieldwork drops the `$schema` key. Tavily and Parallel accept only a subset, so keep schemas for them simple.

## Results

Every result is normalized and keeps the provider's response in `raw`. Most also carry `meta`: the provider's `requestId`, `usage` (credits, US dollars, or counted units such as tokens) and `warnings`, when the provider returns them.

- `search` returns `{ results, answer, images, meta, raw }`. Each result has `url`, `title`, `snippet` and, when the provider has them, `content`, `publishedAt`, `author`, `image`, `favicon` and `score`. Shopping, place, news, scholar and patent results set `kind` and carry `price`, `rating`, `reviewCount` and `place`.
- `read` returns a `Page`: `url`, `title`, `description`, `markdown`, `html`, `links`, `images`, `image` (the page's main image), `excerpts`, `summary`, `publishedAt`, `author`, `language`, `statusCode` and `screenshot`, as the provider has them. A page that answered 404 or 410 is not returned: `read` throws `NotFound` on every provider, and `readMany` lists the URL in `failed`.
- `readMany` returns `{ pages, failed }`. A URL that could not be read is listed in `failed` with the reason; it does not throw.
- `extract` returns `{ data, fields }`. `data` follows your schema; `fields` lists each field's citations when the provider returns them.
- `product` returns the product and its `variants`, each with `sku`, option `values`, `price` (`amount`, `currency`, `formatted`), `originalPrice`, `availability`, `gtin` and `images` (`{ url, alt }`).
- `answer` returns `{ answer, output, citations, continuationId }`.
- `research` returns `{ id, status, output, sources, fields, continuationId }`. `output` follows your schema when you pass one, otherwise it is the report text.
- `crawl` returns `{ pages, failed, robotsBlocked, total }`.

A job that stopped early but produced output, for example on a credit or step limit, returns `status: "partial"` with `stopReason`. A job with no usable output throws `JobFailed`.

### Long jobs

Research, discovery, crawls, batch reads and Parallel extraction are polled until they finish. A job status the provider does not document throws `ProviderError` with `jobId` at once, instead of polling until the timeout. Pass `timeout` and `signal` to bound or cancel any call.

When a job outlasts `timeout`, or `signal` stops the wait, the provider keeps running it and charging for it. The error carries the job's id as `jobId`; pass it back as `resume` to collect the result instead of starting another job:

```ts
try {
  return await web.research(question, { timeout: 60_000 });
} catch (error) {
  if (error instanceof FieldworkError && error.jobId) {
    return await web.research(question, { resume: error.jobId });
  }
  throw error;
}
```

### Monitors and browsers

`monitor` and `browser` are groups of methods:

```ts
const watch = await web.monitor.create({
  urls: ["https://www.tilebar.com/portmore-aqua"],
  query: "price or stock changes",
  schedule: { every: "day" },
  webhookUrl: "https://example.com/hooks/fieldwork",
});
const { events } = await web.monitor.events(watch.id);
await web.monitor.delete(watch.id);

const session = await web.browser.open();
// connect Playwright to session.cdpUrl
await web.browser.close(session.id);
```

A schedule is `{ every: "day" }`, `{ every: "6h" }` or `{ cron: "0 9 * * 1" }`. A schedule the provider cannot express throws `InvalidRequest`.

## Choosing a provider per capability

`router` sends each capability to exactly one adapter:

```ts
import { Fieldwork, router } from "@howells/fieldwork-sdk";
import { brave } from "@howells/fieldwork-sdk/brave";
import { exa } from "@howells/fieldwork-sdk/exa";
import { firecrawl } from "@howells/fieldwork-sdk/firecrawl";
import { parallel } from "@howells/fieldwork-sdk/parallel";

const web = new Fieldwork({
  adapter: router({
    search: brave(),
    read: firecrawl(),
    product: firecrawl(),
    answer: parallel(),
    research: exa(),
  }),
});
```

A capability without a route is unsupported. A route to an adapter that lacks the capability is a type error and throws when the router is built. For routes known only at run time, such as from flags or configuration, `runtimeRouter(routes)` makes the same check when it is called.

## Errors

Every failure is a `FieldworkError`. It carries:

- `code`, one of the codes below;
- `provider` and the HTTP `status`;
- `retryable`: whether repeating the same call can succeed;
- `retryAfter`, in seconds, when the provider sent one;
- `jobId`, when a job had already started;
- the provider's response, as `cause`.

`error.toJSON()` returns these fields without the provider's response.

| Code | What happened | What to do |
| --- | --- | --- |
| `Unsupported` | The provider does not offer this capability. | Use an adapter that does. Nothing was sent. |
| `Unauthorized` | The key is missing, wrong or not allowed. | Fix the key. Repeating does not help. |
| `RateLimited` | A rate or plan limit was reached. | Wait `retryAfter` seconds, then repeat. |
| `NotFound` | The page, product or job does not exist. | Check the URL or id. |
| `InvalidRequest` | The input was refused, by Fieldwork or by the provider. | Correct the input; the message says what is wrong. |
| `JobFailed` | The job ended without a result. | Start a new job if needed; resuming fails again. |
| `Timeout` | The call or job outlasted its time. | With `jobId`, pass it as `resume`. Without one, repeat when `retryable` is true. |
| `Aborted` | `signal` cancelled the call. | With `jobId`, the job may still be running; pass it as `resume`. |
| `ProviderError` | Any other provider failure. | Repeat when `retryable` is true (5xx and network failures). |

An error with a `jobId` is never `retryable`, because repeating the call would start and charge for a second job. Nor is a failure, other than a rate limit, of the request that starts a job, session or monitor: the provider may already have started it, so check before repeating.

## Agent tools

`@howells/fieldwork-sdk/tools` turns an instance into tool definitions for a model, one per capability or group method: `search_web`, `search_images`, `read_page`, `read_pages`, `extract_values`, `read_product`, `map_site`, `crawl_site`, `answer_question`, `research_question`, `find_entities`, `make_decisions`, `parse_document`, `check_usage`, `run_browser_script`, `open_browser`, `close_browser`, `create_monitor`, `get_monitor`, `list_monitors`, `delete_monitor` and `list_monitor_events`. Each tool has:

- a description that says when to use it and which tool to use instead;
- a JSON Schema input that lists only the options its provider supports;
- an output schema;
- MCP annotations.

`execute(input)` checks the input, calls the capability, and returns the result without `raw`, with long text cut to a shared budget of 20,000 characters (`maxCharacters`).

```ts
import { jsonSchema, tool } from "ai";
import { toolsFor } from "@howells/fieldwork-sdk/tools";

const tools = Object.fromEntries(
  toolsFor(web).map((t) => [
    t.name,
    tool({
      description: t.description,
      inputSchema: jsonSchema(t.inputSchema),
      execute: (input, { abortSignal }) =>
        t.execute(input, { signal: abortSignal }),
    }),
  ])
);
```

Tools that start remote browsers or create lasting, billed resources are left out unless you allow them: `toolsFor(web, { allow: ["act", "browser", "monitor"] })`. `toolError(error)` formats an error for a model.

For MCP clients such as Claude, Cursor and Codex, [`@howells/fieldwork-mcp`](https://www.npmjs.com/package/@howells/fieldwork-mcp) serves these tools over stdio, or over HTTP and remote MCP from a gateway with a key per agent.

## The provider's own API

`web.raw.request(method, path, options)` calls the provider's HTTP API with authentication applied, for anything Fieldwork does not wrap:

```ts
const check = await new Fieldwork({ adapter: firecrawl() }).raw.request(
  "GET",
  `/monitor/${monitorId}/checks/${checkId}`
);
```

On a router, `raw` is keyed by provider name.

## Keys

| Adapter         | Environment variable  |
| --------------- | --------------------- |
| `exa()`         | `EXA_API_KEY`         |
| `firecrawl()`   | `FIRECRAWL_API_KEY`   |
| `tavily()`      | `TAVILY_API_KEY`      |
| `parallel()`    | `PARALLEL_API_KEY`    |
| `perplexity()`  | `PERPLEXITY_API_KEY`  |
| `brave()`       | `BRAVE_API_KEY`       |
| `serpapi()`     | `SERPAPI_API_KEY`     |
| `browserbase()` | `BROWSERBASE_API_KEY` |
| `kernel()`      | `KERNEL_API_KEY`      |
| `llamaparse()`  | `LLAMA_CLOUD_API_KEY` |
| `reducto()`     | `REDUCTO_API_KEY`     |

Pass `apiKey` (and Browserbase's `projectId`) to override, and `fetch` to supply your own. Requests follow redirects only within the provider's origin; a redirect to any other host, scheme or port fails before the key is sent there.

ESM only, Node 22 or later. The dependencies are Zod and, for Kernel's Markdown, Turndown.
