// Shapes a tool's result for a model: drops `raw` and cuts long text to a
// shared character budget.

import { isJsonObject, isList, isText } from "./json.js";
import type { JsonObject, JsonValue } from "./json.js";

/** Text of this length or less, such as titles, URLs and snippets, is never cut. */
const SHORT_TEXT = 500;

/**
 * Keys whose contents belong to the caller, the script or the extraction, not
 * to Fieldwork: a key called `raw` inside them is a value, so it stays.
 */
const VERBATIM = new Set([
  "answers",
  "breakdown",
  "data",
  "output",
  "result",
  "values",
]);

/**
 * The order an object's fields spend the shared budget in: the readable
 * answer or page text first, other renderings of the same page last, and
 * everything else between, as it appears. The result keeps its own key order.
 */
const SPEND_FIRST = [
  "answer",
  "output",
  "markdown",
  "content",
  "text",
  "summary",
];
const SPEND_LAST = ["html", "rawHtml"];

const rank = (key: string): number => {
  if (SPEND_FIRST.includes(key)) {
    return SPEND_FIRST.indexOf(key);
  }
  return SPEND_LAST.includes(key)
    ? SPEND_FIRST.length + 1 + SPEND_LAST.indexOf(key)
    : SPEND_FIRST.length;
};

interface Budget {
  remaining: number;
}

/** The text whole if it is short or the budget covers it; otherwise cut to what is left of the budget, with a note of how much was shown. Short text spends nothing. */
const cut = (value: string, budget: Budget): string => {
  if (value.length <= SHORT_TEXT) {
    return value;
  }
  const kept = Math.min(value.length, budget.remaining);
  budget.remaining -= kept;
  return kept === value.length
    ? value
    : `${value.slice(0, kept)}\n\n[cut: ${kept} of ${value.length} characters shown]`;
};

/**
 * Applies `cut` and the `raw` rule through a value. Fields are visited in
 * `rank` order so the answer or page text gets the budget first, but each
 * object keeps its own key order. `verbatim` is set inside `VERBATIM` keys and
 * stays set below them.
 */
const shape = (
  value: JsonValue | undefined,
  verbatim: boolean,
  budget: Budget
): JsonValue | undefined => {
  if (isText(value)) {
    return cut(value, budget);
  }
  if (isList(value)) {
    return value.map((item) => shape(item, verbatim, budget) ?? null);
  }
  if (!isJsonObject(value)) {
    return value;
  }
  const entries = Object.entries(value).filter(
    ([key]) => verbatim || key !== "raw"
  );
  const shaped = new Map<string, JsonValue | undefined>();
  for (const [key, item] of entries.toSorted(([a], [b]) => rank(a) - rank(b))) {
    shaped.set(key, shape(item, verbatim || VERBATIM.has(key), budget));
  }
  return Object.fromEntries(entries.map(([key]) => [key, shaped.get(key)]));
};

/**
 * A result as a model should see it: the provider's `raw` response dropped at
 * every depth except inside extracted values, and long text cut to one budget
 * shared across the result. Within each object the answer or page text is
 * served first and alternate renderings such as HTML last.
 */
export const forModel = (result: JsonObject, budget: number): JsonObject => {
  const shaped = shape(result, false, { remaining: budget });
  return isJsonObject(shaped) ? shaped : {};
};
