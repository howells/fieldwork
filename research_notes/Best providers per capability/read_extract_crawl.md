# Best providers for read, readMany, extract, product, map and crawl (as of November 2026)

Evidence caveat: nearly every benchmark found was run by a vendor or by an unnamed party. Each is labelled below. Rankings flip depending on who ran the test, and no source tested Exa or Parallel on these capabilities. No source covers PDF handling systematically.

## Which candidate providers outside Fieldwork are credible?

### Takeaway

Credible additions by capability: Zyte (product), Spider.cloud and Cloudflare Browser Run (map/crawl), Scrapfly (read, extract and product; best on hard-to-scrape sites), Olostep (map, crawl and batch), Bright Data (read and crawl on protected sites), and Diffbot (product and article extraction). Jina Reader is credible for single-URL `read` only. It has no crawl, and its ownership is in flux after Elastic bought it. ScrapingBee and Hyperbrowser are weaker or less documented.

### Cited Findings

- Spider.cloud has `/crawl`, `/links` (URL discovery with no page content, "optimized for sitemap generation") and `/transform` (HTML or PDF to markdown). Auth is a Bearer token, and an OpenAPI spec is published — [Spider search result summary of docs](https://spider.cloud/docs/api/); [overview](https://spider.cloud/docs/overview/)
- Spider's `/links` costs about $0.0002 per request and `/crawl` about $0.0003 per request. Billing is $1/GB bandwidth plus compute. Spider's sources disagree on the compute rate ($0.0001 vs $0.001 per minute) — [Spider pricing guide](https://spider.cloud/guides/pricing-and-plans/)
- Cloudflare Browser Run (formerly Browser Rendering) has `/crawl` as an async REST job. It defaults to 10 pages, with a maximum of 100,000. Output formats are HTML, Markdown or JSON (JSON uses Workers AI). `render:false` does a plain fetch, and `source` can be `all`, `sitemaps` or `links`. It honours robots.txt and does not bypass CAPTCHAs, Turnstile or WAF — [Cloudflare docs](https://developers.cloudflare.com/browser-rendering/rest-api/crawl-endpoint/)
- Cloudflare announced `/crawl` on March 10, 2026, in open beta. Third-party sources say `/markdown` and `/json` are single-page endpoints — [Cloudflare Developers on X](https://x.com/CloudflareDev/status/2031488099725754821); search summary of community guides
- Cloudflare's docs list no separate map endpoint. URL discovery is a `source` option on `/crawl`. The docs do not mention PDFs — [Cloudflare docs](https://developers.cloudflare.com/browser-rendering/rest-api/crawl-endpoint/)
- Olostep has `/v1/maps` (1 credit, plus 1 credit per extra 1,000 URLs), `/v1/crawls` and `/v1/batches` (up to 10,000 URLs per batch). It bills only successful requests, and LLM extraction costs 10 credits per scrape — [Olostep Maps docs](https://docs.olostep.com/features/maps); [webscraping.cc review](https://webscraping.cc/tool/olostep/)
- Diffbot Extract has typed endpoints including Product. It costs 1 credit per page. Crawl is limited to the Plus plan ($899/mo) and above — [Diffbot pricing](https://www.diffbot.com/pricing); [coldiq review](https://coldiq.com/tools/diffbot)
- Scrapfly Extraction API has `extraction_model='product'` and also article, review and real-estate models (it claims 19+ models). It accepts HTML or Markdown input, and the AI model costs 5 credits (the docs conflict on the template price: 1 or 5 credits) — [Scrapfly docs](https://scrapfly.io/docs/extraction-api/getting-started); [specification](https://scrapfly.io/docs/extraction-api/specification)
- Scrapfly also lists a crawl, LLM prompt extraction at +5 credits, and PDF as an output format — [Spider's alternatives post (vendor-written)](https://spider.cloud/blog/best-firecrawl-alternatives/)
- Jina Reader handles one URL per request, with no crawl mode and no proxy rotation or anti-bot — [Firecrawl vs Jina comparison (search summary, vendor-written)](https://www.firecrawl.dev/alternatives/firecrawl-vs-jina-ai); [Spider alternatives post](https://spider.cloud/blog/best-firecrawl-alternatives/)
- Elastic completed its acquisition of Jina AI on 2025-10-09. The Reader API and per-token pricing were unchanged as of the August 2026 snapshots. Jina On-Prem has been an Elastic SKU since August 10, 2026 — [usagepricing.com](https://www.usagepricing.com/blueprint/activity/jina-ai-2025-10-09-elastic-acquisition); [Jina Reader page](https://jina.ai/reader/)
- Bright Data Web Unlocker costs $1.50 per 1,000 successful requests, with 5K free per month. Its Crawl API starts at $1.50 and falls to $1.00 per 1,000 on a $1,999 plan. These are third-party-reported prices — [dupple](https://dupple.com/pricing/bright-data); [clawengine](https://clawengine.ai/blog/bright-data-pricing)
- Hyperbrowser has scrape (HTML, Markdown, links, screenshots), crawl (`POST /api/crawl`, `formats:["markdown"]`) and extract APIs. Firecrawl claims its crawl is capped at 100 pages per job, which is unverified. No prices were found — [Hyperbrowser docs](https://docs.hyperbrowser.ai/guides/scraping); [Firecrawl comparison (competitor)](https://www.firecrawl.dev/alternatives/firecrawl-vs-hyperbrowser)
- ScrapingBee offers Markdown and text flags on a single synchronous endpoint, with no crawl described — [Spider alternatives post](https://spider.cloud/blog/best-firecrawl-alternatives/)
- Crawl4AI Cloud is in closed beta with no published price per Spider's post. WebCrawlerAPI's October 2026 benchmark nonetheless tested "Crawl4AI Cloud" at 88.0% — [Spider alternatives post](https://spider.cloud/blog/best-firecrawl-alternatives/); [WebCrawlerAPI benchmarks](https://webcrawlerapi.com/benchmarks)
- Zyte API supports automatic extraction and Markdown (priced as pageContent). It is billed only on successful responses. Its docs do not list per-type rates — [Zyte pricing docs](https://docs.zyte.com/zyte-api/pricing.html)

### Inferences

- Spider, Cloudflare, Olostep and Bright Data are the only candidates where map or crawl is documented as a native API, and are the realistic additions for those capabilities.
- Jina Reader would add little to Fieldwork beyond a cheap `read`, and the Elastic change adds roadmap risk.
- ScrapingBee and Hyperbrowser lack enough evidence here to recommend.

### Gaps

- I could not verify Olostep's official plan prices, Hyperbrowser's prices, or Apify's current crawler pricing (only the $5 free credit and $19 Starter plan came from a competitor's post).
- I did not check Crawl4AI cloud availability from a first-party source.
- Firecrawl-style `readMany` equivalents (batch endpoints) were verified only for Olostep (up to 10,000 URLs) and Hyperbrowser (batch scrape, per a search summary).

## What independent benchmarks exist for scraping and extraction quality?

### Takeaway

No benchmark is clearly independent. Third-party-style runs (Scrapeway, Magpie, scraping-test) put Scrapfly first on hard targets and put Firecrawl at about 64–83%. Vendor-run markdown-quality tests put Firecrawl at about 90% and Jina at about 87%.

### Cited Findings

- Scrapeway, October 1 – November 1, 2026 (11 targets such as Amazon, LinkedIn and Zillow, over 1,000 requests per target): Scrapfly 95% ($3.75/1k, 16.3s), Firecrawl 81% ($2.70/1k, 5.2s), WebScrapingAPI 71%, ZenRows 67%, ScraperAPI 60%, Scrapingdog 59%. Firecrawl scored 0% on LinkedIn and Instagram. The operator is not named and there is no funding disclosure, so the independence claim is unverifiable — [Scrapeway](https://www.scrapeway.com/)
- An earlier Scrapeway run (August 2026) was reported as Scrapfly 98%, Firecrawl 64% (4.7s) and ScrapingBee 40% — [Spider alternatives post, citing Scrapeway](https://spider.cloud/blog/best-firecrawl-alternatives/)
- scraping-test, June 2026 (20 hard sites, 16 providers). The operator is anonymous and the top-ranked provider is Scrape.do. Results: Scrape.do 99.4% ($0.23/1k), Decodo 95.9%, Apify 95.3% ($7.04), Bright Data 94.7% ($1.55), Scrapfly 93.4% ($2.69), Zyte 92.2% across 18 of 20 domains ($1.11), ScrapingBee 89.6%, Firecrawl 83.1% across 16 of 20 domains ($16.70/1k, 4.0s). A "domain reached" counts if success is above zero, so averages exclude unreached domains — [scraping-test GitHub](https://github.com/scraping-test/web-scraping-api-2026)
- WebCrawlerAPI, October 12, 2026, markdown quality on 1,000 URLs from Firecrawl's public dataset (806 scored). The operator sells a competing API. Context.dev 92.1%, Firecrawl 89.7%, WebCrawlerAPI 88.0%, Crawl4AI Cloud 88.0%, Jina Reader 86.8%. A search summary also gave F1 scores of Firecrawl 0.539, Jina 0.184 and Context.dev 0.176, and said the highest F1 was 0.623 — [WebCrawlerAPI benchmarks](https://webcrawlerapi.com/benchmarks); [search summary of the post](https://webcrawlerapi.com/blog/best-web-scraping-apis)
- Firecrawl's own test (January 13, 2026, 1,000 URLs): 96% coverage, F1 0.638, P95 latency 3,387 ms — [Firecrawl vs Jina page](https://www.firecrawl.dev/alternatives/firecrawl-vs-jina-ai)
- Spider's own test (February 2026): Spider 99.9% at 74 pages/s, Firecrawl 95.3% at 16 pages/s, Crawl4AI 89.7% at 12 pages/s. Spider states these are not independently verified — [Spider alternatives post](https://spider.cloud/blog/best-firecrawl-alternatives/)
- Keirolabs, October 2026, 20 live pages: Jina returned real content on 15 of 20 (median 829 ms, partly cache-assisted), 3 thin results and 2 failures. This is from a search summary only — [Keirolabs](https://keirolabs.cloud/blog/firecrawl-vs-jina-reader-vs-tavily-extract)
- ZenRows' benchmark reported ZenRows at 100% and Firecrawl at 66.67% on protected targets. Magpie (September 2026) reported Scrapfly 98% and Firecrawl 72%. Both are search-summary figures. ZenRows' own result of 22% in Magpie's test contradicts its self-reported 100% — [ZenRows](https://www.zenrows.com/blog/best-web-scraping-api-for-ai-agents); [Magpie](https://magpiescraper.com/blog/best-web-scraping-apis/)
- The Zyte product-extraction benchmark is from 2021 and was run by Zyte (see the product question below).

### Inferences

- Firecrawl is strong on ordinary pages (about 90% on markdown extraction) and degrades on protected sites (64–83%, with some 0% targets). That makes it a good default for `read` but not the best choice for protected sites.
- Scrapfly has the most consistent third-party results across several runs on hard targets, although those runs are not clearly independent. A Scrapfly adapter is the clearest quality addition for `read` on hard sites.
- No test covered Exa, Tavily or Parallel, so Fieldwork's current read providers cannot be ranked against the candidates using this evidence.

### Gaps

- No independent PDF benchmark found. The only PDF claims are feature-level: Firecrawl parses PDFs at +1 credit per page, and Crawl4AI and Scrapfly offer PDF output — [Spider alternatives post](https://spider.cloud/blog/best-firecrawl-alternatives/).
- No benchmark of JSON-schema extraction quality (the `extract` capability) was found.
- The full per-provider table on the WebCrawlerAPI scrape-quality page was not retrieved.
- The identity of the Scrapeway and scraping-test operators is unknown.

## Who is best at product-data extraction compared with Firecrawl?

### Takeaway

Zyte is the strongest candidate for `product` (a dedicated, typed product extractor, and it led Diffbot on price and SKU in a 2021 benchmark that Zyte itself ran). Diffbot and Scrapfly are credible alternatives. I found no evidence that Firecrawl's structured-data approach has been benchmarked against any of them.

### Cited Findings

- Zyte vs Diffbot vs extruct, F1 (early 2021, run by Zyte under its former name Scrapinghub; the repo was archived June 24, 2026): price Zyte 0.918 / Diffbot 0.824 / extruct 0.685; SKU 0.841 / 0.765 / 0.537; availability 0.957 / 0.943 / 0.626. The dataset was roughly 134–140 pages per attribute, with only 9 out-of-stock items — [product-extraction-benchmark](https://www.github.com/scrapinghub/product-extraction-benchmark)
- Zyte automatic extraction costs $0.27–$1.07 per 1,000 per data type, on top of the request cost. Only one extraction property can be requested per API call, and the old standalone Automatic Extraction product was discontinued April 30, 2024 — [Zyte pricing docs](https://docs.zyte.com/zyte-api/pricing.html); [search summary](https://docs.zyte.com/zyte-api/migration/zyte/autoextract.html)
- Third-party posts list Zyte extraction at $0.40–$1.60 per 1,000 per data type and a simple-tier HTTP page at $0.13 per 1,000. They disagree with the official range and do not explain why — [clawengine Zyte pricing](https://clawengine.ai/blog/zyte-api-pricing)
- Zyte scored 92.2% across 18 of 20 hard domains at $1.11 per 1,000 in scraping-test's June 2026 run — [scraping-test GitHub](https://github.com/scraping-test/web-scraping-api-2026)
- Diffbot's Product API is billed as an Extract call at 1 credit per page. Plans: Free, Startup $299/mo (250K credits), Plus $899/mo (1M credits) — [Diffbot pricing](https://www.diffbot.com/pricing)
- Scrapfly's `extraction_model='product'` costs 5 credits. It works through either the Extraction API or the Web Scraping API's `/scrape` endpoint — [Scrapfly docs](https://scrapfly.io/docs/extraction-api/getting-started)
- Firecrawl's JSON format costs +4 credits per page — [Firecrawl pricing via search summary](https://www.firecrawl.dev/pricing)

### Inferences

- Ranking for `product`: Zyte first (dedicated, typed product schema, cheap, strong anti-bot on tested sites), then Diffbot (ML extraction, but a $299/month floor), then Scrapfly (a product model bundled with a top-ranked scraper), and Firecrawl last of the dedicated options.
- The Zyte-over-Diffbot evidence is old, vendor-run and small. Treat it as directional only.

### Gaps

- I could not retrieve Zyte's extraction docs (two fetches returned empty), so I cannot confirm whether Zyte `product` returns variants, which Fieldwork's `product` capability needs, or the request field names. Check docs.zyte.com before committing.
- No recent (2025–2026) independent product-extraction benchmark was found.
- No evidence was gathered on Diffbot's variant handling or on how Fieldwork's Firecrawl `product` is implemented.

## Which map and crawl APIs are best?

### Takeaway

For `map`, Spider `/links`, Olostep `/v1/maps` and Cloudflare `/crawl` (with `source:sitemaps` or `links`) are the native candidates beside Firecrawl and Tavily. For `crawl`, Spider and Cloudflare are the strongest additions. Spider is the cheapest by its own pricing, and Cloudflare is the most mature infrastructure but does not defeat bot protection.

### Cited Findings

- Firecrawl Map is 1 credit per call, and Scrape and Crawl are 1 credit per page. JSON format is +4 credits per page. Hobby is $16/mo billed annually (5,000 credits) and Standard $83/mo billed annually (100,000 credits). Some third-party sites wrongly say Map is billed per page — [Firecrawl pricing](https://www.firecrawl.dev/pricing); [Firecrawl billing](https://docs.firecrawl.dev/billing)
- Tavily Map costs 1 credit per 10 successful pages (2 with instructions). Tavily Crawl is the map cost plus extraction, about 3 credits per 10 pages on basic extraction. Pay-as-you-go is $0.008 per credit, so a 1,000-page basic crawl costs about $2.40 — [Tavily Map docs](https://docs.tavily.com/documentation/api-reference/endpoint/map); [Firecrawl's Tavily pricing post (competitor)](https://www.firecrawl.dev/blog/tavily-pricing)
- Spider Crawl: synchronous, with limit, depth and format set in one call, returned directly or streamed as JSONL. The Unlimited plan is $40/mo — [Spider alternatives post](https://spider.cloud/blog/best-firecrawl-alternatives/); [Spider docs](https://spider.cloud/docs/api/)
- Spider's own estimate for 100K basic pages is $8–15, against Firecrawl at $83. Spider acknowledges this is a self-computed range — [Spider alternatives post](https://spider.cloud/blog/best-firecrawl-alternatives/)
- Cloudflare `/crawl`: up to 100,000 pages per job, results kept 14 days, caching via R2 (`maxAge` default 86,400 s). `render:true` bills at normal Browser Run pricing and `render:false` is free during the beta. It has a fixed user agent and cannot bypass bot protection. The Workers Free plan is capped at 10 minutes of browser use per day — [Cloudflare docs](https://developers.cloudflare.com/browser-rendering/rest-api/crawl-endpoint/)
- Olostep `/v1/crawls` costs 1 credit per completed page (reseller report), and reading pages from an existing crawl is free — [treg.to](https://treg.to/tools/olostep)
- Bright Data Crawl API costs $1.50 per 1,000, falling to $1.00 on a $1,999 plan (third-party-reported) — [dupple](https://dupple.com/pricing/bright-data)
- Diffbot's Crawl costs 0 credits but is available only on Plus ($899/mo) and above, with extraction billed per page — [Diffbot pricing](https://www.diffbot.com/pricing)
- Spider's 1,000-URL crawl test (vendor-run) and the Scrapeway and scraping-test results are covered in the benchmark question above.

### Inferences

- Because Spider and Cloudflare both return crawl results in Markdown and one call can bound the crawl (`limit`, `depth`), both fit Fieldwork's `crawl` shape. Each would need `resume` or job semantics mapped: Cloudflare is an async job with `cursor` paging, while Spider is synchronous or streamed, so `resume` may not apply to Spider.
- For `map`, Spider's `/links` and Olostep's `/v1/maps` both exist natively. Cloudflare has no map endpoint, so the guideline against emulation says Cloudflare should not be listed for `map`.
- Firecrawl remains a good choice, but at $83 per 100K pages it is much dearer than Spider, Tavily (about $2.40 per 1,000 pages) and Bright Data ($1.50 per 1,000).

### Gaps

- No independent crawl-quality or crawl-success benchmark was found. Spider's numbers are vendor-run.
- Spider's `/links` response shape and Cloudflare's `/crawl` per-page schema were not examined, so mapping to Fieldwork's types is unverified.
- Cloudflare's official Browser Run pricing was not retrieved, and I did not confirm whether `/crawl` is still labelled beta.
- Olostep's `/v1/crawls` page limits were not found.

## What do the options cost?

### Takeaway

Per-page costs span three orders of magnitude depending on whether anti-bot rendering is needed. For plain pages, Jina, Spider, Zyte HTTP tiers and Tavily are cheapest. For protected pages, per-1,000 costs measured by scraping-test were $0.23 (Scrape.do) to $16.70 (Firecrawl).

### Cited Findings

- Measured cost per 1,000 successful requests in the scraping-test run (June 2026, entry-level plans): Scrape.do $0.23, Bright Data $1.55, Zyte $1.11, Scrapfly $2.69, ScrapingBee $2.66, Apify $7.04, Firecrawl $16.70 — [scraping-test GitHub](https://github.com/scraping-test/web-scraping-api-2026)
- Scrapeway (October 2026) measured Firecrawl at $2.70 per 1,000 and Scrapfly at $3.75. The Firecrawl figures from the two benchmarks differ by about 6x, so the cost depends heavily on the targets — [Scrapeway](https://www.scrapeway.com/)
- Jina Reader is billed per output token, about $0.05 per 1M tokens in most sources (one says $0.02). It includes 10M free tokens, with 20 requests per minute keyless and 500 with a key — [serp.fast](https://serp.fast/tools/jina-ai); [markaicode](https://markaicode.com/pricing/jina-ai-pricing/)
- Zyte: $5 free credit, 25–52% commitment discounts, billed only on success. Spider: $1 per GB plus compute, credits don't expire. ScrapingBee: Hobby $19/mo, with a stealth proxy costing 75 credits per request — [Zyte pricing docs](https://docs.zyte.com/zyte-api/pricing.html); [Spider alternatives post](https://spider.cloud/blog/best-firecrawl-alternatives/)
- Scrapfly: Discovery $30/mo. Residential proxy plus JS rendering is 31 credits per page — [Spider alternatives post (vendor-written)](https://spider.cloud/blog/best-firecrawl-alternatives/)

### Inferences

- Credit-based and tier-based pricing means a per-page figure is only comparable for the same target type. Any pricing table in Fieldwork's docs should state that and link to each provider.

### Gaps

- Prices for Exa, Parallel and Browserbase were out of scope and not gathered.
- Secondhand price sources (clawengine, dupple, usagepricing) conflict with official pages in places. Re-verify on each provider's pricing page before publishing.

## Per-capability ranking (synthesis of the above)

### Takeaway

Fieldwork's coverage is good for `read` and `readMany` and thin for `product`, `map` and `crawl`. Best additions: Zyte (product), Spider (map and crawl), Scrapfly (read and extract on protected sites), Olostep (map, crawl, batch), Cloudflare (crawl). This ranking rests mostly on vendor-run and unverified evidence.

### Cited Findings

- No single source ranks providers by capability. The ranking below is derived from the findings cited in the sections above.

### Inferences

- `read`: Firecrawl and Scrapfly lead on measured success. Bright Data and Zyte are strong on protected sites at low cost. Jina is cheapest for easy pages. Exa, Tavily, Parallel and Browserbase are unbenchmarked here.
- `readMany`: Olostep batches (up to 10,000 URLs) and Hyperbrowser batch scrape are candidates. Both were found only through search summaries and a reseller.
- `extract`: Scrapfly (Extraction API with prompt or model, 5 credits) and Olostep (10 credits per LLM scrape) are the native alternatives. No quality benchmark exists.
- `product`: Zyte, Diffbot, Scrapfly, then Firecrawl.
- `map`: Spider `/links`, Olostep `/v1/maps` (both natively documented), then Firecrawl and Tavily.
- `crawl`: Spider and Cloudflare (async, up to 100,000 pages) join Firecrawl and Tavily. Olostep and Bright Data are further candidates. Diffbot's crawl needs the $899 plan.

### Gaps

- The variants question for Zyte `product`, the Spider and Cloudflare response schemas, PDF quality for every provider, and extract quality are all unresolved. A follow-up read of Zyte's and Spider's API references is the most useful next step.
