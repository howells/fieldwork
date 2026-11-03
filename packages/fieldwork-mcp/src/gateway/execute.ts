import { FieldworkError } from "@howells/fieldwork-sdk";
import type { CallOptions } from "@howells/fieldwork-sdk";
import { toolError } from "@howells/fieldwork-sdk/tools";
import type { ToolInput, ToolOutput } from "@howells/fieldwork-sdk/tools";
import * as z from "zod/mini";

import type { gatewayCatalog } from "./catalog.js";

export interface GatewayCall {
  agentId: string;
  durationMs: number;
  errorCode?: string;
  /** The redacted message of an unexpected error whose details the client never sees. */
  errorDetail?: string;
  jobId?: string;
  outcome: "success" | "error";
  provider?: string;
  requestId: string;
  tool: string;
  usage?: ToolOutput;
}

export interface CallContext {
  agentId: string;
  requestId: string;
  signal: AbortSignal;
}

interface GatewayResult {
  provider: string;
  result: ToolOutput;
}

const redact = (message: string, secrets: readonly string[]): string => {
  let redacted = message;
  for (const secret of secrets) {
    redacted = redacted.replaceAll(secret, "[redacted]");
  }
  return redacted;
};

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

/** A call is recorded after completion, including a failed selection or validation. */
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
