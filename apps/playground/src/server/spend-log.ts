// Every paid call is appended to a local log: what ran, on
// which provider, and what the provider reported it cost. The log never
// holds a key, a prompt or a result.
import { appendFile } from "node:fs/promises";

import type { Usage } from "@/lib/events";

const LOG_PATH = "/tmp/fieldwork-playground-spend.log";

export interface SpendEntry {
  capability: string;
  costUsd?: number;
  credits?: number;
  inputTokens?: number;
  outputTokens?: number;
  provider: string;
  units?: Usage["units"];
}

export const logSpend = async (entry: SpendEntry): Promise<void> => {
  await appendFile(
    LOG_PATH,
    `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`
  );
};
