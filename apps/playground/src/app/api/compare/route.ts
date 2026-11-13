import type { CompareEvent } from "@/lib/events";
import { ndjsonResponse } from "@/server/ndjson";
import { CompareRequestSchema } from "@/server/request";
import { runCompare } from "@/server/run-compare";

export const POST = async (request: Request): Promise<Response> => {
  const parsed = CompareRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }
  return ndjsonResponse<CompareEvent>(
    async (emit) => {
      await runCompare(parsed.data, emit, request.signal);
    },
    (message) => ({ message, type: "error" })
  );
};
