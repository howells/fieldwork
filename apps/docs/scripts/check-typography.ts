// Enforces the type case defined in theme.css: every piece of site text takes
// one type-* role, and nothing outside theme.css sets size, weight, family,
// leading, tracking or case. Allowed beside a role: font-medium, font-mono and
// tabular-nums.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCAN = ["components", "pages", "docs"];

// Components that own their typography and expose a size choice instead.
const EXCEPTIONS = new Map([
  [
    "components/home/code.astro",
    "the code sample sets its own size through its size prop",
  ],
  [
    "components/home/router.astro",
    "the route diagram is an SVG; its text is sized in the drawing's own units",
  ],
]);

const NAMED_TEXT_SIZE = /^text-(?:xs|sm|base|lg|xl|[2-9]xl)$/u;
const ARBITRARY_SIZE =
  /^text-\[(?!#|var\(|rgb|hsl|okl(?:ch|ab)|color[-:(]|currentColor)[^\]]+\]$/u;
const VARIABLE_SIZE = /^text-\(length:--[\w-]+\)$/u;
const FONT_WEIGHT =
  /^font-(?:thin|extralight|light|normal|semibold|bold|extrabold|black|\[\d+\])$/u;
const FONT_FAMILY = /^font-(?:sans|serif|display|\[[^\]]+\])$/u;
const TRACKING = /^-?tracking-(?:[\w.-]+|\[[^\]]+\]|\(--[\w-]+\))$/u;
const LEADING = /^leading-(?:[\w.-]+|\[[^\]]+\]|\(--[\w-]+\))$/u;
const CASE = /^(?:uppercase|lowercase)$/u;
const CSS_SHAPE =
  /(?:^|[;{\s])(?<property>font-size|font-weight|font-family|line-height|letter-spacing|text-transform)\s*:/gu;
const CLASS_ATTRIBUTE = /\bclass="(?<list>[^"]*)"/gu;
const CLASS_LIST = /\bclass:list=\{(?<body>[\s\S]*?)\}\s*(?=[\w-]+=|\/?>)/gu;
const STRING_LITERAL = /"(?<value>[^"]*)"/gu;
const STYLE_BLOCK = /<style[^>]*>(?<css>[\s\S]*?)<\/style>/gu;
const SHAPE_ATTRIBUTE = /\s(?<attribute>font-size|font-family|font-weight)="/gu;
const ROLES =
  "type-display, type-heading, type-title, type-lead, type-body or type-small";

// The utility without its variants, important marker or /modifier.
const baseUtility = (token: string): string => {
  const stripped = token.endsWith("!") ? token.slice(0, -1) : token;
  let depth = 0;
  let lastColon = -1;
  let lastSlash = -1;
  for (let index = 0; index < stripped.length; index += 1) {
    const char = stripped.charAt(index);
    if (char === "[" || char === "(") {
      depth += 1;
    } else if (char === "]" || char === ")") {
      depth -= 1;
    } else if (depth === 0 && char === ":") {
      lastColon = index;
      lastSlash = -1;
    } else if (depth === 0 && char === "/") {
      lastSlash = index;
    }
  }
  const base = stripped.slice(
    lastColon + 1,
    lastSlash === -1 ? undefined : lastSlash
  );
  return base.startsWith("!") ? base.slice(1) : base;
};

const problem = (token: string): string | null => {
  const base = baseUtility(token);
  if (
    NAMED_TEXT_SIZE.test(base) ||
    ARBITRARY_SIZE.test(base) ||
    VARIABLE_SIZE.test(base)
  ) {
    return `font size "${token}": use ${ROLES}`;
  }
  if (FONT_WEIGHT.test(base)) {
    return `font weight "${token}": the role sets weight; font-medium is the one emphasis`;
  }
  if (FONT_FAMILY.test(base)) {
    return `font family "${token}": the role sets the family; font-mono is the one exception`;
  }
  if (LEADING.test(base)) {
    return `line height "${token}": the role sets leading; delete it`;
  }
  if (TRACKING.test(base)) {
    return `tracking "${token}": the role sets tracking; delete it`;
  }
  if (CASE.test(base)) {
    return `case "${token}": uppercase and lowercase belong to a role`;
  }
  return null;
};

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(full);
    }
    return /\.(?:astro|mdx|md)$/u.test(entry.name) ? [full] : [];
  });

const lineOf = (source: string, index: number): number =>
  source.slice(0, index).split("\n").length;

const classFindings = (relative: string, source: string): string[] => {
  // Class lists: class="…", and every string literal inside class:list={…}.
  const classLists: { index: number; list: string }[] = [];
  for (const match of source.matchAll(CLASS_ATTRIBUTE)) {
    classLists.push({ index: match.index, list: match.groups?.list ?? "" });
  }
  for (const match of source.matchAll(CLASS_LIST)) {
    for (const literal of (match.groups?.body ?? "").matchAll(STRING_LITERAL)) {
      classLists.push({
        index: match.index,
        list: literal.groups?.value ?? "",
      });
    }
  }
  return classLists.flatMap(({ index, list }) =>
    list
      .split(/\s+/u)
      .map((token) => (token === "" ? null : problem(token)))
      .filter((message) => message !== null)
      .map((message) => `${relative}:${lineOf(source, index)} ${message}`)
  );
};

// Style blocks and SVG attributes set shape too.
const styleFindings = (relative: string, source: string): string[] => {
  const findings: string[] = [];
  for (const block of source.matchAll(STYLE_BLOCK)) {
    const css = block.groups?.css ?? "";
    const offset = block.index + block[0].indexOf(css);
    for (const declaration of css.matchAll(CSS_SHAPE)) {
      findings.push(
        `${relative}:${lineOf(source, offset + declaration.index)} ${declaration.groups?.property ?? ""} in a style block: put a type-* role on the element`
      );
    }
  }
  for (const attribute of source.matchAll(SHAPE_ATTRIBUTE)) {
    findings.push(
      `${relative}:${lineOf(source, attribute.index)} ${attribute.groups?.attribute ?? ""} attribute: put a type-* role on the element`
    );
  }
  return findings;
};

const fileFindings = (relative: string, source: string): string[] => [
  ...classFindings(relative, source),
  ...styleFindings(relative, source),
];

const findings = SCAN.flatMap((dir) => sourceFiles(path.join(ROOT, dir)))
  .map((file) => path.relative(ROOT, file))
  .filter((relative) => !EXCEPTIONS.has(relative))
  .flatMap((relative) =>
    fileFindings(relative, readFileSync(path.join(ROOT, relative), "utf-8"))
  );

if (findings.length > 0) {
  console.error(
    `Typography outside the type case (${findings.length}):\n${findings.join("\n")}`
  );
  process.exit(1);
}
console.log("typography ok: every text style comes from the type case");
