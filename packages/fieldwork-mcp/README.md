# Fieldwork MCP server

Web search, image search, page reading, value extraction, site maps, crawls, answers, research, entity discovery, decisions, document parsing, remote browsers, monitors and account usage as tools for any MCP client, across Exa, Firecrawl, Tavily, Parallel, Perplexity, Brave, SerpApi, Browserbase, Kernel, LlamaParse and Reducto. It serves the tools from [`@howells/fieldwork-sdk`](https://www.npmjs.com/package/@howells/fieldwork-sdk) over stdio, or from an [HTTP gateway](#http-gateway) as a JSON API and remote MCP.

```sh
npx -y @howells/fieldwork-mcp --provider firecrawl
```

## Choosing providers

Use one provider for everything it offers:

```sh
fieldwork-mcp --provider tavily
```

Or one provider per capability. A capability without a provider has no tool, and nothing falls back to another provider:

```sh
fieldwork-mcp --search brave --read firecrawl --product firecrawl --research exa \
  --monitor firecrawl --browser browserbase --allow-monitor --allow-browser
```

Capabilities: `search`, `images`, `read`, `readMany`, `extract`, `product`, `map`, `crawl`, `answer`, `research`, `discover`, `decide`, `act`, `browser`, `parse`, `monitor`, `usage`. A provider that lacks the capability you route to it stops the server at start-up with an error.

### Providers

Each provider reads its key from the environment.

| Provider | Key | Capabilities |
| --- | --- | --- |
| `exa` | `EXA_API_KEY` | `search`, `read`, `readMany`, `extract`, `answer`, `research`, `monitor` |
| `firecrawl` | `FIRECRAWL_API_KEY` | `search`, `images`, `read`, `readMany`, `extract`, `product`, `map`, `crawl`, `research`, `act`, `browser`, `parse`, `monitor`, `usage` |
| `tavily` | `TAVILY_API_KEY` | `search`, `images`, `read`, `readMany`, `map`, `crawl`, `answer`, `research`, `usage` |
| `parallel` | `PARALLEL_API_KEY` | `search`, `images`, `read`, `readMany`, `extract`, `answer`, `research`, `discover`, `decide`, `monitor` |
| `perplexity` | `PERPLEXITY_API_KEY` | `search`, `answer`, `research`, `decide` |
| `brave` | `BRAVE_API_KEY` | `search`, `images`, `answer` |
| `serpapi` | `SERPAPI_API_KEY` | `search`, `images`, `usage` |
| `browserbase` | `BROWSERBASE_API_KEY`; the project comes from `--browserbase-project` when the key has several | `search`, `read`, `browser`, `usage` |
| `kernel` | `KERNEL_API_KEY` | `read`, `browser` |
| `llamaparse` | `LLAMA_CLOUD_API_KEY` | `parse` |
| `reducto` | `REDUCTO_API_KEY` | `parse` |

## Options

| Option | Effect |
| --- | --- |
| `--provider <name>` | One provider for every capability it offers. |
| `--<capability> <name>` | One provider for one capability, for example `--monitor firecrawl` or `--browser browserbase`. |
| `--allow-act` | Adds `run_browser_script`, which runs code in a remote browser. Off by default. |
| `--allow-browser` | Adds `open_browser` and `close_browser`, which keep a remote browser open until it is closed or expires. Off by default. |
| `--allow-monitor` | Adds `create_monitor`, `get_monitor`, `list_monitors`, `delete_monitor` and `list_monitor_events`. A monitor keeps running, and billing, until it is deleted. Off by default. |
| `--max-characters <n>` | The default shared long-text budget. Default 20,000; a tool call can override it with a positive integer `maxCharacters`. |
| `--help`, `--version` | Show the usage text or the version. |

The three `--allow-*` options are separate on purpose. Each tool group starts remote browsers or creates a lasting, billed resource, so a client gets it only when you ask.

## Client configuration

Claude Code:

```sh
claude mcp add fieldwork -e FIRECRAWL_API_KEY=… -- npx -y @howells/fieldwork-mcp --provider firecrawl
```

Claude Desktop, Cursor and other clients that take a JSON file:

```json
{
  "mcpServers": {
    "fieldwork": {
      "command": "npx",
      "args": [
        "-y",
        "@howells/fieldwork-mcp",
        "--search",
        "parallel",
        "--read",
        "firecrawl"
      ],
      "env": { "PARALLEL_API_KEY": "…", "FIRECRAWL_API_KEY": "…" }
    }
  }
}
```

Every tool accepts `maxCharacters` for one call, without passing it to the provider. The HTTP gateway and remote MCP default to 20,000 and cap it at 200,000 (`InvalidRequest` above that). This leaves room for escaped JSON and MCP's text plus structured copies under Vercel's 4.5 MB response limit; oversized encoded results are also refused. A cut adds top-level `truncated: [{ path, shown, length }]` and keeps the inline `[cut: …]` note. The array is absent when nothing was cut.

`parse_document` accepts `url` with `provider: "llamaparse"` or `"reducto"`; the provider fetches the public document directly. Alternatively send `name` and `contentBase64`, never together with `url`. Firecrawl accepts uploaded bytes here; use `read_page` for its public document URLs. The gateway's 2 MiB JSON-body budget holds less than 1.5 MiB of file after base64 encoding. Larger inline requests return HTTP 413 with `InvalidRequest`, the byte limit and the URL alternative.

## Tools

Each tool serves one capability, or one method of `browser` or `monitor`. The last column lists the providers that offer it.

| Tool | What it does | Providers |
| --- | --- | --- |
| `search_web` | Ranked pages for a query. | all eight |
| `search_images` | Images for a query, with the page each appears on. | Firecrawl, Tavily, Parallel, Brave, SerpApi |
| `read_page` | One page as Markdown. Kernel loads it in a real browser, so JavaScript runs. | Exa, Firecrawl, Tavily, Parallel, Browserbase, Kernel |
| `read_pages` | Several pages in one call; pages that fail come back in `failed`. | Exa, Firecrawl, Tavily, Parallel |
| `extract_values` | The values a JSON Schema asks for, from one page. | Exa, Firecrawl, Parallel |
| `read_product` | A product page's variants, from its structured data. | Firecrawl |
| `map_site` | A site's URLs, without reading them. | Firecrawl, Tavily |
| `crawl_site` | The text of many pages from one site. | Firecrawl, Tavily |
| `answer_question` | A short answer with its sources, in one call. | Exa, Tavily, Parallel, Perplexity, Brave |
| `research_question` | An answer with sources, from a job of many steps. | Exa, Firecrawl, Tavily, Parallel, Perplexity |
| `find_entities` | Entities of one kind that meet every condition you list. | Parallel |
| `make_decisions` | Yes or no, choice and score answers about a context, with probabilities. | Parallel, Perplexity |
| `parse_document` | A PDF, DOCX, XLSX, PPTX, HTML or CSV file as Markdown. | Firecrawl, LlamaParse, Reducto |
| `check_usage` | Credits used and remaining. | Firecrawl, Tavily, SerpApi, Browserbase |
| `run_browser_script` | A script run in a remote browser. Only with `--allow-act`. | Firecrawl |
| `open_browser` | A remote browser to drive over CDP. Only with `--allow-browser`. | Firecrawl, Browserbase, Kernel |
| `close_browser` | Closes a browser opened with `open_browser`. Only with `--allow-browser`. | Firecrawl, Browserbase, Kernel |
| `create_monitor` | A monitor that checks the web on a schedule. Only with `--allow-monitor`. | Exa, Firecrawl, Parallel |
| `get_monitor`, `list_monitors`, `delete_monitor` | Read, list and delete monitors. Only with `--allow-monitor`. | Exa, Firecrawl, Parallel |
| `list_monitor_events` | What a monitor found. Only with `--allow-monitor`. | Exa, Firecrawl, Parallel |

Every tool's input schema lists only the options its provider supports, so a client is never offered an option that would be ignored. Results come back as `structuredContent`, without the provider's own response. Lists come back as an object (`list_monitors` returns `{ "monitors": [...] }`), and `delete_monitor` and `close_browser` return `{ "deleted": true, "id": … }` and `{ "closed": true, "id": … }`.

Failures come back as results with `isError: true` and a JSON body: `code`, `message`, `retryable`, `retryAfter`, and `jobId` for a job that may still be running. Pass a `jobId` back as `resume` to collect the job instead of starting another.

## Embedding

```ts
import { Fieldwork } from "@howells/fieldwork-sdk";
import { firecrawl } from "@howells/fieldwork-sdk/firecrawl";
import { createFieldworkServer } from "@howells/fieldwork-mcp";

const server = createFieldworkServer(new Fieldwork({ adapter: firecrawl() }), {
  allow: ["monitor"],
});
```

`allow` names capabilities that are left out by default (`act`, `browser`, `monitor`) to include as well. `server` is an `McpServer` from `@modelcontextprotocol/server`; connect it to any transport.

Node 22 or later.

## HTTP gateway

`gatewayFromEnvironment(process.env)` returns one `fetch` handler that serves the same tools at `/api/v1/tools/{name}` and as MCP at `/mcp`, behind a bearer key per agent: `FIELDWORK_API_KEY` for the owner and `FIELDWORK_AGENT_<NAME>_API_KEY` for each agent. Only providers with a key are served. `GET /api/v1/openapi.json` describes the running gateway without a key. `createFieldworkGateway` takes the same parts as code. See [HTTP gateway](https://fieldwork-sdk.dev/docs/http-gateway).
