// A small TypeScript tokenizer for the home page's hand-set samples. The
// samples are short and known, and the design colours only keywords, strings
// and comments, so a Shiki theme would be more machinery than the job needs.

export type TokenKind = "comment" | "keyword" | "plain" | "string";

export interface Token {
  kind: TokenKind;
  text: string;
}

const KEYWORDS = new Set([
  "await",
  "catch",
  "const",
  "from",
  "if",
  "import",
  "instanceof",
  "new",
  "return",
  "throw",
  "try",
]);

const PATTERN =
  /(?<comment>\/\/.*$)|(?<string>"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(?<word>[A-Za-z_$][\w$]*)\b/gu;

const kindOf = (groups: Record<string, string | undefined>): TokenKind => {
  if (groups.comment !== undefined) {
    return "comment";
  }
  if (groups.string !== undefined) {
    return "string";
  }
  if (groups.word !== undefined && KEYWORDS.has(groups.word)) {
    return "keyword";
  }
  return "plain";
};

/** Splits one line of TypeScript into coloured tokens. */
export const tokenizeLine = (line: string): Token[] => {
  const tokens: Token[] = [];
  let cursor = 0;
  for (const match of line.matchAll(PATTERN)) {
    const kind = kindOf(match.groups ?? {});
    if (kind !== "plain") {
      if (match.index > cursor) {
        tokens.push({ kind: "plain", text: line.slice(cursor, match.index) });
      }
      tokens.push({ kind, text: match[0] });
      cursor = match.index + match[0].length;
    }
  }
  if (cursor < line.length) {
    tokens.push({ kind: "plain", text: line.slice(cursor) });
  }
  return tokens;
};

/** Splits a sample into lines of tokens, dropping a leading and trailing blank line. */
export const tokenize = (code: string): Token[][] =>
  code.replace(/^\n/u, "").replace(/\n$/u, "").split("\n").map(tokenizeLine);
