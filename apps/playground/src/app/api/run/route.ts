import type { RunEvent } from "@/lib/events";
import { ndjsonResponse } from "@/server/ndjson";
import { RunRequestSchema } from "@/server/request";
import { runAgent } from "@/server/run-agent";

export const POST = async (request: Request): Promise<Response> => {
  const parsed = RunRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }
  return ndjsonResponse<RunEvent>(
    async (emit) => {
      await runAgent(parsed.data, emit, request.signal);
    },
    (message) => ({ message, type: "error" })
  );
};
