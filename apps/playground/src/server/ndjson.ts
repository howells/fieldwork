// A response that streams one JSON object per line, written by `produce`.
// An error `produce` throws becomes the last line, as an `error` event.
import { CaughtSchema, describeError } from "./errors";

export type Emit<E> = (event: E) => void;

export const ndjsonResponse = <E>(
  produce: (emit: Emit<E>) => Promise<void>,
  failure: (message: string) => E
): Response => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const emit: Emit<E> = (event) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        await produce(emit);
      } catch (error) {
        emit(failure(describeError(CaughtSchema.parse(error)).message));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/x-ndjson; charset=utf-8",
    },
  });
};
