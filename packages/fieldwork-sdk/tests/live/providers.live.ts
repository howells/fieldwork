/**
 * Live contract tests: each capability once against the real provider APIs,
 * to catch a provider changing its API under an adapter. They spend money,
 * about $0.20 for a full run with every key set, so they run only through
 * `pnpm test:live` and never in `pnpm test`.
 *
 * A provider whose key is not in the environment is skipped. Two calls are
 * left out on cost: Firecrawl research (agent credits vary by run) and
 * Perplexity research (needs a chosen model).
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { exa } from "../../src/adapters/exa.js";
import { firecrawl } from "../../src/adapters/firecrawl.js";
import { parallel } from "../../src/adapters/parallel.js";
import { perplexity } from "../../src/adapters/perplexity.js";
import { tavily } from "../../src/adapters/tavily.js";
import { Fieldwork } from "../../src/index.js";

const PAGE = "https://example.com/";
const PRODUCT =
  "https://www.tilebar.com/product/portmore-aqua-3x8-glazed-ceramic-tile.html";
const QUERY = "TileBar Portmore Aqua 3x8 glazed ceramic tile";
const QUESTION = "What is the title of the page at https://example.com?";
const SCHEMA = {
  type: "object",
  properties: {
    heading: { type: "string", description: "The page's main heading" },
  },
  required: ["heading"],
};

const has = (name: string) => Boolean(process.env[name]);

/**
 * Builds the instance on first use. describe.skipIf still runs the describe
 * body, and a missing key must skip that provider rather than fail the run.
 */
function lazy<T>(make: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= make());
}

describe.skipIf(!has("EXA_API_KEY"))("exa, live", () => {
  const web = lazy(() => new Fieldwork({ adapter: exa() }));
  it("searches", async () => {
    const { results } = await web().search(QUERY, { limit: 2 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.url).toMatch(/^https?:\/\//u);
  });
  it("reads", async () => {
    const page = await web().read(PAGE);
    expect(page.markdown).toMatch(/documentation/iu);
  });
  it("extracts", async () => {
    const { data } = await web().extract<{ heading: string }>(PAGE, {
      schema: SCHEMA,
    });
    expect(data.heading).toMatch(/example/iu);
  });
  it("researches", async () => {
    const research = await web().research(QUESTION, {
      effort: "minimal",
      interval: 3000,
    });
    expect(research.id).not.toBe("");
    expect(String(research.output)).not.toBe("");
  });
});

describe.skipIf(!has("FIRECRAWL_API_KEY"))("firecrawl, live", () => {
  const web = lazy(() => new Fieldwork({ adapter: firecrawl() }));
  it("searches", async () => {
    const { results } = await web().search(QUERY, { limit: 2 });
    expect(results.length).toBeGreaterThan(0);
  });
  it("reads", async () => {
    const page = await web().read(PAGE, { include: ["links"] });
    expect(page.markdown).toMatch(/documentation/iu);
  });
  it("extracts", async () => {
    const { data } = await web().extract<{ heading: string }>(PAGE, {
      schema: SCHEMA,
    });
    expect(data.heading).toMatch(/example/iu);
  });
  it("reads a product's variants", async () => {
    const product = await web().product(PRODUCT);
    expect(product.variants.length).toBeGreaterThan(0);
  });
  it("maps a site", async () => {
    const { links } = await web().map("https://docs.firecrawl.dev", {
      limit: 5,
    });
    expect(links.length).toBeGreaterThan(0);
  });
  it("crawls a site", async () => {
    const { pages } = await web().crawl("https://docs.firecrawl.dev", {
      limit: 2,
      interval: 2000,
    });
    expect(pages.length).toBeGreaterThan(0);
  });
  it("runs a browser script", async () => {
    const result = await web().act(
      "await page.goto('https://example.com'); console.log(await page.title());",
      { ttl: 60 }
    );
    expect(result.stdout).toContain("Example Domain");
  });
  it("parses a document", async () => {
    const data = readFileSync(
      new URL("fixtures/test-document.pdf", import.meta.url)
    );
    const document = await web().parse({ data, name: "test-document.pdf" });
    expect(document.markdown).toContain("Fieldwork");
  });
});

describe.skipIf(!has("TAVILY_API_KEY"))("tavily, live", () => {
  const web = lazy(() => new Fieldwork({ adapter: tavily() }));
  it("searches", async () => {
    const { results } = await web().search(QUERY, { limit: 2 });
    expect(results.length).toBeGreaterThan(0);
  });
  it("reads", async () => {
    const page = await web().read(PAGE);
    expect(page.markdown).toMatch(/documentation/iu);
  });
  it("maps a site", async () => {
    const { links } = await web().map("https://docs.tavily.com", {
      limit: 5,
      maxDepth: 1,
    });
    expect(links.length).toBeGreaterThan(0);
  });
  it("crawls a site", async () => {
    const { pages } = await web().crawl("https://docs.tavily.com", {
      limit: 2,
      maxDepth: 1,
    });
    expect(pages.length).toBeGreaterThan(0);
  });
  it("researches", async () => {
    const research = await web().research(QUESTION, {
      model: "mini",
      outputLength: "short",
      interval: 3000,
    });
    expect(research.id).not.toBe("");
  });
});

describe.skipIf(!has("PARALLEL_API_KEY"))("parallel, live", () => {
  const web = lazy(() => new Fieldwork({ adapter: parallel() }));
  it("searches", async () => {
    const { results } = await web().search(QUERY, { limit: 2 });
    expect(results.length).toBeGreaterThan(0);
  });
  it("reads", async () => {
    const page = await web().read(PAGE);
    expect(page.markdown).toMatch(/documentation/iu);
  });
  it("extracts with per-field sources", async () => {
    const { data } = await web().extract<{ heading: string }>(PAGE, {
      schema: SCHEMA,
      processor: "lite",
    });
    expect(data.heading).toMatch(/example/iu);
  });
  it("researches", async () => {
    const research = await web().research(QUESTION, { processor: "lite" });
    expect(research.id).not.toBe("");
  });
});

describe.skipIf(!has("PERPLEXITY_API_KEY"))("perplexity, live", () => {
  const web = lazy(() => new Fieldwork({ adapter: perplexity() }));
  it("searches", async () => {
    const { results } = await web().search(QUERY, { limit: 2 });
    expect(results.length).toBeGreaterThan(0);
  });
});
