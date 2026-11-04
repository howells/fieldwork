import { FieldworkError } from "@howells/fieldwork-sdk";
import type { FieldworkErrorCode } from "@howells/fieldwork-sdk";
import * as z from "zod/mini";

/** A transport refusal, before an SDK operation is dispatched. */
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

/** Bounds the bytes actually received; Content-Length alone is not trusted. */
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
