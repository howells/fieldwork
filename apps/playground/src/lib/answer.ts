// The agent's answer, split for the result view: a one-line headline (the
// "# " line it is asked to write first) and paragraphs whose citations,
// written as markdown links with a number for text, become numbered marks.
export type Piece =
  | { kind: "text"; text: string }
  | { kind: "cite"; number: number; url: string };

export interface Answer {
  headline?: string;
  paragraphs: Piece[][];
  sources: { number: number; url: string }[];
}

const CITATION = /\[(?<digits>\d+)\]\((?<url>https?:\/\/[^\s)]+)\)/gu;
// Markdown emphasis the agent sometimes adds; the view sets its own weight.
const EMPHASIS = /\*\*(?<bold>[^*]+)\*\*|__(?<under>[^_]+)__/gu;

const plainText = (text: string): string =>
  text.replaceAll(EMPHASIS, "$<bold>$<under>");

const piecesOf = (line: string, sources: Map<number, string>): Piece[] => {
  const pieces: Piece[] = [];
  let cursor = 0;
  for (const match of line.matchAll(CITATION)) {
    const [whole] = match;
    const digits = match.groups?.digits;
    const url = match.groups?.url;
    if (match.index > cursor) {
      pieces.push({
        kind: "text",
        text: plainText(line.slice(cursor, match.index)),
      });
    }
    const number = Number(digits);
    if (url !== undefined) {
      sources.set(number, url);
      pieces.push({ kind: "cite", number, url });
    }
    cursor = match.index + whole.length;
  }
  if (cursor < line.length) {
    pieces.push({ kind: "text", text: plainText(line.slice(cursor)) });
  }
  return pieces;
};

export const parseAnswer = (text: string): Answer => {
  const lines = text
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const [first] = lines;
  const headline =
    first?.startsWith("# ") === true
      ? plainText(first.slice(2).trim())
      : undefined;
  const sources = new Map<number, string>();
  const paragraphs = (headline === undefined ? lines : lines.slice(1)).map(
    (line) => piecesOf(line.replace(/^#+\s*/u, ""), sources)
  );
  return {
    headline,
    paragraphs,
    sources: [...sources]
      .map(([number, url]) => ({ number, url }))
      .toSorted((a, b) => a.number - b.number),
  };
};
