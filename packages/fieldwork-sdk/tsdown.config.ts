import { defineConfig } from "tsdown";

export default defineConfig({
  clean: false,
  dts: true,
  entry: {
    brave: "src/adapters/brave.ts",
    browserbase: "src/adapters/browserbase.ts",
    exa: "src/adapters/exa.ts",
    firecrawl: "src/adapters/firecrawl.ts",
    index: "src/index.ts",
    llamaparse: "src/adapters/llamaparse.ts",
    parallel: "src/adapters/parallel.ts",
    perplexity: "src/adapters/perplexity.ts",
    reducto: "src/adapters/reducto.ts",
    serpapi: "src/adapters/serpapi.ts",
    tavily: "src/adapters/tavily.ts",
    tools: "src/tools.ts",
  },
  format: ["esm"],
  outExtensions: () => ({ dts: ".d.ts", js: ".js" }),
  sourcemap: false,
});
