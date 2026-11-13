// The six starting points on the empty screen. Each hint names the
// capabilities the task will use, and changes when the provider that offers
// the design's first choice has no key: "Find" needs Parallel, "Decide"
// needs Parallel or Perplexity, so without them the hint says what will
// really run instead.
import type { Routes } from "./routing";

export const TILE_URL = "https://www.toppstiles.co.uk/metro/metro-white-tile";
export const SOFA_URL =
  "https://www.kinstore.co.uk/products/hay-mags-sofa-3-seater-combination-1";

export interface Starter {
  /** Compare runs the read on several providers; agent runs the agent. */
  kind: "agent" | "compare";
  /** The short name the task keeps under Recent. */
  label: string;
  /** What is sent to the agent. */
  prompt: string;
  /** The words on the row. */
  title: string;
  url?: string;
  hint: (routes: Routes) => string;
}

export const STARTERS: readonly Starter[] = [
  {
    hint: (routes) =>
      routes.monitor === undefined ? "Product" : "Product, then Watch",
    kind: "agent",
    label: "HAY Mags sofa price",
    prompt: `Track this sofa's price: ${SOFA_URL}\nRead the product and every fabric, look for the same sofa at other UK shops and check their prices, then check this page every day for price or stock changes.`,
    title: "Track this sofa's price",
    url: SOFA_URL,
  },
  {
    hint: (routes) =>
      routes.discover === undefined ? "Search, then Ask" : "Find",
    kind: "agent",
    label: "Recycled-plastic tile makers",
    prompt:
      "Who makes recycled-plastic tiles in the UK? Name the makers and say what each makes.",
    title: "Who makes recycled-plastic tiles in the UK?",
  },
  {
    hint: () => "Read, three ways",
    kind: "compare",
    label: "Metro White, three reads",
    prompt: "Compare what three providers read on a page",
    title: "Compare what three providers read on a page",
    url: TILE_URL,
  },
  {
    hint: () => "Pull out values",
    kind: "agent",
    label: "Metro White tile specs",
    prompt: `Pull the specs off this tile page: ${TILE_URL}\nI want the name, price per square metre, size, finish, material, thickness and where it can go.`,
    title: "Pull the specs off this tile page",
    url: TILE_URL,
  },
  {
    hint: () => "Research",
    kind: "agent",
    label: "EU AI Act, this month",
    prompt:
      "What changed in the EU AI Act this month? Give me what changed, when, and what it means for a small software company.",
    title: "What changed in the EU AI Act this month?",
  },
  {
    hint: (routes) =>
      routes.decide === undefined ? "Search, then Read" : "Search, then Decide",
    kind: "agent",
    label: "Aesop hand wash prices",
    prompt:
      "Is the Aesop Resurrection Aromatique Hand Wash (500 mL) cheaper anywhere in the UK than on aesop.com? Check a few UK shops and give me their prices.",
    title: "Is the Aesop hand wash cheaper elsewhere?",
  },
];
