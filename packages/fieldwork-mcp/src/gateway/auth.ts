import { createHash, timingSafeEqual } from "node:crypto";

import * as z from "zod/mini";

export interface GatewayAgent {
  id: string;
  apiKey: string;
}

const Agent = z.object({
  apiKey: z.string().check(z.minLength(32), z.regex(/^\S+$/u)),
  id: z.string().check(z.regex(/^[a-z0-9][a-z0-9_-]*$/u)),
});

const digest = (key: string): Buffer =>
  createHash("sha256").update(key).digest();

/** Keeps access-key hashes, never includes a key in an authentication error. */
export const agentAuthenticator = (agents: readonly GatewayAgent[]) => {
  const parsed = z.parse(z.array(Agent), agents);
  if (
    new Set(parsed.map((agent) => agent.id)).size !== parsed.length ||
    new Set(parsed.map((agent) => agent.apiKey)).size !== parsed.length
  ) {
    throw new Error("Gateway agents need distinct IDs and access keys");
  }
  const hashes = parsed.map((agent) => ({
    hash: digest(agent.apiKey),
    id: agent.id,
  }));
  return (request: Request): string | undefined => {
    const match = /^Bearer (?<key>\S+)$/iu.exec(
      request.headers.get("authorization") ?? ""
    );
    const key = match?.groups?.key;
    if (key === undefined) {
      return undefined;
    }
    const hash = digest(key);
    return hashes.find((agent) => timingSafeEqual(hash, agent.hash))?.id;
  };
};
