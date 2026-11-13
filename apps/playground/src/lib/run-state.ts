// One agent run as the page holds it, built up from the streamed events.
// Text between tool calls is kept in order, so the plan the agent writes
// before its first call and the answer it writes after its last stay apart.
import type { Json, RunEvent, Usage } from "./events";

export interface CallState {
  capability: string;
  error?: string;
  id: string;
  input: Json;
  method?: string;
  ms?: number;
  output?: Json;
  provider: string;
  status: "running" | "done" | "failed";
  tool: string;
  usage?: Usage;
}

export type Segment =
  | { kind: "text"; text: string }
  | { id: string; kind: "call" };

export interface RunState {
  calls: Record<string, CallState>;
  error?: string;
  model?: string;
  modelCostUsd: number;
  modelSteps: number;
  ms?: number;
  /** Why the model stopped: "stop" when it finished its answer. */
  reason?: string;
  routes: Record<string, string>;
  segments: Segment[];
  startedAt: number;
  status: "running" | "done" | "failed" | "stopped";
  tokens: number;
}

export const newRun = (startedAt: number): RunState => ({
  calls: {},
  modelCostUsd: 0,
  modelSteps: 0,
  routes: {},
  segments: [],
  startedAt,
  status: "running",
  tokens: 0,
});

const appendText = (segments: Segment[], text: string): Segment[] => {
  const last = segments.at(-1);
  if (last?.kind === "text") {
    return [...segments.slice(0, -1), { kind: "text", text: last.text + text }];
  }
  return [...segments, { kind: "text", text }];
};

const updateCall = (
  run: RunState,
  id: string,
  change: Partial<CallState>
): RunState => {
  const call = run.calls[id];
  return call === undefined
    ? run
    : { ...run, calls: { ...run.calls, [id]: { ...call, ...change } } };
};

export const applyEvent = (run: RunState, event: RunEvent): RunState => {
  switch (event.type) {
    case "start": {
      return { ...run, model: event.model, routes: event.routes };
    }
    case "text": {
      return { ...run, segments: appendText(run.segments, event.text) };
    }
    case "call": {
      const call: CallState = {
        capability: event.capability,
        id: event.id,
        input: event.input,
        method: event.method,
        provider: event.provider,
        status: "running",
        tool: event.tool,
      };
      return {
        ...run,
        calls: { ...run.calls, [event.id]: call },
        segments: [...run.segments, { id: event.id, kind: "call" }],
      };
    }
    case "result": {
      return updateCall(run, event.id, {
        ms: event.ms,
        output: event.output,
        status: "done",
        usage: event.usage,
      });
    }
    case "call-error": {
      return updateCall(run, event.id, {
        error:
          event.code === undefined
            ? event.message
            : `${event.code}: ${event.message}`,
        ms: event.ms,
        status: "failed",
      });
    }
    case "model": {
      return {
        ...run,
        modelCostUsd: run.modelCostUsd + (event.costUsd ?? 0),
        modelSteps: run.modelSteps + 1,
        tokens: run.tokens + event.inputTokens + event.outputTokens,
      };
    }
    case "done": {
      return { ...run, ms: event.ms, reason: event.reason, status: "done" };
    }
    case "error": {
      return { ...run, error: event.message, status: "failed" };
    }
  }
  return run;
};

/** The calls in the order the agent made them. */
export const callsOf = (run: RunState): CallState[] =>
  run.segments.flatMap((segment) => {
    if (segment.kind !== "call") {
      return [];
    }
    const call = run.calls[segment.id];
    return call === undefined ? [] : [call];
  });

/** What the agent wrote before its first tool call: its plan. */
export const planOf = (run: RunState): string | undefined => {
  const [first] = run.segments;
  return first?.kind === "text" && run.segments.length > 1
    ? first.text.trim()
    : undefined;
};

/** What the agent wrote after its last tool call: its answer. */
export const answerOf = (run: RunState): string | undefined => {
  const last = run.segments.at(-1);
  return last?.kind === "text" ? last.text.trim() : undefined;
};

export interface Spend {
  /** Dollars the providers and OpenRouter reported. */
  usd: number;
  /** Credits the providers that bill in credits reported. */
  credits: number;
}

/** Everything the run cost, in the units each side reported. */
export const spendOf = (run: RunState): Spend => {
  const spend: Spend = { credits: 0, usd: run.modelCostUsd };
  for (const call of callsOf(run)) {
    spend.credits += call.usage?.credits ?? 0;
    spend.usd += call.usage?.costUsd ?? 0;
  }
  return spend;
};

/** Text events arrive a few characters at a time; joined, a run keeps far less. */
export const compactEvents = (events: readonly RunEvent[]): RunEvent[] => {
  const compact: RunEvent[] = [];
  for (const event of events) {
    const last = compact.at(-1);
    if (event.type === "text" && last?.type === "text") {
      compact[compact.length - 1] = {
        text: last.text + event.text,
        type: "text",
      };
    } else {
      compact.push(event);
    }
  }
  return compact;
};

/** A run rebuilt from its events, in order. */
export const runOf = (
  events: readonly RunEvent[],
  startedAt: number
): RunState => {
  let run = newRun(startedAt);
  for (const event of events) {
    run = applyEvent(run, event);
  }
  return run;
};
