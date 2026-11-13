# Best web search and image search APIs for AI agents (state as of November 2026)

Method note: most "best search API" posts are written by vendors that rank themselves first (Parallel, Exa, Linkup, You.com, Firecrawl, Serpent). Every benchmark below names who ran it. Only Artificial Analysis and AIMultiple are third parties (AIMultiple discloses that SerpApi is one of its clients). I fetched pages through a summarising fetch tool and some search snippets are second-hand, so figures marked "via" were not seen on the primary page.

## Which providers lead on search quality per benchmarks, and who ran each?

### Takeaway

On the most neutral board (Artificial Analysis Search Index, Oct 19 2026), Exa and Perplexity tie at the top (80), Octen is third-tier at 77 and far cheaper, and Parallel, Brave, You.com, OpenAI and Firecrawl sit at 73 to 75. The top seven are within about 7 points. Rankings flip with the benchmark, the harness and the tier, so price and latency matter more than quality.

### Cited Findings

- Artificial Analysis (independent) launched its Search Index on Aug 18, 2026. The score is the equal-weighted mean of DeepSearchQA, BrowseComp and AA-Omniscience (1,700 questions). The same answer model (GPT-5.6 Luna) runs on the open-source Stirrup harness and only the search API changes. The model alone with no search scores 33. — [Artificial Analysis announcement](https://artificialanalysis.ai/articles/search-api)
- At launch (Aug 2026), Parallel Search advanced led at 75, Exa auto 74, and Firecrawl and Parallel basic 73. — [Artificial Analysis announcement, via search summary](https://artificialanalysis.ai/articles/search-api)
- Leaderboard as of Oct 19, 2026 (26 products from 14 providers; the fetch showed 12 rows). Index, search cost per 1k tasks (not per 1k queries), average time per task: Exa auto dynamic highlights 80 ($53.17, 33.7s); Perplexity Search medium 80 ($62.30, 27.3s); Exa lite 79 ($31.20, 16.5s); Perplexity high 79; Octen (highlights) 77 ($9.07, 12.6s); Parallel advanced 75 ($47.93, 36.6s); Brave LLM context 75 ($61.96, 18.8s); OpenAI Web Search medium 74; You.com highlights 74 ($47.54, 18.1s); Nimble standard 74; Firecrawl Search 73 ($30.48, 57.5s); DeepSeek Search 69. — [Artificial Analysis leaderboard](https://artificialanalysis.ai/agents/search-api)
- The leaderboard FAQ names TinyFish Search as the lowest search cost ($0 per 1,000 benchmark tasks), and a search summary reports it scoring 71. Keenable Search realtime has the fastest calls (0.34s per query at launch). Linkup, Tavily, SerpApi, Browserbase and Serper were not visible in the rows I could read. — [Artificial Analysis leaderboard](https://artificialanalysis.ai/agents/search-api); [launch coverage via search summary](https://alphasignal.ai/news/artificial-analysis-ranks-11-search-apis-by-how-well-ai-agents-answer)
- AIMultiple (third party; SerpApi is a paying client of its benchmarking services) tested 8 APIs on 100 AI/LLM-topic queries. Top 5 results per query, judged by GPT-5.2. Data is a December 2025 snapshot, page last updated May 2026. Agent Score (95% CI) and latency: Brave 14.89 (669 ms); Firecrawl 14.58 (1,335 ms); Exa 14.39 (~1.2 s); Parallel Search Pro 14.21 (13.6 s); Tavily 13.67 (998 ms); Parallel Base 13.50 (~2.9 s); Perplexity 12.96 (11+ s); SerpApi 12.28 (2.4 s). The top four are statistically indistinguishable. Brave's CI lower bound (13.80) is above SerpApi's upper bound (13.41), which contradicts the page's claim that Brave-vs-Tavily is the only clear gap. — [AIMultiple](https://aimultiple.com/agentic-search)
- Parallel (vendor, Sept 2026) BrowseComp with a GPT-5.6 Sol agent: Parallel Advanced 74, Perplexity 74, Exa 70, Tavily 66. With the cheaper Luna agent: Perplexity 46, Parallel Fast 44, Exa 36, Tavily 32. SimpleQA Verified: Parallel Fast 94% at $2 per 1k questions; Tavily 94% at $17.40. Parallel concedes Exa beat Parallel Fast on WideSearch. — [Parallel comparison](https://parallel.ai/articles/the-honest-2026-comparison-web-search-apis-for-ai-agents)
- Parallel's older 6-API post (vendor) put OpenAI Web Search first at 57.7% BrowseComp, Parallel Turbo 51%, Brave 38.3%, Exa Instant 33.7%, SerpAPI 23.3%, Tavily Ultra Fast 19.3%, while also claiming Parallel ranks first overall (self-contradictory; date not confirmed). — [Parallel](https://parallel.ai/articles/best-ai-search-for-agents), via search summary
- Tavily (vendor, open-source `tavily-search-evals`) SimpleQA: Tavily 93.3%, Perplexity 85.92%, Brave 76.05%, Exa 71.24%. Linkup and Parallel were not included. — [tavily-ai/tavily-search-evals](https://github.com/tavily-ai/tavily-search-evals), via search summary
- Linkup (vendor) claims 94% (elsewhere 92%) F-score on SimpleQA Verified, with an open harness at `LinkupPlatform/eval-simpleQA`. Parallel's board shows Linkup at 68 (standard) and 47 (flash) against Exa and Perplexity at 80, which is a rival's board. — [Linkup vs Parallel (Parallel)](https://parallel.ai/articles/linkup-vs-parallel); [Linkup](https://www.linkup.so/blog/tavily-alternative-web-search-api-comparison)
- Openbenchmarks (third party per Parallel; Sept 2026) mean latency on factual lookup: Parallel Turbo 348 ms, Exa Instant 398 ms, Tavily Basic 1.88 s. — [Parallel comparison](https://parallel.ai/articles/the-honest-2026-comparison-web-search-apis-for-ai-agents)
- You.com (vendor) reports 91.1% on SimpleQA for itself. — [You.com](https://you.com/resources/best-web-search-apis-for-ai-agents), via search summary

### Inferences

- Exa and Perplexity are the quality leaders on the independent board, but they are the expensive and slow-per-task configs; Octen delivers 77 at about a sixth of the search cost.
- Quality differences among Exa, Perplexity, Parallel, Brave, You.com and Firecrawl are small and sit within judge noise. Pick on price, latency and filters.
- Tavily and Linkup lead only on benchmarks their own vendors ran (SimpleQA-style factual questions) and are absent from or low on neutral boards.

### Gaps

- The full 26-row Artificial Analysis table was not visible; Tavily, Linkup, SerpApi, Browserbase and Serper scores unknown.
- No independent evaluation of image-search quality found at all.

## Index type, price per 1k queries, filters, latency (current providers)

### Takeaway

Own-index: Exa, Parallel, Perplexity, Brave. Reseller or scraper: SerpApi (scrapes Google, Bing and others), Browserbase (resells Exa and Parallel), and Firecrawl (upstream undisclosed). Tavily's index is not stated. Prices cluster at $5 per 1k.

### Cited Findings

- Exa: own index; $7 per 1k for Auto/Fast (contents for 10 results), Exa's own blog says $4 (Lite/Instant, up to 10 results), Deep $12, extra results $1 per 1k. Latency about 450 ms Lite, about 1 s Auto (vendor). Find Similar endpoint. — [Exa comparison](https://exa.ai/blog/best-web-search-tools-for-ai-agents); [Parallel comparison](https://parallel.ai/articles/the-honest-2026-comparison-web-search-apis-for-ai-agents); [Browserbase/Exa pricing summary](https://exa.ai/docs/admin/pricing)
- Parallel: proprietary index; Turbo and Fast $1 per 1k, Basic and Advanced $5 per 1k; latency Turbo ~200 ms, Fast under 1 s, Basic ~1 s, Advanced ~3 s (vendor); natural-language `objective`; no Google verticals; no anti-bot bypass. — [Parallel comparison](https://parallel.ai/articles/the-honest-2026-comparison-web-search-apis-for-ai-agents)
- Perplexity Search API: own index, hundreds of billions of pages per its Sept 25, 2025 launch; $5 per 1k, or $1 per 1k with `search_type: "fast"`; billed per request not per query; up to 5 queries per request, 1 to 20 results; filters for domain (allowlist or denylist, up to 20, not both), language, date (`MM/DD/YYYY`) and country (ISO code). Sonar was replaced by the Agent API on 2026-09-27. — [Perplexity pricing](https://docs.perplexity.ai/docs/getting-started/pricing); [search summary](https://docs.perplexity.ai/docs/search/overview.md)
- Brave: own independent index (over 30 billion pages per Exa's blog); $5 per 1k across Web, LLM Context, Images, News and Videos, with $5 free credit monthly (card required; the 2,000/month free plan ended around Feb 2026); 50 QPS; Answers plan $4 per 1k plus $5 per million tokens. Lowest latency in AIMultiple (669 ms). — [Brave launch post](https://brave.com/blog/most-powerful-search-api-for-ai/); [Parallel comparison](https://parallel.ai/articles/the-honest-2026-comparison-web-search-apis-for-ai-agents); [AIMultiple](https://aimultiple.com/agentic-search)
- Firecrawl `/search`: 2 credits per 10 results; sources `web`, `news`, `images`; filters `location`, `tbs` time ranges (web only, not images or news), `includeDomains` or `excludeDomains` (not both), `categories` (`research`, `pdf`, `developer`, `gov`). General web results come from an unnamed "upstream search provider"; Firecrawl's own indexes cover only the `developer`, `gov` and (from 2026-11-16) `research` categories. Scored 73 on Artificial Analysis but with the slowest time per task (57.5s). — [Firecrawl docs](https://docs.firecrawl.dev/features/search); [Artificial Analysis](https://artificialanalysis.ai/agents/search-api)
- Tavily: basic search 1 credit, advanced 2 credits, $0.008 per credit pay-as-you-go (about $8 per 1k basic); 1,000 free credits per month; index not stated; Nebius agreed to acquire Tavily in Feb 2026. — [Tavily credits](https://docs.tavily.com/documentation/api-credits); [Exa comparison](https://exa.ai/blog/best-web-search-tools-for-ai-agents)
- SerpApi: scrapes Google, Bing, Yahoo, DDG, Baidu and Yandex; $25 for 1k down to about $5.50 per 1k at 500k (about $2 per 1k on the largest image plan); free 250 per month; widest engine and vertical coverage. Lowest AIMultiple Agent Score (12.28, 2.4 s). — [Parallel comparison](https://parallel.ai/articles/the-honest-2026-comparison-web-search-apis-for-ai-agents); [AIMultiple](https://aimultiple.com/agentic-search)
- SerpApi legal risk: Google sued under the DMCA in Dec 2025; on July 20, 2026 the N.D. Cal. court dismissed the §1201 claim with prejudice for results without copyrighted content and dismissed the rest with leave to amend. Docket status after mid-Aug 2026 unconfirmed. — [Search Engine Journal](https://www.searchenginejournal.com/court-dismisses-googles-dmca-claims-against-serpapi/583033/); [Search Engine Land](https://searchengineland.com/google-loses-key-dmca-claims-against-serpapi-in-scraping-lawsuit-483185)
- Browserbase Search: Parallel Fast $1 per 1k (~700 ms), Parallel Advanced $5 per 1k (~3 s), Exa Auto $7 per 1k (~1 s); 1,000 free calls per month on Free, Developer ($20) and Startup ($99) plans; overage $7 per 1k on paid plans; 2 per second rate limit; an older page described a flat $7 per 1k Exa-powered rate. A competitor (TinyFish) notes it adds a vendor hop on a third-party index. — [Browserbase Search](https://www.browserbase.com/search); [Browserbase plans](https://docs.browserbase.com/account/billing/plans); [Vercel AI Gateway listing](https://vercel.com/ai-gateway/models/exa-search)
- OpenAI and Anthropic native `web_search` cost $10 per 1k plus tokens (not REST search APIs; reference points only). — [Parallel comparison](https://parallel.ai/articles/the-honest-2026-comparison-web-search-apis-for-ai-agents)

### Inferences

- Browserbase Search is a pure reseller of Exa and Parallel at the same or higher price ($7 per 1k for Exa Auto, the same as Exa direct), so it adds nothing over calling Exa or Parallel directly and is redundant for Fieldwork. It also means a Browserbase request buys the same two indexes Fieldwork already supports.
- Firecrawl search is a wrapper over an undisclosed upstream index for general web (its own index exists only for niche categories), but it scored 73 on the neutral board and 14.58 on AIMultiple, so quality is fine; the weak points are slow runs and `tbs` not applying to images. It is not redundant because it returns page markdown inline and has images and news sources.
- SerpApi is the only current provider that offers Google-vertical breadth and a Google ranking; it scores lowest on agent-style quality tests, with legal risk.

### Gaps

- Exa's price is inconsistent across sources ($4 Lite/Instant versus $7 Auto/Fast versus the AIMultiple "$5–$15" range); confirm on exa.ai/docs.
- Tavily fast and ultra-fast credit costs and `include_images` cost were not on the page I fetched.
- Perplexity Search and Tavily country and date filter specifics beyond the summary were not verified against raw API reference.

## Which candidates not in Fieldwork are credible additions?

### Takeaway

Credible adds with a public REST API: You.com (own-index claims, rich filters, $5 per 1k, and on the independent board at 74), Linkup (pay as you go, $5 per 1k, strong self-reported factual accuracy but weak or absent on neutral boards), Kagi (premium, $12 per 1k, includes images), and Serper (cheapest Google SERP at $1 per 1k, includes images). Bing and Google PSE are not options.

### Cited Findings

- Bing Search APIs (Web, Image, News, Video, Custom Search and others) were retired Aug 11, 2025; endpoints return HTTP 410. Microsoft's replacement is "Grounding with Bing Search" inside Azure AI Agents, not a standalone search endpoint. — [PPC Land](https://ppc.land/microsoft-ends-bing-search-apis-on-august-11-alternative-costs-40-483-more/); [Linkup blog](https://www.linkup.so/blog/what-s-the-best-alternative-to-the-bing-search-api)
- Google Custom Search JSON API is closed to new customers and shuts down Jan 1, 2027. Since Jan 2026 new Programmable Search engines are limited to 50 listed domains and cannot search the whole web. Google documented a partner-only Web Search Service API on Sept 9, 2026 (quote only, agreement required). Existing pricing: 100 free per day, then $5 per 1k. — [Massive](https://www.joinmassive.com/blog/google-custom-search-api-alternative); [Octoparse](https://www.octoparse.com/blog/google-official-search-api) (both secondary; vendor-adjacent)
- You.com Web Search API: $5 per 1k flat (cut from $6.25/$8.00 in Mar–Apr 2026), 1 to 100 results per call, country, language and freshness filters, 100 free calls per day, $100 signup credit; Contents API $1 per 1k pages. Scored 74 on Artificial Analysis (18.1s per task). — [You.com pricing](https://you.com/resources/lower-search-api-cost); [Exa comparison](https://exa.ai/blog/best-web-search-tools-for-ai-agents); [Artificial Analysis](https://artificialanalysis.ai/agents/search-api)
- Linkup: standard $5 per 1k ("searchResults"), $6 with sourced answer or structured output; deep $50 per 1k (deep takes 5 to 30s); fetch with JS $5 per 1k; pricing moved to USD in May 2026; $20 monthly free top-up for eligible accounts. Self-reported 92 to 94% SimpleQA Verified. — [Linkup docs via search](https://docs.linkup.so/pages/documentation/platform/pricing.md); [Linkup](https://www.linkup.so/blog/tavily-alternative-web-search-api-comparison)
- Kagi Search API: $12 per 1k pay as you go, covers web, images, news, videos, podcasts, with lenses and filters; page extraction $4 per 1k pages; auth `Authorization: Bot TOKEN`. — [Kagi pricing](https://kagi.com/api/pricing); [Kagi help](https://help.kagi.com/kagi/api/api-portal.html)
- Serper: resells Google SERP results (no own index); $1 per 1k at the $50 for 50k tier, down to $0.30 at volume; 2,500 free queries; JSON covers organic, People Also Ask, images, places; separate image, news, shopping and scholar endpoints. Serper is the only tool in Exa's roundup that mentions images. — [Exa comparison](https://exa.ai/blog/best-web-search-tools-for-ai-agents); [Scrapfly roundup via search](https://scrapfly.io/blog/posts/google-serp-api-and-alternatives)
- Jina Search (s.jina.ai): billed in tokens (a fixed amount, from about 10,000 tokens per request), not per query, so no comparable per-1k price. — [DEV Community comparison via search](https://dev.to/agentsearchhq/cheapest-web-search-api-for-ai-agents-in-2026-1g80)
- Valyu: CPM pricing, web search about $1.50 (presumably per 1k results), specialist datasets $12 to $20 per 1k; `max_price` not set by default so premium sources can raise cost. — [Valyu pricing](https://docs.valyu.ai/pricing)
- Octen Search (77, $9.07 per 1k tasks, 12.6s) and Nimble Search (74), Keenable (fastest calls), TinyFish (cheapest) appear on the Artificial Analysis board; Octen has the best price to quality ratio there. Public REST docs and pricing for these were not checked. — [Artificial Analysis](https://artificialanalysis.ai/agents/search-api)

### Inferences

- Ranked by value for Fieldwork: (1) Octen needs a docs and API check; it has the best independent quality per dollar. (2) You.com: independent score 74, flat $5 per 1k, full filter set (country, language, freshness), mature enterprise controls. (3) Serper and Kagi if image search matters. (4) Linkup: cheap and open eval harness, but weak on independent boards so add only if the factual-lookup niche matters.
- Add nothing for Bing or Google PSE (dead/closing). Jina and Valyu are weaker fits (token billing; data-marketplace pricing).

### Gaps

- No docs/pricing verified for Octen, Nimble, Keenable, TinyFish, DeepSeek Search, DataForSEO web search, SearchAPI.io, Tako. Did not confirm each candidate's domain and date filter support first-hand.
- Linkup's own position on the Artificial Analysis board is unknown.

## Best image search APIs

### Takeaway

Everything in the image market is either Google SERP scraping (Serper, SerpApi, DataForSEO, Bright Data, etc.) or Brave's own-index image endpoint. Brave is the only independent-index option with documented source-page fields. No quality benchmark for image search exists.

### Cited Findings

- Brave Image Search: `GET /res/v1/images/search`, same $5 per 1k as other Search endpoints; not paginated, up to 200 results per request; each result has `url` (source page), `properties.url` (original image), `thumbnail.src` (proxied, 500 px wide), width and height (most images), `meta_url`; SafeSearch defaults to strict. — [Brave image search docs](https://api-dashboard.search.brave.com/app/documentation/image-search/responses); [Brave launch post](https://brave.com/blog/most-powerful-search-api-for-ai/)
- Serper: images endpoint, from $1 per 1k down to $0.30; Google-sourced. — [Exa comparison](https://exa.ai/blog/best-web-search-tools-for-ai-agents)
- SerpApi: one search returns a batch of about 100 images; $25 per 1k searches at Starter down to about $1.96 per 1k at the biggest plan; Google plus Yahoo Images. — [Serpent blog (vendor)](https://apiserpent.com/blog/best-image-search-api-providers-2026)
- DataForSEO Google images: $0.60 per 1k SERP pages of 100 results ($50 minimum payment). Bright Data $1.50 down to $1.30 per 1k; HasData $1.23 down to $0.35; Scrapingdog $2.00 down to $0.27. None uses its own index. The source is Serpent's own blog, which sells a competing API (Serpent $0.35 per 1k) and read only some competitors' rate cards. — [Serpent blog (vendor)](https://apiserpent.com/blog/best-image-search-api-providers-2026)
- Kagi covers images in its $12 per 1k Search API. — [Kagi pricing](https://kagi.com/api/pricing)
- Firecrawl `sources: ["images"]` is supported; image size operators in the query (`imagesize:`, `larger:`); `tbs` time filter does not apply to images; no separate image price documented. — [Firecrawl docs](https://docs.firecrawl.dev/features/search)
- Microsoft's Bing Image Search API was retired with the rest of the Bing family on Aug 11, 2025. — [PPC Land](https://ppc.land/microsoft-ends-bing-search-apis-on-august-11-alternative-costs-40-483-more/)

### Inferences

- The current image set (Firecrawl, Tavily, Parallel, Brave, SerpApi) is missing Serper, the cheapest Google Images route. Exa's and Perplexity's absence is consistent with their APIs not offering images.
- Brave is the strongest default (own index, source page URL, no scraping legal risk). SerpApi and Serper are the Google-quality choices.

### Gaps

- I could not verify that Tavily (`include_images`) and Parallel offer image results, nor their pricing. Fieldwork's list claims them; Parallel's own comparison says nothing about images and the Exa roundup says only Serper returns images. Check those two adapters against provider docs before relying on this.
- No independent image search quality benchmark exists in what I found. Fields (source page URL, dimensions) for Serper, SerpApi, DataForSEO were not verified against their docs.

## Is any current provider weak or redundant?

### Takeaway

Browserbase Search is the clear redundancy. SerpApi is the weakest on agent-quality benchmarks and carries litigation risk, but it has unique value (Google verticals, Google ranking, images). Firecrawl is a wrapper for web results but competitive. Everything else (Exa, Parallel, Perplexity, Brave, Tavily) is justified.

### Cited Findings

- See the Browserbase, Firecrawl and SerpApi findings above: Browserbase resells Exa and Parallel at equal or higher prices; Firecrawl's web index is upstream; SerpApi ranked last on AIMultiple (12.28).
- Tavily had a $17.40 per 1k-question SimpleQA cost against Parallel Fast's $2 for the same 94% (Parallel's data) and sits at roughly $8 per 1k basic. — [Parallel comparison](https://parallel.ai/articles/the-honest-2026-comparison-web-search-apis-for-ai-agents)
- Perplexity's AIMultiple latency was 11+ s, though Artificial Analysis shows it at 80 with 27.3s per task. — [AIMultiple](https://aimultiple.com/agentic-search); [Artificial Analysis](https://artificialanalysis.ai/agents/search-api)

### Inferences

- Under the AGENTS.md rule "a provider is only listed for what its API natively offers", Browserbase Search is natively just Exa or Parallel behind another key. Candidate for removal or at least flagging as redundant; this is a published-name change, so ask Daniel first.
- Tavily is mid-pack on quality and priced above peers, but has ecosystem weight (agent frameworks, Nebius acquisition); keep unless there is a reason to prune.

### Gaps

- Whether Tavily's Nebius acquisition changes API terms was not checked.
