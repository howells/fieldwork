#!/usr/bin/env node
import { createRequire } from "node:module";

import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import { USAGE, fieldworkFor, parseArgs } from "./config.js";
import { createFieldworkServer } from "./server.js";

const hasVersion = (value: unknown): value is { version: string } =>
  typeof value === "object" &&
  value !== null &&
  "version" in value &&
  typeof value.version === "string";

const readVersion = (): string => {
  const manifest: unknown = createRequire(import.meta.url)("../package.json");
  return hasVersion(manifest) ? manifest.version : "0.0.0";
};

// stdout carries the protocol, so everything for a person goes to stderr.
try {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    process.stderr.write(`${USAGE}\n`);
  } else if (config.version) {
    process.stderr.write(`${readVersion()}\n`);
  } else {
    const server = createFieldworkServer(fieldworkFor(config), {
      allow: config.allow,
      maxCharacters: config.maxCharacters,
      version: readVersion(),
    });
    await server.connect(new StdioServerTransport());
  }
} catch (error) {
  process.stderr.write(
    `fieldwork-mcp: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
}
