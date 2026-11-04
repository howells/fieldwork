import { defineConfig } from "vitest/config";

// Live provider calls: run with `pnpm test:live`. Research runs take minutes.
// Provider keys come from the repo's .env.local; a variable already set in the
// shell wins.
process.loadEnvFile(new URL("../../.env.local", import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["tests/live/**/*.live.ts"],
    testTimeout: 300_000,
  },
});
