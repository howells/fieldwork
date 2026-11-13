# Document parsing (`parse`): best providers for Fieldwork, as of November 2026

Research date 2026-11-03. Method note: WebSearch returned summaries, so I fetched primary pages where I could (LlamaParse docs, Mistral announcement, Reducto pricing, Firecrawl docs, Datalab docs, OmniParseBench README). Anything I could not confirm on a primary page is marked. Not checked: Unstructured, Extend, Chunkr, Pulse, Gemini-as-parser and AWS Textract primary pages; Docling hosted. I did not call any provider API.

## Which providers are best, with independent benchmarks and who ran each

### Takeaway

No fully independent benchmark exists. Every current leaderboard is run by a vendor. On the newest and broadest one (Datalab's OmniParseBench, Oct 2026) the order is Datalab, Reducto, LlamaParse, Mistral, with Azure well behind. For Fieldwork the two strongest adds are Reducto (the best accuracy-to-API fit) and Mistral OCR 4 (the cheapest strong hosted option), with LlamaParse and Datalab as close alternatives. See the Gaps for what was not verified.

### Cited Findings

- OmniParseBench (16,288 pass/fail tests, 2,937 pages) is built and maintained by Datalab, and Datalab's own products are on it. Headline scores: Datalab accurate 94.1 ($7.50/1k pages), Gemini 3.8 Flash 92.9 (about $37), Datalab balanced 92.6 ($3), GPT-6.1 Sol 91.5, Reducto 90.8 ($10), LlamaParse 90.4 (about $56.25, which is the Agentic Plus tier price), Mistral OCR 89.5 ($4), Claude Sonnet 5.5 88.7, Extend 83.3 (about $33.75), Azure 83.0 ($5). — [OmniParseBench README/wiki](https://github.com/datalab-to/omni_parse_bench/wiki)
- Per-family scores on that board (Text / Tables / Layout): Reducto 85.4 / 91.2 / 95.8; LlamaParse 88.2 / 92.6 / 90.4; Mistral 82.8 / 91.9 / 93.8; Datalab accurate 92.0 / 94.2 / 96.0; Extend 64.1 / 92.5 / 93.4; Azure 74.6 / 81.7 / 92.8. Reducto's text score is notably weak relative to its layout score. — [OmniParseBench README/wiki](https://github.com/datalab-to/omni_parse_bench/wiki)
- Bias disclosures in the README: no explicit conflict-of-interest statement; Gemini 3.8 Flash, Claude Opus 5.5 and Claude Sonnet 5.5 were "used in creating and verifying at least some tests"; the README does not say who ran each competitor. The date is not stated, but example run folders are dated 2026-10-26. The board also has a hard-slices table (handwriting, math, tables, forms, multi-column, tiny, rotated, degraded, non-English) that I did not retrieve. — [OmniParseBench README/wiki](https://github.com/datalab-to/omni_parse_bench/wiki)
- Datalab says olmOCR-Bench is saturated and that competitors used roughly 700-line postprocessors tuned to it, versus under 100 lines for its own. This is Datalab's claim, from a secondary write-up. — [dev48.org summary](https://dev48.org/en/articles/why-we-built-omniparsebench), via search result only (not fetched)
- Mistral OCR 4 (released 2026-06-23): 85.20 on olmOCR-Bench, 93.07 on OmniDocBench, and a 72% blind human-preference win rate on 600+ documents. Mistral ran the benchmarks itself ("All competitor scores reflect internal reproductions", "directional") and lists flaws in the benchmarks. Handwriting is not mentioned. — [Mistral OCR 4](https://mistral.ai/news/ocr-4/)
- olmOCR-Bench scores on other boards: Ai2's dataset card lists the March 2025 Mistral OCR API at 72.0 (old version). Interfaze has Mistral OCR 4.0 at 82.8 and Reducto at 76.2 (92.5 on tables). Unsiloed, a competitor, ran its own tests in May 2026 and got Reducto Agentic 66.0 while ranking itself first at 88.0. — [search result summary](https://huggingface.co/datasets/allenai/olmOCR-bench), [Interfaze](https://interfaze.ai/leaderboards/olmocr), [Unsiloed](https://www.unsiloed.ai/blog/unsiloed-ai-achieves-1-rank-on-olmocr-bench-2); these came through search snippets and I did not fetch them.
- RD-TableBench (created by Reducto, re-run by competitor Pulse on 2026-04-07): Pulse 0.9684, Reducto Agentic 0.9308, Reducto 0.8957, Azure 0.8500, Textract 0.8434, Google 0.6840, Unstructured 0.6270. Pulse reported errors in about 4% of the ground-truth files. — [Dexto, Oct 2026](https://www.dexto.ai/blog/best-document-parsing-apis-for-ai-agents/)
- OmniDocBench v1.6 (public academic benchmark, 1,651 pages; mostly open VLMs): top scores are open or lab models (Unlimited-OCR 93.92, Qianfan-OCR 93.9, Gemini 3 Pro 92.91), and Dexto cites PaddleOCR-VL-1.6 at 96.34. Reducto, LlamaParse, Azure and Google have no published scores there. Scores for the same model differ by source (DeepSeek-OCR-2 is 89.17 on one site and 91.09 on another). — [SOTA2](https://www.sota2.com/research/sota/document-parsing-on-omnidocbench-v1-6), [benchmarklist](https://benchmarklist.com/benchmarks/omnidocbench_1_5/), [Dexto](https://www.dexto.ai/blog/best-document-parsing-apis-for-ai-agents/)
- Dexto's own ranking, which it says is "a short list of what to test, not a ranking": Reducto or LlamaParse, then Mistral OCR, Datalab, Docling, Unstructured, then Azure or Google. Dexto sells an agent layer and pitches its own product. — [Dexto](https://www.dexto.ai/blog/best-document-parsing-apis-for-ai-agents/)
- Datalab (about 4.5B open weights, Chandra OCR 2) reports 85.8 on olmOCR-Bench; its weights are under a modified OpenRAIL-M licence that bars use competitive with its API. — [Docsumo roundup](https://www.docsumo.com/blog/best-ocr-models), [dev48.org summary](https://dev48.org/en/articles/why-we-built-omniparsebench)

### Inferences

- Datalab, Reducto, LlamaParse and Mistral are a close pack on layout and tables, so the choice should be driven by API shape, price and format coverage rather than a point or two of benchmark score. The scores are not independent, and the only board that includes all four was written by one of them.
- General-purpose LLMs (Gemini, GPT, Claude) are competitive on accuracy but cost 5 to 10 times more per 1k pages, and the board records refusals for them (Opus 5.5: 40, GPT-6.1 Sol: 17). Fieldwork should not add them as a parser: the repo rule is a dedicated capability per provider, and they would be emulation.
- Datalab's $7.50 and $3.00 per 1k figures on the board conflict with the $10 and $4 in Dexto (below); one of them is out of date or measures something different.

### Gaps

- No independent third-party benchmark with all candidates was found.
- No benchmark number for Firecrawl /parse anywhere (see the Firecrawl section).
- Handwriting and scanned-image results for individual APIs: only the OmniParseBench hard-slices table covers them, and I did not retrieve it. Worth a second fetch of the dataset or wiki before relying on handwriting claims.
- Unstructured, Chunkr, Pulse, Docling hosted, Textract and Google Document AI: only secondary sources, and no recent accuracy numbers beyond RD-TableBench.
- Extend: scored 83.3 on OmniParseBench (strong tables, weak text) at about $33.75 per 1k pages; no primary docs checked.

## Pricing per 1,000 pages, formats, and sync vs async

### Takeaway

Cheapest credible hosted options are Mistral OCR 4 ($4, $2 batch) and Datalab ($4 or $10), then Reducto at $10 and LlamaParse from $1.25 (Fast) to $56.25 (Agentic Plus). The big clouds charge about $10 for layout-grade output.

### Cited Findings

- LlamaParse v2: $1.25 per 1,000 credits. Parse tiers per page: Fast 1 credit ($1.25 per 1k pages), Cost-effective 3 ($3.75), Agentic 10 ($12.50), Agentic Plus 45 ($56.25). Layout extraction is a separate +3 credits per page. Spreadsheets 1 credit per sheet. Parsed files are cached for 48 hours and re-parsing in that window is free. The page does not mention a free tier. — [LlamaParse pricing](https://developers.llamaindex.ai/llamaparse/general/pricing/)
- A search summary says layout extraction is "always on and free in v2", which contradicts the pricing page's +3 credits per page. I trust the pricing page. — [search summary](https://developers.llamaindex.ai/llamaparse/general/pricing/)
- LlamaParse plans (third-party, not primary): Free 10,000 credits, Starter $50 for 40,000, Pro $500 for 400,000. — [Extend review](https://www.extend.ai/resources/llamaparse-review-features-pricing-alternatives), [Dexto](https://www.dexto.ai/blog/best-document-parsing-apis-for-ai-agents/)
- Reducto: r-1 Parse is $10 per 1k pages on the Standard plan, with $2 per 1k for OCR data return and $5 per 1k for prompted blocks or custom regions. Batch gives 20% off. $150 free usage, which the FAQ also describes as 15,000 credits. A third party says Reducto moved from credits to list prices on 2026-09-01. 29 file types listed (PDF, many image types, CSV, XLSX, XLS, PPTX, PPT, DOCX, DOC, TXT, HTML). — [Reducto pricing](https://reducto.ai/pricing), [Nutrient comparison](https://llms.nutrient.io/reducto-vs-llamaparse/)
- Mistral OCR 4 (mistral-ocr-4-0): $4 per 1k pages, $2 via Batch API, Document AI (schema-shaped JSON) $5. Twice the OCR 3 price. Accepts PDF, DOC, PPT, OpenDocument ("common enterprise formats"); every request returns markdown-structured text with bounding boxes, block types and confidence scores; 170 languages. The announcement footer shows a newer OCR 4.1 model card that I did not read, and Dexto lists "Mistral OCR 4.1" at $4. — [Mistral OCR 4](https://mistral.ai/news/ocr-4/), [Dexto](https://www.dexto.ai/blog/best-document-parsing-apis-for-ai-agents/)
- Datalab: Convert $4 per 1k pages (fast or balanced) and $10 (accurate); extraction $6 to $20; free $20 a month with a work email; a lite mode at $0.50 per 1k is mentioned in one search result. Only `word_bboxes` ($0.30 per 1k) is priced on the docs page I fetched; responses carry a `cost_breakdown`. The OmniParseBench board lists $7.50 (accurate) and $3.00 (balanced). Pricing is unresolved: I did not find a Datalab pricing page. — [Dexto](https://www.dexto.ai/blog/best-document-parsing-apis-for-ai-agents/), [Datalab API docs](https://documentation.datalab.to/docs/welcome/api), [OmniParseBench](https://github.com/datalab-to/omni_parse_bench/wiki)
- Firecrawl /v2/parse: 1 credit per PDF page, whether text or OCR; other formats not stated; LLM-backed formats like json or summary cost more; 1,000 free credits a month; paid from $83 a month for 100k credits (about $0.83 per 1k pages at the top of that plan; the plan figures are from a search summary). — [Firecrawl document parsing docs](https://docs.firecrawl.dev/features/document-parsing), [search summary](https://www.firecrawl.dev/parse)
- Unstructured: $0.015 per page ($15 per 1k) after 10k free pages, 45+ file types, JSON elements output (not Markdown-first); strategies fast, hi_res, ocr_only, vlm, auto. — [Dexto](https://www.dexto.ai/blog/best-document-parsing-apis-for-ai-agents/)
- Azure Document Intelligence: Read $1.50, Layout and prebuilt $10, custom $30 per 1k pages (Oct 2026 per one source); 500 free pages a month. Output is JSON with optional Markdown; up to 2,000 pages or 500 MB per document. Note the OmniParseBench board costs Azure at $5, which conflicts with this. — [Dexto](https://www.dexto.ai/blog/best-document-parsing-apis-for-ai-agents/), [docuocr](https://docuocr.com/blog/azure-document-intelligence-pricing)
- Google Document AI: OCR $1.50, Layout Parser $10, Form Parser and Custom Extractor $30 per 1k pages; online requests are capped at 15 PDF pages, batch at 500. — [Dexto](https://www.dexto.ai/blog/best-document-parsing-apis-for-ai-agents/)
- AWS Textract: $1.50 per 1k for plain text detection, and forms ($50) and tables ($15) are billed on top. Dexto excludes it for supporting only four file formats and English-only handwriting. No Markdown output was found. — [Dexto](https://www.dexto.ai/blog/best-document-parsing-apis-for-ai-agents/), [price comparison](https://aliteq.com/idp-pricing-per-page)
- Docling: MIT licence, self-hosted, no per-page fee. I found no hosted Docling REST API with its own pricing. — [Dexto](https://www.dexto.ai/blog/best-document-parsing-apis-for-ai-agents/)

### Inferences

- Reducto's format list is the closest match to the requested formats (PDF, DOCX, XLSX, PPTX, HTML, CSV, images). Mistral's documented list is narrower and omits XLSX, CSV and HTML, which matters for a general `parse` capability.
- LlamaParse Fast returns only text and spatial text, with no markdown (see the API-shape section), so it cannot serve a Markdown capability; the cheapest Markdown tier is Cost-effective at $3.75 per 1k pages.

### Gaps

- The live Datalab pricing page; Datalab file-format list from a primary source (only "PDF, images, DOCX, spreadsheets" confirmed in the docs I fetched).
- Mistral's Document AI vs OCR endpoint request shape and whether the standard endpoint is synchronous.
- Latency or speed numbers per provider: none from an independent source. OmniParseBench says its timing definitions "differ and are not directly comparable". Mistral's customers claim 17x lower latency than agentic parsers, but that is a customer claim.

## Current API shapes (sync vs async, job id, resume)

### Takeaway

LlamaParse, Reducto and Datalab all have a job id that fits Fieldwork's resume rule. Mistral appears synchronous with a separate Batch API. Firecrawl /parse is documented as a single awaited call.

### Cited Findings

- LlamaParse v2 flow: `POST https://api.cloud.llamaindex.ai/api/v1/beta/files` (multipart, `purpose=parse`) returns a file id; `POST /api/v2/parse` with `file_id`, `tier` and `version` returns a job `id` and `status` (PENDING); `GET /api/v2/parse/<job_id>?expand=markdown` is polled until COMPLETED, FAILED or CANCELLED. On the GET response status is nested under `job.status`. The result can include `text`, `markdown`, `items`, `images_content_metadata`; option groups are `input_options`, `output_options` and `processing_options`. Bearer auth. — [LlamaParse getting started](https://developers.llamaindex.ai/python/cloud/llamaparse/getting_started/)
- LlamaParse tiers: Fast returns only text and spatial text, with no markdown; Cost-effective for text-heavy documents; Agentic is the suggested default; Agentic Plus for complex tables and multi-column. A Cost Optimizer can route pages. v1 modes are deprecated. — [LlamaParse getting started](https://developers.llamaindex.ai/python/cloud/llamaparse/getting_started/), [LlamaParse pricing](https://developers.llamaindex.ai/llamaparse/general/pricing/)
- Reducto: `/parse_async` returns a `job_id` and you poll `/job/{id}` (webhooks recommended); sync `/parse` exists; later calls can reuse a parse with `input="jobid://<job_id>"`; `queue_priority: "batch"` gives 20% off and a 12-hour completion guarantee, honoured only on `/parse_async` per the docs. — [Reducto docs via search](https://docs.reducto.ai/workflows/batch-queue); I did not fetch these docs directly.
- Datalab: base `https://www.datalab.to/api/v1/`, header `X-API-Key`. `POST /convert` returns `request_id` and `request_check_url`; poll `GET /convert/{request_id}` until status is `complete` or `failed`; results are deleted about a day after completion; `webhook_url` supported. Modes `fast`, `balanced`, `accurate`. Output `markdown` (default), `html`, `json`, `chunks`; includes `parse_quality_score` (0 to 5) and `page_count`. File upload by multipart or `file_url`. — [Datalab API docs](https://documentation.datalab.to/docs/welcome/api)
- Firecrawl: `POST https://api.firecrawl.dev/v2/parse`, multipart with an `options` JSON string and a `file` part; Bearer auth; the examples await one call and read `doc.markdown`, which suggests it is synchronous but the docs do not say. Formats: Excel (.xlsx, .xls, .xlsm, .xlsb, .ods), Word (.docx, .doc, .docm, .odt, .rtf), PowerPoint, EPUB, CSV, PDF (text or scanned), and HTML in the examples. 50 MB limit and a `GET /v2/parse/formats` endpoint are from a search summary. Image formats may be listed but marked `available: false` until image OCR is enabled. Results are not cached. No benchmark or accuracy claims on the docs page. — [Firecrawl document parsing](https://docs.firecrawl.dev/features/document-parsing), [search summary](https://docs.firecrawl.dev/api-reference/endpoint/parse)
- Mistral: single API endpoint plus a Batch API; the announcement does not state sync vs async. — [Mistral OCR 4](https://mistral.ai/news/ocr-4/)

### Inferences

- The Firecrawl /parse comparison: it covers the broadest office-format list (Excel, Word, PowerPoint, EPUB, CSV) at about 1 credit per page, but it has no published accuracy data and no job id, so it cannot satisfy the resume rule for long documents. Whether it handles scanned images today depends on the `available` flag at runtime.
- Of the candidates, Datalab and LlamaParse have the cleanest async job semantics for the `resume` option. Reducto's `/parse_async` also fits. Mistral has none for the standard endpoint (Batch API has job ids, unverified).
- Cost to add: LlamaParse needs three calls (upload, create, poll), so the adapter holds a file upload step. Datalab and Reducto accept the file directly (Datalab by multipart; Reducto upload step unverified).

### Gaps

- Reducto upload mechanics (does `/parse` take multipart directly, or does it need `/upload` first) and exact response shapes: not fetched.
- Mistral request shape for local files (upload then signed URL vs inline base64): not fetched.
- Whether Firecrawl /parse has any resumable or async mode: not stated.

## Recommendation: which one or two to add

### Takeaway

Add Reducto first and LlamaParse or Mistral second. If only one, Reducto. The user's LlamaParse idea is sound, but it is not clearly better than Reducto or Datalab on the available evidence.

### Cited Findings

- On OmniParseBench, Reducto (90.8 at $10) and LlamaParse (90.4 at its Agentic Plus price of $56.25) score the same, so Reducto wins on cost; LlamaParse has cheaper tiers whose scores were not reported. — [OmniParseBench](https://github.com/datalab-to/omni_parse_bench/wiki)
- Mistral OCR 4 scores 89.5 at $4 on the same board, which is the best price-to-score ratio among the mainstream hosted APIs. — [OmniParseBench](https://github.com/datalab-to/omni_parse_bench/wiki), [Mistral OCR 4](https://mistral.ai/news/ocr-4/)

### Inferences

- Reducto: best format coverage, a documented async job id, a pricing model that is flat per page, and good table scores across two vendor-run tests. Weakness: text score (85.4) and Reducto authored the table benchmark it leads.
- LlamaParse: tiered cost control and a clean job API, but the tier that scored 90.4 costs 45 credits a page, and the 130+ formats claim (from Dexto) is unverified.
- Mistral: lowest price and good scores, but narrower documented formats and unclear async semantics, so it is the weaker fit for the resume rule.
- Datalab: top score on a benchmark it wrote; treat with suspicion until a neutral run confirms it. Its API shape is well documented and a good fit.
- Under the repo rule that a provider lacking a capability is never called for it, the adapter should expose only the options each provider has (for example, tiers for LlamaParse, modes for Datalab), with names kept in each adapter's types.
- Needs Daniel's sign-off before building: AGENTS.md requires approval to add a provider, and live testing needs approval and the $5 cap.

### Gaps

- A neutral head-to-head on the user's real documents. A small test set (a scanned page, a handwritten page, a multi-column PDF, a wide XLSX) run through Reducto, LlamaParse, Mistral and Datalab would settle this; it would need Daniel's approval for live calls.
