import { defineConfig } from "tsdown";

export default defineConfig({
  clean: false,
  dts: true,
  entry: { cli: "src/cli.ts", index: "src/index.ts" },
  format: ["esm"],
  outExtensions: () => ({ dts: ".d.ts", js: ".js" }),
  sourcemap: false,
});
