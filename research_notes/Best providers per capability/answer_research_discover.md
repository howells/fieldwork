# Best providers per capability: answer, research, discover, decide (as of 2026-11-03)

General caveat: almost every benchmark number below is published by a vendor, often a competitor of the vendor being scored, and scores for the same product disagree by 40+ points across sources. No neutral, current leaderboard covers API products as a group. Eden AI says so itself, and it resells Linkup and Firecrawl ([Eden AI](https://www.edenai.co/post/best-deep-research-apis)).

## 1. Deep research APIs (`research`): who leads, and what changed

### Takeaway

Two incumbents in Fieldwork's research list changed under us. Exa's `/research` endpoint is gone, replaced by the Exa Agent API. Firecrawl's v1 `/deep-research` is deprecated. OpenAI's deep research models were shut down. Parallel Task, You.com Research, Valyu, Linkup `/research`, Gemini Deep Research and Perplexity are the live contenders. No independent benchmark ranks them, and vendor numbers conflict. Gemini Deep Research does not support JSON schema output.

### Cited Findings

- Exa shut down its Research API (`/research/v1`, models exa-research-fast / exa-research / exa-research-pro). The changelog entry dated April 1, 2026 says it was replaced by `/search` with `type: "deep-reasoning"`. A third-party write-up gives the removal date as May 1, 2026. — [Exa changelog](https://exa.ai/docs/changelog); [DEV write-up](https://dev.to/flarecanary/exa-just-removed-research-and-started-silently-ignoring-two-date-filters-your-agent-is-probably-1p51)
- On October 19, 2026, Exa marked `deep-reasoning` legacy and said to use `deep`, "or Exa Agent for long-running research, list building and multi-hop enrichment". — [Exa changelog](https://exa.ai/docs/changelog)
- Exa Agent API launched June 16, 2026. You create a run with `POST https://api.exa.ai/agent/runs` and poll until it finishes. It takes a natural-language query, `effort`, `outputSchema` and `input.data`. Output has `output.text`, `output.structured` and `output.grounding` (citations). `effort: "ultra"` was added September 24, 2026, billed by usage with a default cap of $20 per run. — [Exa changelog](https://exa.ai/docs/changelog); [Exa Agent quickstart via search summary](https://exa.ai/docs/agent/quickstart)
- Eden AI lists Exa Agent API costs as compute units capped at $5 (auto) or $20 (beta max). — [Eden AI](https://www.edenai.co/post/best-deep-research-apis)
- Firecrawl's v1 `/deep-research` is deprecated. The docs say it stays active but is no longer maintained. Responses point to `/v2/search`. Firecrawl now offers `/agent` (managed runs, described as Research Preview in an August 2026 third-party post) or search plus scrape loops. Dates in Firecrawl's own docs and blog contradict each other (June 30, 2025 vs May 2026). Self-hosted installs serve deep research only under `/v1`. — [Firecrawl docs](https://docs.firecrawl.dev/api-reference/v1-endpoint/deep-research); [Firecrawl blog](https://www.firecrawl.dev/blog/best-deep-research-apis); [GitHub PR #113](https://github.com/obeone/firecrawl-ui/pull/113); [Eden AI](https://www.edenai.co/post/best-deep-research-apis)
- OpenAI `o3-deep-research` and `o4-mini-deep-research` were deprecated April 22, 2026 and shut down July 23, 2026. OpenAI's listed replacement is `gpt-5.6-sol`, a general model with no dedicated deep research endpoint. — [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations). (Eden AI names GPT-5.5 / GPT-5.4-mini as replacements; the OpenAI page is the primary source.)
- Gemini Deep Research is available only through the Interactions API, in preview. Agent IDs: `deep-research-preview-04-2026` (about $1-3 per task) and `deep-research-max-preview-04-2026` (about $3-7 per task). It requires `background=True` and `store=True`. You poll `interactions.get(id)` and can stream with resume via `last_event_id`. It runs up to 60 minutes. It "currently doesn't support structured outputs". — [Gemini docs (redirected to AI Studio)](https://aistudio.google.com/docs/deep-research)
- Gemini cost: no flat fee, billed at Gemini token and tool rates. — [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- Parallel Task API (self-published, August 2026, fixed 100-question subsets): BrowseComp Lite 88% ($5 per 1k), Core 91% ($25), Ultra 92% ($300), Ultra2x 93% ($600), Ultra4x 94% ($1,200). DeepSearchQA: Task Pro 83% at $100 per 1k vs Gemini 3.1 Pro (high) 77% at $123.90 per 1k. These contradict Parallel's own June 2025 figures (Ultra 27% BrowseComp, Ultra8x 58%), so setups and test sizes differ. — [Parallel benchmark report](https://parallel.ai/articles/best-deep-research-apis); [Parallel BrowseComp post](https://parallel.ai/blog/deep-research-browsecomp)
- Eden AI quotes Parallel's DeepSearchQA run: Ultra2x 72.6%, Ultra 68.5%, Pro 62%; Gemini Deep Research 64.3%; Exa Research Pro 27%; Perplexity 26.9%. Parallel ran these on its competitors. — [Eden AI](https://www.edenai.co/post/best-deep-research-apis)
- You.com Research API (self-published): tiers Lite $6.50, Standard $50, Deep $100, Exhaustive $300 per 1k, with Frontier $1,200 per 1k and over 300 s. Frontier reaches about 86.61% on DeepSearchQA, 94.35% F1, and 89.95% on FinSearchComp. It is a single agent that can run up to 1,000 turns. Earlier claim of 83.67% accuracy on DeepSearchQA. — [You.com Frontier post](https://about.you.com/resources/the-ydc-research-api-frontier-tier-reaches-a-new-level-of-state-of-the-art-performance); [You.com DeepSearchQA post](https://you.com/resources/achieving-sota-on-deepsearchqa); [Eden AI](https://www.edenai.co/post/best-deep-research-apis)
- Valyu DeepResearch (self-published on DRACO, a benchmark Research.site attributes to Perplexity): Heavy 72.7% at about $2,500 per 1k; Perplexity DR 70.5%; Gemini DR 59.0%; OpenAI DR (o4-mini) 41.9%; Tavily Research pro 38.8%; Exa Deep Reasoning 25.9%. Valyu also scores You.com 52.9% and Parallel Ultra8x 51.2% on DRACO. Valyu's tiers: Fast / Standard / Heavy / Max, runtimes from 1 minute to 3 hours; supports file outputs such as PDF, DOCX and XLSX. — [Valyu blog](https://www.valyu.ai/blogs/introducing-deepresearch); [Eden AI](https://www.edenai.co/post/best-deep-research-apis); [Research.site](https://research.site/table)
- Linkup `/research` is asynchronous. Linkup reports 61% on SealQA-0. Research costs $250-$2,500 per 1k by depth. — [Eden AI](https://www.edenai.co/post/best-deep-research-apis); [Linkup benchmarks](https://www.linkup.so/benchmarks)
- Perplexity Sonar Deep Research: $2/M input, $8/M output, $2/M citation tokens, $3/M reasoning tokens, $5 per 1k searches; typically $0.41-$1.32 per query per one guide. Eden AI calls it the fastest turnkey option (most runs under 3 minutes). — [CloudZero-type guides via search](https://www.cloudzero.com/blog/perplexity-api-pricing/); [Eden AI](https://www.edenai.co/post/best-deep-research-apis)
- Tavily Research: credits at $0.008 (pay as you go) or $0.005 (Growth); mini 4-110 credits, pro 15-250 credits per request. Tavily supports a JSON-schema structured output option in its Research UI. Nebius announced an acquisition on February 10, 2026; closing unconfirmed in sources found. Tavily Research pro scores 38.8-39.1% on third-party runs. — [Liner](https://build.liner.com/blog/tavily-alternative-deep-research); [Medium evaluation](https://medium.com/@unicodeveloper/ai-deepresearch-apis-in-2026-f6d89ca0c17d)
- DeepResearch Bench (the academic RACE/FACT benchmark; paper at ICLR 2026): scores changed after the official grader moved to GPT-5.5 by July 2026. October 2026 vendor-hosted standings (CellCog's own site) put CellCog Max at 56.72, with Google, OpenAI, Perplexity and xAI products ranked 14-17 of 17 (Gemini 2.5 Pro DR 49.98, OpenAI DR 47.84, Perplexity 43.05). GREP AI claims first at 56.27 on its own site. The leaderboard is dominated by agent products, not APIs. — [CellCog](https://cellcog.ai/benchmarks); [GREP AI](https://grep.ai/benchmark)
- Eden AI warns of "search-time contamination" (agents finding benchmark answers on the web) and recommends a private 20-50 query eval. — [Eden AI](https://www.edenai.co/post/best-deep-research-apis)

### Inferences

- Fieldwork's research list should drop Exa's old Research mapping and move to Exa Agent API (`/agent/runs`) if Exa stays. Check the current adapter against `/research`. Firecrawl `/deep-research` is a deprecated target, and the replacement `/agent` is a different shape in Research Preview, so Firecrawl is a weak entry.
- Best candidates to add for `research`: You.com Research API (tiered, public benchmarks, REST), Linkup `/research` (async), Valyu DeepResearch (async, strongest DRACO claim, but its own benchmark), and Gemini Deep Research (strong, but no `schema` support, so the types must refuse `schema` for it under the "never called for options it lacks" rule).
- Parallel looks like the strongest all-round entry on structured output plus tiered cost, but its lead claims are self-published.
- OpenAI no longer has a native deep research API; do not add it.

### Gaps

- No independent, current comparison across Parallel, You.com, Valyu, Linkup, Perplexity and Gemini. Every figure is vendor-run.
- Did not verify You.com or Valyu REST shapes (job/poll/resume, schema support) in their own docs.
- Did not verify the Perplexity DeepSearchQA / ResearchRubrics claims from Perplexity itself.
- Tavily's own DeepResearch Bench score was not found.

## 2. Answer APIs (`answer`)

### Takeaway

Everyone near the top claims 90%+ on SimpleQA, and every claim is self-reported (Linkup 94%, Brave 94.1%, Exa Research Pro 94.9% as quoted by Brave). Linkup is the one clear provider missing from Fieldwork's answer list. Perplexity scores 77-87% on SimpleQA in Linkup's runs against 93.9% in Brave's, so the numbers carry no weight as a ranking.

### Cited Findings

- Linkup reports SimpleQA F1 (sub-second class): Linkup Fast 94%, Perplexity Sonar 87%, Gemini 3 Flash 85%, Serper Fast 83%, Tavily Fast 79%, Exa Fast 63%. An older post gave Sonar 77.3% and Sonar Pro 85.8% (Linkup Standard 92%). The eval code is open source (github.com/LinkupPlatform/eval-simpleQA). — [Linkup benchmarks](https://www.linkup.so/benchmarks); [Linkup SimpleQA post](https://www.linkup.so/blog/linkup-establishes-sota-performance-on-simpleqa)
- Brave AI Grounding: 94.1% F1 on SimpleQA in multi-search mode, 92.1% in single search, compared with Exa Research Pro 94.9% and Perplexity Deep Research 93.9% as cited by Brave. Brave's reviewers found 167 of 292 "wrong" answers were judge errors or flawed gold answers, so the benchmark is noisy near the ceiling. — [Brave blog](https://brave.com/blog/ai-grounding/)
- Brave 2026 plans: Search plan at $5 per 1k, plus an Answers plan. Launch pricing was $4 per 1k searches plus $5/M tokens; supports the OpenAI SDK and streaming; 2 QPS rate limit. — [ppc.land summary of the Brave announcement](https://ppc.land/braves-5-search-api-wins-ai-answer-test-as-perplexity-finishes-last/); [Brave blog](https://brave.com/blog/ai-grounding/)
- Perplexity: Sonar $1/$1 per M tokens; Sonar Pro $3/$15, plus request fees $5-14 per 1k by context size. A raw Search API with no answer costs $5 per 1k. One guide says Sonar now runs inside Perplexity's Agent API (rates checked October 12, 2026). — [CloudZero](https://www.cloudzero.com/blog/perplexity-api-pricing/); [Puter](https://developer.puter.com/tutorials/perplexity-api-pricing/)
- Eden AI lists Exa Answer at $5 per 1k, Exa Search $7, Deep $12. Exa's changelog has no `/answer` entry, so verify the endpoint exists. — [Eden AI](https://www.edenai.co/post/best-deep-research-apis); [Exa changelog](https://exa.ai/docs/changelog)
- Linkup pricing: Search $5 per 1k, Deep Search $50. — [Eden AI](https://www.edenai.co/post/best-deep-research-apis)
- You.com tested its API on SimpleQA, FRAMES, BrowseComp and DeepSearchQA, with an open-source harness using fixed third-party graders. — [You.com](https://you.com/resources/achieving-sota-on-deepsearchqa)

### Inferences

- Current list (Exa, Tavily, Parallel, Perplexity, Brave) covers the major answer providers except Linkup (sourced answers via `/search` with `outputType`), and You.com (whose `answer` equivalent is its Research API Lite/Standard tier).
- A ranking from these sources would be unreliable. Pick on price, latency and citation format instead.

### Gaps

- Did not verify Linkup's `sourcedAnswer` output type against its docs, or Parallel's chat endpoint. No independent SimpleQA run for any provider. Exa's `/answer` endpoint status not confirmed.

## 3. Entity discovery (`discover`)

### Takeaway

Exa Websets is a natural fit for `discover` and is the only direct rival to Parallel FindAll. The two differ in a way that matters: FindAll verifies each candidate against every condition, Websets filters at search time. The only independent test found (NewsCatcher, March 2026, 32 queries) favors Websets on recall (19.6% vs 5.5%) with similar precision, so Parallel's recall claims are untested by outsiders. Exa Agent API also does list building. I found no sign Exa is sunsetting Websets, but its changelog does not mention Websets at all.

### Cited Findings

- Parallel FindAll: `POST /v1beta/findall/runs` with `objective`, `entity_type`, `generator` (preview / base / core / pro), named `match_conditions` and `match_limit`. Three stages: generate, evaluate, enrich. Async, 10 seconds to 2 hours, 300 runs per hour. Pricing: preview $0.10 fixed; base $0.25 + $0.03 per match; core $2 + $0.15; pro $10 + $1. Enrichments add per-match Task API cost. — [Parallel docs](https://docs.parallel.ai/getting-started/pricing); [Parallel vs Exa](https://parallel.ai/articles/exa-vs-parallel-findall)
- Parallel's own recall benchmark: FindAll Base 30.3%, Core 52.5%, Pro 61.3%, OpenAI Deep Research 21%, Exa 19.2%. — [Parallel FindAll](https://parallel.ai/products/findall) (via search summary)
- Independent test (NewsCatcher, March 2026, 32 real-world event queries): Websets recall 19.6% and precision 83.7%; FindAll Core recall 5.5% and precision 77.7%. Reported in a Parallel-authored article, so the framing is theirs but the numbers are unfavorable to Parallel. — [Parallel vs Exa](https://parallel.ai/articles/exa-vs-parallel-findall)
- Websets: create a Webset from a natural-language search, then add enrichment columns (text, date, number, options, email, phone, URL). Async with webhooks. Email / phone enrichment is 5 credits per contact. — [Parallel vs Exa](https://parallel.ai/articles/exa-vs-parallel-findall)
- Websets pricing is a subscription: Starter $49 per month with 8,000 credits, Pro $449 per month with 100,000 credits (as shown on Exa's billing page). It is not drawn from pay-as-you-go API billing. An October 2026 review says Exa's pricing page no longer lists Websets plans. — [Websets billing](https://websets.exa.ai/websets/billing); [Aitrendtool review](https://aitrendtool.com/tools/exa)
- Exa Agent API supports list building and enrichment, with `outputSchema` and `input.data` to extend an existing dataset. — [Exa changelog](https://exa.ai/docs/changelog)
- Parallel Entity Search: a synchronous people and company search at $5 per 1k requests with 100 results per request; results are ranked but not verified. — [Parallel docs](https://docs.parallel.ai/findall-api/entity-search)

### Inferences

- Websets fits `discover` (conditions as criteria, entity type, count). Fieldwork's `resume` and `jobId` rules should map to a Webset id. The pricing model (subscription credits) is awkward for a pay-per-call SDK and needs Daniel's decision.
- Exa Agent API is probably the newer, pay-per-use route to list building, but check whether it offers match-condition semantics before listing it for `discover`.
- Note Parallel FindAll is still `v1beta`.

### Gaps

- Could not confirm Websets' current API status after the Agent API launch (changelog silent). Did not find Clay-like APIs with a public REST discovery endpoint. Credit cost per Webset result or enrichment not found.

## 4. `decide` (classification with probabilities)

### Takeaway

I found no provider that natively returns per-class probabilities for classification of supplied facts. Parallel returns a calibrated confidence per output field in `basis`, which is not a class distribution. Fieldwork's current `decide` mapping for Parallel and Perplexity should be checked against how each produces probabilities.

### Cited Findings

- Parallel Task API returns a `basis` array with citations, excerpts, reasoning and confidence for each output field. Docs and changelog describe confidence as high / medium / low; two Parallel pages show a 0-1 number. — [Parallel Basis post](https://parallel.ai/blog/introducing-basis-with-calibrated-confidences); [Parallel changelog](https://docs.parallel.ai/resources/changelog)
- Exa deep search with `outputSchema` returns `output.grounding` with field-level citations and confidence. — [Exa changelog write-up](https://dev.to/flarecanary/exa-just-removed-research-and-started-silently-ignoring-two-date-filters-your-agent-is-probably-1p51)
- Search found no mention of class probability distributions in any provider's classification docs.

### Inferences

- If `decide` currently reports probabilities from Parallel or Perplexity, they likely come from a model-stated number in a JSON schema or categorical confidence. That is closer to emulation than a native feature, which conflicts with the "no emulation" rule. Check the adapter code.

### Gaps

- Did not read Perplexity's structured output docs for logprobs or confidence. Did not search OpenAI, Gemini or Anthropic logprob features, because they are model APIs and not web providers.

## 5. Pricing summary (per 1,000 requests unless noted)

### Takeaway

Per-call costs span three orders of magnitude, and the units differ across vendors, so compare on a fixed eval set.

### Cited Findings

- Parallel Task: Lite $5, Core $25, Pro $100, Ultra $300, Ultra2x $600, Ultra8x $2,400. — [Parallel benchmark report](https://parallel.ai/articles/best-deep-research-apis); [Eden AI](https://www.edenai.co/post/best-deep-research-apis)
- You.com: Lite $6.50, Standard $50, Deep $100, Exhaustive $300, Frontier $1,200. — [You.com](https://about.you.com/resources/the-ydc-research-api-frontier-tier-reaches-a-new-level-of-state-of-the-art-performance); [Eden AI](https://www.edenai.co/post/best-deep-research-apis)
- Linkup: Search $5, Deep Search $50, Research $250-$2,500. — [Eden AI](https://www.edenai.co/post/best-deep-research-apis)
- Valyu: about $0.10 / $0.50 / $2.50 / $15 per task across Fast / Standard / Heavy / Max; vendor pages disagree on units. — [Eden AI](https://www.edenai.co/post/best-deep-research-apis)
- Gemini Deep Research: about $1-3 per task (standard), $3-7 (Max), token-billed. — [Gemini docs](https://aistudio.google.com/docs/deep-research)
- Exa Agent: usage-based, capped at $5 (auto) or $20 (ultra) per run by default. Exa search $7, deep $12. — [Exa changelog](https://exa.ai/docs/changelog); [Eden AI](https://www.edenai.co/post/best-deep-research-apis)
- Perplexity: Deep Research about $0.41-$1.32 per query. — [CloudZero](https://www.cloudzero.com/blog/perplexity-api-pricing/)
- Tavily Research: $0.03-$0.88 (mini) and $0.12-$2.00 (pro) per request. — [Liner](https://build.liner.com/blog/tavily-alternative-deep-research)
- Brave: $5 per 1k on the Search plan; Answers plan launched at $4 per 1k plus $5/M tokens. — [Brave blog](https://brave.com/blog/ai-grounding/)
- FindAll: see section 3. Websets: subscription, see section 3.

### Inferences

- On Parallel's own numbers, Pro to Ultra2x costs 6x more for roughly 10 points of accuracy (Eden AI's reading), so default tiers should stay cheap.

### Gaps

- Prices come from vendor pages and third-party summaries fetched through search; I did not open every official pricing page (Perplexity, Linkup, You.com, Valyu especially).
