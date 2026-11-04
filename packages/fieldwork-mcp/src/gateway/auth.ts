// Bearer-key authentication for gateway agents. http.ts calls the authenticator
// first for every request except the public OpenAPI description.

import { createHash, timingSafeEqual } from "node:crypto";

import * as z from "zod/mini";

/** One caller of the gateway. */
export interface GatewayAgent {
  /** Names the agent in the call log. Lower-case letters, digits, `_` and `-`, starting with a letter or digit. */
  id: string;
  /** The bearer key: at least 32 characters, none of them whitespace. Distinct for each agent. */
  apiKey: string;
}

const Agent = z.object({
  apiKey: z.string().check(z.minLength(32), z.regex(/^\S+$/u)),
  id: z.string().check(z.regex(/^[a-z0-9][a-z0-9_-]*$/u)),
});

const digest = (key: string): Buffer =>
  createHash("sha256").update(key).digest();

/**
 * Checks the agents and returns a function that maps a request to the id of
 * the agent whose key it carries, or undefined. Throws when an agent is
 * malformed or two share an id or a key; the message never holds a key.
 *
 * Only SHA-256 digests of the keys are kept. A presented key is hashed too and
 * compared with `timingSafeEqual`, so every comparison is between 32 bytes and
 * the comparison itself takes the same time for any key. The scan stops at
 * the first match, so time reveals only which agent matched. With no agents,
 * nothing matches. The scheme is `Bearer`, in any case, followed by one space.
 */
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
