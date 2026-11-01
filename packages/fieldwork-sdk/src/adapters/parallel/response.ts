import * as z from "zod/mini";

import {
  anything,
  arrayOf,
  both,
  looseObject,
  optionalAnyString,
  optionalId,
  optionalNumber,
  optionalScalar,
  optionalString,
  optionalStructure,
  recordOf,
  Source,
  sourceShape,
  warnings,
  withOriginal,
} from "../../parse.js";

/** What a result says about the evidence for a field. */
const Basis = looseObject({
  citations: arrayOf(Source),
  confidence: optionalString,
  field: optionalString,
  reasoning: optionalString,
});

/** The units a call used, one entry per kind. */
const Usage = arrayOf(
  looseObject({ count: optionalNumber, name: optionalString })
);

/** A string, an object or an array as it arrived, told apart. */
const Content = z.pipe(
  both(optionalAnyString, optionalStructure),
  z.transform(({ first, second }) => ({ structure: second, text: first }))
);

/** `/v1/search`. */
export const SearchResponse = looseObject({
  results: arrayOf(
    looseObject({
      excerpts: arrayOf(z.string()),
      publish_date: optionalString,
      title: optionalString,
      url: optionalString,
    })
  ),
  search_id: optionalScalar,
  usage: Usage,
  warnings,
});

/** `/v1/images/search`. */
export const ImagesResponse = looseObject({
  results: arrayOf(
    looseObject({
      height: optionalNumber,
      image_url: optionalString,
      source_page_url: optionalString,
      title: optionalString,
      width: optionalNumber,
    })
  ),
  search_id: optionalScalar,
  usage: Usage,
  warnings,
});

const ExtractResult = looseObject({
  excerpts: arrayOf(z.string()),
  full_content: optionalString,
  publish_date: optionalString,
  title: optionalString,
  url: optionalString,
});

/** `/v1/extract`. Each result keeps its own entry as it arrived. */
export const ExtractResponse = looseObject({
  errors: arrayOf(
    looseObject({
      content: optionalString,
      error_type: optionalString,
      http_status_code: optionalNumber,
      url: optionalString,
    })
  ),
  extract_id: z.pipe(
    both(optionalString, optionalScalar),
    z.transform(({ first, second }) => ({ id: second, text: first }))
  ),
  results: arrayOf(withOriginal(ExtractResult)),
  usage: Usage,
  warnings,
});

/** `/v1/responses`: the ids are read as text (a continuation id) and as a request id. */
export const AnswerResponse = looseObject({
  error: looseObject({ message: optionalString }),
  id: z.pipe(
    both(optionalString, optionalScalar),
    z.transform(({ first, second }) => ({ request: second, text: first }))
  ),
  incomplete_details: looseObject({ reason: optionalString }),
  output: arrayOf(
    looseObject({
      content: arrayOf(
        looseObject({
          annotations: arrayOf(
            looseObject({ ...sourceShape, type: optionalString })
          ),
          text: optionalString,
          type: optionalString,
        })
      ),
      phase: optionalString,
      type: optionalString,
    })
  ),
  status: optionalString,
  usage: looseObject({
    input_tokens: optionalNumber,
    output_tokens: optionalNumber,
    total_tokens: optionalNumber,
  }),
});

const Decision = looseObject({
  choice: optionalString,
  confidence: optionalNumber,
  noul: optionalNumber,
  probabilities: recordOf(optionalNumber),
  type: optionalString,
});

/** `/v1/decisions`. */
export const DecisionsResponse = looseObject({
  answers: recordOf(Decision),
  citations: arrayOf(Source),
  decision_id: optionalScalar,
  usage: looseObject({ input_tokens: optionalNumber }),
});

/** The reply to starting a task run. */
export const TaskStart = looseObject({ run_id: withOriginal(optionalId) });

/** A task run while it is polled. */
export const TaskRun = withOriginal(
  looseObject({
    error: looseObject({ message: optionalString }),
    status: optionalString,
    warnings: arrayOf(looseObject({ message: optionalString })),
  })
);

/** A finished task run's result, beside the response as it arrived. */
export const TaskResult = withOriginal(
  looseObject({
    output: looseObject({ basis: arrayOf(Basis), content: anything }),
    run: looseObject({
      interaction_id: optionalString,
      run_id: optionalScalar,
      warnings,
    }),
  })
);

/** The reply to starting a FindAll run. */
export const FindAllStart = looseObject({
  findall_id: withOriginal(optionalId),
});

/** A FindAll run while it is polled. */
export const FindAllRun = withOriginal(
  looseObject({ status: looseObject({ status: optionalString }) })
);

const Candidate = looseObject({
  basis: arrayOf(Basis),
  description: optionalString,
  match_status: optionalString,
  name: optionalString,
  output: recordOf(looseObject({ type: optionalString, value: anything })),
  url: optionalString,
});

/** A finished FindAll run's result, beside the response as it arrived. */
export const FindAllResult = withOriginal(
  looseObject({
    candidates: arrayOf(Candidate),
    run: looseObject({
      status: looseObject({
        metrics: looseObject({
          generated_candidates_count: optionalNumber,
          matched_candidates_count: optionalNumber,
        }),
        status: optionalString,
        termination_reason: optionalString,
      }),
    }),
  })
);

/** A monitor beside the entry as it arrived. */
export const MonitorEntry = withOriginal(
  looseObject({
    created_at: optionalString,
    frequency: optionalString,
    monitor_id: withOriginal(optionalId),
    settings: looseObject({ query: optionalString }),
    status: optionalString,
    webhook: looseObject({ url: optionalString }),
  })
);

/** One page of monitors. */
export const MonitorsPage = looseObject({
  monitors: arrayOf(MonitorEntry),
  next_cursor: optionalString,
});

const EventOutput = looseObject({ basis: arrayOf(Basis), content: Content });

/** One page of a monitor's events, each beside its entry as it arrived. */
export const EventsPage = looseObject({
  events: arrayOf(
    withOriginal(
      looseObject({
        changed_output: EventOutput,
        error_message: optionalString,
        event_date: optionalString,
        event_id: optionalString,
        event_type: optionalString,
        output: EventOutput,
        timestamp: optionalString,
      })
    )
  ),
  next_cursor: optionalString,
});

export type BasisBlock = z.output<typeof Basis>;
export type UsageBlock = z.output<typeof Usage>;
export type AnswerBody = z.output<typeof AnswerResponse>;
export type ExtractBody = z.output<typeof ExtractResponse>;
export type ExtractResultBlock = z.output<typeof ExtractResult>;
export type ExtractErrorBlock = ExtractBody["errors"][number];
export type DecisionBlock = z.output<typeof Decision>;
export type TaskRunBlock = z.output<typeof TaskRun>;
export type TaskResultBlock = z.output<typeof TaskResult>;
export type FindAllResultBlock = z.output<typeof FindAllResult>;
export type CandidateBlock = z.output<typeof Candidate>;
export type MonitorBlock = z.output<typeof MonitorEntry>;
export type EventsBlock = z.output<typeof EventsPage>["events"][number];
