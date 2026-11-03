import { env } from "node:process";

import { gatewayFromEnvironment } from "@howells/fieldwork-mcp";

export const prerender = false;

let handle: ReturnType<typeof gatewayFromEnvironment> | undefined;

/** Agent-only API routes share one configuration and log metadata only. */
export const ALL = async ({
  request,
}: {
  request: Request;
}): Promise<Response> => {
  try {
    handle ??= gatewayFromEnvironment(env, (entry) => {
      process.stdout.write(
        `${JSON.stringify({ event: "fieldwork.call", ...entry })}\n`
      );
    });
    return await handle(request);
  } catch {
    return Response.json(
      {
        error: {
          code: "ProviderError",
          message: "Fieldwork gateway configuration is unavailable",
          retryable: false,
        },
      },
      { headers: { "cache-control": "no-store" }, status: 503 }
    );
  }
};
