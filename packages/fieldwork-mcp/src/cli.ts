#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import { USAGE, fieldworkFor, parseArgs } from "./config.js";
import { createFieldworkServer } from "./server.js";
import { VERSION } from "./version.js";

// While serving, stdout carries the protocol. Help and version are the only
// output meant for a person, so they alone go to stdout; errors go to stderr.
try {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    process.stdout.write(`${USAGE}\n`);
  } else if (config.version) {
    process.stdout.write(`${VERSION}\n`);
  } else {
    const server = createFieldworkServer(fieldworkFor(config), {
      allow: config.allow,
      maxCharacters: config.maxCharacters,
    });
    await server.connect(new StdioServerTransport());
  }
} catch (error) {
  process.stderr.write(
    `fieldwork-mcp: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
}
