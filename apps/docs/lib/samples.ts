// The home page's code samples. Each provider's hero sample calls only methods
// that provider offers; the capability table on the same page proves it.

const imports = (factory: string) =>
  `import { Fieldwork } from "@howells/fieldwork-sdk";
import { ${factory} } from "@howells/fieldwork-sdk/${factory}";

const web = new Fieldwork({ adapter: ${factory}() });
`;

export interface HeroSample {
  label: string;
  code: string;
}

export const HERO_SAMPLES: HeroSample[] = [
  {
    code: `${imports("exa")}
const { results } = await web.search("TileBar Portmore Aqua 3x8");
const page = await web.read(results[0].url);
const report = await web.research("Is Portmore Aqua frost-proof?");

page.markdown;     // the page as Markdown
report.sources;    // the pages the report cites
report.raw;        // Exa's own response`,
    label: "Exa",
  },
  {
    code: `${imports("firecrawl")}
const { results } = await web.search("TileBar Portmore Aqua 3x8");
const page = await web.read(results[0].url);
const product = await web.product(page.url);

page.markdown;     // the page as Markdown
product.variants;  // sku, values, price, availability, images
product.raw;       // Firecrawl's own response`,
    label: "Firecrawl",
  },
  {
    code: `${imports("tavily")}
const { results } = await web.search("TileBar Portmore Aqua 3x8");
const site = await web.map("https://www.tilebar.com");
const reply = await web.answer("Is Portmore Aqua frost-proof?");

site.links;        // every URL on the site
reply.citations;   // the sources the answer cites
reply.raw;         // Tavily's own response`,
    label: "Tavily",
  },
  {
    code: `${imports("parallel")}
const { results } = await web.search("TileBar Portmore Aqua 3x8");
const page = await web.read(results[0].url);
const reply = await web.answer("Is Portmore Aqua frost-proof?");

page.markdown;     // the page as Markdown
reply.citations;   // the sources the answer cites
reply.raw;         // Parallel's own response`,
    label: "Parallel",
  },
  {
    code: `${imports("perplexity")}
const { results } = await web.search("TileBar Portmore Aqua 3x8");
const reply = await web.answer("Is Portmore Aqua frost-proof?");
const report = await web.research("Which porcelain survives frost?");

reply.citations;   // the sources the answer cites
report.sources;    // the pages the report cites
report.raw;        // Perplexity's own response`,
    label: "Perplexity",
  },
  {
    code: `${imports("brave")}
const { results } = await web.search("TileBar Portmore Aqua 3x8");
const images = await web.images("Portmore Aqua tile");
const reply = await web.answer("Is Portmore Aqua frost-proof?");

images.results;    // each image and the page it is on
reply.citations;   // the sources the answer cites
reply.raw;         // Brave's own response`,
    label: "Brave",
  },
  {
    code: `${imports("serpapi")}
const { results } = await web.search("TileBar Portmore Aqua 3x8");
const images = await web.images("Portmore Aqua tile");
const usage = await web.usage();

results[0].kind;   // "web", "shopping", "place" and so on
usage.remaining;   // credits left this period
usage.raw;         // SerpApi's own response`,
    label: "SerpApi",
  },
  {
    code: `${imports("browserbase")}
const { results } = await web.search("TileBar Portmore Aqua 3x8");
const page = await web.read(results[0].url);
const session = await web.browser.open();

page.markdown;     // the page as Markdown
session.cdpUrl;    // connect Playwright here
session.raw;       // Browserbase's own response`,
    label: "Browserbase",
  },
];

export const HONEST_SAMPLE = `
const web = new Fieldwork({ adapter: tavily() });

// @ts-expect-error Tavily has no browser
await web.act(script);

try {
  await web.crawl("https://tilebar.com");
} catch (error) {
  if (error instanceof FieldworkError) {
    error.code;       // "RateLimited"
    error.retryable;  // true
    error.retryAfter; // 30
  }
}`;

export const ROUTER_SAMPLE = `
const web = new Fieldwork({
  adapter: router({
    search: parallel(),
    read: firecrawl(),
    product: firecrawl(),
    research: exa(),
  }),
});

web.supports("crawl");  // false`;

export const RESUME_SAMPLE = `
try {
  return await web.research(question, { timeout: 60_000 });
} catch (error) {
  if (error instanceof FieldworkError && error.jobId) {
    return await web.research(question, { resume: error.jobId });
  }
  throw error;
}`;

export const CODE_SURFACE_SAMPLE = `
const { output, sources } =
  await web.research(
    "Is Portmore Aqua frost-proof?"
  );`;

export const TOOLS_SURFACE_SAMPLE = `
toolsFor(web).map((t) => t.name);
// search_web, read_page, read_pages,
// answer_question, find_entities,
// create_monitor, … 22 in all`;

export const MCP_SURFACE_SAMPLE = `$ npx -y @howells/fieldwork-mcp \\
    --search parallel \\
    --read firecrawl \\
    --research exa`;
