// Schemas for LlamaParse's responses. Each reads a response without failing: a missing or mistyped field is absent, not an error.
// `documentBlocks` turns its items, boxes in page points, into the normalized blocks with boxes in fractions of the page.
// The adapter in ../llamaparse.ts parses each response with one of these.

import * as z from "zod/mini";

import { enclosing } from "../../document.js";
import {
  anything,
  arrayOf,
  looseObject,
  optionalAnyString,
  optionalId,
  optionalNumber,
  optionalScalar,
  optionalString,
  withOriginal,
} from "../../parse.js";
import type { Box, DocumentBlock, TableCell, WordBox } from "../../types.js";
import { compact } from "../../util.js";

/** A box in page points, from the page's top-left corner. */
const PointBox = looseObject({
  h: optionalNumber,
  w: optionalNumber,
  x: optionalNumber,
  y: optionalNumber,
});

/** A word: `span` is `[start, end)` in UTF-8 bytes of its item's text. */
const Word = looseObject({ bbox: PointBox, span: arrayOf(z.number()) });

const Line = looseObject({ words: arrayOf(Word) });

const Cell = looseObject({ bbox: arrayOf(PointBox), lines: arrayOf(Line) });

/** An item of a page. Its own `items` (a header's, a list's) are read one level at a time. */
const Item = looseObject({
  bbox: arrayOf(PointBox),
  grounding: looseObject({
    lines: arrayOf(Line),
    rows: arrayOf(arrayOf(Cell)),
  }),
  items: arrayOf(anything),
  md: optionalAnyString,
  /** A table's cells as text; a number reads as its digits. */
  rows: arrayOf(arrayOf(optionalScalar)),
  type: optionalString,
  value: optionalAnyString,
});

/** A page of items: in `items.pages` of a job, and a row of the grounded items. */
export const ItemsPage = looseObject({
  items: arrayOf(Item),
  page_height: optionalNumber,
  page_number: optionalNumber,
  page_width: optionalNumber,
});

/** `POST /api/v2/parse/upload`. */
export const JobStart = looseObject({ id: withOriginal(optionalId) });

/** `GET /api/v2/parse/{id}`, as it arrived beside the value read from it. */
export const JobResult = withOriginal(
  looseObject({
    images_content_metadata: looseObject({
      images: arrayOf(
        looseObject({
          filename: optionalString,
          presigned_url: optionalString,
        })
      ),
    }),
    items: looseObject({ pages: arrayOf(ItemsPage) }),
    job: looseObject({
      error_message: optionalString,
      status: optionalString,
      usage: looseObject({ credits: optionalNumber }),
    }),
    markdown: looseObject({
      pages: arrayOf(
        looseObject({
          markdown: optionalAnyString,
          page_number: optionalNumber,
        })
      ),
    }),
    result_content_metadata: looseObject({
      grounded_items: looseObject({ presigned_url: optionalString }),
    }),
  })
);

/** A parse job's result: `value` is what the schema read, `original` the response as it arrived, for `raw` and error causes. */
export type JobResultBlock = z.output<typeof JobResult>;
type ItemsPageBlock = z.output<typeof ItemsPage>;
type ItemBlock = z.output<typeof Item>;
type PointBoxBlock = z.output<typeof PointBox>;
type LineBlock = z.output<typeof Line>;

interface PageSize {
  width: number;
  height: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const fraction = (box: PointBoxBlock, size: PageSize): Box | undefined => {
  const { h, w, x, y } = box;
  if (
    x === undefined ||
    y === undefined ||
    w === undefined ||
    h === undefined
  ) {
    return undefined;
  }
  return {
    height: h / size.height,
    left: x / size.width,
    top: y / size.height,
    width: w / size.width,
  };
};

const around = (
  boxes: readonly PointBoxBlock[],
  size: PageSize
): Box | undefined =>
  enclosing(
    boxes
      .map((box) => fraction(box, size))
      .filter((box): box is Box => box !== undefined)
  );

const wordsOf = (
  lines: readonly LineBlock[],
  text: string,
  size: PageSize
): WordBox[] => {
  const bytes = encoder.encode(text);
  return lines.flatMap((line) =>
    line.words.flatMap((word) => {
      const box = fraction(word.bbox, size);
      const [start, end] = word.span;
      if (box === undefined || start === undefined || end === undefined) {
        return [];
      }
      return [{ box, text: decoder.decode(bytes.slice(start, end)) }];
    })
  );
};

const tableOf = (item: ItemBlock, size: PageSize) => {
  const cells: TableCell[] = [];
  const words: WordBox[] = [];
  for (const [row, grounded] of item.grounding.rows.entries()) {
    for (const [column, cell] of grounded.entries()) {
      const text = item.rows[row]?.[column];
      if (text !== undefined) {
        cells.push(
          compact({ box: around(cell.bbox, size), column, row, text })
        );
        words.push(...wordsOf(cell.lines, text, size));
      }
    }
  }
  return { cells, words };
};

const blocksOfItem = (
  item: ItemBlock,
  page: number,
  size: PageSize | undefined
): DocumentBlock[] => {
  // A header, a footer or a list holds its content in items of its own.
  if (item.items.length > 0) {
    return item.items.flatMap((child) =>
      blocksOfItem(z.parse(Item, child), page, size)
    );
  }
  const text = item.md ?? item.value ?? "";
  if (size === undefined) {
    return [{ page, text, type: item.type ?? "unknown" }];
  }
  const table = tableOf(item, size);
  const words = [...wordsOf(item.grounding.lines, text, size), ...table.words];
  return [
    compact({
      box: around(item.bbox, size),
      cells: table.cells.length > 0 ? table.cells : undefined,
      page,
      text,
      type: item.type ?? "unknown",
      words: words.length > 0 ? words : undefined,
    }),
  ];
};

/** The blocks of each page, its boxes turned from points into fractions of the page. */
export const documentBlocks = (
  pages: readonly ItemsPageBlock[]
): DocumentBlock[] =>
  pages.flatMap((entry) => {
    const page = entry.page_number;
    if (page === undefined) {
      return [];
    }
    const size =
      entry.page_width !== undefined &&
      entry.page_height !== undefined &&
      entry.page_width > 0 &&
      entry.page_height > 0
        ? { height: entry.page_height, width: entry.page_width }
        : undefined;
    return entry.items.flatMap((item) => blocksOfItem(item, page, size));
  });
