# Fieldwork

One API for searching the web, reading pages, extracting values, walking sites, running research, driving a browser and parsing documents, across Exa, Firecrawl, Tavily, Parallel and Perplexity.

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

Each instance has only the methods its provider offers, so a call the provider cannot serve does not compile. `new Fieldwork({ adapter: tavily() }).act(...)` is a type error, because Tavily has no browser. Untyped JavaScript gets a `FieldworkError` with code `Unsupported`, and no request is sent. Nothing falls back to another provider.

| Method | Exa | Firecrawl | Tavily | Parallel | Perplexity |
| --- | --- | --- | --- | --- | --- |
| `search(query)` | yes | yes | yes | yes | yes |
| `read(url)` | yes | yes | yes | yes |  |
| `extract(url, { schema })` | yes | yes |  | yes |  |
| `product(url)` |  | yes |  |  |  |
| `map(url)` |  | yes | yes |  |  |
| `crawl(url)` |  | yes | yes |  |  |
| `research(question)` | yes | yes | yes | yes | yes |
| `act(code)` |  | yes |  |  |  |
| `parse(document)` |  | yes |  |  |  |

`web.capabilities` and `web.supports("crawl")` report the same table at runtime.

Options are typed per provider too. Shared ideas share a name (`limit`, `includeDomains`, `excludeDomains`, `publishedAfter`, `country`); options only one provider has keep that provider's meaning, such as Tavily's `topic` or Exa's `category`.

## Results

Every result is normalized and keeps the provider's response in `raw`:

- `search` returns `{ results: [{ url, title, snippet, content, publishedAt, score }], answer, raw }`.
- `read` returns a `Page`: `{ url, title, markdown, html, rawHtml, links, images, excerpts, raw }`.
- `extract` returns `{ data, fields, raw }`. `data` follows your schema; `fields` lists each field's citations when the provider returns them (Parallel).
- `research` returns `{ id, output, sources, fields, raw }`. `output` follows your schema when you pass one, otherwise it is the report text. Exa and Parallel return per-field sources in `fields`.
- `product` returns `{ title, brand, category, url, variants: [{ sku, values, price, inStock, images }], raw }`.

Asynchronous jobs (research on Exa, Firecrawl, Tavily and Parallel, Parallel extraction, and Firecrawl crawls) are polled until they finish. Pass `timeout` and `signal` to bound or cancel any call.

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

## Choosing a provider per capability

`router` sends each capability to exactly one adapter:

```ts
import { Fieldwork, router } from "@howells/fieldwork-sdk";
import { exa } from "@howells/fieldwork-sdk/exa";
import { firecrawl } from "@howells/fieldwork-sdk/firecrawl";
import { parallel } from "@howells/fieldwork-sdk/parallel";

const web = new Fieldwork({
  adapter: router({
    search: parallel(),
    read: firecrawl(),
    product: firecrawl(),
    research: exa(),
  }),
});
```

A capability without a route is unsupported. A route to an adapter that lacks the capability is a type error and throws when the router is built.

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
| `InvalidRequest` | The provider rejected the input. | Correct the input; the message says what is wrong. |
| `JobFailed` | The job ended without a result. | Start a new job if needed; resuming fails again. |
| `Timeout` | The call or job outlasted its time. | With `jobId`, pass it as `resume`. Without one, repeat. |
| `Aborted` | `signal` cancelled the call. | With `jobId`, the job may still be running; pass it as `resume`. |
| `ProviderError` | Any other provider failure. | Repeat when `retryable` is true (5xx and network failures). |

An error with a `jobId` is never `retryable`, because repeating the call would start and charge for a second job.

## Agent tools

`@howells/fieldwork-sdk/tools` turns an instance into tool definitions for a model: one per capability, named `search_web`, `read_page`, `extract_values`, `read_product`, `map_site`, `crawl_site`, `research_question`, `parse_document` and `run_browser_script`. Each tool has:

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

`run_browser_script` runs code in a remote browser, so it is left out unless you name it: `toolsFor(web, { capabilities: ["read", "act"] })`. `toolError(error)` formats an error for a model.

For MCP clients such as Claude, Cursor and Codex, [`@howells/fieldwork-mcp`](https://www.npmjs.com/package/@howells/fieldwork-mcp) serves these tools over stdio.

## The provider's own API

`web.raw.request(method, path, options)` calls the provider's HTTP API with authentication applied, for anything Fieldwork does not wrap:

```ts
const usage = await new Fieldwork({ adapter: tavily() }).raw.request(
  "GET",
  "/usage"
);
```

On a router, `raw` is keyed by provider name.

## Keys

| Adapter                 | Environment variable |
| ----------------------- | -------------------- |
| `exa()`                 | `EXA_API_KEY`        |
| `firecrawl()`           | `FIRECRAWL_API_KEY`  |
| `tavily()`              | `TAVILY_API_KEY`     |
| `parallel()`            | `PARALLEL_API_KEY`   |
| `perplexity({ model })` | `PERPLEXITY_API_KEY` |

Pass `apiKey` to override. Perplexity research also needs a `model`, on the adapter or the call.

ESM only, Node 22 or later. No dependencies.
