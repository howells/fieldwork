// Schemas for Reducto's responses. Each reads a response without failing: a missing or mistyped field is absent, not an error.
// `documentBlocks` turns the parse output into the normalized blocks. Reducto's boxes are already fractions of the page.
// The adapter in ../reducto.ts parses each response with one of these.

import * as z from "zod/mini";

import {
  arrayOf,
  looseObject,
  optionalAnyString,
  optionalId,
  optionalNumber,
  optionalString,
  withOriginal,
} from "../../parse.js";
import type { Box, DocumentBlock, TableCell, WordBox } from "../../types.js";
import { compact } from "../../util.js";

/** A box in fractions of the page, from its top-left corner. `page` counts the pages parsed; `original_page` the file's. */
const FractionBox = looseObject({
  height: optionalNumber,
  left: optionalNumber,
  original_page: optionalNumber,
  page: optionalNumber,
  top: optionalNumber,
  width: optionalNumber,
});

/** A layout block. `extra` holds the word and cell citations, which the `return_citations` setting asks for. */
const Block = looseObject({
  bbox: FractionBox,
  content: optionalAnyString,
  extra: looseObject({
    cell_citations: arrayOf(
      looseObject({
        bbox: FractionBox,
        col_idx: arrayOf(z.number()),
        row_idx: arrayOf(z.number()),
        text: optionalAnyString,
      })
    ),
    word_citations: arrayOf(
      looseObject({ bbox: FractionBox, text: optionalAnyString })
    ),
  }),
  type: optionalString,
});

/** The parse output: in full, or, when large, a URL to fetch it from. */
export const ParseOutput = looseObject({
  chunks: arrayOf(
    looseObject({ blocks: arrayOf(Block), content: optionalAnyString })
  ),
  type: optionalString,
  url: optionalString,
});

/** `POST /upload`. */
export const UploadResponse = looseObject({
  file_id: withOriginal(optionalString),
});

/** `POST /parse_async`. */
export const ParseStart = looseObject({ job_id: withOriginal(optionalId) });

/** `GET /job/{id}`, as it arrived beside the value read from it. */
export const JobResponse = withOriginal(
  looseObject({
    error: looseObject({ message: optionalString }),
    reason: optionalString,
    result: looseObject({
      result: ParseOutput,
      usage: looseObject({
        credits: optionalNumber,
        num_pages: optionalNumber,
      }),
    }),
    status: optionalString,
  })
);

/** A job's status response: `value` is what the schema read, `original` the response as it arrived, for `raw` and error causes. */
export type JobResponseBlock = z.output<typeof JobResponse>;
/** The parse output, whether it came inline or from the stored result. */
export type ParseOutputBlock = z.output<typeof ParseOutput>;
type FractionBoxBlock = z.output<typeof FractionBox>;
type BlockBlock = z.output<typeof Block>;

const boxOf = (box: FractionBoxBlock): Box | undefined => {
  const { height, left, top, width } = box;
  if (
    left === undefined ||
    top === undefined ||
    width === undefined ||
    height === undefined
  ) {
    return undefined;
  }
  return { height, left, top, width };
};

const cellOf = (
  cell: BlockBlock["extra"]["cell_citations"][number]
): TableCell[] => {
  const row = Math.min(...cell.row_idx);
  const column = Math.min(...cell.col_idx);
  if (!Number.isFinite(row) || !Number.isFinite(column)) {
    return [];
  }
  return [
    compact({
      box: boxOf(cell.bbox),
      column,
      columnSpan: cell.col_idx.length > 1 ? cell.col_idx.length : undefined,
      row,
      rowSpan: cell.row_idx.length > 1 ? cell.row_idx.length : undefined,
      text: cell.text ?? "",
    }),
  ];
};

const blockOf = (block: BlockBlock): DocumentBlock[] => {
  const page = block.bbox.original_page ?? block.bbox.page;
  if (page === undefined) {
    return [];
  }
  const words = block.extra.word_citations.flatMap((word): WordBox[] => {
    const box = boxOf(word.bbox);
    return box === undefined ? [] : [{ box, text: word.text ?? "" }];
  });
  const cells = block.extra.cell_citations.flatMap((cell) => cellOf(cell));
  return [
    compact({
      box: boxOf(block.bbox),
      cells: cells.length > 0 ? cells : undefined,
      page,
      text: block.content ?? "",
      type: block.type ?? "unknown",
      words: words.length > 0 ? words : undefined,
    }),
  ];
};

/** Every chunk's blocks, in order, each on the file's own page number. */
export const documentBlocks = (output: ParseOutputBlock): DocumentBlock[] =>
  output.chunks.flatMap((chunk) =>
    chunk.blocks.flatMap((block) => blockOf(block))
  );
