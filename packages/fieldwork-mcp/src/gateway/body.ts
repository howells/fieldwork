// Reads and bounds a request's JSON body, and the error for a request the gateway
// refuses itself. http.ts calls `gatewayBody` after the key check, for POST only.

import { FieldworkError } from "@howells/fieldwork-sdk";
import type { FieldworkErrorCode } from "@howells/fieldwork-sdk";
import * as z from "zod/mini";

/**
 * A refusal the gateway makes itself, before any SDK operation runs: its own
 * HTTP `status` and an SDK `code`. It is never retryable and is not reported
 * to `onCall`.
 */
export class GatewayRejectionError extends Error {
  override readonly name = "GatewayRejectionError";
  readonly status: number;
  readonly code: FieldworkErrorCode;

  constructor(status: number, code: FieldworkErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Reads the body as JSON. It must be `application/json` (415). A declared
 * `Content-Length` over the limit is refused at once (413); the bytes that
 * arrive are counted too, so a missing or false length cannot get past
 * (413). Reading must finish within 5 seconds. Invalid JSON throws
 * `InvalidRequest`. Any JSON value comes back; the executor checks that it is
 * an object.
 */
export const gatewayBody = async (request: Request, maxBytes: number) => {
  const contentType = request.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim();
  if (contentType !== "application/json") {
    throw new GatewayRejectionError(
      415,
      "InvalidRequest",
      "Use Content-Type: application/json"
    );
  }
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) {
    throw new GatewayRejectionError(
      413,
      "InvalidRequest",
      `Request body exceeds ${maxBytes} bytes`
    );
  }
  let received = 0;
  const bounded = request.body?.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk, controller) => {
        received += chunk.byteLength;
        if (received > maxBytes) {
          throw new GatewayRejectionError(
            413,
            "InvalidRequest",
            `Request body exceeds ${maxBytes} bytes`
          );
        }
        controller.enqueue(chunk);
      },
    }),
    { signal: AbortSignal.any([request.signal, AbortSignal.timeout(5000)]) }
  );
  const text = await new Response(bounded).text();
  try {
    return z.parse(z.json(), JSON.parse(text));
  } catch {
    throw new FieldworkError(
      "InvalidRequest",
      "Request body must be valid JSON"
    );
  }
};
