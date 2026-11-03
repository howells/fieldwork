import { country, resume } from "./fields.js";
import {
  ACT_OUTPUT,
  CLOSE_BROWSER_OUTPUT,
  OPEN_BROWSER_OUTPUT,
  PARSE_OUTPUT,
} from "./outputs.js";
import { choice, flag, text, whole } from "./schema.js";
import type { Spec } from "./types.js";

export const BROWSER_SPECS: Spec[] = [
  {
    capability: "act",
    description:
      "Run a script in a new remote browser session and return what it printed and returned; the session closes afterwards. The script can visit sites, click, type and submit forms, and its effects on those sites are real. Use only when a page needs interaction that reading cannot do. Do not use to read or search pages.",
    destructive: true,
    fields: [
      {
        name: "code",
        required: true,
        schema: text("The script to run."),
      },
      {
        name: "language",
        providers: ["firecrawl"],
        schema: choice("The script's language. Defaults to node.", [
          "node",
          "python",
          "bash",
        ]),
      },
    ],
    idempotent: false,
    name: "run_browser_script",
    output: ACT_OUTPUT,
    positional: ["code"],
    readOnly: false,
    title: "Run a browser script",
  },
  {
    capability: "browser",
    description:
      "Open a remote browser session and return its Chrome DevTools Protocol (CDP) URL, a live-view URL and when it expires, for driving it yourself with Playwright or Puppeteer. The session bills until it expires or close_browser is called, and its effects on the sites it visits are real. Use only when you need a browser you control. Do not use to read pages or run a one-off script (use run_browser_script).",
    destructive: true,
    fields: [
      {
        name: "ttl",
        providers: ["firecrawl"],
        schema: whole(
          "Seconds the session may live, 30 to 3600. It closes by itself after that.",
          30,
          3600
        ),
      },
      {
        name: "ttl",
        providers: ["browserbase"],
        schema: whole(
          "Seconds the session may live, 60 to 21600. It closes by itself after that.",
          60,
          21_600
        ),
      },
      country(["firecrawl"], "Browse from"),
    ],
    idempotent: false,
    method: "open",
    name: "open_browser",
    output: OPEN_BROWSER_OUTPUT,
    positional: [],
    readOnly: false,
    title: "Open a browser",
  },
  {
    capability: "browser",
    confirmAs: "closed",
    description:
      "Close a remote browser session opened with open_browser, so it stops billing. Anything still running in the session ends. Use when you are done with a session. Do not use on a session you did not open.",
    destructive: true,
    fields: [
      {
        name: "id",
        required: true,
        schema: text("The session's id, from open_browser."),
      },
    ],
    idempotent: true,
    method: "close",
    name: "close_browser",
    output: CLOSE_BROWSER_OUTPUT,
    positional: ["id"],
    readOnly: false,
    title: "Close a browser",
  },
  {
    capability: "parse",
    description:
      "Convert a document file (PDF, DOCX, XLSX, PPTX, HTML or CSV) to Markdown. Use when you have the file's bytes. Do not use for a document at a public URL (use read_page).",
    destructive: false,
    fields: [
      {
        name: "name",
        required: true,
        schema: text(
          "The file name with its extension, such as spec-sheet.pdf. The extension tells the provider the type."
        ),
      },
      {
        name: "contentBase64",
        required: true,
        schema: text("The file's bytes, base64-encoded."),
      },
      {
        name: "pages",
        providers: ["firecrawl"],
        schema: flag("Also return the Markdown of each page separately."),
      },
      resume(["llamaparse", "reducto"]),
    ],
    idempotent: true,
    name: "parse_document",
    output: PARSE_OUTPUT,
    positional: ["name", "contentBase64"],
    readOnly: true,
    title: "Convert a document to Markdown",
  },
];
