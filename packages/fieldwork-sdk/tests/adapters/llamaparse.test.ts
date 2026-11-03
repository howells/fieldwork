import { describe, expect, it } from "vitest";

import { llamaparse } from "../../src/adapters/llamaparse.js";
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

const groundedClient = () =>
  client(
    { body: { id: "pjb-1" } },
    {
      body: job("COMPLETED", { groundedUrl: signed }),
    },
    { text: `${JSON.stringify(grounded)}\n${JSON.stringify(page([]))}\n` }
  );

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

  it("resumes a job without uploading the file again", async () => {
    const { web, calls } = client({ body: job("COMPLETED") });
    const document = await web.parse(sheet, { resume: "pjb-9" });
    expect(
      calls.map((call) => `${call.method} ${call.url.pathname}`)
    ).toStrictEqual(["GET /api/v2/parse/pjb-9"]);
    expect(document.id).toBe("pjb-9");
  });
});
