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
  description: string;
  group: TaskGroup;
  capabilities: string[];
  providers: string[];
  choices: string[];
  note: string;
  check: string;
  evidence: string;
  evidenceHref: string;
  docsOnly?: boolean;
}

export const GUIDE_TASKS: GuideTask[] = [
  {
    capabilities: ["search"],
    check: "Check the exact name, version and date on the official page.",
    choices: ["Parallel · fast"],
    description: "A release, date or named document.",
    evidence: "Live tests · Exact lookup",
    evidenceHref: "#evidence-search",
    group: "find",
    id: "exact-source",
    note: "Begin with up to five results and confirm the official page.",
    providers: ["Parallel"],
    title: "Find an exact source",
  },
  {
    capabilities: ["search"],
    check:
      "Check that the results address the question. Split it up or use research if relevant sources are missing.",
    choices: ["Exa · auto", "Parallel · advanced"],
    description: "A broad question or several constraints.",
    evidence: "Live tests + studies · Broad search",
    evidenceHref: "#evidence-search",
    group: "find",
    id: "broad-question",
    note: "Search in plain language. Check relevance in the first five results.",
    providers: ["Exa", "Parallel"],
    title: "Find sources for a broad question",
  },
  {
    capabilities: ["read", "readMany"],
    check:
      "Check for missing or cut-off text before asking the agent to interpret it.",
    choices: ["Exa · read"],
    description: "Prose, code or a few selected URLs.",
    evidence: "Live tests · Single-page content",
    evidenceHref: "#evidence-reading",
    group: "read",
    id: "known-page",
    note: "Use readMany for a chosen set of URLs. Batch reading wasn't tested here.",
    providers: ["Exa"],
    title: "Read a known page",
  },
  {
    capabilities: ["extract", "research"],
    check:
      "Check the selected variant, units and document. Leave unsupported values unknown.",
    choices: ["Firecrawl · JSON", "Parallel Task · base"],
    description: "Actual dimensions, ratings and source documents.",
    evidence: "Product tests · 54 jobs",
    evidenceHref: "#evidence-products",
    group: "read",
    id: "technical-facts",
    note: "Firecrawl for speed; Task for accuracy with field-level source links and excerpts.",
    providers: ["Firecrawl", "Parallel"],
    title: "Extract technical facts",
  },
  {
    capabilities: ["product"],
    check:
      "Check the variant list and technical fields. Use extract for missing fields and verify which product they describe.",
    choices: ["Firecrawl"],
    description: "Names and listed variants.",
    docsOnly: true,
    evidence: "Docs only · Check variant coverage",
    evidenceHref: "/docs/capabilities",
    group: "read",
    id: "product-details",
    note: "Available through Firecrawl only.",
    providers: ["Firecrawl"],
    title: "Read product details",
  },
  {
    capabilities: ["answer"],
    check:
      "Check each citation and preserve conditions and exceptions. Open the source section if they don't match.",
    choices: ["Exa · fast", "Parallel · low"],
    description: "A short answer backed by a primary source.",
    evidence: "Live tests · Answers and citations",
    evidenceHref: "#evidence-answers",
    group: "reason",
    id: "precise-answer",
    note: "Use Exa for speed; Parallel to restrict sources. Check every citation.",
    providers: ["Exa", "Parallel"],
    title: "Answer a precise question",
  },
  {
    capabilities: ["research"],
    check:
      "Increase effort only when the sources are complete and the answer misses a relationship.",
    choices: ["Exa Agent · low", "Parallel Task · base"],
    description: "Rules, exceptions and facts that affect each other.",
    evidence: "Live tests + studies · Two-page comparison",
    evidenceHref: "#evidence-synthesis",
    group: "reason",
    id: "compare-sources",
    note: "Exa for short comparisons; Task for built-in source excerpts per field. Check quoted wording.",
    providers: ["Exa", "Parallel"],
    title: "Compare a few sources",
  },
  {
    capabilities: ["read", "parse"],
    check:
      "Check table rows, columns, reading order and page references against the original PDF.",
    choices: ["Exa · read", "Firecrawl · parse"],
    description: "Tables, formulas, scans and page-specific facts.",
    evidence: "Live tests + studies · PDF reading",
    evidenceHref: "#evidence-pdf",
    group: "read",
    id: "technical-pdf",
    note: "All four readers kept this PDF's table. The parse operation wasn't tested.",
    providers: ["Exa", "Firecrawl"],
    title: "Read a technical PDF",
  },
  {
    capabilities: ["map"],
    check:
      "Check that the URL limit hasn't hidden pages you need. Report any missing coverage.",
    choices: ["Firecrawl"],
    description: "List URLs before fetching page text.",
    evidence: "Live tests · Site URLs",
    evidenceHref: "#evidence-crawl",
    group: "explore",
    id: "site-urls",
    note: "Set the URL limit and allowed section. Tavily missed this target.",
    providers: ["Firecrawl"],
    title: "Find pages within a site",
  },
  {
    capabilities: ["crawl"],
    check:
      "Check which required pages were fetched and whether they stayed within the allowed section. List missing pages.",
    choices: ["Firecrawl"],
    description: "A tutorial, docs section or other linked pages.",
    evidence: "Live tests · Site map and crawl",
    evidenceHref: "#evidence-crawl",
    group: "explore",
    id: "site-section",
    note: "Set paths, page limit and depth. Tavily missed required pages in this test.",
    providers: ["Firecrawl"],
    title: "Collect pages from one section",
  },
  {
    capabilities: ["browser", "act"],
    check:
      "Check the inputs, permission to act and final page state. A readable page alone needs no browser.",
    choices: ["Firecrawl / Browserbase"],
    description: "A result that depends on a form or filter.",
    docsOnly: true,
    evidence: "Docs + routing check · No browser test",
    evidenceHref: "#evidence-browser",
    group: "explore",
    id: "interactive-page",
    note: "Use browser or act when clicking or typing changes the result.",
    providers: ["Firecrawl", "Browserbase"],
    title: "Use an interactive page",
  },
  {
    capabilities: ["images"],
    check:
      "Check image coverage, metadata and usage rights. A link doesn't grant permission to use an image.",
    choices: ["Brave / SerpApi", "Firecrawl / Tavily / Parallel"],
    description: "Images and the pages they appear on.",
    docsOnly: true,
    evidence: "Docs only",
    evidenceHref: "/docs/capabilities",
    group: "find",
    id: "find-images",
    note: "Available in the SDK; not live-tested in this pilot.",
    providers: ["Brave", "SerpApi", "Firecrawl", "Tavily", "Parallel"],
    title: "Find images",
  },
  {
    capabilities: ["decide"],
    check:
      "Supply the facts and allowed choices. Check that the chosen label matches the evidence.",
    choices: ["Parallel / Perplexity"],
    description: "A yes/no answer, a choice or a score.",
    docsOnly: true,
    evidence: "Docs only",
    evidenceHref: "/docs/capabilities",
    group: "reason",
    id: "classify-facts",
    note: "Available in the SDK; not live-tested in this pilot.",
    providers: ["Parallel", "Perplexity"],
    title: "Classify supplied facts",
  },
  {
    capabilities: ["discover"],
    check:
      "Set the criteria and result limit. Allow for separate discovery and enrichment costs.",
    choices: ["Parallel · FindAll"],
    description: "Companies or products that meet your criteria.",
    docsOnly: true,
    evidence: "Docs only",
    evidenceHref: "/docs/capabilities",
    group: "find",
    id: "matching-entities",
    note: "Available in the SDK; not live-tested in this pilot.",
    providers: ["Parallel"],
    title: "Find matching entities",
  },
  {
    capabilities: ["monitor"],
    check:
      "Set the frequency, scope and owner before starting a monitor. Check the source when it changes.",
    choices: ["Exa / Firecrawl / Parallel"],
    description: "A repeated search or page check.",
    docsOnly: true,
    evidence: "Docs only",
    evidenceHref: "/docs/monitors-and-browsers",
    group: "explore",
    id: "watch-changes",
    note: "Available in the SDK; not live-tested in this pilot.",
    providers: ["Exa", "Firecrawl", "Parallel"],
    title: "Watch for changes",
  },
  {
    capabilities: ["usage"],
    check:
      "Check credit and the expected cost before starting. A working key doesn't confirm either.",
    choices: ["Firecrawl / Tavily", "SerpApi / Browserbase"],
    description: "Account credits used and remaining.",
    docsOnly: true,
    evidence: "Docs only",
    evidenceHref: "/docs/provider-api",
    group: "explore",
    id: "check-quota",
    note: "Available in the SDK; not live-tested in this pilot.",
    providers: ["Firecrawl", "Tavily", "SerpApi", "Browserbase"],
    title: "Check quota",
  },
];

export const GUIDE_PROVIDERS = [
  ...new Set(GUIDE_TASKS.flatMap((task) => task.providers)),
].toSorted();

export const GUIDE_RULES = [
  {
    detail:
      "Search finds links. Read gets page text. Extract gets fields. Answer and research combine evidence into answers.",
    question: "Links, page text, fields or an answer?",
    title: "Choose the output",
  },
  {
    detail:
      "Use read for known pages, map to list URLs, crawl for a site section, parse for documents, and browser or act for interaction.",
    question: "A known URL, linked pages or an interactive page?",
    title: "Choose how to reach the source",
  },
  {
    detail:
      "Use extract for fields in a schema. Use research for scattered facts, unclear scope or conflicting claims. Check that the source text is complete first.",
    question: "One fact, a relationship or several sources to compare?",
    title: "Choose the reasoning level",
  },
  {
    detail:
      "Check actual versus nominal sizes, the selected variant and any missing values. Open each citation and confirm it supports the wording.",
    question: "Which error would change your decision?",
    title: "Decide what must be checked",
  },
  {
    detail:
      "Use a provider that supports the capability and options. Set page, depth and effort limits. Choose a cheaper call when it meets the same checks.",
    question: "Freshness, time, budget and supported options.",
    title: "Set the limits",
  },
  {
    detail:
      "Report what's missing. Choose the next step and its budget explicitly. Keep the provider, mode and job ID, and resume an interrupted job.",
    question: "A missing source, missing field or conflicting claim.",
    title: "Act on a specific failure",
  },
];

export const ACCESS_CASES = [
  {
    capabilities: "read / search",
    detail: "A public documentation page, a known URL or a literal table cell.",
    label: "Easy access · simple answer",
    title: "Read the page",
  },
  {
    capabilities: "parse / browser / act",
    detail: "For scans, rendered content or answers that need form input.",
    label: "Harder access · simple answer",
    title: "Parse the file or use a browser",
  },
  {
    capabilities: "extract / research",
    detail:
      "Two public pages may disagree or contain rules that depend on each other.",
    label: "Easy access · complex answer",
    title: "Compare the sources",
  },
  {
    capabilities: "read / browser → research",
    detail:
      "Collect the required pages or documents first. Compare their evidence and check the answer against them.",
    label: "Harder access · complex answer",
    title: "Get the sources, then compare",
  },
];

export const GUIDE_DATE = { iso: "2026-11-02", label: "2 November 2026" };

export const MATRIX_NOTE = {
  after: ".",
  before:
    "Starting recommendations, 2 November 2026. These small tests cover selected tasks. Keep provider selection explicit and check each provider's ",
  link: { href: "/docs/options", label: "supported options" },
};

export const CHOOSING_COPY = {
  accessLead:
    "A hard-to-reach page may contain a simple fact. Two public pages may need careful comparison. Choose how to get the source and how to interpret it separately.",
  accessTitle: "Access and reasoning",
  lead: "Choose a capability for the output you need. Then compare providers for access, reasoning, source support, speed and cost.",
  note: "Fieldwork rejects unsupported capabilities and options. Report a failed check, then choose any next step explicitly. These recommendations change no service defaults. Site-specific scrapers remain outside Fieldwork.",
  routerLink: {
    href: "/docs/router",
    label: "Use different providers in one client",
  },
};
