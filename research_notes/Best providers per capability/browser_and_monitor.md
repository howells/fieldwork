# Best providers for Fieldwork `browser`, `act` and `monitor` (as of 2026-11-03)

Evidence caveat for the whole file: nearly every comparison found is written by a vendor in the market (Browser Use, Kernel, Anchor, Steel, Parallel, Visualping, Exa). Only BrowserArena (session lifecycle) and ComputeSDK (throughput) were described as third-party, and I only saw them quoted by vendors, not on their own pages. No neutral, peer-reviewed benchmark was found. Fieldwork's own requirement (public REST API, native capability) is applied throughout.

## Which remote browser providers lead (`browser`: open/close a session, drive over CDP)?

### Takeaway

No provider wins every axis. Kernel leads on latency, Browser Use Cloud leads the one stealth benchmark found (run by Browser Use itself) and on price, Anchor is second on stealth, and Browserbase is mid-pack on both but the most established and already covered. Firecrawl is not in any of the cloud-browser comparisons. The strongest additions for `browser` are Kernel, Browser Use Cloud, Anchor, then Steel and Hyperbrowser; Cloudflare is cheap but explicitly has no stealth, and Bright Data prices per GB.

### Cited Findings

- Stealth Bench V2 was run by Browser Use (the top-ranked vendor). 100 bot-protected sites, each visited twice, a blinded judge model checked whether the real site loaded within 60 s, measured Sept 25, 2026. Got through: Browser Use Cloud 90.5%, Anchor 82%, Kernel 80.5%, Browserbase 78.5%, Browserless 77.5%, Steel 74.5%, Hyperbrowser 73.5%. Baselines: plain headless Chrome 3%, Chrome with a US proxy 14% — [Browser Use](https://browser-use.com/cloud-browsers)
- Bias disclosed on the same page: sites were chosen where Browser Use "historically got through" and stock Chrome did not; the page calls them "not a balanced sample of the web". Competitors ran standard-plan stealth only (Browserbase Verified, Hyperbrowser Ultra Stealth and Steel stealth are Enterprise-only and untested), two runs per site — [Browser Use](https://browser-use.com/cloud-browsers)
- Session lifecycle (create, connect over CDP, load a page, release), median of 100 sequential runs, BrowserArena, Oct 14, 2026 (Browser Use says it does not run BrowserArena): Kernel 318 ms, Browser Use Cloud 493 ms, Browserbase 877 ms, Hyperbrowser 1,417 ms, Anchor 2,800 ms, Steel 3,509 ms. Browserless had no result (all 100 runs got a 401). Tilion was fastest but is not in the stealth test — [Browser Use](https://browser-use.com/cloud-browsers)
- ComputeSDK lifecycle scores quoted by Browser Use (Oct 9, 2026): Kernel 96.4, Browser Use 95.2, Hyperbrowser 94.0, Browserbase 92.8, Steel 77.2 — [Browser Use](https://browser-use.com/cloud-browsers)
- Kernel's own page (vendor-authored, Aug 14, 2026) reports browserbench (open-source tool published by rival Steel) averages from January 2026, 5,000 runs each: end-to-end Kernel 794 ms, Steel 894 ms, Browserbase 2,967 ms, Hyperbrowser 3,657 ms, Anchor 8,001 ms; both Kernel and Browserbase 100% success. Its ComputeSDK claim: Kernel 77.5 vs Browserbase 61.6 (a different scoring from the 96.4/92.8 above, so the two ComputeSDK figures are not comparable) — [Kernel](https://www.kernel.sh/ai-library/browserbase-alternatives-2026)
- A 6-month-old Stat Proxies test had Hyperbrowser as overall timing leader, contradicting the newer results — [search summary of Stat Proxies](https://www.statproxies.com/blog/cloud-browser-comparison). I did not open the page.
- AIMultiple composite task score (about 2 months old per the search summary): Anchor 82%, Steel 72%, Browserbase 65%, Hyperbrowser 62%; Kernel not included — [AIMultiple](https://aimultiple.com/remote-browsers)
- A BrowserChad stealth test (fingerprint signals, first visits to DataDome sites) exists but is from a vendor comparing its own product; not read in full — [ninatechllc.com](https://ninatechllc.com/stealth-browser-benchmark)
- CDP: all seven benchmarked providers are driven over CDP (Playwright `connectOverCDP`, Puppeteer `connect`). A create call returns a CDP URL, often with a live-view URL; Browserless gives a WebSocket endpoint instead. Browsers must be stopped through the API: on Browser Use, "closing the CDP connection does not stop the browser" and billing continues — [Browser Use](https://browser-use.com/cloud-browsers)
- Concurrency (as of Oct 2026): Browserbase 3 free / 25 / 100 / 250+; Steel 10 / 100 / 1,000+; Kernel 5 / 10 / 150; Anchor 5 / 25 / 200 / 500+; Browserless 2 / 10 / 40 / 100; Browser Use Cloud 10 rising with lifetime spend (50 at $100, 250 at $1k), sessions max 240 minutes; Cloudflare 10 included then $2/mo each extra — [Browser Use](https://browser-use.com/cloud-browsers)
- Browserbase plans: Free (3 concurrent, 1 hour, 15 min/session, no stealth), Developer $20/mo (25 concurrent, 100 hours, $0.12/hr after, basic stealth, auto CAPTCHA), Startup $99/mo (100 concurrent, 500 hours, $0.10/hr after), Scale custom (250+, advanced stealth, Verified Agents). Records sessions by default, 7 to 30 day retention — [Browserbase pricing](https://www.browserbase.com/pricing)
- Kernel features (vendor-stated): `kernel.browsers.create({stealth: true})` returns `cdp_ws_url`; pools of pre-booted browsers; profiles persisting cookies; managed auth (hosted login, credentials never passed to an LLM) including on free tier; sessions up to 72 hours with idle time unbilled; per-second billing; Playwright Execution API runs code inside the browser VM; cannot be self-hosted — [Kernel](https://www.kernel.sh/ai-library/browserbase-alternatives-2026)
- Cloudflare Browser Rendering ("Browser Run") has a REST API and Workers bindings but "uses zero stealth and explicitly identifies itself as bot traffic", so it gets blocked often — [search summary of flarecalc and others](https://flarecalc.com/calculators/browser-rendering/)
- Bright Data Scraping Browser bills per GB (about $8/GB pay-as-you-go, $499/mo Scale), includes proxies and CAPTCHA solving, has a 60-minute session cap; one review calls the billing unit punishing — [webscraping.cc](https://webscraping.cc/blog/bright-data-scraping-browser/)
- Steel's browser is open source (Apache-2.0) and self-hostable in Docker; Browserless is also self-hostable with a license caveat — [Browser Use](https://browser-use.com/posts/best-browser-infrastructure-for-ai-agents)
- Proxidize (independent blog) recommends Steel for open-source BYOP, Kernel for isolated workers and managed auth, Hyperbrowser for multiple hosted agent runtimes, Anchor for authentication-centric computer use — [Proxidize](https://proxidize.com/blog/best-cloud-browsers-for-ai-agents/)
- Airtop is a cloud-browser REST API (base `https://api.airtop.ai/api/v1`) with Sessions (create, terminate) and Windows (load-url, click, type, page-query, scrape-content and more) endpoints; its model is natural-language rather than raw CDP — [API Evangelist profile](https://github.com/api-evangelist/airtop)

### Inferences

- If Fieldwork keeps `browser` strictly to "returns a CDP URL", the best-evidenced additions are Kernel (speed, managed auth, pools), Browser Use Cloud (stealth and price, but the stealth number is self-reported) and Anchor (second on stealth, slow to start). Steel is the open-source option but is slowest in BrowserArena and middling on stealth.
- Airtop does not fit a pure "CDP session" definition from what I found; it fits `act`. Cloudflare fits technically (CDP) but fails the stealth test by design.
- Browserbase is a defensible default (brand, observability, contexts, scale) even though it is not first on any measured axis in these sources.

### Gaps

- No neutral third-party stealth benchmark; every stealth number comes from a competitor vendor.
- I did not open BrowserArena or ComputeSDK directly, so their methodology is second-hand.
- Anchor's plan prices conflict across sources ($500 vs $2,000 for the higher plan); Proxidize flagged this.
- Firecrawl's `browser` endpoint was not researched here, so it is not ranked against these.
- Exact REST paths for Kernel, Anchor, Steel and Browser Use browser-session endpoints were not verified from their API references.

## Which APIs run code or natural-language actions in a browser in one REST call (`act`)?

### Takeaway

`act` has more candidates than Fieldwork's single provider. Browser Use Cloud (task REST API), Browserbase (Stagehand API, Functions), Airtop (prompt-per-window REST) and Hyperbrowser (agent tasks) all expose it natively. Browser Use and Browserbase look like the strongest additions, but the REST shape of "run a script" differs from "run a natural-language task", which affects whether they belong under one `act` capability.

### Cited Findings

- Browser Use Cloud: start a task with `POST /api/v2/tasks`, poll `GET /api/v2/tasks/{id}`, or use webhooks; auth is the `X-Browser-Use-API-Key` header. The docs call v2 legacy and say to use v3; the open-source repo's skill file says to use v4 for new hosted-agent integrations. The old `run-task` URL 404s — [search summary of Browser Use docs](https://docs.browser-use.com/cloud/llms.txt)
- Browser Use Cloud model tokens are billed at provider cost plus 20% on top of $0.02/browser-hour (this comparison comes from Hyperbrowser-competitor browser-use.com) — [search summary citing Browser Use](https://browser-use.com/posts/best-browser-agent-mcp-servers)
- Browserbase says Functions deploy serverless browser automations run on a schedule or on demand, callable through an API, executing next to the browser; Stagehand's API turns a single high-level command (for example "click the quickstart button") into CDP actions on a Browserbase browser. The Stagehand API blog post is about 505 days old, and current Stagehand has changed (`act`, `extract`, `observe` moved to the instance, `agent()` removed) — [Browserbase docs](https://docs.browserbase.com/welcome/introduction), [Stagehand API post](https://www.browserbase.com/blog/introducing-the-stagehand-api)
- Browserbase LLM calls for Stagehand route through the Browserbase API key, so no separate model account is needed — [Mastra reference on Stagehand](https://mastra.ai/reference/browser/stagehand-browser)
- Airtop: typical flow is create a session, create a window with a URL, call `page_query` with a prompt, then terminate. Pricing is credits-based; one 2026 review says free 1,000 credits, Starter from $26/mo, $0.65 to $0.87 per 1,000 credits, with Airtop not publishing credits per task; older review said $29 / $89 / $380 tiers (about 421 days old). Prices conflict — [API Evangelist](https://github.com/api-evangelist/airtop), [slicey.ai](https://slicey.ai/tools/airtop)
- Hyperbrowser runs Browser Use, OpenAI CUA, Claude computer use, Gemini and Grok computer use, and its open-source HyperAgent as hosted agents. Pricing from its docs: $0.001 per credit, browser $0.10/hr, Browser Use agent and HyperAgent $0.02 per step (25-step default cap, up to $0.50), CUA and Claude rows per million tokens. One Claude row listed a "Haiku 5.5" at a tenth of the others, which looks like a doc error — [Hyperbrowser pricing](https://www.hyperbrowser.ai/docs/pricing)
- Browserbase Free/Developer/Startup plans include 3/15/50 "agent runs" — [Browserbase pricing](https://www.browserbase.com/pricing)
- Kernel offers a Playwright Execution API that runs your code inside the browser VM, which is the closest match to "run a script" — [Kernel](https://www.kernel.sh/ai-library/browserbase-alternatives-2026)

### Inferences

- "Run a script in a remote browser" (what Fieldwork's Firecrawl `act` appears to be) maps most directly to Kernel's Playwright Execution API and Browserbase Functions, both script/code-based. Browser Use, Airtop and Hyperbrowser agents take natural-language goals and cost LLM tokens or steps, a different contract. Daniel should decide whether `act` means script, instruction, or both before adding any.
- Airtop is the only one found whose whole API is natural-language-per-action over REST with no CDP.

### Gaps

- Exact request/response schemas for Browser Use Create Task, Stagehand API sessions endpoints, Browserbase Functions invoke, Kernel invocations and Hyperbrowser agent endpoints were not retrieved.
- Firecrawl's own interact/actions behaviour and pricing were not researched here.
- No independent reliability or success-rate benchmark of these agent APIs against each other was found.

## Which web monitoring APIs suit agents watching a query or a page (`monitor`)?

### Takeaway

Fieldwork's three monitor providers are the right category leaders for agents: Parallel Monitor (query watching, GA May 2026), Exa Monitors (query watching, rebuilt as v2 around Nov 2026 at $2 per 1,000 runs) and Firecrawl Monitor (page and search watching, 5-minute minimum). Visualping, changedetection.io, Distill and Olostep are page-change tools; Visualping and Olostep are the only credible additions.

### Cited Findings

- Parallel Monitor reached general availability May 7, 2026, with Lite and Base processors, event streams and snapshots, advanced domain filtering and Interactions. Cadences hourly, daily, weekly; webhooks (`monitor.event.detected`, `monitor.execution.completed`, `monitor.execution.failed`) or polling; endpoint `https://api.parallel.ai/v1/monitors`; $3 per 1,000 executions — [search summary of Parallel pages](https://parallel.ai/products/monitor), [GA blog](https://parallel.ai/blog/monitor-api)
- Parallel `event_stream` takes a query and returns discrete events with `output.basis` citations; `snapshot` takes a Task Run ID and reports diffs. Both semantically deduplicate. Lite is stated as matching Task API Core quality at about a tenth the cost; the blog gives no absolute prices — [Parallel blog](https://parallel.ai/blog/monitor-api)
- Parallel's $3 per 1,000 and cadence list are from a search summary, not read from docs; the blog itself does not state them. A LangChain reference still calls the API alpha (`/v1alpha/monitors`) and may be stale — [LangChain reference](https://reference.langchain.com/python/langchain-parallel/monitors)
- Exa Monitors v2 (reported Nov 2, 2026): runs retrieve, judge (drops seen pages, checks relevance and novelty) and compose (summary or `outputSchema` JSON with citations); price $2 per 1,000 runs, down from $15; created via `exa.monitors.create()` with `search.query`, `trigger` (`interval`, for example `1d`) and `webhook`; existing integrations keep working. Exa's claim of fewer alerts is unquantified (no test size or recall published) — [AlphaSignal](https://alphasignal.ai/news/exa-slashes-monitors-v2-web-search-costs-by-87-for-ai-agents)
- Websets monitors use `cadence` with `cron` and `timezone`, and `behavior` (search, append). Websets is billed separately on its own plans (Core $49/mo for 8,000 credits, Pro $449/mo for 100,000) per third-party reviews, one of which could not reach the pricing page in Sept 2026 — [Exa docs](https://exa.ai/docs/websets/api/monitors/get-monitor), [Exa pricing](https://exa.ai/pricing)
- Firecrawl Monitor: `POST /v2/monitor` with 1 to 50 `targets` (scrape, crawl, search), cron or text schedule with a 5-minute minimum, optional plain-language `goal` and LLM judge, per-field change tracking (`json`, `git-diff`), webhook events `monitor.page` and `monitor.check.completed` (10 s timeout, retries at 1, 5, 15 min), email, `GET /v2/monitor/{id}/checks`, retention default 30 days max 365. Cost: scrape 1 credit per URL, crawl 1 per page, search 2 per 10 results, judging 1 extra per changed page, no per-monitor fee — [Firecrawl docs](https://docs.firecrawl.dev/features/monitoring)
- Visualping documents a real API since April 2026 (`POST https://job.api.visualping.io/v2/jobs`; XPath regions, click/type steps, webhooks, change history, AI summaries) plus MCP access; its own blog says API on every plan, but PageCrawl's table says $140+/mo — conflicting and Visualping is a party — [Visualping blog](https://visualping.io/blog/top-ai-website-monitoring-tools), [PageCrawl](https://pagecrawl.io/blog/best-free-website-change-monitoring-tools)
- changedetection.io is open source and self-hostable, with API on all plans, JSONPath/jq filters, 85+ notification channels, AI summaries using your own key — [PageCrawl](https://pagecrawl.io/blog/best-free-website-change-monitoring-tools)
- Distill.io API requires Enterprise — [PageCrawl](https://pagecrawl.io/blog/best-free-website-change-monitoring-tools)
- Olostep advertises change detection as an API returning text, HTML or JSON diffs with webhooks from $9/mo (vendor claim) — [Olostep](https://www.olostep.com/blog/best-website-change-detection-tools)

### Inferences

- Query-watching (Parallel, Exa) and page-watching (Firecrawl, Visualping, changedetection.io, Olostep) are different jobs; Firecrawl is the only one in Fieldwork's set that does both (scrape/crawl and search targets).
- Cost per run: Exa about $0.002, Parallel about $0.003, both before downstream LLM use; Firecrawl is 1 or more credits per URL per check, so it is cheaper per page at low volume but scales with page count.
- Exa now has two monitor surfaces (v2 `monitors.create()` and Websets monitors). Fieldwork's adapter, which targets Websets monitors, may need rechecking against v2.

### Gaps

- Parallel's cadence list and $3 per 1,000 price were not confirmed from docs.
- No independent comparison of event quality (precision/recall) across Parallel, Exa and Firecrawl; Exa's and Parallel's quality claims are self-reported.
- Exa v2 launch date not stated; AlphaSignal's Nov 2, 2026 is the article date.
- Visualping, changedetection.io and Olostep API endpoints for listing events were not verified; changedetection.io's API surface was not opened.

## Pricing summary

### Takeaway

Browser hour list prices range from $0.02 (Browser Use Cloud) to $0.24 (Browserless), with Kernel cheapest of the established players at $0.06 headless. Monitors cost roughly $2 to $3 per 1,000 runs for query watchers.

### Cited Findings

- Per browser-hour: Browser Use Cloud $0.02 (per minute, no subscription, proxy $5/GB); Anchor $0.05 plus $0.01 per browser (proxy $8/GB); Kernel $0.06 headless / $0.48 headful billed per second (plans $0 / $30 / $200); Steel $0.08 to $0.10 ($250/mo Scale); Browserbase $0.10 to $0.12 ($20 / $99); Hyperbrowser $0.10; Browserless $0.18 to $0.24; Cloudflare $0.09/hr after 10 hours on Workers Paid (conflicting source lists $2; unresolved); Bright Data about $8/GB — [Browser Use](https://browser-use.com/cloud-browsers), [flarecalc](https://flarecalc.com/calculators/browser-rendering/), [webscraping.cc](https://webscraping.cc/blog/bright-data-scraping-browser/)
- Browser Use's worked example, 300 browsers x 8 h x 22 days: about $1,056 Browser Use, $3,168 Kernel, $5,280 Browserbase, $9,504 Browserless, excluding plan fees and proxy — [Browser Use](https://browser-use.com/cloud-browsers)
- Monitors: Exa $2 per 1,000 runs; Parallel $3 per 1,000 executions (unconfirmed); Firecrawl by credit, plans Free 1,000, Hobby $19, Standard $99, Growth $399, Scale $749 — [AlphaSignal](https://alphasignal.ai/news/exa-slashes-monitors-v2-web-search-costs-by-87-for-ai-agents), [search summary of Parallel](https://parallel.ai/products/monitor), [Firecrawl docs](https://docs.firecrawl.dev/features/monitoring)

### Inferences

- Browser Use's price comparison excludes plan fees, so its relative advantage shrinks for small workloads.

### Gaps

- Anchor, Steel, Hyperbrowser and Airtop prices come from comparison pages, not their own pricing pages; they were not re-verified.
- Firecrawl browser/interact pricing not collected.
