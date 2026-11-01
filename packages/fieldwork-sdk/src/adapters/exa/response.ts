import * as z from "zod/mini";

import {
  anything,
  arrayOf,
  both,
  looseObject,
  optionalAnyString,
  optionalBoolean,
  optionalId,
  optionalNumber,
  optionalScalar,
  optionalString,
  optionalStringOrNumber,
  optionalStructure,
  Source,
  warningEntry,
  withOriginal,
} from "../../parse.js";

/** What every response reports about its cost and identity. */
const metered = {
  costDollars: looseObject({ total: optionalNumber }),
  requestId: optionalScalar,
};

const Metered = looseObject(metered);

/** A page or search result. */
const Result = looseObject({
  author: optionalString,
  extras: looseObject({
    imageLinks: arrayOf(z.string()),
    links: arrayOf(z.string()),
  }),
  favicon: optionalString,
  highlights: arrayOf(z.string()),
  image: optionalString,
  publishedDate: optionalString,
  score: optionalNumber,
  // The summary is text for a page and may be an object for an extraction.
  summary: z.pipe(
    both(optionalString, anything),
    z.transform(({ first, second }) => ({ text: first, value: second }))
  ),
  text: optionalString,
  title: optionalString,
  url: optionalString,
});

/** The status of one URL of a `/contents` call. `status` is kept as it arrived, since anything but `success` counts as a failure. */
const UrlStatus = looseObject({
  error: looseObject({ httpStatusCode: optionalNumber, tag: optionalString }),
  id: optionalString,
  status: z.pipe(
    both(anything, optionalString),
    z.transform(({ first, second }) => ({ text: second, value: first }))
  ),
});

/** `/contents`. Each result keeps its own entry as it arrived. */
export const ContentsResponse = looseObject({
  ...metered,
  results: arrayOf(withOriginal(Result)),
  statuses: arrayOf(UrlStatus),
});

/** A generated answer: text, or the structured value the output schema asked for. */
export const AnswerResponse = looseObject({
  ...metered,
  answer: z.pipe(
    both(optionalString, optionalStructure),
    z.transform(({ first, second }) => ({ structure: second, text: first }))
  ),
  citations: arrayOf(Source),
});

/** A string, or any other value kept as it arrived. */
const Content = z.pipe(
  both(optionalAnyString, anything),
  z.transform(({ first, second }) => ({ text: first, value: second }))
);

/** `/search`. */
export const SearchResponse = looseObject({
  ...metered,
  notices: arrayOf(warningEntry),
  output: looseObject({ content: Content }),
  results: arrayOf(Result),
  warnings: arrayOf(warningEntry),
});

const Grounding = looseObject({
  citations: arrayOf(Source),
  confidence: optionalStringOrNumber,
  field: optionalString,
});

/** An agent run, as started, polled or resumed. */
const Run = looseObject({
  ...metered,
  error: looseObject({
    code: optionalString,
    message: optionalString,
    type: optionalString,
  }),
  output: looseObject({
    grounding: arrayOf(Grounding),
    structured: anything,
    text: optionalString,
  }),
  request: looseObject({ outputSchema: anything }),
  status: optionalString,
  stopReason: optionalString,
  usage: looseObject({
    agentComputeUnits: optionalNumber,
    emails: optionalNumber,
    phoneNumbers: optionalNumber,
    searches: optionalNumber,
  }),
});

/** A run beside the response as it arrived. */
export const RunEntry = withOriginal(Run);

/** The reply to starting a run. */
export const RunStart = looseObject({ id: withOriginal(optionalId) });

const Monitor = looseObject({
  createdAt: optionalString,
  id: withOriginal(optionalId),
  search: looseObject({ query: optionalString }),
  status: optionalString,
  trigger: looseObject({ period: optionalString }),
  webhook: looseObject({ url: optionalString }),
});

/** A monitor beside the entry as it arrived. */
export const MonitorEntry = withOriginal(Monitor);

/** One page of monitors. */
export const MonitorsPage = looseObject({
  data: arrayOf(MonitorEntry),
  hasMore: optionalBoolean,
  nextCursor: optionalString,
});

const MonitorRun = looseObject({
  completedAt: optionalString,
  createdAt: optionalString,
  failReason: optionalString,
  id: optionalString,
  output: looseObject({
    content: Content,
    grounding: arrayOf(looseObject({ citations: arrayOf(Source) })),
  }),
  status: optionalString,
});

/** One page of a monitor's runs, each beside its entry as it arrived. */
export const RunsPage = looseObject({
  data: arrayOf(withOriginal(MonitorRun)),
  hasMore: optionalBoolean,
  nextCursor: optionalString,
});

export type SearchBody = z.output<typeof SearchResponse>;
export type ResultBlock = z.output<typeof Result>;
export type ContentsBody = z.output<typeof ContentsResponse>;
export type UrlStatusBlock = z.output<typeof UrlStatus>;
export type MeteredBody = z.output<typeof Metered>;
export type RunBody = z.output<typeof Run>;
export type RunBlock = z.output<typeof RunEntry>;
export type MonitorBlock = z.output<typeof MonitorEntry>;
export type MonitorRunBlock = z.output<typeof MonitorRun>;
