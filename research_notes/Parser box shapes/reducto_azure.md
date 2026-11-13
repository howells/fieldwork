# Reducto and Azure Document Intelligence Layout: API contract

Fetched 2026-11-03 from the providers' pages. Nothing was called. Anything not found on an official page is marked UNVERIFIED. Caveat: the fetch tool summarises pages with a small model, so JSON examples below are sometimes the docs' own shapes, restated. Re-check exact strings against the live page before writing adapter fixtures.

---

## 1. Reducto (docs.reducto.ai, base `https://platform.reducto.ai`)

### 1.1 Endpoints and flow

| Fact | Detail | Source |
| --- | --- | --- |
| Upload | `POST /upload`, `multipart/form-data` (field `file`) or `application/json`. One file per request. Optional query `extension`. Response `{"file_id": "reducto://<uuid>.pdf"}` (`presigned_url` nullable). | https://docs.reducto.ai/api-reference/upload ; https://docs.reducto.ai/upload/overview.md |
| Upload limits | Direct upload 100 MB; presigned-URL upload 5 GB; URL passthrough no limit. Uploaded files expire 24 h after upload. | https://docs.reducto.ai/upload/overview.md ; https://docs.reducto.ai/reference/faq.md |
| Other inputs | `input` accepts a public URL, presigned S3 URL, `reducto://` id, `jobid://<job_id>` (reuse an earlier parse), or a list of URLs (V3 only). Base64 in the body: not documented (UNVERIFIED, appears unsupported). | https://docs.reducto.ai/api-reference/parse |
| Sync parse | `POST /parse`, JSON body, returns `ParseResponse` directly. | https://docs.reducto.ai/api-reference/parse |
| Async parse | `POST /parse_async`, same body plus `async` config. Returns `{"job_id": "..."}`. | https://docs.reducto.ai/api-reference/async-parse ; https://docs.reducto.ai/workflows/async-overview.md |
| Poll | `GET /job/{job_id}`. Docs examples poll every 2 s. | https://docs.reducto.ai/api-reference/retrieve-parse.md |
| Statuses | OpenAPI enum: `Pending`, `Completed`, `Failed`, `Idle`. Async-overview page lists `Pending`, `InProgress`, `Completing`, `Completed`, `Failed`. The two pages disagree; handle all. | retrieve-parse.md vs async-overview.md |
| Job response | `{status, result, progress, reason, error{code,name,message,job_id?}}`; enhanced variant adds `type, num_pages, total_pages, source, duration, created_at, raw_config, bucket`. `result` is discriminated by `response_type` (`parse` etc.). | https://docs.reducto.ai/api-reference/job |
| Webhooks | `async.webhook` = `{mode:"svix", channels?:[]}` or `{mode:"direct", url}`; `async.metadata` echoed in webhook body; `async.priority` bool; top-level `queue_priority` `auto | standard | batch`. Payload shape not on the pages I read (see https://docs.reducto.ai/workflows/svix-webhooks.md and direct-webhooks.md, not fetched: UNVERIFIED). | async-parse |
| Retention | Job results "generally available for 12 hours"; job ids "generally expire after 12 hours". `persist_results: true` keeps indefinitely but requires opting in to Studio. Under ZDR (Growth tier and up) artifacts purged within 24 h. Result/`pdf_url`/`image_url` presigned URLs valid 1 h. Early delete: `DELETE /job/{job_id}`; 410 = deleted, 409 = deletion in progress. | https://docs.reducto.ai/reference/faq.md ; https://docs.reducto.ai/security/policies.md |
| Resumability | `job_id` is a plain string, pollable by `GET /job/{id}` for ~12 h. That fits Fieldwork's `resume`. Resume window is 12 h, not unlimited. | derived from the above |
| Large results | If response over ~6 MB, `result` is `{type:"url", url, result_id}`; `force_url_result:true` always does this. Adapter must handle both `type:"full"` and `type:"url"`. | https://docs.reducto.ai/parse/response-format.md |

### 1.2 Auth

`Authorization: Bearer $REDUCTO_API_KEY` (curl example on upload page). Source: https://docs.reducto.ai/upload/overview.md

### 1.3 Output element shape

Parse response: `{job_id, duration, usage{num_pages, credits, credit_breakdown, page_billing_breakdown, usage_breakdown?}, pdf_url?, studio_link?, result}`, with `result = {type:"full", chunks[], ocr?, custom?}`. Chunk: `{content (markdown), embed, enriched, enrichment_success, blocks[]}`. Block: `{type, bbox, content, image_url?, confidence ("low"|"high"), granular_confidence{parse_confidence, extract_confidence}, merged_tables[]?, extra{word_citations?, cell_citations?}}`. Block types (OpenAPI): Header, Footer, Title, Section Header, Page Number, List Item, Figure, Table, Key Value, Text, Comment, Signature. The prose page also lists `Checkbox`; the two lists differ. Sources: https://docs.reducto.ai/api-reference/parse ; https://docs.reducto.ai/parse/response-format.md

Bounding box (response-format page): fields `left`, `top`, `width`, `height`, `page`, `original_page`.

- Format: rect (left/top/width/height), not polygon.
- Units: "All coordinates are normalized to [0, 1] relative to page dimensions." No absolute page size in the bbox; the page size is not returned there (UNVERIFIED whether it appears elsewhere), so converting to points needs the PDF's own page size.
- Origin: top-left, y increases downward.
- `page`: 1-indexed within the processed output; `original_page`: 1-indexed page in the source doc (differs from `page` when `page_range` is used, e.g. pages 5-10 gives page 5 as `page:1, original_page:5`).
- Docs example values on that page: `left 0.076, top 0.427, width 0.834, height 0.432`.
- Note the OpenAPI spec page itself gives no units; only the prose page does.

Citations example shape (from citations page, paraphrased by the fetch tool, not verbatim JSON):

```json
{
  "type": "Text",
  "content": "...",
  "bbox": {
    "left": 0,
    "top": 0,
    "width": 0,
    "height": 0,
    "page": 1,
    "original_page": 1
  },
  "extra": {
    "word_citations": [
      { "text": "...", "char_start": 0, "char_end": 0, "bbox": {} }
    ],
    "cell_citations": [
      { "text": "...", "row_idx": [0], "col_idx": [1, 2], "bbox": {} }
    ]
  }
}
```

Source: https://docs.reducto.ai/configs/parse/citations.md

### 1.4 Tables

- `formatting.table_output_format`: `html | json | md | jsonbbox | dynamic | csv`, default `dynamic` (md for <=30 cells and <=4 merged cells, else html). Source: https://docs.reducto.ai/configs/parse/table-output-formats.md
- `html`: merged cells via `rowspan`/`colspan`; headers `<th>`. "The only format that preserves merged cells." No per-cell boxes.
- `md`, `json`, `csv`: merged cells flattened.
- `jsonbbox`: each cell `{"text": ..., "bbox": {"x","y","width","height"}}` normalized 0-1 (note `x`/`y`, not `left`/`top`). **Not supported on r-1.**
- On r-1, per-cell boxes come from `settings.return_citations: true` -> `extra.cell_citations` (one per non-empty cell, `row_idx`/`col_idx` are zero-based arrays covering all spanned rows/cols, `bbox` covers the cell's words). Citations require r-1 (400 on legacy) and cannot combine with `merge_tables` (400). Docs recommend HTML tables with citations. Source: citations.md.
- Header flags: only through HTML `<th>`; no structured `isHeader` field found (UNVERIFIED).

### 1.5 Word/line boxes and OCR

- `settings.return_ocr_data: true` returns `result.ocr.words[]` and `result.ocr.lines[]`, each `{text, bbox (normalized), confidence 0-1, chunk_index, rotation (deg CCW)}`. Supported by r-1 and legacy; "OCR included at no extra charge". Source: https://docs.reducto.ai/configs/parse/ocr-settings.md ; https://docs.reducto.ai/api-reference/parse
- Word-level boxes inside blocks also via `return_citations` (`word_citations`), r-1 only.
- Scanned PDFs: r-1 "reads digital text, scans, handwriting, and mixed formatting in the full-page pass" (https://docs.reducto.ai/parse/r-1.md). Whether OCR'd text gets boxes: yes, blocks always carry `bbox`, and OCR words carry `bbox`.

### 1.6 Embedded text layer vs OCR, hidden text

- Legacy only: `settings.extraction_mode` = `hybrid` (default; "good quality metadata first, then OCR"), `ocr` ("ignoring any embedded text in the PDF"), `metadata` (embedded text only; this value appears on the prose page but not in the OpenAPI enum `ocr|hybrid`, so treat as UNVERIFIED). Source: ocr-settings.md.
- **r-1 ignores `extraction_mode` and `ocr_system`** ("native full-page processing"). The docs do not say whether r-1 reads the embedded text layer or only the rendered page. UNVERIFIED. This is the key gap for the hidden-text requirement.
- Hidden / invisible text: no official page addresses it. The only "hidden text layer" mention is `embed_pdf_metadata`, which writes OCR text back into a returned PDF. UNVERIFIED for leakage. The only way to get a guaranteed ignore-embedded-text mode is legacy + `extraction_mode:"ocr"`, which means giving up r-1 features (citations, and r-1 pricing).
- `formatting.include` has `ignore_watermarks` (r-1 ignores it, "handles by default").
- No documented "force OCR" flag other than legacy `extraction_mode: "ocr"`.

### 1.7 Markdown

Always present: `chunk.content` is markdown; `chunk.embed` is embedding-optimised. Blocks (with `bbox`) sit alongside in each chunk, so markdown and boxes come together. Chunking: `retrieval.chunking.chunk_mode` = `variable|section|page|disabled|block|page_sections` (default `disabled`), `chunk_size`, `chunk_overlap`. `block` mode is presumably one block per chunk (UNVERIFIED semantics, see https://docs.reducto.ai/configs/parse/chunking-methods.md, not fetched). Offsets from markdown back to the page: only via citations `char_start/char_end`.

### 1.8 Limits and pricing

- Direct upload 100 MB (20 MB files fit). Page limit: not documented anywhere I read (UNVERIFIED). Image limit: under 50 megapixels and 15,000 px per axis (413 error). Source: https://docs.reducto.ai/reference/error-codes.md
- Timeouts: sync requests have a 900 s timeout (rate-limits page); SDK default 1 h. `settings.timeout` (seconds) is settable (docs example `120`). Sync guidance: use `run()` under ~20 pages, async over ~50 pages or complex processing. Errors 504 "Conversion took too long" are retryable. Sources: https://docs.reducto.ai/reference/rate-limits.md ; async-overview.md ; error-codes.md
- Rate limits: 1,000 req/s per key; `GET /job/{id}` 300 req/s (429 with CODE 2000: use webhooks). Source: rate-limits.md
- Pricing (effective 2026-09-01): r-1 $10 per 1,000 pages; Legacy Standard $15; Legacy Complex $30; agentic 2x on legacy; OCR, citations and bounding boxes included; prompted blocks/custom regions $5 per 1,000; advanced chart agent $0.06 per chart; batch queue 20% discount (r-1 ~ $8 per 1,000, 12 h SLA). Rates are list prices; Growth/Enterprise differ. Source: https://docs.reducto.ai/reference/credit-usage.md
- For Vercel's 2-minute ceiling: use `/parse_async` plus polling or webhook (do not hold a sync request). Per-doc latency numbers: not published (UNVERIFIED).

### 1.9 Options worth exposing

`settings.model` (`r-1`|`legacy`; legacy is the default unless the org is on the r-1 plan, so always send it), `settings.return_citations`, `settings.return_ocr_data`, `settings.page_range` (1-indexed `{start,end}`), `settings.timeout`, `settings.force_url_result`, `settings.persist_results`, `settings.document_password`, `formatting.table_output_format`, `formatting.merge_tables`, `retrieval.chunking.*`, `retrieval.filter_blocks`, `enhance.agentic[]`, `settings.return_images`, `async.webhook`, `async.metadata`, `queue_priority`.

---

## 2. Azure Document Intelligence, prebuilt-layout (API 2024-11-30, "v4.0 GA")

Latest GA per the model overview page (https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/model-overview?view=doc-intel-4.0.0): `2024-11-30` is the newest GA; earlier GA: 2023-07-31, 2022-08-31 (v3.0 end of support 2029-03-30). Pages are dated through Oct 2026, still listing 2024-11-30 as latest GA. Note the REST path is `/documentintelligence/` (the v3.x path was `/formrecognizer/`).

### 2.1 Endpoints and flow

| Fact | Detail | Source |
| --- | --- | --- |
| Submit | `POST {endpoint}/documentintelligence/documentModels/prebuilt-layout:analyze?_overload=analyzeDocument&api-version=2024-11-30` | https://learn.microsoft.com/en-us/rest/api/aiservices/document-models/analyze-document?view=rest-aiservices-v4.0%20(2024-11-30)&tabs=HTTP |
| Body | JSON `{"base64Source": "..."}` or `{"urlSource": "https://..."}`; exactly one. No separate upload step. Raw binary (`application/octet-stream`) body: not on the reference page; known from SDK/quickstart practice but UNVERIFIED on official pages I fetched. Base64 inflates a 20 MB file by ~33%. | same |
| Query params | `pages` (1-based, e.g. `1-3,5,7-9`), `locale`, `stringIndexType` (`textElements` | `unicodeCodePoint` | `utf16CodeUnit`), `features` (list), `queryFields`, `outputContentFormat` (`text` | `markdown`), `output` (`pdf` | `figures`) | same |
| Response | `202 Accepted` with headers `Operation-Location` (full poll URL) and `Retry-After` (int) | same |
| Poll | `GET {endpoint}/documentintelligence/documentModels/{modelId}/analyzeResults/{resultId}?api-version=2024-11-30`. `resultId` is a UUID (in the Operation-Location URL). Body `{status, createdDateTime, lastUpdatedDateTime, analyzeResult{apiVersion, modelId, stringIndexType, contentFormat, content, pages, tables, ...}}` | https://learn.microsoft.com/en-us/rest/api/aiservices/document-models/get-analyze-result?view=rest-aiservices-v4.0%20(2024-11-30)&tabs=HTTP |
| Statuses | Only `succeeded` was visible verbatim on the page I got. `notStarted`/`running`/`failed` are UNVERIFIED on an official page (the fetch truncated). Error body `{error:{code,message,target,details,innererror}}`. | same |
| Polling guidance | Do not poll more than once per 2 s per request; honour `retry-after`; GET limit 50 TPS (S0), analyze POST 15 TPS default. | https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/service-limits?view=doc-intel-4.0.0 |
| Webhooks | None documented. Polling only. | (absent) |
| Retention | "The service stores submitted input data and analyze results for 24 hours after an analysis operation completes", then deletes. Early delete: Delete Analyze Result API. | https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/document-intelligence/data-privacy-security |
| Resumability | Resumable id = `resultId` (UUID) plus `modelId` (path needs both) plus endpoint. Store the whole `Operation-Location` URL as the job id, or `modelId/resultId`. Valid ~24 h after completion. | derived |

### 2.2 Auth

Header `Ocp-Apim-Subscription-Key: <key>` (apiKey in header), or OAuth2 with scope `https://cognitiveservices.azure.com/.default`. Endpoint is per-resource: `https://<resource>.cognitiveservices.azure.com`. Source: analyze-document REST page above.

### 2.3 Output element shape

Top-level `analyzeResult`: `content` (one concatenated string in reading order), `pages[]`, `paragraphs[]`, `tables[]`, `figures[]`, `sections[]`, `styles[]`, `languages[]`, `keyValuePairs[]` (if feature on). Elements locate text via `spans: [{offset, length}]` into `content`. Source: https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/concept/analyze-document-response?view=doc-intel-4.0.0

- Page: `{pageNumber, angle, width, height, unit, words[], lines[], spans[], selectionMarks[]}`. `pageNumber` is 1-indexed. Docs example: `"pageNumber": 1, "angle": 0, "width": 915, "height": 1190, "unit": "pixel"` (an image example). Source: https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/layout?view=doc-intel-4.0.0
- Paragraph: `{spans, boundingRegions, role?, content}`. Roles: `title`, `sectionHeading`, `footnote`, `pageHeader`, `pageFooter`, `pageNumber`. (No role = body text.)
- Line: `{content, polygon, spans}`. Word: `{content, polygon, confidence, span}`. Selection mark: `{state, polygon, confidence}`.
- Figure: `{id, boundingRegions, spans, elements, caption}`. Section: `{spans, elements:["/paragraphs/0","/sections/1"]}`.
- Docs example paragraph: `{"spans": [], "boundingRegions": [], "role": "title", "content": "NEWS TODAY"}`.

Bounding box:

- `boundingRegions: [{pageNumber, polygon}]` on paragraphs, tables, cells, figures; `polygon` directly on words, lines, selection marks.
- Format: flat number array `[x1,y1,x2,y2,x3,y3,x4,y4]`, 4 vertices only ("Currently, Document Intelligence only returns 4-vertex quadrilaterals"). Order: clockwise from the left of the element's natural orientation; for quads, top-left, top-right, bottom-right, bottom-left. Docs example: `"polygon": [7.3842, 7.465, 7.9181, 7.465, 7.9181, 7.6089, 7.3842, 7.6089]`.
- Units: per `page.unit`; "In general, unit of measure for images is pixels while PDFs use inches." So for PDFs, inches (1 in = 72 pt). The layout page's JSON sample shows `"unit": "pixel"` with a pixel-sized page for an image; a PDF sample was not shown (the `unit` value string for PDFs, i.e. `inch`, is UNVERIFIED verbatim; read `page.unit` at runtime).
- Origin: top-left implied by the point order and x/y plane, not stated in words (UNVERIFIED as an explicit statement).
- Rotated pages: `angle` is reported; polygons are "relative to the natural orientation of the element".
- Bounding regions "only for rendered files"; DOCX/XLSX/PPTX/HTML get none.
- Table and figure regions cover the core content only, excluding caption and footnotes.

### 2.4 Tables

`tables[]`: `{rowCount, columnCount, boundingRegions, cells[], caption?, footnotes?, spans}`. Cell: `{kind, rowIndex, columnIndex, rowSpan?, columnSpan?, content, boundingRegions, spans, elements}`. Docs example:

```json
{
  "kind": "columnHeader",
  "rowIndex": 0,
  "columnIndex": 0,
  "columnSpan": 4,
  "content": "(In millions, except earnings per share)",
  "boundingRegions": [],
  "spans": []
}
```

- Cell kinds named in prose: general content, row header, column header, stub head, description (JSON values seen verbatim: only `columnHeader`; the others, e.g. `rowHeader`, `stubHead`, `description`, `content`, are UNVERIFIED as exact strings).
- `rowSpan` is described in prose ("row span", "a cell can span across multiple rows and columns"); the JSON key `rowSpan` is not shown verbatim on the pages I read (only `columnSpan`). UNVERIFIED exact name.
- Cells carry their own `boundingRegions` (and thus polygons) and `spans`. Cells' words can be recovered via `spans` into `content` and the page `words`.
- Tables can cross pages (multiple bounding regions). XLSX input: table analysis not supported.
- Rotated tables supported.

### 2.5 Word/line boxes and OCR

- Words and lines both have `polygon` and are always returned for PDF and images; words carry `confidence`; lines carry handwriting via `styles[].isHandwritten`.
- Scanned pages: OCR'd, same word/line polygons. No separate "scanned" switch.
- `features=ocrHighResolution` improves small text on large pages (A1/A2/A3 drawings). Add-on, billed per page.

### 2.6 Embedded text layer vs OCR, hidden text

Not documented on any page I read. The Read page describes an OCR model "that extracts print and handwritten text from PDF documents and scanned images" and the layout page says nothing about whether PDF text-layer characters are used. Whether invisible (render mode 3, white-on-white, off-page) text is returned: UNVERIFIED. No force-OCR option exists in the API; `features` has no such flag. Treat the hidden-text requirement as unproven; it needs a test PDF with injected hidden text. (Do not run it from this task.)

### 2.7 Markdown

`outputContentFormat=markdown` puts markdown into `analyzeResult.content` (`contentFormat: "markdown"`). Spans still index into this markdown string, so element boxes and markdown line up through `spans`. Tables are HTML (`<table><tr><th>..`) with `rowspan`/`colspan` for merged cells and `<caption>`; figures in `<figure>`; checkboxes as ☒ / ☐; page header/footer/number as HTML comments; pages separated by `<!-- PageBreak -->`. KeyValuePairs/Language/Style stay in JSON. Source: https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/concept/markdown-elements?view=doc-intel-4.0.0 Spans offsets default to grapheme clusters; use `stringIndexType=utf16CodeUnit` for JavaScript.

### 2.8 Limits and pricing

- File size: S0 500 MB, F0 4 MB. Pages: 2,000 (S0), 2 (F0). Image 50x50 to 10,000x10,000 px; min text height 12 px on 1024x768. Password-locked PDFs must be unlocked first. OCR JSON response max 500 MB. Sources: layout page and service-limits page above. (An older v3 section of the layout page says "less than 50 MB"; that is the retired-version text, ignore.)
- Latency / timeout: no published per-doc SLA or timeout; docs say "multitenant asynchronous service" with variable latency (model-overview). So the 2-minute ceiling needs async plus resumable polling, not blocking.
- Quotas: analyze POST 15 TPS, GET 50 TPS default (S0), adjustable by support request.
- Pricing: official pricing page renders prices client-side (fetch showed `$-`). The numbers below come from Microsoft's public Retail Prices API (https://prices.azure.com/api/retail/prices, filter productName Azure Document Intelligence, eastus, S0), not from the pricing page text: Pre-built/Layout pages $10.00 per 1K; Batch Layout $10.00 per 1K (from 2026-01-01); Add-on pages (high resolution, font, formula) $6.00 per 1K extra; query fields $10.00 per 1K; Read $1.50 per 1K (0.60 above 1M). Treat as UNVERIFIED against the pricing page itself. Free: 500 pages/month on F0. Commitment tiers exist for prebuilt (20k/100k/500k pages per month).
- Bounding boxes and markdown: no extra charge listed; `ocrHighResolution` is the billed add-on that affects OCR. `keyValuePairs`, `languages`, `barcodes` free; `styleFont`, `formulas`, `ocrHighResolution` add-on.

### 2.9 Options worth exposing

`features` (`ocrHighResolution`, `languages`, `barcodes`, `formulas`, `keyValuePairs`, `styleFont`, `queryFields`), `outputContentFormat` (`text`|`markdown`), `pages`, `locale`, `stringIndexType` (default to `utf16CodeUnit` in Node), `output` (`figures`, `pdf` for searchable PDF, `pdf` is Read-only), plus `resume` as `modelId`+`resultId`.

---

## 3. Comparison for the materials-data use case

| Need | Reducto (r-1) | Azure prebuilt-layout |
| --- | --- | --- |
| Local file in | Upload step (`/upload`, multipart, <=100 MB), then `reducto://` id; or URL | One call, base64 JSON (or URL); no upload |
| Job id | `job_id`, 12 h | `resultId` + `modelId`, 24 h post-completion |
| Box format | normalized 0-1 rect, top-left, 1-based page | polygon of 4 points, inches for PDF (pixels for images), 1-based page |
| Per-element box | every block | paragraphs, lines, words, cells, tables, figures |
| Table cell boxes | via `cell_citations` on r-1 (jsonbbox not on r-1) | native `cells[].boundingRegions` |
| Merged cells | html `rowspan/colspan`; cell_citations row_idx/col_idx arrays | `rowSpan`/`columnSpan` (rowSpan key UNVERIFIED) |
| Word boxes | `return_ocr_data` or `word_citations` | native `words[].polygon` |
| Hidden text | UNVERIFIED on r-1; legacy `extraction_mode:"ocr"` ignores text layer | UNVERIFIED |
| Price (list) | $10 / 1k pages (r-1) | $10 / 1k pages (+$6 / 1k for ocrHighResolution), prices via retail API |
| Sync/async | both; use async for Vercel | async only |

Open items to resolve with a test PDF before committing adapters: hidden-text behaviour on both; Reducto r-1 text-layer use; Azure poll status strings and `rowSpan` key; Reducto webhook payload; Reducto page limit.
