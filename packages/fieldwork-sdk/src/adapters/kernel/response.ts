// Schemas for Kernel's responses. Each reads a response without failing: a missing or mistyped field is absent, not an error.
// The adapter in ../kernel.ts parses each response with one of them and keeps the untouched response in `raw`.

import {
  anything,
  looseObject,
  optionalAnyString,
  optionalBoolean,
  optionalId,
  optionalNumber,
  optionalObject,
  optionalString,
  withOriginal,
} from "../../parse.js";

/** `POST /browsers`. The id keeps the value as it arrived, for the error raised when there is none. */
export const BrowserResponse = looseObject({
  browser_live_view_url: optionalString,
  cdp_ws_url: optionalString,
  session_id: withOriginal(optionalId),
});

/** `GET /browsers/{id}?include_deleted=true` after deletion: the billed time, once `usage_status` is ready. */
export const DeletedBrowserResponse = looseObject({
  usage: optionalObject({ uptime_ms: optionalNumber }),
  usage_status: optionalString,
});

/** `POST /browsers/{id}/playwright/execute`. `result` is whatever the script returned. */
export const ExecuteResponse = looseObject({
  error: optionalString,
  result: anything,
  stderr: optionalAnyString,
  success: optionalBoolean,
});

/** What the read script returns: the page after it rendered. */
export const RenderedPage = looseObject({
  html: optionalAnyString,
  status: optionalNumber,
  title: optionalString,
  url: optionalString,
});
