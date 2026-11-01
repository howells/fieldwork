import * as z from "zod/mini";

import {
  anything,
  arrayOf,
  looseObject,
  optionalId,
  optionalNumber,
  optionalScalar,
  optionalString,
  withOriginal,
} from "../../parse.js";
import type { ImageResult } from "../../types.js";
import { compact } from "../../util.js";

/** What a response reports about its own cost: the credits used, the id and the time taken. */
const usageShape = {
  request_id: optionalScalar,
  response_time: optionalNumber,
  usage: looseObject({ credits: optionalNumber }),
};

const Metered = looseObject(usageShape);

/** An image: a bare URL, or an object with a URL and a description. Anything else, or one without a URL, reads as undefined. */
const Image = z.union([
  z.pipe(
    z.string(),
    z.transform((url): ImageResult | undefined =>
      url === "" ? undefined : { url }
    )
  ),
  z.pipe(
    looseObject({ description: optionalString, url: optionalString }),
    z.transform((image): ImageResult | undefined =>
      image.url === undefined
        ? undefined
        : compact({ description: image.description, url: image.url })
    )
  ),
]);

const SearchResult = looseObject({
  content: optionalString,
  favicon: optionalString,
  published_date: optionalString,
  raw_content: optionalString,
  score: optionalNumber,
  title: optionalString,
  url: optionalString,
});

/** `/search`, whole or as the part of an answer, image or search call. */
export const SearchResponse = looseObject({
  ...usageShape,
  answer: optionalString,
  images: arrayOf(Image),
  results: arrayOf(SearchResult),
});

const PageResult = looseObject({
  favicon: optionalString,
  images: arrayOf(z.string()),
  raw_content: optionalString,
  url: optionalString,
});

const FailedResult = looseObject({
  error: optionalString,
  url: optionalString,
});

/** `/crawl`, and `/extract` for one URL or several. Each page keeps its own entry as it arrived. */
export const PagesResponse = looseObject({
  ...usageShape,
  failed_results: arrayOf(FailedResult),
  results: arrayOf(withOriginal(PageResult)),
});

/** `/map`: the links are bare strings. */
export const MapResponse = looseObject({
  ...usageShape,
  results: arrayOf(z.string()),
});

/** The reply to starting a research task. */
export const ResearchStart = looseObject({
  request_id: withOriginal(optionalId),
});

/** A research task while it runs and when it is done. `content` is the report, or the object the output schema asked for. */
export const ResearchRun = looseObject({
  ...usageShape,
  content: anything,
  sources: arrayOf(looseObject({ title: optionalString, url: optionalString })),
  status: optionalString,
});

/** `/usage`. */
export const UsageResponse = looseObject({
  account: looseObject({
    crawl_usage: optionalNumber,
    extract_usage: optionalNumber,
    map_usage: optionalNumber,
    paygo_usage: optionalNumber,
    plan_limit: optionalNumber,
    plan_usage: optionalNumber,
    research_usage: optionalNumber,
    search_usage: optionalNumber,
  }),
  key: looseObject({ usage: optionalNumber }),
});

export type SearchBody = z.output<typeof SearchResponse>;
export type SearchResultBlock = z.output<typeof SearchResult>;
export type PageBlock = z.output<typeof PageResult>;
export type PagesBody = z.output<typeof PagesResponse>;
export type PageEntry = PagesBody["results"][number];
export type FailedBlock = z.output<typeof FailedResult>;
export type MeteredBody = z.output<typeof Metered>;
