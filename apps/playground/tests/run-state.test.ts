import { describe, expect, it } from "vitest";

import { codeFor, lineText, signature } from "@/lib/code";
import type { RunEvent } from "@/lib/events";
import {
  answerOf,
  callsOf,
  compactEvents,
  planOf,
  runOf,
  spendOf,
} from "@/lib/run-state";

const URL_ = "https://www.toppstiles.co.uk/metro/metro-white-tile";

const EVENTS: RunEvent[] = [
  {
    model: "openrouter/openai/gpt-6-luna",
    routes: { extract: "firecrawl" },
    type: "start",
  },
  { text: "Read the page, ", type: "text" },
  { text: "then pull out values.", type: "text" },
  {
    capability: "extract",
    id: "c1",
    input: { maxAge: null, prompt: "Specs", url: URL_ },
    provider: "firecrawl",
    tool: "extract_values",
    type: "call",
  },
  {
    id: "c1",
    ms: 3100,
    output: { data: { name: "Metro" } },
    type: "result",
    usage: { credits: 5 },
  },
  { costUsd: 0.0004, inputTokens: 900, outputTokens: 40, type: "model" },
  { text: "# Metro White costs £14.50/m².", type: "text" },
  { ms: 5200, reason: "stop", type: "done" },
];

describe("a run rebuilt from its events", () => {
  const run = runOf(EVENTS, 0);

  it("keeps the plan and the answer apart", () => {
    expect(planOf(run)).toBe("Read the page, then pull out values.");
    expect(answerOf(run)).toBe("# Metro White costs £14.50/m².");
    expect(run.status).toBe("done");
  });

  it("adds up what each side reported, in its own unit", () => {
    expect(spendOf(run)).toStrictEqual({ credits: 5, usd: 0.0004 });
  });

  it("joins text deltas when stored", () => {
    expect(
      compactEvents(EVENTS).filter((event) => event.type === "text")
    ).toHaveLength(2);
  });

  it("writes the calls as code, naming the task's URL and leaving out options the model sent as null", () => {
    const lines = codeFor(callsOf(run), URL_).map((line) => lineText(line));
    expect(lines[0]).toBe(`const url = "${URL_}";`);
    expect(lines).toContain("  extract: firecrawl(),");
    expect(lines).toContain("const values = await web.extract(url, {");
    expect(lines).toContain('  prompt: "Specs",');
    expect(lines.join("\n")).not.toContain("maxAge");
  });

  it("writes each step's call in one short line", () => {
    const [call] = callsOf(run);
    expect(call === undefined ? "" : signature(call)).toBe(
      'extract(url, { prompt: "Specs" })'
    );
  });
});
