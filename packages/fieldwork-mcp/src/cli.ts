#!/usr/bin/env node
import { createRequire } from "node:module";

import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import { USAGE, fieldworkFor, parseArgs } from "./config.js";
import { createFieldworkServer } from "./server.js";

const { version } = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

// stdout carries the protocol, so everything for a person goes to stderr.
try {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    process.stderr.write(`${USAGE}\n`);
  } else if (config.version) {
    process.stderr.write(`${version}\n`);
  } else {
    const web = fieldworkFor(config);
    const server = createFieldworkServer(web, {
      version,
      maxCharacters: config.maxCharacters,
      capabilities: config.allowAct
        ? Object.entries(web.capabilities)
            .filter(([, offered]) => offered)
            .map(([capability]) => capability as keyof typeof web.capabilities)
        : undefined,
    });
    await server.connect(new StdioServerTransport());
  }
} catch (error) {
  process.stderr.write(
    `fieldwork-mcp: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
}
