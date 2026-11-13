# Mistral OCR and Firecrawl /v2/parse: verified API contract

Checked 2026-11-03 by fetching official pages. No API was called. Items without a page behind them are marked UNVERIFIED. WebFetch summarises pages through a small model, so field names come from the OpenAPI spec where possible.

Sources:

- M-API: https://docs.mistral.ai/openapi.yaml (official spec; OCR schemas read directly)
- M-OCR: https://docs.mistral.ai/studio-api/document-processing/basic_ocr.md
- M-BATCH: https://docs.mistral.ai/studio-api/batch-processing
- M-41: https://docs.mistral.ai/models/ocr-4-1.md ; M-40: https://docs.mistral.ai/models/ocr-4-0.md
- M-PRICE: https://docs.mistral.ai/inference/pricing.md
- F-GUIDE: https://docs.firecrawl.dev/features/parse
- F-API: https://docs.firecrawl.dev/api-reference/endpoint/parse (spec: api-reference/v2-openapi.json)

---

## 1. Mistral OCR

### Models

- `mistral-ocr-latest` is an alias for the newest model (M-OCR). `mistral-ocr-4-1` (OCR 4.1, GA 2026-07-16) is the current one; `mistral-ocr-4` and `mistral-ocr-latest` are also listed as its IDs (M-41).
- `mistral-ocr-4-0` is marked Deprecated, retired 2026-09-30, successor 4.1 (M-40).
- OCR 3 is `mistral-ocr-2512` (M-PRICE).
- OCR 4 adds paragraph boxes and block labels; 4.1 adds block-level confidence (llms.txt descriptions).

### Endpoints and flow

- `POST https://api.mistral.ai/v1/ocr`, JSON body, synchronous (M-API, M-OCR).
- Auth: `Authorization: Bearer $MISTRAL_API_KEY` (M-API curl example).
- Three ways to send a document (M-OCR, M-API `OCRRequest.document`):
  1. Public URL: `{"type":"document_url","document_url":"https://..."}` (`document_name` optional) or `{"type":"image_url","image_url":...}`.
  2. Base64 data URL, same `document_url` field: `"document_url": "data:application/pdf;base64,<base64_pdf>"`. The page says the V1 SDK does not support this; the REST body is the same field.
  3. Upload then signed URL: `POST /v1/files` multipart (`file`, `purpose=ocr`, optional `expiry`, `visibility` workspace|user), then `GET /v1/files/{id}/url?expiry=24` (1 to 168 h, default 24), then pass `signed_url.url` as `document_url`. The spec also defines `{"type":"file","file_id":"<uuid>"}` (`FileChunk`) as a valid `document`, but M-OCR never shows it used.
- `/v1/files` upload cap is 512 MB per file (M-API); the OCR cap is lower (see Limits).
- Batch: `/v1/ocr` is a supported batch endpoint (M-BATCH). Upload JSONL with `purpose="batch"`; each line has `custom_id` and a `body` holding the normal request. Create a job at `/v1/batch/jobs`; the job has an `id` for get and `/cancel` (`/v1/batch/jobs/{job_id}`). Up to 1M requests per file. 50% discount stated (M-BATCH).
- Job id: only the batch API has one. Direct `/v1/ocr` calls are synchronous with no job id, so resumability maps to batch jobs only.
- Retention: UNVERIFIED for OCR inputs and outputs. Only the Files API `expiry` field and the signed URL expiry are documented. M-BATCH has a "will batch results expire" FAQ whose answer was not captured.

### Request fields (M-API `OCRRequest`, `additionalProperties: false`)

Required: `model`, `document`. Optional: `pages` (list of ints or string like `"0,2-4"`, **0-indexed**), `include_image_base64`, `image_limit`, `image_min_size`, `bbox_annotation_format`, `document_annotation_format`, `document_annotation_prompt`, `table_format` (`markdown`|`html`; omitted/null means inline), `extract_header`, `extract_footer` (default false), `include_blocks` (boolean, **default true** in the spec), `confidence_scores_granularity` (`word`|`page`|`block`; default none).

Block extraction needs OCR 4 or newer; older models accept the flag and return an empty array (M-OCR). Table format and header/footer extraction need OCR 2512 or newer.

### Response

Top level: `pages`, `model`, `document_annotation` (JSON string or null), `usage_info {pages_processed, doc_size_bytes}`.

Page (`OCRPageObject`): `index` (0-based), `markdown`, `images[]`, `tables[]`, `hyperlinks[]`, `header`, `footer`, `dimensions {dpi,height,width}`, `confidence_scores`, `blocks[]`.

Page dimensions (spec): "Height/Width of the image in pixels"; the page object describes them as the dimensions of the PDF page's screenshot image. Doc example: `dpi 200, height 2200, width 1700` (a US Letter page at 200 dpi).

### Blocks (the per-element boxes)

Spec description: "Paragraph-level bounding boxes for all content blocks in reading order (populated when include_blocks is True)". Block fields:

```
type                 text|title|list|table|image|equation|caption|code|references|aside_text|header|footer|signature
top_left_x           integer >= 0
top_left_y           integer >= 0
bottom_right_x       integer >= 0
bottom_right_y       integer >= 0
content              string (text/markdown/html of the block)
confidence_scores    null, or {average_content_confidence_score, minimum_content_confidence_score, block_type_confidence_score}  (set with granularity "block")
table_id             table blocks only (links to page.tables[].id)
image_id             image blocks only
```

- Box format: four integer corner fields, not an array.
- Units: integers. The spec types them as integers and gives page `dimensions` in pixels. The docs never state that block coordinates are pixels in that frame. Treating them as pixels of the `dimensions` image is an inference. **UNVERIFIED** for blocks. Image boxes in the doc example (`292,217`..`1405,649` on a 1700x2200 page) are consistent with it.
- Origin: **UNVERIFIED**. Field names say top_left and bottom_right, which implies a top-left origin with y downward.
- Page index: 0-based (`index`, `pages`). The OpenAPI example response shows `index: 1` and `2` for the first pages, so verify with a real call.
- No sample blocks JSON exists in the docs I could fetch; the shape above is from the schema. The doc image-box example is `{"id":"img-0.jpeg","top_left_x":292,"top_left_y":217,"bottom_right_x":1405,"bottom_right_y":649}`.
- Confirmed: OCR 4 returns text-block boxes, not just image boxes. Block types include `text`, `title`, `list`, `table`, `header`, `footer` etc. The enabling option is `include_blocks` (default true). Confidence needs `confidence_scores_granularity="block"`, which gives `average`, `minimum` and `block_type` scores 0 to 1, from model logprobs. Content scores are null for image-only blocks. Spec says confidence is derived from "model logprobs", so it is a model-likelihood signal.
- Page-level: `page` granularity gives `average_page_confidence_score` and `minimum_page_confidence_score`. `word` adds `word_confidence_scores[{text, confidence, start_index}]` (index into the page markdown) and per-table `word_confidence_scores`.

### Tables

- `table_format` null: inline markdown in page `markdown`. `markdown` or `html`: placeholders like `[tbl-3.html](tbl-3.html)` in the markdown, and `tables[] {id, content, format, word_confidence_scores?}`.
- Merged cells: the docs make no statement, but the HTML sample in M-OCR contains `rowspan` and `colspan`. Use `table_format: "html"` for merged cells; markdown cannot express them (inference).
- Cell boxes: none. Table granularity is the table block's box. Cell-level boxes do not exist in the schema.

### OCR, word and line boxes

- Boxes are paragraph-level only. No word or line boxes. `word_confidence_scores` has text and index but no coordinates.
- Scanned pages: Document AI OCR is an OCR model that runs on images and PDFs; supported images include JPEG, PNG, AVIF, TIFF, GIF, HEIC, BMP, WebP.

### Text layer vs rendering

- UNVERIFIED. No page says whether the embedded text layer is read. The spec describes `dimensions` as a "page screenshot image", which suggests rendering followed by a vision model, but that is an inference. Hidden-text behaviour: UNVERIFIED (not mentioned on any page).

### Limits and pricing

- Uploaded files: 50 MB or less and 1,000 pages or fewer (M-OCR FAQ, quoted). Rate limits: "Document OCR rate limits" exist, pages per minute, numbers UNVERIFIED. A 2-minute per-doc ceiling: no timeout documented.
- Price: OCR 4.1 $4 per 1000 pages, $5 per 1000 annotated pages. OCR 3 $2 and $3 (M-PRICE). OCR 4.0 had the same $4/$5 (M-40).
- Batch: 50% discount is stated on the batch page and on mistral.ai/pricing in general terms. An OCR-specific batch price is not listed, so $2 per 1000 is an inference.

---

## 2. Firecrawl `POST /v2/parse`

### Endpoint and flow

- `POST https://api.firecrawl.dev/v2/parse` (F-GUIDE, F-API). `GET /v2/parse/formats` lists extensions and MIME types.
- Auth: `Authorization: Bearer <API_KEY>`.
- Body: `multipart/form-data`. Part `file` (required, binary) and optional part `options` (`application/json`). No base64, no upload step.
- Synchronous. No job id and no batch upload: "call `/parse` once per file". `resume` does not apply; the SDK adapter has nothing to resume. Public URLs should use `/scrape`, which has the same options and output.
- Retention: `zeroDataRetention` option (default false, needs contacting Firecrawl). Default retention UNVERIFIED.
- Formats: .html .htm .xhtml .pdf .docx .doc .docm .odt .ods .odp .rtf .xlsx .xls .xlsm .xlsb .pptx .ppt .pptm .epub .csv.

### Options (F-API ParseOptions)

- `formats`: array of `{type}`; default `[{type: markdown}]`; types markdown, summary, html, rawHtml, links, images, json (json takes `schema`, `prompt`). The guide's prose lists them as strings. Which form the server accepts is UNVERIFIED.
- `onlyMainContent` (true), `includeTags`, `excludeTags`, `headers`, `timeout` (ms, default 30000, **max 300000**), `skipTlsVerification`, `removeBase64Images`, `blockAds`, `checkPromptInjection` (+4 credits), `redactPII` (bool or `{mode: accurate|aggressive|fast, entities, replaceStyle: tag|mask|remove}`), `proxy` (basic|auto), `origin`, `integration`, `auditMetadata`, `zeroDataRetention`.
- `parsers`: default `[{type:"pdf"}]`; `[]` skips parsing and returns the PDF as base64 for a flat 1 credit. PDF parser (no extra properties):
  - `mode`: `fast` | `auto` | `ocr` (default `auto`)
  - `maxPages`: integer 1 to 10000
  - `pages`: bool, default false, fills per-page markdown
  - `blocks`: bool, default false, fills layout blocks
  - `pageMarkers`: bool, default false; pages joined with `"\n\n---\n\n<!-- page N -->\n\n"`, no marker before page 1
- Unsupported on parse: actions, waitFor, location, mobile, change tracking.

### Response

`{ success, data: { markdown, pages?, blocks?, metadata, warning, ... } }`

- `pages`: `[{pageNumber (1-based int), markdown}]`.
- `metadata`: `numPages` (pages parsed, capped by maxPages), `totalPages` (true count; greater than numPages means truncated; omitted if unknown), `title`, `sourceFile`, `contentType`, `statusCode`, `provider{creditsCost,...}`.
- `blocks`: **one entry per page**: `{pageNumber, width, height, status: ok|partial|failed, items:[Block]}`. `width`/`height` are nullable pixel numbers.

### Block shape (`blocks: true`)

```
id               "p<page>.b<index>", stable within one response
type             title|section_header|text|table|formula|figure|caption|page_number|page_header|page_footer (more may be added)
label            raw layout-model label, nullable
bbox             [x0,y0,x1,y1], NORMALIZED 0-1 relative to the page; null if page size unknown
content          markdown fragment for this block
markdownSpan     [start,end) character offsets into the document markdown; null if post-processing rewrote the fragment
readingOrder     integer
source           native_text | layout_ocr | tsr (tables) | formula_model | full_page
confidence       {layout: 0-1|null, ocr: 0-1|null}
```

- Multiply bbox by page `width`/`height` for pixels. The guide's example page is 1700x2200 (200 dpi Letter, same size Mistral reports).
- Origin: not stated on the pages I read. UNVERIFIED (x0,y0 first suggests top-left). Page index: `pageNumber` 1-based.
- The pages give no full JSON example of a block; this shape is from the OpenAPI schema and guide table.
- No word or line boxes. Block-level only.

### Tables

- Tables are blocks of `type: "table"` with `source: "tsr"` (table structure recognition). Markdown format of the table content and merged-cell handling: UNVERIFIED (the guide does not say). Cell-level boxes: none in the schema.

### OCR and text layer

- `auto`: "tries text-based extraction from the embedded text first, then falls back to OCR for pages that need it." `fast`: embedded text only, fails on scanned pages. `ocr`: forces OCR on every page.
- `source` per block tells you which path produced it (`native_text` vs `layout_ocr`).
- Hidden text: in `auto` and `fast`, `native_text` blocks come from the embedded text layer, so invisible text can leak. Use `mode: "ocr"` to avoid it. That `ocr` mode ignores the embedded layer is an inference from "forces OCR"; no page mentions hidden text. UNVERIFIED.

### Limits and pricing

- File size 50 MB. Timeout default 30 s, max 300 s. OCR mode on large or scanned PDFs "can be slow"; raise `timeout` or set `maxPages`. Page limit: only `maxPages` max 10000.
- Billing: 1 credit per page for PDFs; `pages`, `blocks`, `pageMarkers` add no cost. Non-PDF pricing is not documented. Dollar price per credit: UNVERIFIED (pricing page not fetched).

---

## 3. Local adapter drift (`packages/fieldwork-sdk/src/adapters/firecrawl/`)

Read `options.ts`, `request.ts`, `shapes.ts` (and the `parseResult` use in `response.ts`).

Matches current docs:

- `FirecrawlPdfParser` and `FirecrawlParseOptions`: `mode` fast|auto|ocr, `maxPages`, `pages`, `blocks`, `pageMarkers` are all correct.
- 50 MB check, `options` part before `file`, multipart, extension-to-media-type check.

Drift and gaps:

1. `timeout` is not sent in `options`. Firecrawl defaults to 30 s (max 300 s), so a scanned or `ocr` PDF will likely time out server-side. This matters for a 2-minute ceiling. Sending it is a missing option, not wrong data.
2. `formats: ["markdown"]` is sent as strings. The OpenAPI schema says an array of `{type}` objects. The guide prose uses strings. Which is accepted is UNVERIFIED; since it is the default, it could simply be left out.
3. `shapes.ts` types `blocks` as `optionalArrayOf(anything)`, so the per-page wrapper `{pageNumber,width,height,status,items[]}` and block fields (`bbox` normalized, `confidence`, `source`, `markdownSpan`) are untyped. Callers get no help.
4. `ParseResponse` has no `numPages` or `totalPages`; they are only reachable through `metadataShape` if that includes them (not checked), so truncation by `maxPages` may be invisible. Adapter should surface `totalPages > numPages`.
5. `FirecrawlParser` (scrape-side) includes `"image"` and `{type:"image"}`. The parse docs list only the `pdf` parser. Not verifiable against these two pages (UNVERIFIED), possibly a scrape-only option.
6. `maxPages` is not range-checked (docs: integer 1 to 10000). Minor.
7. Not exposed: `redactPII`, `json` format, `checkPromptInjection`, `zeroDataRetention`, `skipTlsVerification`. These are omissions rather than drift.
8. Parse is synchronous with no job id, so the repo rule "every asynchronous method accepts `resume`" does not apply here.
