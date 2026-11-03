// The capability table on the home page, read from the SDK itself so it can't
// drift from what each adapter offers. Building an adapter needs a key; these
// placeholders are never sent, because nothing here makes a request.
import { CAPABILITIES, Fieldwork } from "@howells/fieldwork-sdk";
import type { Capability } from "@howells/fieldwork-sdk";
import { brave } from "@howells/fieldwork-sdk/brave";
import { browserbase } from "@howells/fieldwork-sdk/browserbase";
import { exa } from "@howells/fieldwork-sdk/exa";
import { firecrawl } from "@howells/fieldwork-sdk/firecrawl";
import { llamaparse } from "@howells/fieldwork-sdk/llamaparse";
import { parallel } from "@howells/fieldwork-sdk/parallel";
import { perplexity } from "@howells/fieldwork-sdk/perplexity";
import { reducto } from "@howells/fieldwork-sdk/reducto";
import { serpapi } from "@howells/fieldwork-sdk/serpapi";
import { tavily } from "@howells/fieldwork-sdk/tavily";

const apiKey = "docs-build";

const adapters = [
  { adapter: exa({ apiKey }), label: "Exa" },
  { adapter: firecrawl({ apiKey }), label: "Firecrawl" },
  { adapter: tavily({ apiKey }), label: "Tavily" },
  { adapter: parallel({ apiKey }), label: "Parallel" },
  { adapter: perplexity({ apiKey }), label: "Perplexity" },
  { adapter: brave({ apiKey }), label: "Brave" },
  { adapter: serpapi({ apiKey }), label: "SerpApi" },
  { adapter: browserbase({ apiKey }), label: "Browserbase" },
  { adapter: llamaparse({ apiKey }), label: "LlamaParse" },
  { adapter: reducto({ apiKey }), label: "Reducto" },
];

export interface Provider {
  label: string;
  supports: Readonly<Record<Capability, boolean>>;
}

export const PROVIDERS: Provider[] = adapters.map(({ adapter, label }) => ({
  label,
  supports: new Fieldwork({ adapter }).capabilities,
}));

const SUMMARIES: Record<Capability, string> = {
  act: "A browser script, run once",
  answer: "A cited answer, in one call",
  browser: "A remote browser for Playwright",
  crawl: "Many pages from one starting URL",
  decide: "Closed questions, answered with probabilities",
  discover: "Entities that meet every condition",
  extract: "Named values from a page, by schema",
  images: "Images for a query",
  map: "Every URL on a site",
  monitor: "A query or page, checked on a schedule",
  parse: "A PDF or document as Markdown",
  product: "A product page and its variants",
  read: "A page as Markdown",
  readMany: "Many pages in one call",
  research: "A long research job you can resume",
  search: "Pages that answer a query",
  usage: "Credits used and left",
};

export interface CapabilityRow {
  name: Capability;
  summary: string;
  providers: string[];
}

export const CAPABILITY_ROWS: CapabilityRow[] = CAPABILITIES.map((name) => ({
  name,
  providers: PROVIDERS.filter((provider) => provider.supports[name]).map(
    (provider) => provider.label
  ),
  summary: SUMMARIES[name],
}));
