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
import {
  IMAGES_OUTPUT,
  IMAGE_MATCHES_OUTPUT,
  SEARCH_OUTPUT,
} from "./outputs.js";
import { choice, text, flag, url } from "./schema.js";
import type { Spec } from "./types.js";

/**
 * The search tools, `search_web`, `search_images` and `search_by_image`. Each option lists the
 * providers whose options type takes it; the tools test sends every one and
 * checks it reaches the provider's request.
 */
export const SEARCH_SPECS: Spec[] = [
  {
    capability: "search",
    description:
      "Search the web and return a ranked list of pages with their titles, URLs and matching snippets. Use when you need pages about a topic, product or fact and do not have a URL yet. Do not use to read a page you already have a URL for (use read_page), for pictures of a subject (use search_images), for where an image appears (use search_by_image), or for a question that needs several sources combined into an answer (use research_question).",
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
  {
    capability: "reverseImage",
    description:
      "Find the web pages an image appears on, given the image's URL. Returns each page's URL (sourceUrl), the matched image when the provider gives one, a thumbnail, a title and whether the match is the same image or a similar one. Use when you have an image and need to know where it is published, who uses it or where a larger copy is. Do not use to find pictures of a subject (use search_images), to find pages by text (use search_web) or to learn what is in an image.",
    destructive: false,
    fields: [
      {
        name: "imageUrl",
        required: true,
        schema: url(
          "The image's full URL, including https://. It must be publicly reachable."
        ),
      },
      {
        name: "query",
        providers: ["serpapi"],
        schema: text(
          'Words to refine the search with, such as the subject. SerpApi refuses it together with match "exact".'
        ),
      },
      {
        name: "match",
        providers: ["serpapi"],
        schema: choice(
          "exact for pages showing the same image, visual for pages showing a similar one. Leave out for the provider's default, which lists similar images.",
          ["exact", "visual"]
        ),
      },
      country(["serpapi"], "Localize results to"),
      language(["serpapi"]),
    ],
    idempotent: true,
    name: "search_by_image",
    output: IMAGE_MATCHES_OUTPUT,
    positional: ["imageUrl"],
    readOnly: true,
    title: "Find where an image appears",
  },
];
