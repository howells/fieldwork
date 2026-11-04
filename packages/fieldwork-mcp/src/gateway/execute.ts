// Runs one tool call for the gateway: validates the gateway's own fields, selects
// the provider, enforces the deadline, redacts errors and records the call.
// http.ts and mcp.ts both call it, so the JSON API and MCP behave the same.

import { FieldworkError } from "@howells/fieldwork-sdk";
import type { CallOptions } from "@howells/fieldwork-sdk";
import { toolError } from "@howells/fieldwork-sdk/tools";
import type { ToolInput, ToolOutput } from "@howells/fieldwork-sdk/tools";
import * as z from "zod/mini";

import type { gatewayCatalog } from "./catalog.js";

/**
 * The log entry for one tool call, given to `onCall` when it ends. It holds who
 * called, what ran and how it ended. It has no field for the input or the
 * result, and `errorDetail` is redacted.
 */
export interface GatewayCall {
  agentId: string;
  /** From the start of validation to the end of the call. */
  durationMs: number;
  errorCode?: string;
  /**
   * The redacted message of an error that was not a `FieldworkError`. The
   * client gets a generic message instead; this is for the operator.
   */
  errorDetail?: string;
  /** The provider job a failed call had already started; resume it rather than repeat the call. */
  jobId?: string;
  outcome: "success" | "error";
  /** Absent when the call failed before a provider was chosen. */
  provider?: string;
  requestId: string;
  tool: string;
  /** What the provider reported it used (`meta.usage` of the result), in its own units. */
  usage?: ToolOutput;
}

/** Who is calling and how to stop the call. */
export interface CallContext {
  /** The authenticated agent. */
  agentId: string;
  /** Also sent to the caller as `x-request-id`. */
  requestId: string;
  /** Aborts when the client goes away. */
  signal: AbortSignal;
}

interface GatewayResult {
  provider: string;
  result: ToolOutput;
}

/** Replaces each secret's exact text. A key a provider echoes re-encoded, such as URL-encoded, is not caught. */
const redact = (message: string, secrets: readonly string[]): string => {
  let redacted = message;
  for (const secret of secrets) {
    redacted = redacted.replaceAll(secret, "[redacted]");
  }
  return redacted;
};

/**
 * The error the client may see. A `FieldworkError` keeps its code, ids and
 * retry hints with a redacted message; its `cause` is dropped. Anything else
 * becomes a fixed `ProviderError`, so the text of an unexpected failure never
 * leaves the process.
 */
const safeError = (
  error: Error | null,
  secrets: readonly string[]
): FieldworkError => {
  if (!(error instanceof FieldworkError)) {
    return new FieldworkError(
      "ProviderError",
      "Fieldwork could not complete the request",
      { retryable: false }
    );
  }
  return new FieldworkError(error.code, redact(error.message, secrets), {
    jobId: error.jobId,
    provider: error.provider,
    retryAfter: error.retryAfter,
    retryable: error.retryable,
    status: error.status,
  });
};

const Input = z.record(z.string(), z.json());
const Provider = z.optional(z.string());
const Usage = z.object({
  meta: z.optional(
    z.object({ usage: z.optional(z.record(z.string(), z.json())) })
  ),
});

/** Takes the gateway's `provider` and `timeout` out of the input. The tool sees only the rest. */
const settings = (input: ToolInput, maxTimeout: number) => {
  const parsed = z.safeParse(Input, input);
  const values = parsed.success ? parsed.data : undefined;
  const provider = z.safeParse(Provider, values?.provider);
  const timeout = z.safeParse(
    z.optional(z.number().check(z.int(), z.minimum(1), z.maximum(maxTimeout))),
    values?.timeout
  );
  if (values === undefined || !provider.success || !timeout.success) {
    throw new FieldworkError(
      "InvalidRequest",
      `Input must be an object, provider a string, and timeout an integer from 1 to ${maxTimeout}`
    );
  }
  const { provider: _provider, timeout: _timeout, ...args } = values;
  return { args, provider: provider.data, timeout: timeout.data ?? maxTimeout };
};

/**
 * Runs a call and records it. The entry is reported once the call ends, even
 * when the input or provider was refused.
 *
 * The call stops at `timeout` milliseconds (the default is `maxTimeout`), or
 * when the client goes away. When the deadline, not the client, ends a call
 * with a `FieldworkError`, the error becomes `Timeout` and keeps the
 * provider's `jobId`: the job may still be running, and the caller passes
 * `jobId` as `resume` to collect it.
 */
export const gatewayExecutor =
  (
    catalog: ReturnType<typeof gatewayCatalog>,
    maxTimeout: number,
    onCall?: (entry: GatewayCall) => void,
    secrets: readonly string[] = []
  ) =>
  async (
    name: string,
    input: ToolInput,
    context: CallContext
  ): Promise<GatewayResult> => {
    const started = Date.now();
    const entry: GatewayCall = {
      agentId: context.agentId,
      durationMs: 0,
      outcome: "error",
      requestId: context.requestId,
      tool: name,
    };
    try {
      const call = settings(input, maxTimeout);
      const tool = catalog.select(name, call.provider);
      entry.provider = tool.provider;
      const deadline = AbortSignal.timeout(call.timeout);
      const options: CallOptions = {
        signal: AbortSignal.any([context.signal, deadline]),
        timeout: call.timeout,
      };
      let result: ToolOutput;
      try {
        result = await tool.execute(call.args, options);
      } catch (error) {
        if (deadline.aborted && error instanceof FieldworkError) {
          throw new FieldworkError(
            "Timeout",
            "Gateway wait ended; resume jobId when one is returned",
            {
              jobId: error.jobId,
              provider: error.provider,
              retryable: error.retryable,
              status: error.status,
            }
          );
        }
        throw error;
      }
      entry.outcome = "success";
      // A result without readable usage is still a completed, billed call.
      const usage = z.safeParse(Usage, result);
      entry.usage = usage.success ? usage.data.meta?.usage : undefined;
      return { provider: tool.provider, result };
    } catch (error) {
      const detail = toolError(error);
      entry.errorCode = detail.code;
      entry.jobId = "jobId" in detail ? detail.jobId : undefined;
      if (!(error instanceof FieldworkError)) {
        entry.errorDetail = redact(detail.message, secrets);
      }
      throw safeError(error instanceof Error ? error : null, secrets);
    } finally {
      entry.durationMs = Date.now() - started;
      if (onCall !== undefined) {
        onCall(entry);
      } else if (entry.errorDetail !== undefined) {
        process.stderr.write(
          `fieldwork-gateway: ${entry.tool} failed: ${entry.errorDetail}\n`
        );
      }
    }
  };
