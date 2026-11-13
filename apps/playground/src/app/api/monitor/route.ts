// Stops a monitor the agent created: the "Stop" on the watching card.
import { CaughtSchema, describeError } from "@/server/errors";
import {
  deleteMonitor,
  isMonitorProvider,
  usableKeys,
} from "@/server/providers";
import { MonitorRequestSchema } from "@/server/request";

export const DELETE = async (request: Request): Promise<Response> => {
  const parsed = MonitorRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }
  const { id, keys, provider } = parsed.data;
  const usable = usableKeys(keys);
  if (!isMonitorProvider(provider) || !usable.has(provider)) {
    return Response.json(
      { error: `${provider} can't stop monitors here` },
      { status: 400 }
    );
  }
  try {
    await deleteMonitor(provider, usable.get(provider), id);
    return Response.json({ deleted: true, id });
  } catch (error) {
    return Response.json(describeError(CaughtSchema.parse(error)), {
      status: 502,
    });
  }
};
