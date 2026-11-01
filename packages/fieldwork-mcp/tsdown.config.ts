import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { index: "src/index.ts", cli: "src/cli.ts" },
  format: ["esm"],
  dts: true,
  clean: false,
  sourcemap: false,
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
