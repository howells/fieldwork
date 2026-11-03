// The home page's parse figure: page 1 of a tile spec sheet, as Fieldwork
// returned it from each parser in the 2026-11-03 benchmark. Every box is a
// fraction of the page from its top-left corner, [left, top, width, height].

export type Box = readonly [number, number, number, number];

/** The page, landscape A4: width over height. */
export const PAGE_RATIO = 841.92 / 594.96;

/** Where text sits on the page, as Reducto laid it out. */
export const TEXT: readonly Box[] = [
  [0.03, 0.025, 0.072, 0.013],
  [0.426, 0.026, 0.256, 0.013],
  [0.315, 0.105, 0.107, 0.01],
  [0.633, 0.072, 0.05, 0.03],
  [0.314, 0.157, 0.317, 0.043],
  [0.315, 0.369, 0.08, 0.012],
  [0.03, 0.963, 0.206, 0.013],
  [0.956, 0.965, 0.013, 0.009],
];

/** The logo and the product photographs. */
export const IMAGES: readonly Box[] = [
  [0.313, 0.061, 0.045, 0.033],
  [0.314, 0.235, 0.063, 0.089],
  [0.416, 0.235, 0.063, 0.089],
  [0.519, 0.235, 0.062, 0.089],
  [0.621, 0.257, 0.062, 0.044],
];

/** The specification table's cells, row by row. */
export const CELLS: readonly Box[] = [
  [0.3184, 0.4209, 0.0483, 0.0076],
  [0.4074, 0.4213, 0.0677, 0.0216],
  [0.5065, 0.4204, 0.0613, 0.0081],
  [0.5968, 0.4213, 0.0118, 0.0076],
  [0.3187, 0.4879, 0.0378, 0.0072],
  [0.4071, 0.4879, 0.0359, 0.0094],
  [0.5068, 0.4883, 0.0308, 0.0081],
  [0.5964, 0.4879, 0.0197, 0.009],
  [0.319, 0.5396, 0.0194, 0.0076],
  [0.4074, 0.5405, 0.0137, 0.0067],
  [0.5068, 0.5405, 0.048, 0.0067],
  [0.5968, 0.5405, 0.0118, 0.0063],
  [0.319, 0.5926, 0.033, 0.0067],
  [0.4077, 0.5913, 0.0588, 0.0094],
  [0.5068, 0.5922, 0.0292, 0.0072],
  [0.5974, 0.5926, 0.0477, 0.0067],
  [0.3187, 0.6443, 0.0264, 0.0076],
  [0.4074, 0.6439, 0.0785, 0.0378],
  [0.5068, 0.6443, 0.0254, 0.0076],
  [0.5971, 0.6443, 0.0127, 0.0081],
  [0.319, 0.7262, 0.0248, 0.0081],
  [0.4077, 0.7271, 0.0292, 0.0072],
  [0.5068, 0.7271, 0.0489, 0.0067],
  [0.5968, 0.7266, 0.0041, 0.0067],
  [0.319, 0.7792, 0.027, 0.0067],
  [0.4074, 0.7792, 0.0114, 0.0067],
  [0.5068, 0.7788, 0.0353, 0.0072],
  [0.5964, 0.7783, 0.0362, 0.009],
  [0.3187, 0.83, 0.0397, 0.0099],
  [0.4074, 0.8314, 0.0369, 0.0067],
  [0.5068, 0.8309, 0.0496, 0.0072],
  [0.5964, 0.8309, 0.0089, 0.0067],
  [0.3187, 0.8826, 0.0442, 0.0081],
  [0.408, 0.8835, 0.0168, 0.0063],
  [0.5068, 0.8831, 0.0419, 0.0085],
  [0.5971, 0.8835, 0.014, 0.0063],
];

/** The cell each figure marks: the first row's sizes. */
export const MARKED_CELL = 1;

export interface ParserBox {
  label: string;
  box: Box;
  code: string;
}

const fixed = (box: Box) => {
  const [left, top, width, height] = box.map((value) => value.toFixed(3));
  return `// { left: ${left}, top: ${top},\n//   width: ${width}, height: ${height} }`;
};

const LLAMAPARSE: Box = [0.40784, 0.42082, 0.06692, 0.02261];
const REDUCTO: Box = [0.40737, 0.42131, 0.06768, 0.02158];
const FIRECRAWL: Box = [0.3125, 0.4023, 0.3733, 0.5015];

const cellCode = (box: Box) => `const { blocks } = await web.parse(sheet, {
  wordBoxes: true,
});
const table = blocks.find((b) => b.cells);

table.cells[1].box;
${fixed(box)}`;

export const PARSER_BOXES: ParserBox[] = [
  { box: LLAMAPARSE, code: cellCode(LLAMAPARSE), label: "LlamaParse" },
  { box: REDUCTO, code: cellCode(REDUCTO), label: "Reducto" },
  {
    box: FIRECRAWL,
    code: `const { blocks } = await web.parse(sheet, {
  blocks: true,
});
const table = blocks.find((b) => b.type === "table");

// Firecrawl places blocks, not cells
table.box;
${fixed(FIRECRAWL)}`,
    label: "Firecrawl",
  },
];

// The drawing's units: the page is WIDTH wide, so a fraction f sits at
// f * WIDTH across and f * HEIGHT down.
export const WIDTH = 1000;
export const HEIGHT = WIDTH / PAGE_RATIO;
export const x = (fraction: number) => fraction * WIDTH;
export const y = (fraction: number) => fraction * HEIGHT;

export const percent = (fraction: number) => `${(fraction * 100).toFixed(2)}%`;

/**
 * The SVG attributes of a box and its two guides. The guides run from the
 * page edges, and `reach` (0 to 1) is how far along they are.
 */
export const boxGeometry = (
  [left, top, width, height]: Box,
  reach: number
) => ({
  box: { height: y(height), width: x(width), x: x(left), y: y(top) },
  guideLeft: { x2: x(left) * reach, y1: y(top), y2: y(top) },
  guideTop: { x1: x(left), x2: x(left), y2: y(top) * reach },
});

export interface Readout {
  /** CSS left and top, as percentages of the page. */
  left: string;
  top: string;
  text: string;
}

/** The two readouts beside the guides: the box's left, then its top. */
export const readouts = ([left, top]: Box, reach: number) => ({
  left: {
    left: percent((left * reach) / 2),
    text: (left * reach).toFixed(3),
    top: percent(top),
  },
  top: {
    left: percent(left),
    text: (top * reach).toFixed(3),
    top: percent((top * reach) / 2),
  },
});
