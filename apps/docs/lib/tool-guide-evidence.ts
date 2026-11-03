export const PRODUCT_RESULTS = [
  {
    grounding: "Built-in field links and excerpts",
    mode: "Parallel Task · base",
    score: 103,
    time: "88.7 s",
  },
  {
    grounding: "No built-in field citations",
    mode: "Firecrawl · JSON",
    score: 93,
    time: "7.2 s",
  },
  {
    grounding: "Built-in field links; no excerpts",
    mode: "Exa Agent · low",
    score: 91,
    time: "19.7 s",
  },
];

export const SYNTHESIS_RESULTS = [
  {
    facts: "2/2",
    grounding: "URLs, no excerpts",
    mode: "Exa Agent · low",
    quotes: "9/9",
    time: "24.1 s",
  },
  {
    facts: "2/2",
    grounding: "URLs and excerpts",
    mode: "Parallel Task · base",
    quotes: "9/10",
    time: "99.3 s",
  },
  {
    facts: "2/2",
    grounding: "URLs and excerpts",
    mode: "Parallel Task · core",
    quotes: "9/9",
    time: "127.6 s",
  },
  {
    facts: "0/2",
    grounding: "No field-level citations",
    mode: "Tavily · mini",
    quotes: "No comparable list",
    time: "32.4 s",
  },
];

export const STUDIES = [
  {
    href: "https://github.com/chatnoir-eu/web-content-extraction-benchmark",
    lesson:
      "Compare the page types you need. Main-content extraction doesn't establish complete product relationships or correct schema fields.",
    name: "Bevendorff et al.",
    topic: "Page reading",
    year: "2023",
  },
  {
    href: "https://github.com/opendatalab/WebMainBench",
    lesson:
      "Measure which text survives. Check tables, navigation-heavy pages and your own source types separately.",
    name: "WebMainBench / Dripper",
    topic: "Page reading",
    year: "2026",
  },
  {
    href: "https://github.com/Murrough-Foley/web-content-extraction-benchmark",
    lesson:
      "Use content benchmarks to design capture checks, with their versions and judging methods in view.",
    name: "WCXB",
    topic: "Page reading",
    year: "2026",
  },
  {
    href: "https://arxiv.org/abs/2407.12883",
    lesson:
      "Difficult retrieval from fixed collections tests source-finding, not a current commercial API ranking.",
    name: "BRIGHT",
    topic: "Finding sources",
    year: "2024 / ICLR 2025",
  },
  {
    href: "https://arxiv.org/abs/2508.06600",
    lesson: "Separate finding the source from the agent's answer.",
    name: "BrowseComp-Plus",
    topic: "Finding sources",
    year: "2025",
  },
  {
    href: "https://arxiv.org/abs/2504.12516",
    lesson:
      "Research benchmarks test whole agents. Score answers, source coverage and citation support separately.",
    name: "BrowseComp",
    topic: "Comparing sources",
    year: "2025",
  },
  {
    href: "https://arxiv.org/abs/2506.11763",
    lesson: "Assess report quality and citation support as separate checks.",
    name: "DeepResearch Bench",
    topic: "Comparing sources",
    year: "2025",
  },
  {
    href: "https://arxiv.org/abs/2412.07626",
    lesson:
      "Check text, tables, formulae and reading order separately. Good Markdown doesn't establish page or region references.",
    name: "OmniDocBench",
    topic: "PDFs and documents",
    year: "2024; evolving dataset versions",
  },
  {
    href: "https://arxiv.org/abs/2307.13854",
    lesson:
      "Verify the requested result in the page or app. An answer or screenshot alone doesn't prove the action worked.",
    name: "WebArena",
    topic: "Browser tasks",
    year: "2023",
  },
];

export const EVIDENCE_COPY = {
  families: {
    detail:
      "53 completed jobs across 16 variations: 51 planned jobs and two map/crawl follow-ups. Some questions share one capture. These were local SDK calls, not fresh hosted-gateway tests.",
    title: "Tests across eight task families",
  },
  lead: "Product extraction, eight task families and nine studies. Selected diagnostic cases help us choose a starting point; they don't establish a universal winner.",
  products: {
    caveat:
      "Excluding two ambiguous paint checks gives 102/106, 93/106 and 89/106; the ranking stays the same. Repeats aren't independent products. A source-backed alternative can still be valid. Exa Agent research and Exa Contents extraction are separate operations. Provider freshness controls differed.",
    detail:
      "54 jobs, 12 products and 18 jobs per mode. The first run for each product contributed 108 checks per mode: facts, missing values and exact source documents.",
    summary: "All 54 results matched the JSON schema. Some facts were wrong.",
    title: "Product facts and response time",
  },
  spend: {
    detail:
      "$0.812 for this pilot + $1.08 for the earlier product tests. Costs use reported USD/credits or conservative price estimates; invoices weren't checked. All paid jobs finished. Native parse, browser actions and specialist operations were untested here. Brave, Perplexity and Browserbase were covered by docs only.",
    title: "Estimated provider spend: $1.89 of $10",
  },
  studies: {
    caveat:
      "Several benchmarks come from teams whose tools they evaluate. BrowseComp comes from OpenAI. Versions, fixed source collections and LLM judging methods affect the results. We reviewed public sources and code; we didn't rerun the benchmarks. Links were checked against saved research notes, not freshly fetched for this guide.",
    detail:
      "Each study tests a different part of the work. None ranks all of today's commercial APIs.",
    title: "What the studies help us test",
  },
  synthesis: {
    caveat:
      "Exa for short comparisons; Task base for built-in source excerpts per field. Core added no required facts in these two cases. Base changed “since” to “Because” in a quote. Tavily missed explicit guidance in both cases; we haven't established why.",
    detail:
      "Two questions about when SQLite fits, concurrent writers and WAL limits. Generated quotes were checked against the source text, allowing only whitespace differences.",
    title: "Comparing two SQLite pages",
  },
};

export const FAMILY_FINDINGS = [
  {
    id: "evidence-reading",
    paragraphs: [
      "All four readers kept the required HTML prose and code. Batch reading wasn't tested.",
    ],
    title: "Page reading",
  },
  {
    id: "evidence-search",
    paragraphs: [
      "Exact source in the first five, two queries: Exa 2/2, Parallel 2/2, Firecrawl 2/2, Tavily 2/2 and SerpApi 0/2. For two broad questions: Exa 2/2, Parallel 2/2, Firecrawl 1/2, Tavily 1/2 and SerpApi 0/2.",
      "We checked for specific target pages, not overall relevance. Modes, content add-ons and caching differed. Google used the same plain-language queries, without keyword tuning.",
    ],
    title: "Finding sources",
  },
  {
    id: "evidence-answers",
    paragraphs: [
      "On the RFC exception question, Exa cited a source outside the allowed set. Parallel shortened an extra quote without marking the omission. Tavily missed a qualifying exception. Check the answer, quoted wording and allowed sources separately.",
    ],
    title: "Answers and citations",
  },
  {
    id: "evidence-pdf",
    paragraphs: [
      "All four readers kept Table 2 and the source's conflicting BLEU scores: 41.0 in the prose, 41.8 in the table. Training Cost is FLOPs. The outputs didn't establish structured page or region references. Scans and native parse weren't tested.",
    ],
    title: "PDF reading",
  },
  {
    id: "evidence-crawl",
    paragraphs: [
      "Firecrawl found the target and fetched all three requested chapters within four pages. Tavily's mapped URL gave a 404. Its first crawl fetched only the index; a depth-two follow-up fetched 1/3 chapters. Depth and selection rules differed.",
    ],
    title: "Site map and crawl",
  },
  {
    id: "evidence-browser",
    paragraphs: [
      "The UK calculator's first question was readable over HTTP. No personal inputs, browser actions or completed calculations were tested. The bank-holiday JSON needed no browser. Use a browser when the answer depends on interaction, and check the final page state.",
    ],
    title: "When a browser helps",
  },
];
