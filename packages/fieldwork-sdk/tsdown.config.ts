import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    exa: "src/adapters/exa.ts",
    firecrawl: "src/adapters/firecrawl.ts",
    tavily: "src/adapters/tavily.ts",
    parallel: "src/adapters/parallel.ts",
    perplexity: "src/adapters/perplexity.ts",
  },
  format: ["esm"],
  dts: true,
  clean: false,
  sourcemap: false,
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
