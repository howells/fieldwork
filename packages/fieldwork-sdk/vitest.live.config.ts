import { defineConfig } from "vitest/config";

// Live provider calls: run with `pnpm test:live`. Research runs take minutes.
export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["tests/live/**/*.live.ts"],
    testTimeout: 300_000,
  },
});
