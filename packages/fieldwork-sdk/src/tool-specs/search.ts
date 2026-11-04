import {
  country,
  excludeDomains,
  includeDomains,
  language,
  limit,
  maxAge,
  maxAgeAtLeast600,
  publishedAfter,
  publishedBefore,
  recency,
} from "./fields.js";
import { IMAGES_OUTPUT, SEARCH_OUTPUT } from "./outputs.js";
import { flag, text } from "./schema.js";
import type { Spec } from "./types.js";

/**
 * The search tools, `search_web` and `search_images`. Each option lists the
 * providers whose options type takes it; the tools test sends every one and
 * checks it reaches the provider's request.
 */
export const SEARCH_SPECS: Spec[] = [
  {
    capability: "search",
    description:
      "Search the web and return a ranked list of pages with their titles, URLs and matching snippets. Use when you need pages about a topic, product or fact and do not have a URL yet. Do not use to read a page you already have a URL for (use read_page), for pictures (use search_images), or for a question that needs several sources combined into an answer (use research_question).",
    destructive: false,
    fields: [
      {
        name: "query",
        required: true,
        schema: text("What to search for."),
      },
      limit("How many results to return.", 20, [
        "exa",
        "firecrawl",
        "tavily",
        "parallel",
        "perplexity",
        "brave",
        "browserbase",
      ]),
      includeDomains("results", [
        "exa",
        "firecrawl",
        "tavily",
        "parallel",
        "perplexity",
      ]),
      excludeDomains("results", [
        "exa",
        "firecrawl",
        "tavily",
        "parallel",
        "perplexity",
      ]),
      publishedAfter([
        "exa",
        "firecrawl",
        "tavily",
        "parallel",
        "perplexity",
        "brave",
        "serpapi",
      ]),
      publishedBefore([
        "exa",
        "firecrawl",
        "tavily",
        "perplexity",
        "brave",
        "serpapi",
      ]),
      ...recency(["firecrawl", "perplexity", "serpapi"], ["tavily", "brave"]),
      country(
        [
          "exa",
          "firecrawl",
          "tavily",
          "parallel",
          "perplexity",
          "brave",
          "serpapi",
        ],
        "Localize results to"
      ),
      language(["tavily", "perplexity", "brave", "serpapi"]),
      {
        name: "content",
        providers: ["exa", "firecrawl", "tavily", "brave"],
        schema: flag(
          "Include each result's page text. Slower and longer; leave out to get snippets only."
        ),
      },
      maxAge(["exa", "tavily"]),
      maxAgeAtLeast600(),
    ],
    idempotent: true,
    name: "search_web",
    output: SEARCH_OUTPUT,
    positional: ["query"],
    readOnly: true,
    title: "Search the web",
  },
  {
    capability: "images",
    description:
      "Search for images and return each image's URL, thumbnail, the page it appears on, its title and its size. Use when you need pictures of a subject. Do not use to find pages (use search_web) or to learn what is in an image.",
    destructive: false,
    fields: [
      {
        name: "query",
        required: true,
        schema: text("What the images should show."),
      },
      limit("How many images to return.", 20, [
        "firecrawl",
        "parallel",
        "brave",
      ]),
      includeDomains("images", ["tavily"]),
      excludeDomains("images", ["tavily"]),
      publishedAfter(["serpapi"]),
      publishedBefore(["serpapi"]),
      ...recency(["serpapi"], []),
      country(
        ["firecrawl", "parallel", "brave", "serpapi"],
        "Localize results to"
      ),
      language(["brave", "serpapi"]),
    ],
    idempotent: true,
    name: "search_images",
    output: IMAGES_OUTPUT,
    positional: ["query"],
    readOnly: true,
    title: "Search for images",
  },
];
