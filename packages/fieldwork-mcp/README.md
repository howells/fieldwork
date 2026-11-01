# Fieldwork MCP server

Web search, page reading, value extraction, site maps, crawls, research and document parsing as tools for any MCP client, across Exa, Firecrawl, Tavily, Parallel and Perplexity. It serves the tools from [`@howells/fieldwork-sdk`](https://www.npmjs.com/package/@howells/fieldwork-sdk) over stdio.

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
fieldwork-mcp --search parallel --read firecrawl --product firecrawl --research exa
```

Capabilities: `search`, `read`, `extract`, `product`, `map`, `crawl`, `research`, `act`, `parse`. A provider that lacks the capability you route to it stops the server at start-up with an error.

Each provider reads its key from the environment: `EXA_API_KEY`, `FIRECRAWL_API_KEY`, `TAVILY_API_KEY`, `PARALLEL_API_KEY` or `PERPLEXITY_API_KEY`.

| Option | Effect |
| --- | --- |
| `--allow-act` | Adds `run_browser_script`, which runs code in a remote browser. Off by default. |
| `--max-characters <n>` | The long text one result may return. Default 20,000. |
| `--perplexity-model <id>` | The model Perplexity research runs on. |

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

## Tools

| Tool | What it does |
| --- | --- |
| `search_web` | Ranked pages for a query. |
| `read_page` | One page as Markdown. |
| `extract_values` | The values a JSON Schema asks for, from one page. |
| `read_product` | A product page's variants, from its structured data. |
| `map_site` | A site's URLs, without reading them. |
| `crawl_site` | The text of many pages from one site. |
| `research_question` | An answer with sources, from a job of many steps. |
| `parse_document` | A PDF, DOCX, XLSX, PPTX, HTML or CSV file as Markdown. |
| `run_browser_script` | A script run in a remote browser. Only with `--allow-act`. |

Every tool's input schema lists only the options its provider supports. Results come back as `structuredContent`. Failures come back as results with `isError: true` and a JSON body: `code`, `message`, `retryable`, `retryAfter`, and `jobId` for a job that may still be running. Pass a `jobId` back as `resume` to collect the job instead of starting another.

## Embedding

```ts
import { Fieldwork } from "@howells/fieldwork-sdk";
import { firecrawl } from "@howells/fieldwork-sdk/firecrawl";
import { createFieldworkServer } from "@howells/fieldwork-mcp";

const server = createFieldworkServer(new Fieldwork({ adapter: firecrawl() }));
```

`server` is an `McpServer` from `@modelcontextprotocol/server`; connect it to any transport.

Node 22 or later.
