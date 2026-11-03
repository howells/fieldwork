import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import manifest from "../package.json" with { type: "json" };
import { USAGE } from "../src/config.js";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

const run = (...args: string[]) => {
  if (!existsSync(cli)) {
    throw new Error("dist/cli.js is missing; run `pnpm build` first");
  }
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf-8" });
};

describe("the built fieldwork-mcp command", () => {
  it("prints its version to stdout and exits 0", () => {
    const result = run("--version");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${manifest.version}\n`);
    expect(result.stderr).toBe("");
  });

  it("prints its usage to stdout", () => {
    const result = run("--help");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${USAGE}\n`);
    expect(result.stderr).toBe("");
  });

  it("exits 1 with an error on stderr for an unknown flag", () => {
    const result = run("--allow-everything");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Unknown option --allow-everything/u);
    expect(result.stdout).toBe("");
  });
});
