// Runs the Fieldwork agent and turns Mastra's stream into the page's events:
// the agent's text, each tool call with its capability and provider, each
// result with its time and the cost the provider reported, and each model
// step's cost as OpenRouter reported it.
import { z } from "zod";

import { UsageSchema } from "@/lib/events";
import type { RunEvent } from "@/lib/events";
import { mastra } from "@/mastra";
import { runContext } from "@/mastra/context";
import { OpenRouterCostSchema, TokenCountsSchema } from "@/mastra/spend";
import { toolDirectory } from "@/mastra/tools/fieldwork-tools";
import type { ToolDirectory } from "@/mastra/tools/fieldwork-tools";

import { CaughtSchema, describeError } from "./errors";
import type { Emit } from "./ndjson";
import { routedWeb, usableKeys } from "./providers";
import type { RunRequest } from "./request";
import { logSpend } from "./spend-log";

/** Sequential model calls one run may make; each tool round is one. */
const MAX_STEPS = 10;
/** Per model call. Reasoning models spend part of this thinking, so it leaves room for the answer too. */
const MAX_OUTPUT_TOKENS = 4000;
const RUN_TIMEOUT_MS = 300_000;

/** A tool result's `meta.usage`; every SDK tool result is an object. */
const UsageOfSchema = z
  .object({ meta: z.object({ usage: UsageSchema.optional() }).optional() })
  .transform((result) => result.meta?.usage);

const JsonSchema = z.json();

// Mastra returns input that fails a tool's schema as a result, not an error:
// the provider was never called, so it is shown and counted as a failed call.
const RefusedSchema = z.object({ error: z.literal(true), message: z.string() });

interface Call {
  capability: string;
  provider: string;
  started: number;
}

interface RunState {
  calls: Map<string, Call>;
  directory: ToolDirectory;
  emit: Emit<RunEvent>;
  model: string;
}

const elapsed = (call: Call | undefined): number =>
  call === undefined ? 0 : Math.round(performance.now() - call.started);

interface ToolCallPayload {
  args?: object;
  toolCallId: string;
  toolName: string;
}

const onToolCall = (state: RunState, payload: ToolCallPayload): void => {
  const entry = state.directory.get(payload.toolName);
  const call: Call = {
    capability: entry?.capability ?? payload.toolName,
    provider: entry?.provider ?? "unknown",
    started: performance.now(),
  };
  state.calls.set(payload.toolCallId, call);
  state.emit({
    capability: call.capability,
    id: payload.toolCallId,
    input: JsonSchema.parse(payload.args),
    method: entry?.method,
    provider: call.provider,
    tool: payload.toolName,
    type: "call",
  });
};

interface ToolResultPayload {
  isError?: boolean;
  result: unknown;
  toolCallId: string;
  toolName: string;
}

const onToolResult = async (
  state: RunState,
  payload: ToolResultPayload
): Promise<void> => {
  const call = state.calls.get(payload.toolCallId);
  const ms = elapsed(call);
  const refused = RefusedSchema.safeParse(payload.result);
  if (refused.success) {
    state.emit({
      id: payload.toolCallId,
      message: refused.data.message,
      ms,
      type: "call-error",
    });
    return;
  }
  if (payload.isError === true) {
    state.emit({
      ...describeError(CaughtSchema.parse(payload.result)),
      id: payload.toolCallId,
      ms,
      type: "call-error",
    });
    return;
  }
  const usage = UsageOfSchema.parse(payload.result);
  state.emit({
    id: payload.toolCallId,
    ms,
    output: JsonSchema.parse(payload.result),
    type: "result",
    usage,
  });
  await logSpend({
    capability: call?.capability ?? payload.toolName,
    provider: call?.provider ?? "unknown",
    ...usage,
  });
};

interface ToolErrorPayload {
  error: unknown;
  toolCallId: string;
}

const onToolError = (state: RunState, payload: ToolErrorPayload): void => {
  state.emit({
    ...describeError(CaughtSchema.parse(payload.error)),
    id: payload.toolCallId,
    ms: elapsed(state.calls.get(payload.toolCallId)),
    type: "call-error",
  });
};

interface StepFinish {
  metadata: { providerMetadata?: unknown };
  output: { usage: unknown };
  providerMetadata?: unknown;
}

const onStepFinish = async (
  state: RunState,
  payload: StepFinish
): Promise<void> => {
  const spend = {
    // Mastra keeps the model response's provider metadata, where OpenRouter
    // reports the charge, under `metadata`.
    costUsd: OpenRouterCostSchema.parse(
      payload.metadata.providerMetadata ?? payload.providerMetadata
    ),
    ...TokenCountsSchema.parse(payload.output.usage),
  };
  state.emit({ ...spend, type: "model" });
  await logSpend({ capability: "model", provider: state.model, ...spend });
};

export const runAgent = async (
  request: RunRequest,
  emit: Emit<RunEvent>,
  signal: AbortSignal
): Promise<void> => {
  const started = performance.now();
  const { routes, web } = routedWeb(
    usableKeys(request.keys),
    request.preferences
  );
  const state: RunState = {
    calls: new Map(),
    directory: toolDirectory(web),
    emit,
    model: request.model,
  };
  emit({ model: request.model, routes, type: "start" });

  const output = await mastra
    .getAgent("fieldworkAgent")
    .stream(request.messages, {
      abortSignal: signal,
      maxSteps: MAX_STEPS,
      modelSettings: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        timeout: { totalMs: RUN_TIMEOUT_MS },
      },
      requestContext: runContext({ model: request.model, web }),
    });

  let reason = "stop";
  for await (const chunk of output.fullStream) {
    if (chunk.type === "text-delta") {
      emit({ text: chunk.payload.text, type: "text" });
    } else if (chunk.type === "tool-call") {
      onToolCall(state, chunk.payload);
    } else if (chunk.type === "tool-result") {
      await onToolResult(state, chunk.payload);
    } else if (chunk.type === "tool-error") {
      onToolError(state, chunk.payload);
    } else if (chunk.type === "step-finish") {
      await onStepFinish(state, chunk.payload);
    } else if (chunk.type === "finish") {
      ({ reason } = chunk.payload.stepResult);
    } else if (chunk.type === "error") {
      throw CaughtSchema.parse(chunk.payload.error);
    }
  }
  emit({ ms: Math.round(performance.now() - started), reason, type: "done" });
};
