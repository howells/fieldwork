import type { Capability, JsonSchema } from "./types.js";

/**
 * What each agent tool is called, what it says about itself and which inputs
 * each provider accepts. `toolsFor` in tools.ts turns these into tools.
 */

export interface Field {
  name: string;
  schema: JsonSchema;
  required?: boolean;
  /** Providers that support this option; every provider when absent. */
  providers?: readonly string[];
}

export interface Spec {
  capability: Capability;
  name: string;
  title: string;
  description: string;
  /** The field passed as the method's first argument. */
  subject: string;
  fields: Field[];
  readOnly: boolean;
  idempotent: boolean;
}

const RESUME_DESCRIPTION =
  "The jobId from an earlier call's error, when that call timed out or was cancelled. Waits for that job instead of starting and paying for a new one.";

const url: Field = {
  name: "url",
  required: true,
  schema: {
    type: "string",
    format: "uri",
    description: "The page's full URL, including https://.",
  },
};

const domains = (verb: string): JsonSchema => ({
  type: "array",
  items: { type: "string" },
  description: `${verb} results from these domains, such as example.com.`,
});

const str = { type: "string" };
const strs = { type: "array", items: str };
const citationList = {
  type: "array",
  items: {
    type: "object",
    properties: { url: str, title: str, excerpts: strs },
    required: ["url"],
  },
};
const fieldSources = {
  type: "array",
  description: "The sources the provider gave for each field.",
  items: {
    type: "object",
    properties: { field: str, citations: citationList, reasoning: str },
    required: ["field", "citations"],
  },
};
const pageShape = {
  type: "object",
  properties: {
    url: str,
    title: str,
    markdown: str,
    html: str,
    links: strs,
    images: strs,
    excerpts: strs,
  },
  required: ["url"],
};

const object = (properties: JsonSchema, required: string[]): JsonSchema => ({
  type: "object",
  properties,
  required,
});

export const OUTPUTS: Record<Capability, JsonSchema> = {
  search: object(
    {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            url: str,
            title: str,
            snippet: str,
            content: str,
            publishedAt: str,
            score: { type: "number" },
          },
          required: ["url"],
        },
      },
      answer: str,
    },
    ["results"]
  ),
  read: pageShape,
  extract: object(
    {
      data: { description: "The values, in the shape of the schema." },
      fields: fieldSources,
    },
    ["data"]
  ),
  product: object(
    {
      title: str,
      brand: str,
      category: str,
      description: str,
      url: str,
      variants: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: str,
            sku: str,
            title: str,
            values: { type: "object", additionalProperties: str },
            price: object({ amount: str, currency: str }, []),
            inStock: { type: "boolean" },
            images: strs,
          },
        },
      },
    },
    ["variants"]
  ),
  map: object(
    {
      links: {
        type: "array",
        items: object({ url: str, title: str, description: str }, ["url"]),
      },
    },
    ["links"]
  ),
  crawl: object({ pages: { type: "array", items: pageShape } }, ["pages"]),
  research: object(
    {
      id: str,
      output: {
        description: "Values in the shape of the schema, or the report text.",
      },
      sources: citationList,
      fields: fieldSources,
    },
    ["id", "output", "sources"]
  ),
  act: object(
    { stdout: str, stderr: str, result: {}, exitCode: { type: "number" } },
    ["stdout", "stderr"]
  ),
  parse: object(
    {
      markdown: str,
      pages: {
        type: "array",
        items: object({ pageNumber: { type: "integer" }, markdown: str }, [
          "pageNumber",
          "markdown",
        ]),
      },
      blocks: { type: "array" },
    },
    ["markdown"]
  ),
};

export const SPECS: Spec[] = [
  {
    capability: "search",
    name: "search_web",
    title: "Search the web",
    description:
      "Search the web and return a ranked list of pages with their titles, URLs and matching snippets. Use when you need pages about a topic, product or fact and do not have a URL yet. Do not use to read a page you already have a URL for (use read_page), or for a question that needs several sources combined into an answer (use research_question).",
    subject: "query",
    readOnly: true,
    idempotent: true,
    fields: [
      {
        name: "query",
        required: true,
        schema: { type: "string", description: "What to search for." },
      },
      {
        name: "limit",
        schema: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          description: "How many results to return.",
        },
      },
      { name: "includeDomains", schema: domains("Only return") },
      { name: "excludeDomains", schema: domains("Leave out") },
      {
        name: "publishedAfter",
        providers: ["exa", "tavily", "parallel", "perplexity"],
        schema: {
          type: "string",
          format: "date",
          description:
            "Only pages published on or after this date, YYYY-MM-DD.",
        },
      },
      {
        name: "publishedBefore",
        providers: ["exa", "tavily", "perplexity"],
        schema: {
          type: "string",
          format: "date",
          description: "Only pages published before this date, YYYY-MM-DD.",
        },
      },
      {
        name: "content",
        providers: ["exa", "firecrawl", "tavily"],
        schema: {
          type: "boolean",
          description:
            "Include each result's page text. Slower and longer; leave out to get snippets only.",
        },
      },
    ],
  },
  {
    capability: "read",
    name: "read_page",
    title: "Read a page",
    description:
      "Read one web page and return its title and its text as Markdown. Use when you have a URL and need what the page says. Do not use to pull specific values into a structure (use extract_values), or to read many pages of one site (use crawl_site).",
    subject: "url",
    readOnly: true,
    idempotent: true,
    fields: [url],
  },
  {
    capability: "extract",
    name: "extract_values",
    title: "Extract values from a page",
    description:
      "Read one web page and return the values a JSON Schema asks for, such as dimensions, materials or prices. Use when you have a URL and know which fields you need. Do not use when you need the whole page text (use read_page), or when the values are spread across several sites (use research_question).",
    subject: "url",
    readOnly: true,
    idempotent: true,
    fields: [
      url,
      {
        name: "schema",
        required: true,
        schema: {
          type: "object",
          description:
            'A JSON Schema object describing the values to return, such as {"type":"object","properties":{"width":{"type":"string"}}}.',
        },
      },
      {
        name: "prompt",
        schema: {
          type: "string",
          description:
            "What to extract, in plain words, when the schema alone is not enough.",
        },
      },
      {
        name: "resume",
        providers: ["parallel"],
        schema: { type: "string", description: RESUME_DESCRIPTION },
      },
    ],
  },
  {
    capability: "product",
    name: "read_product",
    title: "Read a product page",
    description:
      "Read a product page's structured data and return the product with its variants: SKUs, option values such as color or size, prices, stock and images. No model reads the page, so it returns only what the page publishes. Use on one product page. Do not use on category or search pages, or for details the page's structured data does not carry (use extract_values).",
    subject: "url",
    readOnly: true,
    idempotent: true,
    fields: [url],
  },
  {
    capability: "map",
    name: "map_site",
    title: "List a site's pages",
    description:
      "List the URLs of a website without reading the pages. Use to find which pages a site has before reading some of them. Do not use when you need page text (use read_page or crawl_site).",
    subject: "url",
    readOnly: true,
    idempotent: true,
    fields: [
      {
        ...url,
        schema: {
          ...url.schema,
          description: "The site's address, such as https://example.com.",
        },
      },
      {
        name: "limit",
        schema: {
          type: "integer",
          minimum: 1,
          maximum: 5000,
          description: "The most URLs to return.",
        },
      },
    ],
  },
  {
    capability: "crawl",
    name: "crawl_site",
    title: "Crawl a site",
    description:
      "Start at a URL, follow links within the site and return the text of every page reached, up to limit. Slower and costlier than reading single pages. Use when you need the content of many pages from one site. Do not use for one page (use read_page), or when you only need the list of URLs (use map_site).",
    subject: "url",
    readOnly: true,
    idempotent: false,
    fields: [
      url,
      {
        name: "limit",
        schema: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "The most pages to read.",
        },
      },
      {
        name: "resume",
        providers: ["firecrawl"],
        schema: { type: "string", description: RESUME_DESCRIPTION },
      },
    ],
  },
  {
    capability: "research",
    name: "research_question",
    title: "Research a question",
    description:
      "Research a question across the web and return an answer with its sources: a written report, or values matching a JSON Schema when one is given. Runs a job of many steps that can take minutes and costs more than a search. Use for questions that need several sources compared or combined. Do not use for a single lookup (use search_web), or to read a page you have a URL for (use read_page).",
    subject: "question",
    readOnly: true,
    idempotent: false,
    fields: [
      {
        name: "question",
        required: true,
        schema: {
          type: "string",
          description: "The question, with any context the answer depends on.",
        },
      },
      {
        name: "schema",
        schema: {
          type: "object",
          description:
            "A JSON Schema object for the answer. Without one, the answer is a written report.",
        },
      },
      {
        name: "resume",
        providers: ["exa", "firecrawl", "tavily", "parallel"],
        schema: { type: "string", description: RESUME_DESCRIPTION },
      },
    ],
  },
  {
    capability: "act",
    name: "run_browser_script",
    title: "Run a browser script",
    description:
      "Run a script in a new remote browser session and return what it printed and returned; the session closes afterwards. The script can visit sites, click, type and submit forms, and its effects on those sites are real. Use only when a page needs interaction that reading cannot do. Do not use to read or search pages.",
    subject: "code",
    readOnly: false,
    idempotent: false,
    fields: [
      {
        name: "code",
        required: true,
        schema: { type: "string", description: "The script to run." },
      },
      {
        name: "language",
        providers: ["firecrawl"],
        schema: {
          type: "string",
          enum: ["node", "python", "bash"],
          description: "The script's language. Defaults to node.",
        },
      },
    ],
  },
  {
    capability: "parse",
    name: "parse_document",
    title: "Convert a document to Markdown",
    description:
      "Convert a document file (PDF, DOCX, XLSX, PPTX, HTML or CSV) to Markdown. Use when you have the file's bytes. Do not use for a document at a public URL (use read_page).",
    subject: "document",
    readOnly: true,
    idempotent: true,
    fields: [
      {
        name: "name",
        required: true,
        schema: {
          type: "string",
          description:
            "The file name with its extension, such as spec-sheet.pdf. The extension tells the provider the type.",
        },
      },
      {
        name: "contentBase64",
        required: true,
        schema: {
          type: "string",
          description: "The file's bytes, base64-encoded.",
        },
      },
      {
        name: "pages",
        providers: ["firecrawl"],
        schema: {
          type: "boolean",
          description: "Also return the Markdown of each page separately.",
        },
      },
    ],
  },
];
