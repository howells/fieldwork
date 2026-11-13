# Datalab (Marker/Convert) and LlamaParse v2: API contract

Checked 2026-11-03 from official docs. No provider API was called. Docs were fetched as markdown (`.md` / `llms-full.txt` / `openapi.json`). Where a fetch tool summarised a page, I re-read the raw text with grep before relying on it. Anything marked UNVERIFIED was not confirmed on an official page.

## Short answers for the use case

| Need | Datalab | LlamaParse v2 |
| --- | --- | --- |
| Per-element boxes | `json` output has blocks with `bbox` (block_type "Table" shown in docs). Units, origin, format and polygon are NOT documented. UNVERIFIED | `items[].bbox`: array of `{x,y,w,h,r?}`, page points, top-left origin. Fully documented. |
| Word boxes | `word_bboxes=true` (+$3/1k), emitted ONLY as HTML `<span data-bbox data-confidence>`. Not in the JSON. | `output_options.granular_bboxes: ["word","line","cell"]`, in a `grounded_items` JSONL sidecar. Also `raw_words` via `additional_outputs: ["word_bbox"]`. |
| Table cell boxes | `extras=table_cell_bboxes`, HTML `data-bbox` on `td`/`th`/`tr`/`col` | `granular_bboxes` includes `"cell"`: `grounding.rows[r][c].bbox`, plus `row_bboxes`, `column_bboxes` |
| Merged cells | Table rec "handles rowspans and colspans" (changelog). HTML has them; JSON cell shape UNVERIFIED | `html` keeps `colspan`/`rowspan`. `rows` is a flat 2-D array of strings with no spans. |
| Force OCR / skip text layer | None. `force_ocr` and `strip_existing_ocr` are DEPRECATED, no effect, and absent from `/convert`. | None. Only `ignore_hidden_text`, `ignore_diagonal_text`, `ignore_text_in_image`. |
| Hidden-text defence | No documented option. Uses the text layer on born-digital pages (lite says so). | `processing_options.ignore.ignore_hidden_text` ("White-on-white or CSS-hidden text") |
| Resumable job id | `request_id`, poll `request_check_url` | `id` (`job.id`), poll `GET /api/v2/parse/{id}` |
| 20 MB / 2 min on Vercel | 200 MB cap. No documented timeout. | 512 MB cap. Job timeout configurable (see below). |

## DATALAB

### 1. Endpoints and flow

- Base `https://www.datalab.to/api/v1/`. Source: https://documentation.datalab.to/docs/welcome/api.md
- Submit: `POST /api/v1/convert`, `multipart/form-data`, field `file` (binary) OR `file_url` (http/https string). Source: https://documentation.datalab.to/api-reference/convert-document.md
- Presigned alternative: `POST /api/v1/files/upload` with JSON `{filename, content_type}` returns `file_id`, `upload_url`, `reference` (`datalab://file-...`). Then `PUT upload_url` with the raw bytes, then `GET /api/v1/files/{file_id}/confirm`. Source: api.md above. How `reference` is passed to `/convert` is UNVERIFIED.
- Always async. The submit response is `{success, error, request_id, request_check_url, versions, checkpoint_reused}`. Job id field: `request_id`. Source: convert-document.md
- Poll: `GET /api/v1/convert/{request_id}` (= `request_check_url`). Source: https://documentation.datalab.to/api-reference/convert-result-check.md
- Statuses: `processing`, `complete`, `failed` (api.md). The result-check page names only `complete`.
- Poll response (`MarkerFinalResponse`): `status`, `success`, `error`, `progress_percent`, `markdown`, `html`, `json`, `chunks`, `images` ({filename: base64}), `metadata`, `page_count`, `parse_quality_score`, `cost_breakdown`, `runtime`, `checkpoint_id`, `result_url` (signed URL), `expires_in`, `versions`.
  - Do not use `progress_percent` as a completion signal. Use `status` and `success`.
- Webhooks: `webhook_url` per request, or a single account-level one. Source: https://documentation.datalab.to/platform/webhooks.md
  - Payload: `{request_id, request_check_url, webhook_secret}`.
  - There is no HMAC. The secret is sent in the body in plaintext.
  - Retries happen on 5xx and timeouts, not on 4xx. The wait is 30 s. Duplicates are possible.
  - There is no status or event field. Fetch `request_check_url` to learn the outcome.
- Retention: "Results are deleted from Datalab servers about one day after processing completes". `DELETE /api/v1/results/{request_id}` deletes sooner. Source: api.md. A deleted or expired result returns 404.
- Resumable: poll by `request_id` from any process. `save_checkpoint=true` returns a `checkpoint_id` for later `/extract` or `/segment`.

### 2. Auth

`X-API-Key: <key>` header. Source: api.md. (An older Datalab example in the docs uses the same header.)

### 3. Output shape (`output_format=json`)

Documented:

- `output_format` is one of `markdown`, `html`, `json`, `chunks`. Comma-separate for several. Default `markdown`.
- The `json` result field is "Block-level structure with bounding boxes". Source: https://documentation.datalab.to/llms-full.txt (conversion section) and https://documentation.datalab.to/docs/recipes/conversion/conversion-api-overview.md
- The only schema evidence is a docs migration snippet (llms-full.txt, "Table Recognition -> Document Conversion"):
  ```python
  for block in result.json.get("children", []):
      if block.get("block_type") == "Table":
          print(block['id']); print(block['bbox'])   # cells in block['children']
  ```
  So: a root with `children`; each block has `id`, `block_type`, `bbox`, and `children`.
- `PageHeader` and `PageFooter` blocks are always present in `json` and `chunks`. They are omitted from markdown and HTML unless `additional_config` sets `keep_pageheader_in_output` or `keep_pagefooter_in_output`.
- `add_block_ids=true` adds `data-block-id` to HTML for citations.
- `include_markdown_in_chunks` adds a markdown field.
- `extras=new_block_types` adds chemistry, handwriting and signature blocks. No block-type list is given.
- UNVERIFIED (not on any official page I could fetch): the full block_type list, `polygon` in convert JSON, `html` field per block, the page field and its base inside blocks, and the bbox units, origin and order. No JSON example is published. `bbox` and `polygon` appear in docs only for the deprecated `/ocr` endpoint. A real response must be captured to settle this.
- Page numbering is 0-based for `page_range` (e.g. `"0-5,10"`), `failed_pages` and bookmark pages. Source: conversion-api-overview.md

### `word_bboxes` and cell/list boxes

- `word_bboxes=true`: "Predict per-word bounding boxes with confidence scores". Each word becomes `<span data-bbox="..." data-confidence="...">` in HTML. Markdown strips them. Source: convert-document.md
- A changelog (llms-full.txt, ~line 10620) says the `metadata.words` JSON array is no longer emitted. Word boxes are exclusively inline in HTML. The bbox string format inside `data-bbox` is UNVERIFIED.
- `extras=table_cell_bboxes`: `<colgroup><col>`, `<tr>`, `<td>`/`<th>` get `data-bbox`/`data-confidence`. `extras=list_item_bboxes`: each `<li>`. These run word prediction internally. Per-word spans appear only if `word_bboxes=true` is also set. `table_row_bboxes` is deprecated.
- Both flags are REST-only or extras. `word_bboxes`, `merge_cross_page` and `processing_location` are not in the SDK `ConvertOptions`.

### 4. Tables

HTML carries `td`/`th`/`tr`/`col` with optional boxes. In JSON, a Table block has cell children (`block['children']`). Merged cells are in the HTML output (the table model "handles rowspans and colspans", changelog 2024-25). JSON cell field names and span attributes are UNVERIFIED. `merge_cross_page=true` (beta, ~$0.50/doc surcharge) rejoins tables split across pages.

### 5. OCR for scans, boxes

- There is no OCR toggle. OCR is "handled automatically by the parsing pipeline". Docs say to use `accurate` for scanned documents. Sources: conversion-api-overview.md, openapi.json (deprecated-parameter descriptions).
- Whether OCR'd text gets word boxes: `word_bboxes` is documented as page-wide ("every word in the document"). No scan-specific statement. Treat as probable but UNVERIFIED for scans.

### 6. Text layer vs OCR, hidden text

- `mode=lite` is "fast CPU OCR that reads born-digital pages from their text layer". Source: convert-document.md
- A changelog says PDF-derived verifiers (text recall, substitution, column-shift, charset, vector-control checks) are on in `accurate` and `balanced`, with auto re-parse. So the embedded text layer is used.
- `force_ocr`, `strip_existing_ocr`, `disable_ocr_math`: all marked "[DEPRECATED] ... no effect" in openapi.json (https://www.datalab.to/openapi.json). They appear only on the deprecated `/marker` body, not on `/convert`. The 2025-01-03 changelog entry that introduced `strip_existing_ocr` is stale.
- Hidden or invisible text: no documented option and no documented statement. Assume it can leak on born-digital PDFs. A post-filter would be needed, e.g. render-vs-text comparison. UNVERIFIED either way.
- `exact_transcription=true` keeps text character-for-character (no correction). `disable_image_extraction` / `disable_image_captions` avoid synthetic content.

### 7. Limits and pricing

Limits: https://documentation.datalab.to/docs/common/limits.md

- File size 200 MB for all types. Max 7,000 pages per request (use `page_range` to split).
- Rate limits: Free 10 req/min and 5 concurrent. Team 200 req/min and 400 concurrent. Over limit returns 429.
- Page concurrency 15,000 per team, checked during processing. A rejected job is not queued. Polling it returns 429.
- Timeouts: none stated. A per-doc 2-minute ceiling must be enforced by our client (poll deadline). UNVERIFIED on the server side.

Pricing per 1,000 pages: https://www.datalab.to/pricing (billing page https://documentation.datalab.to/platform/billing.md only points here)

| Mode              | $/1k pages      |
| ----------------- | --------------- |
| lite              | 0.50            |
| fast and balanced | 4 (shared rate) |
| accurate          | 10              |

Add-ons, per 1k pages:

| Add-on                            | Rate                          |
| --------------------------------- | ----------------------------- |
| word boxes                        | +3                            |
| table cell boxes                  | +6 (includes word prediction) |
| list item boxes                   | +6 (includes word prediction) |
| table cell and list item together | +9                            |

- The pricing page's cost estimator shows +3 for the table/list add-ons while the rate table shows +6. That is a discrepancy on the official page.
- The conversion docs agree on +6 / +6 / +9. A stale line in llms-full.txt says $0.30 per 1k.
- Other modifiers: EU processing +25%. Data-retention opt-in -25%. Startup program -33% (not combinable).
- Free allowance is $20/month on a work email and $10 on a personal one. The Team plan is $400/month.

### 8. Modes and options worth exposing

- `mode`: `lite | fast | balanced | accurate`. The default conflicts between pages: api.md and the SDK table say `fast`, the API reference says `balanced`. Always send `mode` explicitly.
- `output_format`, `page_range` (0-based) / `max_pages`, `word_bboxes`, `extras` (`table_cell_bboxes`, `list_item_bboxes`, `extract_links`, `extract_bookmarks`, `new_block_types`), `add_block_ids`, `paginate`, `merge_cross_page`, `exact_transcription`, `disable_image_extraction`, `disable_image_captions`, `skip_cache`, `save_checkpoint`, `webhook_url`, `processing_location`, `additional_config` (`keep_pageheader_in_output`, `keep_pagefooter_in_output`).
- The Datalab docs index at https://documentation.datalab.to/llms.txt lists every page.

## LLAMAPARSE v2

### 1. Endpoints and flow

- Base `https://api.cloud.llamaindex.ai`. Source: https://developers.llamaindex.ai/llamaparse/parse/guides/api-reference/index.md and https://developers.llamaindex.ai/llamaparse/parse/getting_started/
- Upload: `POST /api/v1/beta/files`, multipart with `file` and `purpose`. `purpose` is one of `user_data, parse, extract, classify, split, sheet, agent_app`. Returns `id` (e.g. `dfl-...`), `name`, `project_id`, `download_url`, `expires_at`, `external_file_id`, `file_type`, `purpose`. Optional query params `organization_id`, `project_id`. Source: https://developers.llamaindex.ai/reference/resources/files/methods/create/index.md
- Create job: `POST /api/v2/parse` with JSON `{"file_id": "...", "tier": "agentic", "version": "latest"}`. `source_url` can replace `file_id`. Exactly one of the two is required. Returns top-level `id`, `project_id`, `status` (`PENDING`), `tier`.
- One-shot: `POST /api/v2/parse/upload`, multipart with `file` and `configuration` (JSON string). That makes the separate upload step optional.
- Poll: `GET /api/v2/parse/{job_id}?expand=...`. The response is wrapped: read `job.status`, `job.id`, `job.error_message`, `job.usage.credits`. The top-level `.status` is empty on GET.
- Also: `GET /api/v2/parse` lists jobs (`page_size`, `page_token`, `status`; returns `items`, `next_page_token`, `total_size`). The reference also lists cancel, delete and list_versions.
- Statuses: `PENDING, RUNNING, COMPLETED, FAILED, CANCELLED`. Webhook events: `parse.pending|success|error|partial_success|cancelled`.
- Config nests in the body. A top-level `max_pages` gives `422 extra_forbidden`.
- Resumable: poll by `id`. `expand` is a query parameter, not a body field.
- Expand values, from https://developers.llamaindex.ai/llamaparse/parse/guides/retrieving-results/index.md:
  - Inline: `markdown, markdown_full, text, text_full, items, metadata, forms` (beta; needs `processing_options.forms: "enrich"`; not on `fast`), `job_metadata, usage`.
  - Download URLs, returned under `result_content_metadata` with a presigned `presigned_url`: `markdown_content_metadata, markdown_full_content_metadata, text_content_metadata, text_full_content_metadata, items_content_metadata, metadata_content_metadata, forms_content_metadata, images_content_metadata, xlsx_content_metadata, output_pdf_content_metadata, raw_words_content_metadata` (word boxes, JSONL).
  - `grounded_items` is added automatically when `granular_bboxes` is set.
  - Combine with commas: `?expand=markdown,items,images_content_metadata`.
- Webhooks (https://developers.llamaindex.ai/llamaparse/general/webhooks/index.md): `webhook_configurations: [{webhook_url, webhook_signing_secret, webhook_headers, webhook_events, webhook_output_format}]`. Signed payloads and retries with exponential backoff. The signing header and algorithm details were not read. UNVERIFIED.
- Retention (https://developers.llamaindex.ai/llamaparse/general/data_retention/index.md):
  - Parse cache 48 h (re-parse of the same file and options is free; `disable_cache: true` forces a fresh run).
  - Uploaded source files (Parse) 48 h.
  - Job results: "Not published". A 404 on a known job id means it expired.
  - Presigned URLs: limited time, not published. Re-fetch for fresh URLs.
  - Files with `expires_at` unset are retained until deleted (storage billed).

### 2. Auth

`Authorization: Bearer $LLAMA_CLOUD_API_KEY` on every endpoint. Optional Enterprise header `Usage-Tags`. Source: api-reference.md

### 3. Output shape

Sources: https://developers.llamaindex.ai/llamaparse/parse/guides/response-format/index.md, .../features/layout-and-bounding-boxes/index.md, .../examples/parse_granular_bboxes/index.md

`items.pages[]`: `page_number` (1-based), `page_width`, `page_height` (points), `success`, `items[]` (reading order), `error` on failure, `revisions` (only with `annotate_revisions`).

Every item has `type`, `md`, `bbox` (an array of boxes, or `null`).

| `type` | Extra fields |
| --- | --- |
| `text` | `value` |
| `heading` | `level` (1-6), `value` |
| `table` | `rows`, `html`, `csv`, `merged_from_pages`, `merged_into_page`, `parse_concerns` |
| `image` | `url`, `caption` |
| `list` | `ordered`, `items` (nested) |
| `code` | `value`, `language` |
| `link` | `text`, `url` |
| `header` / `footer` | `items` (a container) |

Examples quoted from the docs:

```json
{ "type": "heading", "level": 1, "value": "Document Title", "md": "# Document Title", "bbox": [ { "x": 72.0, "y": 60.0, "w": 300.0, "h": 24.0 } ] }
{ "type": "table", "rows": [["Header1","Header2"],["Row1","Data1"]], "html": "<table>...</table>", "csv": "Header1,Header2\nRow1,Data1", "md": "| Header1 | Header2 |\n|---|---|..." }
```

Bounding box:

- Fields: `x, y, w, h`, optional `r` (clockwise rotation, degrees, about the box centre), `label`, `confidence`, `start_index`, `end_index`.
- Units: page points ("not pixels and not normalized"; US Letter = 612 x 792). The frame is the page's `page_width` x `page_height`.
- Origin: top-left corner, `x` right, `y` down. Apply only `r`. Page `/Rotate` and `original_orientation_angle` are already composed in.
- One element can have several boxes (wrapped paragraphs).
- Spans are `[start, end)` UTF-8 byte offsets into `md` (or the caption).

Granular grounding (`output_options.granular_bboxes`; sidecar JSONL, one row per page, at `result_content_metadata.grounded_items`):

```json
{
  "span": [0, 11],
  "bbox": { "x": 72.0, "y": 100.0, "w": 200.0, "h": 12.0 },
  "words": [
    { "span": [0, 5], "bbox": { "x": 72.0, "y": 100.0, "w": 35.0, "h": 12.0 } }
  ]
}
```

This is `items[].grounding.lines[]` with `source: "md"|"caption"`.

Bbox cost: the layout and bounding-box page says nothing about cost. Item-level `bbox` is documented as part of the normal `items` expand on every non-`fast`-legacy job.

- The pricing page (https://developers.llamaindex.ai/llamaparse/general/pricing/index.md) has "Layout extraction: +3 credits per page (can be added to any tier)". It appears in both the v2 tier table and the legacy modes table, and is not tied to bboxes anywhere.
- Whether v2 charges +3 for granular boxes or items boxes is UNVERIFIED. Check `expand=usage` (`job.usage.credits`) on a test job before assuming.

### 4. Tables

- `rows` is a 2-D array. A cell is a string, a number or null. There is no separate `cells` field and no header flag.
- Merged cells exist only in `html` (`colspan`/`rowspan`). `md` and `rows` cannot express them.
- Cell boxes need `granular_bboxes` containing `"cell"`: `grounding.rows[row][col]` has `bbox` (array), `span`, `lines`, or null for a missing cell. Also `row_bboxes` and `column_bboxes`.
- `parse_concerns` flags quality problems (e.g. `inconsistent_row_cell_count`, `scanned_page_table`, `header_row_in_body`).
- `output_options.markdown.tables.merge_continued_tables` joins tables across pages (`merged_from_pages`, `merged_into_page`).

### 5. OCR for scans, boxes

- Scanned pages are listed under `agentic` ("tables, scanned pages, multi-column layouts"). Source: .../guides/tiers/index.md
- `ocr_parameters.languages` affects only text from images.
- `v1 -> v2` migration: `high_res_ocr` and `precise_bounding_box` are always on in v2. Source: .../guides/migration-v1-to-v2/index.md
- Word and line boxes on scanned pages come through the same `granular_bboxes` path. No scan-specific box guarantee is stated, so I treat it as UNVERIFIED for scans.
- Watermarks: `output_options.watermark_handling` (`move_to_end` default, `move_to_start`, `remove`), version >= `2026-09-28`, ignored on `fast`.

### 6. Text layer vs OCR, hidden text

- The docs state the text output "comes from the PDF's text layer". `ocr_parameters.languages`: "native text in born-digital PDFs is read directly". Source: .../guides/configuring-parse/index.md
- `processing_options.ignore`:

| Option                 | What it ignores                           |
| ---------------------- | ----------------------------------------- |
| `ignore_hidden_text`   | "White-on-white or CSS-hidden text"       |
| `ignore_diagonal_text` | rotated text from the PDF text layer      |
| `ignore_text_in_image` | "Low-quality OCR text in embedded images" |

- There is no option to force OCR or skip the text layer. `ignore_hidden_text` is the only direct control for the leak risk. How it detects hidden text (colour, clipping, render mode 3) is not documented. Test with a crafted PDF.
- `fast` runs no AI model ("reads text only"). Per-tier text-layer behaviour is otherwise not stated.

### 7. Limits and pricing

Limits: https://developers.llamaindex.ai/llamaparse/general/limitations/index.md

- Max file 512 MB. 10,000 pages after page selection (default).
- Over the size limit gives `413` or `400`.
- Per page: the 35 largest images are extracted and text beyond 64 KB is dropped, silently.
- Timeout = `processing_control.timeouts.base_in_seconds` + `extra_time_per_page_in_seconds` x pages. Base cap 7,200 s, per-page extra cap 300 s. Over run gives `TIMEOUT` or `JOB_EXPIRE`. The default value is not stated. So the 2-minute ceiling can be set by us (e.g. `base_in_seconds: 120`, `extra_time_per_page_in_seconds` small). Whether the minimum allowed is that low is UNVERIFIED.
- Webhooks: 10 endpoints per job. Rate limits page: https://developers.llamaindex.ai/llamaparse/general/rate_limits (numbers not read).

Pricing (credit = $1.25 per 1,000 credits; the $/1k pages column is my arithmetic):

| Tier           | Credits/page | $/1k pages |
| -------------- | ------------ | ---------- |
| fast           | 1            | 1.25       |
| cost_effective | 3            | 3.75       |
| agentic        | 10           | 12.50      |
| agentic_plus   | 45           | 56.25      |

Add-ons: layout extraction +3 credits/page ($3.75/1k) (see the bbox note above), enriched forms +10 per form page, spreadsheet 1 per sheet. Cache re-parse in 48 h is free.

### 8. Tiers and options worth exposing

- Required: `tier` (`fast | cost_effective | agentic | agentic_plus`) and `version` (a dated string or `"latest"`).
- Doc inconsistency: the tiers page says current `fast` returns markdown and items. The granular-bbox example page says `fast` has no item-level layout, so granular grounding is unavailable there. Treat `fast` as unusable for boxes.
- `fast` also rejects `agentic_options` and `forms`.
- Options: `page_ranges` (`max_pages`, `target_pages` 1-based), `crop_box`, `disable_cache`, `processing_control` (`timeouts`, `job_failure_conditions`), `webhook_configurations`, `user_metadata`, `agentic_options.custom_prompt`, `output_options` (`granular_bboxes`, `additional_outputs: ["word_bbox"]`, `images_to_save`, `markdown.tables.*`, `watermark_handling`, `extract_printed_page_number`), `processing_options` (`ignore.*`, `ocr_parameters.languages`, `cost_optimizer.enable`, `confidence_score_effort`, `specialized_chart_parsing`, `forms`).
- `metadata.pages[]` has per-page `confidence` (0-1) and `printed_page_number`.

## Open items to settle with a real (paid) response, if approved

1. Datalab JSON block shape: field names, bbox order and units, polygon, page field, table cell children, scans.
2. Datalab `data-bbox` string format, and whether the numbers are pixels or points.
3. Whether either parser drops invisible text (Datalab: no option; LlamaParse: `ignore_hidden_text` behaviour).
4. LlamaParse: whether granular bboxes or items boxes cost extra credits (+3?), via `expand=usage`.
5. LlamaParse: minimum `processing_control.timeouts` and default job time on a 20 MB file.
6. Datalab: how to pass a presigned-upload `reference` to `/convert`, and typical latency of `fast` vs `accurate` on 20 MB.
