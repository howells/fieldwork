// Schemas for Browserbase's responses. Each reads a response without failing: a missing or mistyped field is absent, not an error.
// The adapter in ../browserbase.ts parses each response with one of them and keeps the untouched response in `raw`.

import type * as z from "zod/mini";

import {
  arrayOf,
  looseObject,
  optionalAnyString,
  optionalNumber,
  optionalScalar,
  optionalId,
  optionalString,
  withOriginal,
} from "../../parse.js";

/** `POST /v1/sessions`. The id keeps the value as it arrived, for the error raised when there is none. */
export const SessionResponse = looseObject({
  connectUrl: optionalString,
  expiresAt: optionalString,
  id: withOriginal(optionalId),
});

/** `GET /v1/sessions/{id}/debug`. */
export const DebugResponse = looseObject({
  debuggerFullscreenUrl: optionalString,
  debuggerUrl: optionalString,
});

/** `POST /v1/fetch`. An empty `content` is kept as it is. */
export const FetchResponse = looseObject({
  content: optionalAnyString,
  contentType: optionalString,
  encoding: optionalString,
  id: optionalScalar,
  statusCode: optionalNumber,
});

/** `POST /v1/search`. */
export const SearchResponse = looseObject({
  requestId: optionalScalar,
  results: arrayOf(
    looseObject({
      author: optionalString,
      favicon: optionalString,
      image: optionalString,
      publishedDate: optionalString,
      title: optionalString,
      url: optionalString,
    })
  ),
});

/** `GET /v1/projects/{id}/usage`. */
export const UsageResponse = looseObject({
  browserMinutes: optionalNumber,
  proxyBytes: optionalNumber,
});

/** `GET /v1/projects`: an array of projects. */
export const ProjectsResponse = arrayOf(
  looseObject({ id: withOriginal(optionalId) })
);

/** The parsed `POST /v1/fetch` body. */
export type FetchBody = z.output<typeof FetchResponse>;
