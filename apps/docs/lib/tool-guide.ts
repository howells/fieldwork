export const TASK_GROUPS = [
  { id: "all", label: "All tasks" },
  { id: "find", label: "Find sources" },
  { id: "read", label: "Read and extract" },
  { id: "reason", label: "Answer and compare" },
  { id: "explore", label: "Explore and act" },
] as const;

type TaskGroup = Exclude<(typeof TASK_GROUPS)[number]["id"], "all">;

export interface GuideTask {
  id: string;
  title: string;
  group: TaskGroup;
  capabilities: string[];
  providers: string[];
  choices: string[];
  why: string;
  docs: string;
}

export const GUIDE_TASKS: GuideTask[] = [
  {
    capabilities: ["search"],
    choices: ["Parallel · fast"],
    docs: "/docs/capabilities",
    group: "find",
    id: "exact-source",
    providers: ["Parallel"],
    title: "Find an exact source",
    why: "Parallel's fast mode puts the official page in the first few results.",
  },
  {
    capabilities: ["search"],
    choices: ["Exa · auto", "Parallel · advanced"],
    docs: "/docs/capabilities",
    group: "find",
    id: "broad-question",
    providers: ["Exa", "Parallel"],
    title: "Find sources for a broad question",
    why: "Both rank by meaning, so a question in plain words finds relevant pages.",
  },
  {
    capabilities: ["read", "readMany"],
    choices: ["Exa · read"],
    docs: "/docs/results",
    group: "read",
    id: "known-page",
    providers: ["Exa"],
    title: "Read a known page",
    why: "Exa returns clean, complete page text. Use readMany for a set of URLs.",
  },
  {
    capabilities: ["extract", "research"],
    choices: ["Firecrawl · JSON", "Parallel Task · base"],
    docs: "/docs/structured-output",
    group: "read",
    id: "structured-fields",
    providers: ["Firecrawl", "Parallel"],
    title: "Extract structured fields",
    why: "Firecrawl is fastest. Parallel's Task links every field to its source.",
  },
  {
    capabilities: ["product"],
    choices: ["Firecrawl"],
    docs: "/docs/capabilities",
    group: "read",
    id: "product-details",
    providers: ["Firecrawl"],
    title: "Read product details",
    why: "Firecrawl reads every variant from the page's structured data, without a model.",
  },
  {
    capabilities: ["answer"],
    choices: ["Exa · fast", "Parallel · low"],
    docs: "/docs/capabilities",
    group: "reason",
    id: "precise-answer",
    providers: ["Exa", "Parallel"],
    title: "Answer a precise question",
    why: "Exa answers fastest. Parallel lets you limit which sites it cites.",
  },
  {
    capabilities: ["research"],
    choices: ["Exa Agent · low", "Parallel Task · base"],
    docs: "/docs/long-jobs",
    group: "reason",
    id: "compare-sources",
    providers: ["Exa", "Parallel"],
    title: "Compare a few sources",
    why: "Exa suits short comparisons. Parallel's Task quotes its source for each field.",
  },
  {
    capabilities: ["read", "parse"],
    choices: ["Exa · read", "Firecrawl · parse"],
    docs: "/docs/capabilities",
    group: "read",
    id: "pdf",
    providers: ["Exa", "Firecrawl"],
    title: "Read a PDF",
    why: "Read a PDF at a URL with Exa. Parse a file you hold with Firecrawl.",
  },
  {
    capabilities: ["map"],
    choices: ["Firecrawl"],
    docs: "/docs/capabilities",
    group: "explore",
    id: "site-urls",
    providers: ["Firecrawl"],
    title: "Find pages within a site",
    why: "Firecrawl lists a site's URLs quickly, limited to the section you name.",
  },
  {
    capabilities: ["crawl"],
    choices: ["Firecrawl"],
    docs: "/docs/long-jobs",
    group: "explore",
    id: "site-section",
    providers: ["Firecrawl"],
    title: "Collect pages from one section",
    why: "Firecrawl stays inside the paths, depth and page limit you set.",
  },
  {
    capabilities: ["browser", "act"],
    choices: ["Firecrawl", "Browserbase"],
    docs: "/docs/monitors-and-browsers",
    group: "explore",
    id: "interactive-page",
    providers: ["Firecrawl", "Browserbase"],
    title: "Use an interactive page",
    why: "Use a browser only when clicking or typing changes what the page shows.",
  },
  {
    capabilities: ["images"],
    choices: ["Brave", "SerpApi"],
    docs: "/docs/capabilities",
    group: "find",
    id: "find-images",
    providers: ["Brave", "SerpApi"],
    title: "Find images",
    why: "Both return each image with the page it appears on.",
  },
  {
    capabilities: ["decide"],
    choices: ["Parallel", "Perplexity"],
    docs: "/docs/capabilities",
    group: "reason",
    id: "classify-facts",
    providers: ["Parallel", "Perplexity"],
    title: "Classify supplied facts",
    why: "Give the facts and the allowed answers; each answer comes back with a probability.",
  },
  {
    capabilities: ["discover"],
    choices: ["Parallel · FindAll"],
    docs: "/docs/capabilities",
    group: "find",
    id: "matching-entities",
    providers: ["Parallel"],
    title: "Find matching entities",
    why: "FindAll returns the companies or products that meet all your conditions.",
  },
  {
    capabilities: ["monitor"],
    choices: ["Exa", "Firecrawl", "Parallel"],
    docs: "/docs/monitors-and-browsers",
    group: "explore",
    id: "watch-changes",
    providers: ["Exa", "Firecrawl", "Parallel"],
    title: "Watch for changes",
    why: "Exa and Parallel watch a query. Firecrawl also watches specific pages.",
  },
  {
    capabilities: ["usage"],
    choices: ["Firecrawl", "Tavily", "SerpApi", "Browserbase"],
    docs: "/docs/capabilities",
    group: "explore",
    id: "check-quota",
    providers: ["Firecrawl", "Tavily", "SerpApi", "Browserbase"],
    title: "Check credits",
    why: "These four report credits used and remaining before you start a large job.",
  },
];

export const GUIDE_PROVIDERS = [
  ...new Set(GUIDE_TASKS.flatMap((task) => task.providers)),
].toSorted();

export const GUIDE_RULES = [
  {
    detail:
      "Search finds links. Read gets page text. Extract gets fields. Answer and research return an answer with its sources.",
    title: "Choose the output",
  },
  {
    detail:
      "Read a known page, map a site's URLs, crawl a section, parse a file, or use a browser when the page needs clicks.",
    title: "Choose how to reach the source",
  },
  {
    detail:
      "Extract for fields on one page. Answer for one question. Research when facts are scattered across sources.",
    title: "Choose how much reasoning",
  },
  {
    detail:
      "Set page, depth and effort limits, and take the cheaper call when it does the job.",
    title: "Set the limits",
  },
];
