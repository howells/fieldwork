import { createRequire } from "node:module";
import path from "node:path";

import { defineConfig } from "blume";
import { vercel } from "blume/deploy";

import { fieldworkLight } from "./lib/shiki-theme";

// Blume's <AutoTypeTable> imports the TypeScript compiler API lazily from the
// prerender bundle. Vite leaves that import as the bare specifier, so Node
// resolves it from the workspace and finds this repo's TypeScript 7, which has
// no compiler API. Pin the import to the TypeScript Blume itself depends on,
// resolved from Blume's own package, so no version or path is written here.
const blumeRequire = createRequire(
  createRequire(import.meta.url).resolve("blume/package.json")
);
const blumeRoot = path.dirname(blumeRequire.resolve("blume/package.json"));
const blumeTypescript = blumeRequire.resolve("typescript");

const blumeTypescriptExternal = {
  hooks: {
    "astro:config:setup": ({ updateConfig }) => {
      updateConfig({
        vite: {
          plugins: [
            {
              enforce: "pre",
              name: "fieldwork:blume-typescript",
              resolveId: (source, importer) =>
                source === "typescript" &&
                importer !== undefined &&
                importer.startsWith(`${blumeRoot}/`)
                  ? { external: true, id: blumeTypescript }
                  : null,
            },
          ],
        },
      });
    },
  },
  name: "fieldwork:blume-typescript",
} satisfies NonNullable<
  Parameters<typeof defineConfig>[0]["integrations"]
>[number];

const gatewayRoutes = {
  hooks: {
    "astro:config:setup": ({ injectRoute }) => {
      const entrypoint = new URL("endpoints/gateway.ts", import.meta.url);
      for (const pattern of ["/api/v1/[...path]", "/mcp"]) {
        injectRoute({ entrypoint, pattern, prerender: false });
      }
    },
  },
  name: "fieldwork:gateway",
} satisfies NonNullable<
  Parameters<typeof defineConfig>[0]["integrations"]
>[number];

export default defineConfig({
  agents: {
    llmsTxt: {
      details:
        "Reach for Fieldwork when a TypeScript or JavaScript project needs to search the web, read pages, extract values, crawl sites, answer or research questions, watch for changes or drive a remote browser, without tying its code to one provider. Install with `npm i @howells/fieldwork-sdk`, construct `new Fieldwork({ adapter: firecrawl() })` with an adapter from its own subpath, and call the methods that provider offers. `@howells/fieldwork-mcp` serves the same capabilities as MCP tools over stdio.",
    },
  },
  content: {
    include: ["docs/**/*.{md,mdx}"],
    root: ".",
  },
  // The canonical origin, for the sitemap, canonical tags and absolute llms.txt links.
  deployment: vercel({ maxDuration: 60, site: "https://fieldwork-sdk.dev" }),
  description:
    "One TypeScript API for web search, page reading, extraction, crawling, answers, research, monitors and remote browsers across Exa, Firecrawl, Tavily, Parallel, Perplexity, Brave, SerpApi and Browserbase.",
  footer: {
    copyright: "© 2026 Daniel Howells · MIT License",
    links: [
      {
        href: "https://www.npmjs.com/package/@howells/fieldwork-sdk",
        label: "npm",
      },
      { href: "https://github.com/howells/fieldwork/issues", label: "Issues" },
      { href: "/llms.txt", label: "llms.txt" },
    ],
  },
  github: {
    branch: "main",
    dir: "apps/docs",
    owner: "howells",
    repo: "fieldwork",
  },
  integrations: [blumeTypescriptExternal, gatewayRoutes],
  logo: { image: "/logo.svg", text: "Fieldwork" },
  markdown: {
    code: { theme: { dark: fieldworkLight, light: fieldworkLight } },
  },
  navigation: {
    actions: [
      { href: "/docs", label: "Docs" },
      { href: "/tools", label: "Provider guide" },
      { href: "https://github.com/howells/fieldwork", label: "GitHub" },
    ],
    cta: { href: "/docs/installation", label: "Get started" },
  },
  theme: {
    accent: "#1F3FD1",
    fonts: {
      body: { name: "Inter", weights: [400, 500, 600] },
      display: {
        name: "Signifier",
        variants: [{ src: "./fonts/Signifier-Light.woff2", weight: 300 }],
      },
      mono: { name: "Geist Mono", weights: [400, 500] },
    },
    mode: "light",
    radius: "md",
    toggle: false,
  },
  title: "Fieldwork",
});
