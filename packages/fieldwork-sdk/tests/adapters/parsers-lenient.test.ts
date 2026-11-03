import { describe, expect, it } from "vitest";

import { llamaparse } from "../../src/adapters/llamaparse.js";
import { reducto } from "../../src/adapters/reducto.js";
import { Fieldwork } from "../../src/index.js";
import { fakeFetch } from "../helpers.js";

const sheet = { data: new Uint8Array([1]), name: "sheet.pdf" };

describe("document parsers with a response of the wrong shape", () => {
  it("llamaparse leaves out what it cannot read and keeps the call working", async () => {
    const body = {
      items: {
        pages: [
          {
            items: [
              { bbox: "wide", md: 4, type: "text" },
              "not an item",
              { bbox: [{ h: 1, w: 1, x: "a", y: 1 }], md: "kept" },
            ],
            page_height: 0,
            page_number: 1,
            page_width: 100,
          },
          { items: [{ md: "no page" }] },
        ],
      },
      job: { status: "COMPLETED", usage: { credits: "ten" } },
      markdown: { pages: [{ markdown: 5, page_number: 1 }, "x"] },
    };
    const { fetch } = fakeFetch({ body: { id: "pjb-1" } }, { body });
    const web = new Fieldwork({
      adapter: llamaparse({ apiKey: "k", fetch, retries: 0 }),
    });
    const document = await web.parse(sheet, { blocks: true });
    expect(document).toStrictEqual({
      blocks: [
        { page: 1, text: "", type: "text" },
        { page: 1, text: "", type: "unknown" },
        { page: 1, text: "kept", type: "unknown" },
      ],
      id: "pjb-1",
      markdown: "",
      pages: [{ markdown: "", pageNumber: 1 }],
      raw: body,
    });
  });

  it("reducto leaves out what it cannot read and keeps the call working", async () => {
    const body = {
      result: {
        result: {
          chunks: [
            {
              blocks: [
                { bbox: { left: 0.1, page: 2 }, content: 3, type: "Text" },
                { bbox: null, content: "no page" },
                {
                  bbox: { height: 1, left: 0, page: 1, top: 0, width: 1 },
                  extra: {
                    cell_citations: [{ col_idx: "a", row_idx: [0] }],
                    word_citations: "none",
                  },
                },
              ],
              content: ["x"],
            },
          ],
        },
        usage: "free",
      },
      status: "Completed",
    };
    const { fetch } = fakeFetch(
      { body: { file_id: "reducto://f" } },
      { body: { job_id: 7 } },
      { body }
    );
    const web = new Fieldwork({
      adapter: reducto({ apiKey: "k", fetch, retries: 0 }),
    });
    const document = await web.parse(sheet, { wordBoxes: true });
    expect(document).toStrictEqual({
      blocks: [
        { page: 2, text: "", type: "Text" },
        {
          box: { height: 1, left: 0, top: 0, width: 1 },
          page: 1,
          text: "",
          type: "unknown",
        },
      ],
      id: "7",
      markdown: "",
      raw: body,
    });
  });
});
