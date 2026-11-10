/**
 * Live contract tests: each capability once against the real provider APIs,
 * to catch a provider changing its API under an adapter. They spend money,
 * well under the $5 cap for a full run with every key set, so they run only
 * through `pnpm test:live` and never in `pnpm test`. Each call takes the
 * cheapest settings the provider offers.
 *
 * A provider whose key is not in the environment is skipped. Monitors and
 * browser sessions are deleted or closed in `finally`, so a failed assertion
 * never leaves one billing.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { brave } from "../../src/adapters/brave.js";
import { browserbase } from "../../src/adapters/browserbase.js";
import { exa } from "../../src/adapters/exa.js";
import { firecrawl } from "../../src/adapters/firecrawl.js";
import { kernel } from "../../src/adapters/kernel.js";
import { llamaparse } from "../../src/adapters/llamaparse.js";
import { parallel } from "../../src/adapters/parallel.js";
import { perplexity } from "../../src/adapters/perplexity.js";
import { reducto } from "../../src/adapters/reducto.js";
import { serpapi } from "../../src/adapters/serpapi.js";
import { tavily } from "../../src/adapters/tavily.js";
import { Fieldwork } from "../../src/index.js";

const PAGE = "https://example.com/";
const MISSING = "https://example.com/fieldwork-live-missing-page";
const PRODUCT =
  "https://www.tilebar.com/product/portmore-aqua-3x8-glazed-ceramic-tile.html";
const QUERY = "TileBar Portmore Aqua 3x8 glazed ceramic tile";
const QUESTION = "What is the title of the page at https://example.com?";
// Exa refuses example.com as a webhook host. The monitor has no schedule and
// is deleted at once, so nothing is delivered here.
const HOOK = "https://httpbin.org/status/204";
const URL_PATTERN = /^https?:\/\//u;
const SCHEMA = {
  properties: {
    heading: { description: "The page's main heading", type: "string" },
  },
  required: ["heading"],
  type: "object",
};

// oxlint-disable-next-line no-restricted-properties -- live tests skip a provider whose key is not set
const has = (name: string) => Boolean(process.env[name]);

/**
 * Builds the instance on first use. describe.skipIf still runs the describe
 * body, and a missing key must skip that provider rather than fail the run.
 */
const lazy = <T>(make: () => T): (() => T) => {
  let value: T | undefined;
  return () => (value ??= make());
};

describe.skipIf(!has("EXA_API_KEY"))("exa, live", () => {
  const web = lazy(() => new Fieldwork({ adapter: exa() }));
  it("searches", async () => {
    const { results, meta } = await web().search(QUERY, { limit: 2 });
    expect(results[0]?.url).toMatch(URL_PATTERN);
    expect(meta?.requestId).toBeTruthy();
  });
  it("reads, with the page's main image", async () => {
    const page = await web().read(PAGE);
    expect(page.markdown).toMatch(/documentation/iu);
  });
  it("reads many, listing a failure instead of throwing", async () => {
    const batch = await web().readMany([PAGE, MISSING]);
    expect(batch.pages.length + batch.failed.length).toBe(2);
  });
  it("extracts", async () => {
    const { data } = await web().extract<{ heading: string }>(PAGE, {
      schema: SCHEMA,
    });
    expect(data.heading).toMatch(/example/iu);
  });
  it("answers with citations", async () => {
    const answer = await web().answer(QUESTION);
    expect(answer.answer).toMatch(/example/iu);
  });
  it("researches", async () => {
    const research = await web().research(QUESTION, {
      effort: "minimal",
      interval: 3000,
    });
    expect(["completed", "partial"]).toContain(research.status);
  });
  it("creates, reads and deletes a monitor", async () => {
    const monitor = await web().monitor.create({
      query: "TileBar new tile collections",
      webhookUrl: HOOK,
    });
    try {
      expect((await web().monitor.get(monitor.id)).id).toBe(monitor.id);
      const all = await web().monitor.list();
      expect(all.some((item) => item.id === monitor.id)).toBe(true);
    } finally {
      await web().monitor.delete(monitor.id);
    }
  });
});

describe.skipIf(!has("FIRECRAWL_API_KEY"))("firecrawl, live", () => {
  const web = lazy(() => new Fieldwork({ adapter: firecrawl() }));
  it("searches", async () => {
    const { results } = await web().search(QUERY, { limit: 2 });
    expect(results.length).toBeGreaterThan(0);
  });
  it("searches images", async () => {
    const { results } = await web().images("glazed ceramic tile", {
      limit: 1,
    });
    expect(results[0]?.url).toMatch(URL_PATTERN);
  });
  it("reads, with its status code", async () => {
    const page = await web().read(PAGE, { include: ["links"] });
    expect(page.markdown).toMatch(/documentation/iu);
    expect(page.statusCode).toBe(200);
  });
  it("reads through enhanced proxies", async () => {
    const page = await web().read(PAGE, { proxy: "enhanced" });
    expect(page.markdown).toMatch(/documentation/iu);
  });
  it("reads many", async () => {
    const batch = await web().readMany([PAGE, MISSING], { interval: 2000 });
    expect(batch.pages.length).toBeGreaterThan(0);
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
    const crawl = await web().crawl("https://docs.firecrawl.dev", {
      interval: 2000,
      limit: 2,
    });
    expect(crawl.pages.length).toBeGreaterThan(0);
  });
  it("researches within a credit cap", async () => {
    const research = await web().research(QUESTION, {
      interval: 3000,
      maxCredits: 50,
    });
    expect(["completed", "partial"]).toContain(research.status);
  });
  it("runs a browser script", async () => {
    const result = await web().act(
      "await page.goto('https://example.com'); console.log(await page.title());",
      { ttl: 60 }
    );
    expect(result.stdout).toContain("Example Domain");
  });
  it("opens and closes a browser", async () => {
    const session = await web().browser.open({ ttl: 60 });
    try {
      expect(session.cdpUrl ?? session.liveViewUrl).toMatch(/^wss?:|^https?:/u);
    } finally {
      await web().browser.close(session.id);
    }
  });
  it("parses a document", async () => {
    const data = readFileSync(
      new URL("fixtures/test-document.pdf", import.meta.url)
    );
    const document = await web().parse({ data, name: "test-document.pdf" });
    expect(document.markdown).toContain("Fieldwork");
  });
  it("creates, reads and deletes a page monitor", async () => {
    const monitor = await web().monitor.create({
      schedule: { every: "day" },
      urls: [PAGE],
    });
    try {
      expect((await web().monitor.get(monitor.id)).id).toBe(monitor.id);
      expect(
        Array.isArray((await web().monitor.events(monitor.id)).events)
      ).toBe(true);
    } finally {
      await web().monitor.delete(monitor.id);
    }
  });
  it("reports credit usage", async () => {
    const usage = await web().usage();
    expect(typeof usage.remaining).toBe("number");
  });
});

describe.skipIf(!has("TAVILY_API_KEY"))("tavily, live", () => {
  const web = lazy(() => new Fieldwork({ adapter: tavily() }));
  it("searches", async () => {
    const { results } = await web().search(QUERY, { limit: 2 });
    expect(results.length).toBeGreaterThan(0);
  });
  it("searches images", async () => {
    const { results } = await web().images("glazed ceramic tile");
    expect(results[0]?.url).toMatch(URL_PATTERN);
  });
  it("reads", async () => {
    const page = await web().read(PAGE);
    expect(page.markdown).toMatch(/documentation/iu);
  });
  it("reads many", async () => {
    const batch = await web().readMany([PAGE, MISSING]);
    expect(batch.pages.length).toBeGreaterThan(0);
  });
  it("answers", async () => {
    const answer = await web().answer(QUESTION);
    expect(answer.answer).toMatch(/example/iu);
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
      interval: 3000,
      model: "mini",
      outputLength: "short",
    });
    expect(research.id).not.toBe("");
  });
  it("reports usage", async () => {
    const usage = await web().usage();
    expect(usage.raw).toBeDefined();
  });
});

describe.skipIf(!has("PARALLEL_API_KEY"))("parallel, live", () => {
  const web = lazy(() => new Fieldwork({ adapter: parallel() }));
  it("searches", async () => {
    const { results } = await web().search(QUERY, { limit: 2, mode: "turbo" });
    expect(results.length).toBeGreaterThan(0);
  });
  it("searches images", async () => {
    const { results } = await web().images("glazed ceramic tile", {
      limit: 1,
      mode: "fast",
    });
    expect(results[0]?.url).toMatch(URL_PATTERN);
  });
  it("reads", async () => {
    const page = await web().read(PAGE);
    expect(page.markdown).toMatch(/documentation/iu);
  });
  it("reads many, listing a failure instead of throwing", async () => {
    const batch = await web().readMany([PAGE, MISSING]);
    expect(batch.pages.length + batch.failed.length).toBe(2);
  });
  it("extracts with per-field sources", async () => {
    const { data } = await web().extract<{ heading: string }>(PAGE, {
      processor: "lite",
      schema: SCHEMA,
    });
    expect(data.heading).toMatch(/example/iu);
  });
  it("answers, then follows up", async () => {
    const first = await web().answer(QUESTION, { effort: "low" });
    expect(first.continuationId).toBeTruthy();
    const next = await web().answer("And its main heading?", {
      continueFrom: first.continuationId,
      effort: "low",
    });
    expect(next.answer).toBeTruthy();
  });
  it("researches", async () => {
    const research = await web().research(QUESTION, { processor: "lite" });
    expect(research.status).toBe("completed");
  });
  it("discovers entities", async () => {
    const discovery = await web().discover("Tile brands based in Italy", {
      conditions: [
        { description: "Makes ceramic or porcelain tiles", name: "tiles" },
      ],
      entityType: "companies",
      generator: "preview",
      limit: 5,
    });
    expect(discovery.entities.length).toBeGreaterThan(0);
  });
  it("decides closed questions", async () => {
    const decisions = await web().decide("The page at https://example.com", {
      domain: {
        question: "Is this page a documentation example?",
        type: "yesno",
      },
    });
    expect(decisions.answers.domain).toBeDefined();
  });
  it("creates, reads and deletes a monitor", async () => {
    const monitor = await web().monitor.create({
      processor: "lite",
      query: "TileBar new tile collections",
      schedule: { every: "day" },
    });
    try {
      expect((await web().monitor.get(monitor.id)).id).toBe(monitor.id);
      expect(
        Array.isArray((await web().monitor.events(monitor.id)).events)
      ).toBe(true);
    } finally {
      await web().monitor.delete(monitor.id);
    }
  });
});

describe.skipIf(!has("PERPLEXITY_API_KEY"))("perplexity, live", () => {
  const web = lazy(() => new Fieldwork({ adapter: perplexity() }));
  it("searches", async () => {
    const { results } = await web().search(QUERY, { limit: 2 });
    expect(results.length).toBeGreaterThan(0);
  });
  it("answers", async () => {
    const answer = await web().answer(QUESTION);
    expect(answer.answer).toMatch(/example/iu);
  });
  it("decides closed questions", async () => {
    const decisions = await web().decide(
      "The page at https://example.com",
      {
        domain: {
          question: "Is this page a documentation example?",
          type: "yesno",
        },
      },
      { model: "pplx-decider-flash-v1.2" }
    );
    expect(decisions.answers.domain).toBeDefined();
  });
});

describe.skipIf(!has("BRAVE_API_KEY"))("brave, live", () => {
  const web = lazy(() => new Fieldwork({ adapter: brave() }));
  it("searches", async () => {
    const { results } = await web().search(QUERY, { limit: 2 });
    expect(results[0]?.url).toMatch(URL_PATTERN);
  });
  it("searches images", async () => {
    const { results } = await web().images("glazed ceramic tile", {
      limit: 1,
    });
    expect(results[0]?.url).toMatch(URL_PATTERN);
  });
  // Answers need a Brave plan that includes them. On a plan without them,
  // Brave refuses with OPTION_NOT_IN_PLAN, which still shows the request
  // passed authentication; the answer itself is then left unchecked.
  it("answers, or is refused by the plan", async () => {
    try {
      const answer = await web().answer(QUESTION, { model: "brave" });
      expect(answer.answer).toMatch(/example/iu);
    } catch (error) {
      expect(String(error)).toContain("OPTION_NOT_IN_PLAN");
    }
  });
});

describe.skipIf(!has("SERPAPI_API_KEY"))("serpapi, live", () => {
  const web = lazy(() => new Fieldwork({ adapter: serpapi() }));
  it("searches Google Scholar", async () => {
    const { results, meta } = await web().search("terrazzo tile", {
      engine: "google_scholar",
      limit: 1,
    });
    expect(results[0]?.kind).toBe("scholar");
    expect(meta?.requestId).toBeTruthy();
  });
  it("searches images", async () => {
    const { results } = await web().images("terrazzo");
    expect(results[0]?.width).toBeGreaterThan(0);
  });
  it("reports usage without echoing the key", async () => {
    const usage = await web().usage();
    expect(typeof usage.remaining).toBe("number");
    expect(JSON.stringify(usage.raw)).not.toContain("api_key");
  });
});

describe.skipIf(!has("BROWSERBASE_API_KEY"))("browserbase, live", () => {
  const web = lazy(() => new Fieldwork({ adapter: browserbase() }));
  it("searches", async () => {
    const { results } = await web().search(QUERY, { limit: 2 });
    expect(results[0]?.url).toMatch(URL_PATTERN);
  });
  it("reads", async () => {
    const page = await web().read(PAGE);
    expect(page.markdown).toMatch(/documentation/iu);
  });
  it("opens and closes a browser", async () => {
    const session = await web().browser.open({ ttl: 60 });
    try {
      expect(session.cdpUrl).toMatch(/^wss?:/u);
    } finally {
      await web().browser.close(session.id);
    }
  });
  it("reports usage", async () => {
    const usage = await web().usage();
    expect(usage.raw).toBeDefined();
  });
});

describe.skipIf(!has("KERNEL_API_KEY"))("kernel, live", () => {
  const web = lazy(() => new Fieldwork({ adapter: kernel() }));
  it("reads a page whose specs load with JavaScript", async () => {
    const page = await web().read(PRODUCT, { timeout: 180_000 });
    expect(page.statusCode).toBe(200);
    expect(page.title).toMatch(/Portmore Aqua/iu);
    expect(page.markdown).toMatch(/Portmore Aqua/iu);
    expect(page.meta?.usage?.units?.uptime_ms).toBeGreaterThan(0);
  }, 200_000);
  it("opens and closes a browser", async () => {
    const session = await web().browser.open({ headless: true });
    try {
      expect(session.cdpUrl).toMatch(/^wss?:/u);
    } finally {
      await web().browser.close(session.id);
    }
  });
});

const testDocument = () => ({
  data: readFileSync(new URL("fixtures/test-document.pdf", import.meta.url)),
  name: "test-document.pdf",
});

describe.skipIf(!has("LLAMA_CLOUD_API_KEY"))("llamaparse, live", () => {
  const web = lazy(() => new Fieldwork({ adapter: llamaparse() }));
  it("parses a document with word boxes", async () => {
    // The cheapest tier that returns boxes.
    const document = await web().parse(testDocument(), {
      tier: "cost_effective",
      wordBoxes: true,
    });
    expect(document.markdown).toContain("Fieldwork");
    expect(document.blocks?.some((block) => block.words !== undefined)).toBe(
      true
    );
  });
});

describe.skipIf(!has("REDUCTO_API_KEY"))("reducto, live", () => {
  const web = lazy(() => new Fieldwork({ adapter: reducto() }));
  it("parses a document with word boxes", async () => {
    const document = await web().parse(testDocument(), { wordBoxes: true });
    expect(document.markdown).toContain("Fieldwork");
    expect(document.blocks?.some((block) => block.words !== undefined)).toBe(
      true
    );
  });
});
