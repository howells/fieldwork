import { ANSWER_SPECS } from "./answer.js";
import { BROWSER_SPECS } from "./browser.js";
import { MONITOR_SPECS } from "./monitor.js";
import { READ_SPECS } from "./read.js";
import { SEARCH_SPECS } from "./search.js";
import type { Spec } from "./types.js";

/**
 * What each agent tool is called, what it says about itself, which inputs
 * each provider accepts and what it returns. `toolsFor` in tools.ts turns
 * these into tools, in this order.
 */
export const SPECS: readonly Spec[] = [
  ...SEARCH_SPECS,
  ...READ_SPECS,
  ...ANSWER_SPECS,
  ...BROWSER_SPECS,
  ...MONITOR_SPECS,
];
