import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { llamaparse } from "../../src/adapters/llamaparse.js";
import { enclosing } from "../../src/document.js";
import { Fieldwork } from "../../src/index.js";
import { compact } from "../../src/util.js";
import { fakeFetch } from "../helpers.js";
import type { RecordedCall } from "../helpers.js";

const sheet = { data: new Uint8Array([37, 80, 68, 70]), name: "sheet.pdf" };
const signed = "https://files.s3.test/grounded.jsonl?X-Amz-Signature=s";

const client = (...replies: Parameters<typeof fakeFetch>) => {
  const { fetch, calls } = fakeFetch(...replies);
  return {
    calls,
    web: new Fieldwork({
      adapter: llamaparse({ apiKey: "k", fetch, retries: 0 }),
    }),
  };
};

/** The multipart body of the upload, the first request. */
const upload = (calls: RecordedCall[]): FormData => {
  const form = calls[0]?.body;
  if (!(form instanceof FormData)) {
    throw new TypeError("the first request was not multipart");
  }
  return form;
};

/** The upload's configuration part, to read as JSON. */
const configurationOf = (calls: RecordedCall[]): Response =>
  new Response(upload(calls).get("configuration"));

/** A job response recorded from LlamaParse, with its presigned addresses replaced. */
const recordedJob = (fixture: string) => ({
  text: readFileSync(new URL(`fixtures/${fixture}`, import.meta.url), "utf-8"),
});

const page = (items: unknown[]) => ({
  items,
  page_height: 800,
  page_number: 1,
  page_width: 400,
});

const heading = {
  bbox: [{ h: 16, w: 200, x: 40, y: 80 }],
  md: "## 600°C rating",
  type: "heading",
};

const table = {
  bbox: [{ h: 40, w: 200, x: 40, y: 200 }],
  md: "| Size | 12x24 |",
  rows: [["Size", "12x24"]],
  type: "table",
};

/** What a finished job carries besides its Markdown: its items, or where its grounded items are. */
interface JobExtras {
  pages?: ReturnType<typeof page>[];
  groundedUrl?: string;
}

const job = (status: string, extras: JobExtras = {}) =>
  compact({
    items: extras.pages === undefined ? undefined : { pages: extras.pages },
    job: { id: "pjb-1", status, usage: { credits: 10 } },
    markdown: {
      pages: [
        { markdown: "## 600°C rating", page_number: 1 },
        { markdown: "page two", page_number: 2 },
      ],
    },
    result_content_metadata:
      extras.groundedUrl === undefined
        ? undefined
        : { grounded_items: { presigned_url: extras.groundedUrl } },
  });

const grounded = page([
  {
    ...heading,
    grounding: {
      lines: [
        {
          words: [
            // Spans count UTF-8 bytes: "°" takes two.
            { bbox: { h: 16, w: 40, x: 40, y: 80 }, span: [3, 9] },
            { bbox: { h: 16, w: 60, x: 84, y: 80 }, span: [10, 16] },
          ],
        },
      ],
    },
  },
  {
    ...table,
    grounding: {
      rows: [
        [
          {
            bbox: [{ h: 8, w: 40, x: 40, y: 200 }],
            lines: [
              {
                words: [{ bbox: { h: 8, w: 40, x: 40, y: 200 }, span: [0, 4] }],
              },
            ],
          },
          null,
        ],
      ],
    },
  },
]);

/** One A5 page (420 by 594.96 points) parsed on the agentic tier with word, line and cell boxes, 2026-11-17. */
const recordedParse = async () => {
  const recorded = readFileSync(
    new URL("fixtures/llamaparse-grounded.jsonl", import.meta.url),
    "utf-8"
  );
  const { web } = client(
    { body: { id: "pjb-1" } },
    { body: job("COMPLETED", { groundedUrl: signed }) },
    { text: recorded }
  );
  return await web.parse(sheet, { wordBoxes: true });
};

/** One landscape page (841.92 by 595.32 points) of an EPD from the MG-2988 benchmark, 2026-11-11: a table with a cell in nine boxes, and a footer. */
const footerParse = async () => {
  const recorded = readFileSync(
    new URL("fixtures/llamaparse-grounded-footer.jsonl", import.meta.url),
    "utf-8"
  );
  const { web } = client(
    { body: { id: "pjb-1" } },
    { body: job("COMPLETED", { groundedUrl: signed }) },
    { text: recorded }
  );
  return await web.parse(sheet, { wordBoxes: true });
};

/** A box in the recorded page's points, as fractions of the page. */
const points = (x: number, y: number, w: number, h: number) => ({
  height: h / 594.96,
  left: x / 420,
  top: y / 594.96,
  width: w / 420,
});

const groundedClient = () =>
  client(
    { body: { id: "pjb-1" } },
    {
      body: job("COMPLETED", { groundedUrl: signed }),
    },
    { text: `${JSON.stringify(grounded)}\n${JSON.stringify(page([]))}\n` }
  );

const picture = (pageNumber: number) =>
  `https://files.s3.test/page_${pageNumber}.jpg?X-Amz-Signature=s`;

/** The job's saved screenshots, plus an image on a page that is not a screenshot. */
const pictures = {
  images: [
    { filename: "page_2.jpg", presigned_url: picture(2) },
    { filename: "page_1.jpg", presigned_url: picture(1) },
    { filename: "img_p1_1.png", presigned_url: "https://files.s3.test/x.png" },
  ],
};

const options = {
  ignoreHiddenText: true,
  interval: 1,
  tier: "cost_effective",
  version: "2026-09-28",
} as const;
const polled = () =>
  client(
    { body: { id: "pjb-1", status: "PENDING" } },
    { body: { job: { id: "pjb-1", status: "RUNNING" } } },
    { body: job("COMPLETED") }
  );

describe("llamaparse parse", () => {
  it("uploads the file with its configuration and waits for the job", async () => {
    const { web, calls } = polled();
    await web.parse(sheet, options);
    expect(
      calls.map((call) => `${call.method} ${call.url.pathname}`)
    ).toStrictEqual([
      "POST /api/v2/parse/upload",
      "GET /api/v2/parse/pjb-1",
      "GET /api/v2/parse/pjb-1",
    ]);
    await expect(configurationOf(calls).json()).resolves.toStrictEqual({
      processing_options: { ignore: { ignore_hidden_text: true } },
      tier: "cost_effective",
      version: "2026-09-28",
    });
    expect(upload(calls).get("file")).toMatchObject({
      name: "sheet.pdf",
      type: "application/pdf",
    });
    expect(calls[0]?.headers.authorization).toBe("Bearer k");
  });

  it("returns the Markdown of each page, the job id and the credits", async () => {
    const { web, calls } = polled();
    const document = await web.parse(sheet, options);
    expect(calls[1]?.url.searchParams.get("expand")).toBe("markdown,usage");
    expect(document).toStrictEqual({
      id: "pjb-1",
      markdown: "## 600°C rating\n\npage two",
      meta: { usage: { credits: 10 } },
      pages: [
        { markdown: "## 600°C rating", pageNumber: 1 },
        { markdown: "page two", pageNumber: 2 },
      ],
      raw: job("COMPLETED"),
    });
  });

  it("defaults to the agentic tier and the latest version", async () => {
    const { web, calls } = client(
      { body: { id: "pjb-1" } },
      { body: job("COMPLETED") }
    );
    await web.parse(sheet);
    await expect(configurationOf(calls).json()).resolves.toStrictEqual({
      tier: "agentic",
      version: "latest",
    });
  });

  it("returns blocks with boxes as fractions of the page", async () => {
    const { web, calls } = client(
      { body: { id: "pjb-1" } },
      {
        body: job("COMPLETED", {
          pages: [
            page([
              { items: [heading], type: "header" },
              { bbox: null, md: "no box", type: "text" },
            ]),
          ],
        }),
      }
    );
    const document = await web.parse(sheet, { blocks: true });
    expect(calls[1]?.url.searchParams.get("expand")).toBe(
      "markdown,usage,items"
    );
    expect(document.blocks).toStrictEqual([
      {
        box: { height: 0.02, left: 0.1, top: 0.1, width: 0.5 },
        container: "header",
        page: 1,
        text: "## 600°C rating",
        type: "heading",
      },
      { page: 1, text: "no box", type: "text" },
    ]);
  });

  it("asks for word boxes and downloads them without sending the key there", async () => {
    const { web, calls } = groundedClient();
    await web.parse(sheet, { wordBoxes: true });
    await expect(configurationOf(calls).json()).resolves.toMatchObject({
      output_options: { granular_bboxes: ["word", "line", "cell"] },
    });
    expect(calls[1]?.url.searchParams.get("expand")).toBe(
      "markdown,usage,items"
    );
    expect(calls[2]?.url.href).toBe(signed);
    expect(calls[2]?.headers.authorization).toBeUndefined();
  });

  it("reads word and cell boxes from the grounded items", async () => {
    const { web } = groundedClient();
    const document = await web.parse(sheet, { wordBoxes: true });
    expect(document.blocks).toStrictEqual([
      {
        box: { height: 0.02, left: 0.1, top: 0.1, width: 0.5 },
        page: 1,
        text: "## 600°C rating",
        type: "heading",
        words: [
          {
            box: { height: 0.02, left: 0.1, top: 0.1, width: 0.1 },
            text: "600°C",
          },
          {
            box: { height: 0.02, left: 0.21, top: 0.1, width: 0.15 },
            text: "rating",
          },
        ],
      },
      {
        box: { height: 0.05, left: 0.1, top: 0.25, width: 0.5 },
        cells: [
          {
            box: { height: 0.01, left: 0.1, top: 0.25, width: 0.1 },
            boxes: [{ height: 0.01, left: 0.1, top: 0.25, width: 0.1 }],
            column: 0,
            row: 0,
            text: "Size",
          },
          { column: 1, row: 0, text: "12x24" },
        ],
        page: 1,
        text: "| Size | 12x24 |",
        type: "table",
        words: [
          {
            box: { height: 0.01, left: 0.1, top: 0.25, width: 0.1 },
            text: "Size",
          },
        ],
      },
    ]);
    expect(document.raw).toStrictEqual({
      groundedItems: [grounded, page([])],
      job: job("COMPLETED", { groundedUrl: signed }),
    });
  });

  it("reads each block's line boxes from recorded grounded items", async () => {
    const document = await recordedParse();
    const [title, paragraph] = document.blocks ?? [];
    // The span skips the heading's "## ".
    expect(title?.lines).toStrictEqual([
      {
        box: points(52.25, 61.22, 263.49, 15.86),
        text: "Fieldwork line test — 600°C rating",
      },
    ]);
    expect(title?.words).toHaveLength(6);
    expect(paragraph?.lines?.map((line) => line.text)).toStrictEqual([
      "This sheet describes a ceramic tile rated for use up to 600°C.",
      "The paragraph runs long enough to wrap onto a second line and",
      "a third, so the parser has several lines to report.",
    ]);
  });

  it("reads a table cell's lines from recorded grounded items", async () => {
    const document = await recordedParse();
    const specs = document.blocks?.[2];
    // A cell's spans count bytes of the cell's own text, not the table's.
    const finish = specs?.cells?.find(
      (cell) => cell.row === 2 && cell.column === 1
    );
    expect(finish?.lines).toStrictEqual([
      {
        box: points(148.1, 186.03, 204.98, 10.5),
        text: "Glazed, matte surface that wraps over two",
      },
      { box: points(148.31, 198.21, 46.47, 8.25), text: "lines here" },
    ]);
    // The table's lines are its cells' lines, in reading order.
    expect(specs?.lines?.map((line) => line.text)).toStrictEqual([
      "Property",
      "Value",
      "Size",
      "12 × 24 in",
      "Finish",
      "Glazed, matte surface that wraps over two",
      "lines here",
      "Water",
      "absorption",
      "0.5%",
    ]);
  });

  it("gives each page its size in points from the grounded items", async () => {
    const document = await recordedParse();
    // The job's second page has no grounded row, so no size.
    expect(document.pages).toStrictEqual([
      {
        height: 594.96,
        markdown: "## 600°C rating",
        pageNumber: 1,
        width: 420,
      },
      { markdown: "page two", pageNumber: 2 },
    ]);
  });

  it("marks blocks read out of a page footer, from an MG-2988 sidecar", async () => {
    const document = await footerParse();
    expect(document.pages?.[0]).toMatchObject({
      height: 595.32,
      width: 841.92,
    });
    expect(
      document.blocks?.map((block) => [block.type, block.container])
    ).toStrictEqual([
      ["text", undefined],
      ["text", undefined],
      ["table", undefined],
      ["text", "footer"],
    ]);
    expect(document.blocks?.[3]?.lines?.map((line) => line.text)).toStrictEqual(
      ["One Click LCA Created with One Click LCA", "14", "eKOA (BARE)"]
    );
  });

  it("keeps every box of a cell that sits in several, from an MG-2988 sidecar", async () => {
    const document = await footerParse();
    const cell = document.blocks?.[2]?.cells?.find(
      (each) => each.row === 1 && each.column === 1
    );
    const sheetSize = { height: 595.32, width: 841.92 };
    expect(cell?.boxes).toHaveLength(9);
    expect(cell?.boxes?.[0]).toStrictEqual({
      height: 9.5 / sheetSize.height,
      left: 272.23 / sheetSize.width,
      top: 91.57 / sheetSize.height,
      width: 124.74 / sheetSize.width,
    });
    expect(cell?.box).toStrictEqual(enclosing(cell?.boxes ?? []));
    expect(cell?.lines).toHaveLength(9);
  });

  it("reads a cell box given as one object, not a list", async () => {
    const one = page([
      {
        ...table,
        grounding: { rows: [[{ bbox: { h: 8, w: 40, x: 40, y: 200 } }]] },
      },
    ]);
    const { web } = client(
      { body: { id: "pjb-1" } },
      { body: job("COMPLETED", { groundedUrl: signed }) },
      { text: `${JSON.stringify(one)}\n` }
    );
    const document = await web.parse(sheet, { wordBoxes: true });
    const size = { height: 0.01, left: 0.1, top: 0.25, width: 0.1 };
    expect(document.blocks?.[0]?.cells?.[0]).toStrictEqual({
      box: size,
      boxes: [size],
      column: 0,
      row: 0,
      text: "Size",
    });
  });

  it("fails loudly when the word boxes it asked for are missing", async () => {
    const { web } = client(
      { body: { id: "pjb-1" } },
      { body: job("COMPLETED") }
    );
    await expect(web.parse(sheet, { wordBoxes: true })).rejects.toMatchObject({
      code: "ProviderError",
      jobId: "pjb-1",
    });
  });

  it("fails loudly, with the job id, when a finished job has no pages", async () => {
    const { web } = client(
      { body: { id: "pjb-1" } },
      { body: { job: { id: "pjb-1", status: "COMPLETED" } } }
    );
    await expect(web.parse(sheet)).rejects.toMatchObject({
      code: "ProviderError",
      jobId: "pjb-1",
    });
  });

  it("throws JobFailed with the job id when the job fails", async () => {
    const { web } = client(
      { body: { id: "pjb-1" } },
      {
        body: {
          job: { error_message: "corrupt file", id: "pjb-1", status: "FAILED" },
        },
      }
    );
    await expect(web.parse(sheet)).rejects.toMatchObject({
      code: "JobFailed",
      jobId: "pjb-1",
      message: "llamaparse job failed: corrupt file",
    });
  });

  it.each([
    { job: { id: "pjb-1", status: "QUEUED" } },
    { job: { id: "pjb-1" } },
  ])(
    "fails at once, with the job id, on a missing or undocumented status: %j",
    async (reply) => {
      const { web, calls } = client({ body: { id: "pjb-1" } }, { body: reply });
      await expect(web.parse(sheet, { interval: 1 })).rejects.toMatchObject({
        cause: reply,
        code: "ProviderError",
        jobId: "pjb-1",
      });
      expect(calls).toHaveLength(2);
    }
  );

  it("asks for page pictures and returns each page's address", async () => {
    const { web, calls } = client(
      { body: { id: "pjb-1" } },
      { body: { ...job("COMPLETED"), images_content_metadata: pictures } }
    );
    const document = await web.parse(sheet, { pageImages: true });
    await expect(configurationOf(calls).json()).resolves.toMatchObject({
      output_options: { images_to_save: ["screenshot"] },
    });
    expect(calls[1]?.url.searchParams.get("expand")).toBe(
      "markdown,usage,images_content_metadata"
    );
    expect(document.pages).toStrictEqual([
      { image: picture(1), markdown: "## 600°C rating", pageNumber: 1 },
      { image: picture(2), markdown: "page two", pageNumber: 2 },
    ]);
  });

  it("asks for page pictures and word boxes together", async () => {
    const { web, calls } = client(
      { body: { id: "pjb-1" } },
      {
        body: {
          ...job("COMPLETED", { groundedUrl: signed }),
          images_content_metadata: pictures,
        },
      },
      { text: `${JSON.stringify(grounded)}\n` }
    );
    await web.parse(sheet, { pageImages: true, wordBoxes: true });
    await expect(configurationOf(calls).json()).resolves.toMatchObject({
      output_options: {
        granular_bboxes: ["word", "line", "cell"],
        images_to_save: ["screenshot"],
      },
    });
  });

  it("collects fresh page pictures from an earlier parse without the file", async () => {
    const { web, calls } = client({
      body: { ...job("COMPLETED"), images_content_metadata: pictures },
    });
    const document = await web.parse({ pageImages: true, resume: "pjb-9" });
    expect(
      calls.map((call) => `${call.method} ${call.url.pathname}`)
    ).toStrictEqual(["GET /api/v2/parse/pjb-9"]);
    expect(document.pages?.map((each) => each.image)).toStrictEqual([
      picture(1),
      picture(2),
    ]);
  });

  it("fails loudly when a resumed job saved no page pictures, from a PDF parsed without them", async () => {
    // A 9-page PDF parsed on the cost_effective tier without pageImages, 2026-11-17.
    const { web } = client({
      ...recordedJob("llamaparse-pdf-no-pictures.json"),
    });
    await expect(
      web.parse({
        pageImages: true,
        resume: "pjb-7nkytxwfqpopha4pf0soxps6w7ij",
      })
    ).rejects.toMatchObject({
      code: "ProviderError",
      jobId: "pjb-7nkytxwfqpopha4pf0soxps6w7ij",
      message:
        "llamaparse job pjb-7nkytxwfqpopha4pf0soxps6w7ij has no page pictures; only a parse started with pageImages saves them",
    });
  });

  // Apache POI's SampleSS.xlsx and SampleSS.xls, parsed on the agentic tier
  // with pageImages, 2026-11-17: LlamaParse returns a page per sheet and no pictures.
  it.each([
    ["SampleSS.xlsx", "llamaparse-xlsx.json"],
    ["SampleSS.xls", "llamaparse-xls.json"],
  ])(
    "returns the pages of %s without pictures, which LlamaParse draws none of",
    async (name, fixture) => {
      const { web } = client({ body: { id: "pjb-1" } }, recordedJob(fixture));
      const document = await web.parse(
        { data: new Uint8Array([80, 75]), name },
        { pageImages: true }
      );
      expect(document.pages?.map((each) => each.pageNumber)).toStrictEqual([
        1, 2,
      ]);
      expect(document.pages?.some((each) => "image" in each)).toBe(false);
    }
  );

  it("collects a spreadsheet's pages by resuming with pageImages", async () => {
    const { web } = client(recordedJob("llamaparse-xlsx.json"));
    const document = await web.parse({ pageImages: true, resume: "pjb-9" });
    expect(document.pages).toHaveLength(2);
    expect(document.pages?.some((each) => "image" in each)).toBe(false);
  });

  it("returns pages without pictures when a parse it started got none", async () => {
    const { web } = client(
      { body: { id: "pjb-1" } },
      { body: job("COMPLETED") }
    );
    const document = await web.parse(sheet, { pageImages: true });
    expect(document.pages).toStrictEqual([
      { markdown: "## 600°C rating", pageNumber: 1 },
      { markdown: "page two", pageNumber: 2 },
    ]);
  });

  it("fails loudly when a page has no picture", async () => {
    const { web } = client({
      body: {
        ...job("COMPLETED"),
        images_content_metadata: {
          images: [{ filename: "page_1.jpg", presigned_url: picture(1) }],
        },
      },
    });
    await expect(
      web.parse({ pageImages: true, resume: "pjb-9" })
    ).rejects.toMatchObject({
      code: "ProviderError",
      jobId: "pjb-9",
      message: "llamaparse job pjb-9 has no picture of page 2",
    });
  });

  it("resumes a job without uploading the file again", async () => {
    const { web, calls } = client({ body: job("COMPLETED") });
    const document = await web.parse(sheet, { resume: "pjb-9" });
    expect(
      calls.map((call) => `${call.method} ${call.url.pathname}`)
    ).toStrictEqual(["GET /api/v2/parse/pjb-9"]);
    expect(document.id).toBe("pjb-9");
  });
});
