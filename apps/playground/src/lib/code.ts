// The SDK calls a run made, written out as code you could paste: the router
// that served each capability, then each call with the input the agent sent.
// Tokens carry a kind so the panel can colour keywords and strings.
import { z } from "zod";

import type { Json } from "./events";
import type { CallState } from "./run-state";

export type TokenKind = "keyword" | "string" | "plain";

export interface Token {
  kind: TokenKind;
  text: string;
}

export type Line = Token[];

/**
 * Each tool's leading arguments, in order; every other input goes in the
 * options object after them. This mirrors the SDK's tool specs, whose
 * `positional` list is not part of the public `FieldworkTool`.
 */
const POSITIONAL_FOR = {
  answer_question: ["question"],
  create_monitor: [],
  extract_values: ["url"],
  find_entities: ["objective"],
  make_decisions: ["context", "questions"],
  map_site: ["url"],
  read_page: ["url"],
  read_pages: ["urls"],
  read_product: ["url"],
  research_question: ["question"],
  search_web: ["query"],
} satisfies Record<string, readonly string[]>;

const POSITIONAL = new Map<string, readonly string[]>(
  Object.entries(POSITIONAL_FOR)
);

const NAME_FOR = {
  answer: "answer",
  decide: "decisions",
  discover: "entities",
  extract: "values",
  map: "links",
  monitor: "monitor",
  product: "product",
  read: "page",
  readMany: "pages",
  research: "report",
  search: "results",
} satisfies Record<string, string>;

const NAMES = new Map(Object.entries(NAME_FOR));

const RecordSchema = z.record(z.string(), z.json());
const ListSchema = z.array(z.json());

const plain = (text: string): Token => ({ kind: "plain", text });
const keyword = (text: string): Token => ({ kind: "keyword", text });

/** A JSON value as a JavaScript literal, on one line. */
/**
 * A JSON value as a JavaScript literal, on one line. A string equal to
 * `alias` is written as the variable `url` instead.
 */
export const literal = (value: Json, alias?: string): Token[] => {
  if (alias !== undefined && value === alias) {
    return [plain("url")];
  }
  const list = ListSchema.safeParse(value);
  if (list.success) {
    return [
      plain("["),
      ...list.data.flatMap((item, index) => [
        ...(index > 0 ? [plain(", ")] : []),
        ...literal(item, alias),
      ]),
      plain("]"),
    ];
  }
  const record = RecordSchema.safeParse(value);
  if (record.success) {
    const entries = Object.entries(record.data);
    if (entries.length === 0) {
      return [plain("{}")];
    }
    return [
      plain("{ "),
      ...entries.flatMap(([key, item], index) => [
        plain(
          `${index > 0 ? ", " : ""}${/^[A-Za-z_$][\w$]*$/u.test(key) ? key : JSON.stringify(key)}: `
        ),
        ...literal(item, alias),
      ]),
      plain(" }"),
    ];
  }
  const text = JSON.stringify(value);
  return [
    { kind: z.string().safeParse(value).success ? "string" : "plain", text },
  ];
};

const width = (tokens: readonly Token[]): number =>
  tokens.reduce((total, token) => total + token.text.length, 0);

/** The widest line the panel shows before an options object breaks onto its own lines. */
const MAX_WIDTH = 46;

const methodOf = (call: CallState): string =>
  call.method === undefined
    ? call.capability
    : `${call.capability}.${call.method}`;

/**
 * The input the SDK received. The model sends null for options it leaves
 * out, and those never reach the call, so they are dropped here too.
 */
const sentInput = (call: CallState): Record<string, Json> => {
  const input = RecordSchema.safeParse(call.input);
  return input.success
    ? Object.fromEntries(
        Object.entries(input.data).filter(([, value]) => value !== null)
      )
    : {};
};

const callLines = (call: CallState, name: string, alias?: string): Line[] => {
  const values = sentInput(call);
  const positional = POSITIONAL.get(call.tool) ?? [];
  const leading = positional.flatMap((key) => {
    const value = values[key];
    return value === undefined ? [] : [literal(value, alias)];
  });
  const options = Object.entries(values).filter(
    ([key]) => !positional.includes(key)
  );
  const head: Token[] = [
    keyword("const"),
    plain(` ${name} = `),
    keyword("await"),
    plain(` web.${methodOf(call)}(`),
  ];
  const args = leading.flatMap((tokens, index) => [
    ...(index > 0 ? [plain(", ")] : []),
    ...tokens,
  ]);
  const optionTokens =
    options.length === 0 ? [] : literal(Object.fromEntries(options), alias);
  const oneLine: Line = [
    ...head,
    ...args,
    ...(args.length > 0 && optionTokens.length > 0 ? [plain(", ")] : []),
    ...optionTokens,
    plain(");"),
  ];
  if (width(oneLine) <= MAX_WIDTH || options.length === 0) {
    return [oneLine];
  }
  return [
    [...head, ...args, plain(args.length > 0 ? ", {" : "{")],
    ...options.map(([key, value]) => [
      plain(`  ${key}: `),
      ...literal(value, alias),
      plain(","),
    ]),
    [plain("});")],
  ];
};

/** The router line: each capability the run called, and the provider that served it. */
const routerLines = (calls: readonly CallState[]): Line[] => {
  const routes = new Map(calls.map((call) => [call.capability, call.provider]));
  const entries = [...routes].toSorted(([a], [b]) => a.localeCompare(b));
  return [
    [
      keyword("const"),
      plain(" web = "),
      keyword("new"),
      plain(" Fieldwork({ adapter: router({"),
    ],
    ...entries.map(([capability, provider]) => [
      plain(`  ${capability}: ${provider}(),`),
    ]),
    [plain("}) });")],
  ];
};

export const codeFor = (calls: readonly CallState[], url?: string): Line[] => {
  if (calls.length === 0) {
    return [];
  }
  const used = new Map<string, number>();
  const body = calls.flatMap((call) => {
    const base = NAMES.get(call.capability) ?? "result";
    const seen = (used.get(base) ?? 0) + 1;
    used.set(base, seen);
    return callLines(call, seen === 1 ? base : `${base}${seen}`, url);
  });
  const usesUrl =
    url !== undefined &&
    calls.some((call) =>
      JSON.stringify(call.input).includes(JSON.stringify(url))
    );
  const head: Line[] = usesUrl
    ? [
        [
          keyword("const"),
          plain(" url = "),
          { kind: "string", text: JSON.stringify(url) },
          plain(";"),
        ],
        [],
      ]
    : [];
  return [...head, ...routerLines(calls), [], ...body];
};

export const lineText = (line: Line): string =>
  line.map((token) => token.text).join("");

/** A short literal stays as written; anything longer goes by its name. */
const SHORT = 28;

const argument = (key: string, value: Json): string => {
  const text = JSON.stringify(value);
  return z.string().safeParse(value).success && text.length <= SHORT
    ? text
    : key;
};

/**
 * The call as the step list shows it, in one short line:
 * `search("HAY Mags sofa", { country: "GB" })`, `readMany(urls, { query })`.
 */
export const signature = (call: CallState): string => {
  const values = sentInput(call);
  const positional = POSITIONAL.get(call.tool) ?? [];
  const leading = positional
    .filter((key) => values[key] !== undefined)
    .map((key) => argument(key, values[key] ?? null));
  const options = Object.entries(values)
    .filter(([key]) => !positional.includes(key))
    .map(([key, value]) => {
      const shown = argument(key, value);
      return shown === key ? key : `${key}: ${shown}`;
    });
  const rest = options.length === 0 ? [] : [`{ ${options.join(", ")} }`];
  return `${methodOf(call)}(${[...leading, ...rest].join(", ")})`;
};

/** The reads a compare ran, one adapter each, as code. */
export const compareCode = (
  providers: readonly string[],
  url: string
): Line[] => [
  [
    keyword("const"),
    plain(" url = "),
    { kind: "string", text: JSON.stringify(url) },
    plain(";"),
  ],
  [
    keyword("const"),
    plain(" reads = "),
    keyword("await"),
    plain(" Promise.all(["),
  ],
  ...providers.map((provider) => [
    plain(`  new Fieldwork({ adapter: ${provider}() }).read(url),`),
  ]),
  [plain("]);")],
];
