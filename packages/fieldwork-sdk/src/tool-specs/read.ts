import {
  PAGE_URL,
  country,
  limit,
  maxAge,
  maxAgeAtLeast600,
  resume,
  schemaField,
  stealth,
  urlField,
} from "./fields.js";
import {
  CRAWL_OUTPUT,
  EXTRACT_OUTPUT,
  MAP_OUTPUT,
  PAGES_OUTPUT,
  PAGE_OUTPUT,
  PRODUCT_OUTPUT,
} from "./outputs.js";
import { list, text, url } from "./schema.js";
import type { Field, ProviderName, Spec } from "./types.js";

/** Providers whose read takes `query`, to return the passages of a page that answer it. */
const QUERY_READERS: readonly ProviderName[] = [
  "exa",
  "firecrawl",
  "tavily",
  "parallel",
];

const query: Field = {
  name: "query",
  providers: QUERY_READERS,
  schema: text(
    "Also return the passages of each page that answer this, as excerpts."
  ),
};

/**
 * The tools that read pages: `read_page`, `read_pages`, `extract_values`,
 * `read_product`, `map_site` and `crawl_site`. Firecrawl runs `read_pages` and
 * `crawl_site` as jobs, so they take `resume` with it.
 */
export const READ_SPECS: Spec[] = [
  {
    capability: "read",
    description:
      "Read one web page and return its title and its text as Markdown. Use when you have a URL and need what the page says. Do not use to pull specific values into a structure (use extract_values), to read several pages (use read_pages), or to read many pages of one site (use crawl_site).",
    destructive: false,
    fields: [
      urlField(PAGE_URL),
      query,
      maxAge(["exa", "firecrawl"]),
      maxAgeAtLeast600(),
      country(["browserbase"], "Fetch the page through a proxy in"),
      stealth(["kernel"]),
    ],
    idempotent: true,
    name: "read_page",
    output: PAGE_OUTPUT,
    positional: ["url"],
    readOnly: true,
    title: "Read a page",
  },
  {
    capability: "readMany",
    description:
      "Read several web pages in one call and return each page's title and text as Markdown. URLs that could not be read come back in failed; the call still succeeds. Use when you have a list of URLs. Do not use for one page (use read_page) or to follow links across a site (use crawl_site).",
    destructive: false,
    fields: [
      {
        name: "urls",
        required: true,
        schema: list(
          url("A page's full URL, including https://."),
          "The pages' full URLs, including https://.",
          { minItems: 1 }
        ),
      },
      query,
      maxAge(["exa", "firecrawl"]),
      maxAgeAtLeast600(),
      resume(["firecrawl"]),
    ],
    idempotent: true,
    name: "read_pages",
    output: PAGES_OUTPUT,
    positional: ["urls"],
    readOnly: true,
    title: "Read several pages",
  },
  {
    capability: "extract",
    description:
      "Read one web page and return the values a JSON Schema asks for, such as dimensions, materials or prices. Use when you have a URL and know which fields you need. Do not use when you need the whole page text (use read_page), or when the values are spread across several sites (use research_question).",
    destructive: false,
    fields: [
      urlField(PAGE_URL),
      schemaField(
        'A JSON Schema object describing the values to return, such as {"type":"object","properties":{"width":{"type":"string"}}}.',
        undefined,
        true
      ),
      {
        name: "prompt",
        schema: text(
          "What to extract, in plain words, when the schema alone is not enough."
        ),
      },
      maxAge(["exa", "firecrawl"]),
      country(["parallel"], "Search from"),
      resume(["parallel"]),
    ],
    idempotent: true,
    name: "extract_values",
    output: EXTRACT_OUTPUT,
    positional: ["url"],
    readOnly: true,
    title: "Extract values from a page",
  },
  {
    capability: "product",
    description:
      "Read a product page's structured data and return the product with its variants: SKUs, option values such as color or size, prices, stock and images. No model reads the page, so it returns only what the page publishes. Use on one product page. Do not use on category or search pages, or for details the page's structured data does not carry (use extract_values).",
    destructive: false,
    fields: [urlField(PAGE_URL), maxAge(["firecrawl"])],
    idempotent: true,
    name: "read_product",
    output: PRODUCT_OUTPUT,
    positional: ["url"],
    readOnly: true,
    title: "Read a product page",
  },
  {
    capability: "map",
    description:
      "List the URLs of a website without reading the pages. Use to find which pages a site has before reading some of them. Do not use when you need page text (use read_page or crawl_site).",
    destructive: false,
    fields: [
      urlField("The site's address, such as https://example.com."),
      limit("The most URLs to return.", 5000, ["firecrawl", "tavily"]),
    ],
    idempotent: true,
    name: "map_site",
    output: MAP_OUTPUT,
    positional: ["url"],
    readOnly: true,
    title: "List a site's pages",
  },
  {
    capability: "crawl",
    description:
      "Start at a URL, follow links within the site and return the text of every page reached, up to limit. Slower and costlier than reading single pages. Use when you need the content of many pages from one site. Do not use for one page (use read_page), or when you only need the list of URLs (use map_site).",
    destructive: false,
    fields: [
      urlField("The page to start from, including https://."),
      limit("The most pages to read.", 100, ["firecrawl", "tavily"]),
      resume(["firecrawl"]),
    ],
    idempotent: false,
    name: "crawl_site",
    output: CRAWL_OUTPUT,
    positional: ["url"],
    readOnly: true,
    title: "Crawl a site",
  },
];
