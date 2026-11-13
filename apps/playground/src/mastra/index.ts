// The playground's Mastra instance: one agent with Fieldwork tools, the
// checker the compare workflow calls, and the compare workflow. Nothing here
// needs to outlive a request, so it runs without storage.
import { Mastra } from "@mastra/core";

import { fieldworkAgent } from "./agents/fieldwork-agent";
import { readChecker } from "./agents/read-checker";
import { compareReads } from "./workflows/compare-reads";

export const mastra = new Mastra({
  agents: { fieldworkAgent, readChecker },
  workflows: { compareReads },
});
