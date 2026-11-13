// The compare view's state, rebuilt from the streamed events: how many of
// the six facts each read caught, and what each read returned as text you
// can read. A fact counts as on the page when any provider's read contains
// it, so each score is measured against what the reads themselves found.
import type { CompareEvent, Fact, FactValues, ReadOutcome } from "./events";
import { FACTS } from "./events";
import type { CompareRun } from "./tasks";

export interface CompareState {
  checked: Map<string, FactValues>;
  done: boolean;
  error?: string;
  modelCostUsd: number;
  ms: number;
  providers: string[];
  reads: Map<string, ReadOutcome>;
}

const applyEvent = (state: CompareState, event: CompareEvent): CompareState => {
  switch (event.type) {
    case "read": {
      return {
        ...state,
        reads: new Map(state.reads).set(event.read.provider, event.read),
      };
    }
    case "checked": {
      const checked = new Map(state.checked);
      for (const read of event.checked) {
        checked.set(read.provider, read.facts);
      }
      return { ...state, checked };
    }
    case "model": {
      return {
        ...state,
        modelCostUsd: state.modelCostUsd + (event.costUsd ?? 0),
      };
    }
    case "done": {
      return { ...state, ms: Math.max(state.ms, event.ms) };
    }
    case "error": {
      return { ...state, error: event.message };
    }
    case "start": {
      // The providers are already known from the request.
      return state;
    }
  }
  return state;
};

export const compareStateOf = (
  runs: readonly CompareRun[],
  running: boolean
): CompareState => {
  let state: CompareState = {
    checked: new Map(),
    done: !running,
    modelCostUsd: 0,
    ms: 0,
    providers: runs.flatMap((run) => run.providers),
    reads: new Map(),
  };
  for (const run of runs) {
    for (const event of run.events) {
      state = applyEvent(state, event);
    }
  }
  return state;
};

/** A fact's value in one read, or null when the read doesn't have it. */
export const factValue = (
  fact: Fact,
  read: ReadOutcome,
  facts: FactValues | undefined
): string | null => {
  if (fact === "images") {
    return read.images > 0 ? String(read.images) : null;
  }
  return facts?.[fact] ?? null;
};

export interface Score {
  caught: number;
  missed: Fact[];
  provider: string;
  total: number;
}

/** The facts any read caught: the yardstick each read is held to. */
export const factsOnPage = (state: CompareState): Fact[] =>
  FACTS.filter((fact) =>
    [...state.reads.values()].some(
      (read) =>
        read.ok &&
        factValue(fact, read, state.checked.get(read.provider)) !== null
    )
  );

export const scoreOf = (
  state: CompareState,
  provider: string
): Score | undefined => {
  const read = state.reads.get(provider);
  const facts = state.checked.get(provider);
  if (read?.ok !== true || (facts === undefined && state.checked.size > 0)) {
    return undefined;
  }
  const onPage = factsOnPage(state);
  const missed = onPage.filter((fact) => factValue(fact, read, facts) === null);
  return {
    caught: onPage.length - missed.length,
    missed,
    provider,
    total: onPage.length,
  };
};

/** The provider whose read caught the most, or undefined before any is checked. */
export const bestOf = (state: CompareState): string | undefined =>
  state.providers
    .flatMap((provider) => {
      const score = scoreOf(state, provider);
      return score === undefined ? [] : [score];
    })
    .toSorted((a, b) => b.caught - a.caught)[0]?.provider;

export interface Block {
  kind: "heading" | "text";
  text: string;
}

// A link target may hold one level of brackets, as image CDN paths do.
const TARGET = String.raw`\((?:[^()\s]|\([^()]*\))*\)`;
const IMAGE = new RegExp(String.raw`!\[[^\]]*\]${TARGET}`, "gu");
const LINK = new RegExp(String.raw`\[(?<text>[^\]]*)\]${TARGET}`, "gu");
// A link whose text ran over a blank line leaves its halves behind.
const LINK_ENDS = new RegExp(String.raw`\]${TARGET}|^\[|(?<=\s)\[`, "gu");
const EMPHASIS = /\*\*|__|`/gu;
// Markdown escapes ("\[", "\(", a trailing "\" for a hard break) are not text.
const ESCAPE = /\\+(?=[^\p{L}\p{N}]|$)/gu;
const HEADING = /^#{1,6}\s+/u;
const LIST_ITEM = /^(?:[-*+]|\d+\.)\s+/u;
const TABLE_RULE = /^\|?[\s:|-]+\|?$/u;

const plain = (line: string): string =>
  line
    .replaceAll(IMAGE, "")
    .replaceAll(LINK, "$<text> ")
    .replaceAll(LINK_ENDS, "")
    .replaceAll(EMPHASIS, "")
    .replaceAll(ESCAPE, "")
    .replaceAll(/\s*\|\s*/gu, " · ")
    .replaceAll(/\s+/gu, " ")
    .replaceAll(/^ · | · $/gu, "")
    .trim();

/**
 * A read's Markdown as blocks of plain text, for reading rather than
 * inspecting: images and link targets dropped, headings kept as headings,
 * hard-wrapped lines joined back into their paragraph.
 */
export const previewOf = (markdown: string, limit = 80): Block[] => {
  const blocks: Block[] = [];
  for (const paragraph of markdown.split(/\n\s*\n/u)) {
    let text: string[] = [];
    const flush = () => {
      const joined = text.join(" ").trim();
      if (/[\p{L}\p{N}]/u.test(joined)) {
        blocks.push({ kind: "text", text: joined });
      }
      text = [];
    };
    for (const raw of paragraph.split("\n")) {
      const line = raw.trim();
      if (TABLE_RULE.test(line) && line.includes("-")) {
        continue;
      }
      if (HEADING.test(line)) {
        flush();
        const heading = plain(line.replace(HEADING, ""));
        if (heading !== "") {
          blocks.push({ kind: "heading", text: heading });
        }
      } else if (LIST_ITEM.test(line)) {
        flush();
        text.push(plain(line.replace(LIST_ITEM, "")));
        flush();
      } else {
        text.push(plain(line));
      }
    }
    flush();
  }
  return blocks
    .filter((block, index) => block.text !== blocks[index - 1]?.text)
    .slice(0, limit);
};
