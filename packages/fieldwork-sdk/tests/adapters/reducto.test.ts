import { describe, expect, it } from "vitest";

import { reducto } from "../../src/adapters/reducto.js";
import { Fieldwork } from "../../src/index.js";
import { fakeFetch } from "../helpers.js";

const sheet = { data: new Uint8Array([37, 80, 68, 70]), name: "sheet.pdf" };

const client = (...replies: Parameters<typeof fakeFetch>) => {
  const { fetch, calls } = fakeFetch(...replies);
  return {
    calls,
    web: new Fieldwork({
      adapter: reducto({ apiKey: "k", fetch, retries: 0 }),
    }),
  };
};

const box = (left: number, top: number, page = 1) => ({
  height: 0.01,
  left,
  original_page: page + 4,
  page,
  top,
  width: 0.1,
});

const output = {
  chunks: [
    {
      blocks: [
        {
          bbox: box(0.1, 0.1),
          content: "Fire rating",
          extra: {
            word_citations: [
              { bbox: box(0.1, 0.1), text: "Fire" },
              { bbox: null, text: "rating" },
            ],
          },
          type: "Title",
        },
        {
          bbox: box(0.1, 0.4),
          content: "<table><tr><td>Size</td><td>12x24</td></tr></table>",
          extra: {
            cell_citations: [
              { bbox: box(0.1, 0.4), col_idx: [0], row_idx: [0], text: "Size" },
              {
                bbox: box(0.3, 0.4),
                col_idx: [1, 2],
                row_idx: [0],
                text: "12x24",
              },
            ],
          },
          type: "Table",
        },
      ],
      content: "# Fire rating",
    },
    { blocks: [], content: "page two" },
  ],
  type: "full",
};

/** The parse output, or where Reducto stored one too large to return. */
type Output = typeof output | { result_id: string; type: "url"; url: string };

const completed = (result: Output = output) => ({
  result: {
    job_id: "job-1",
    result,
    usage: { credits: null, num_pages: 2 },
  },
  status: "Completed",
});

const started = [
  { body: { file_id: "reducto://f.pdf" } },
  { body: { job_id: "job-1" } },
];

describe("reducto parse", () => {
  it("uploads the file, starts a parse and waits for the job", async () => {
    const { web, calls } = client(
      ...started,
      { body: { status: "Pending" } },
      { body: completed() }
    );
    const document = await web.parse(sheet, { interval: 1 });
    expect(
      calls.map((call) => `${call.method} ${call.url.pathname}`)
    ).toStrictEqual([
      "POST /upload",
      "POST /parse_async",
      "GET /job/job-1",
      "GET /job/job-1",
    ]);
    const form = calls[0]?.body;
    expect(
      form instanceof FormData ? form.get("file") : undefined
    ).toMatchObject({ name: "sheet.pdf", type: "application/pdf" });
    expect(calls[1]?.body).toStrictEqual({ input: "reducto://f.pdf" });
    expect(calls[1]?.headers.authorization).toBe("Bearer k");
    expect(document).toStrictEqual({
      id: "job-1",
      markdown: "# Fire rating\n\npage two",
      meta: { usage: { units: { pages: 2 } } },
      pageCount: 2,
      raw: completed(),
    });
  });

  it("asks for citations for word boxes, and returns blocks on the file's own pages", async () => {
    const { web, calls } = client(...started, { body: completed() });
    const document = await web.parse(sheet, { wordBoxes: true });
    expect(calls[1]?.body).toStrictEqual({
      input: "reducto://f.pdf",
      settings: { return_citations: true },
    });
    expect(document.blocks).toStrictEqual([
      {
        box: { height: 0.01, left: 0.1, top: 0.1, width: 0.1 },
        page: 5,
        text: "Fire rating",
        type: "Title",
        words: [
          {
            box: { height: 0.01, left: 0.1, top: 0.1, width: 0.1 },
            text: "Fire",
          },
        ],
      },
      {
        box: { height: 0.01, left: 0.1, top: 0.4, width: 0.1 },
        cells: [
          {
            box: { height: 0.01, left: 0.1, top: 0.4, width: 0.1 },
            column: 0,
            row: 0,
            text: "Size",
          },
          {
            box: { height: 0.01, left: 0.3, top: 0.4, width: 0.1 },
            column: 1,
            columnSpan: 2,
            row: 0,
            text: "12x24",
          },
        ],
        page: 5,
        text: "<table><tr><td>Size</td><td>12x24</td></tr></table>",
        type: "Table",
      },
    ]);
  });

  it("returns blocks only when asked", async () => {
    const { web, calls } = client(...started, { body: completed() });
    const document = await web.parse(sheet, { blocks: true });
    expect(calls[1]?.body).toStrictEqual({ input: "reducto://f.pdf" });
    expect(document.blocks).toHaveLength(2);
  });

  it("fetches a large result from its URL without sending the key there", async () => {
    const url = "https://store.s3.test/result.json?X-Amz-Signature=s";
    const { web, calls } = client(
      ...started,
      { body: completed({ result_id: "r1", type: "url", url }) },
      { body: output }
    );
    const document = await web.parse(sheet);
    expect(calls[3]?.url.href).toBe(url);
    expect(calls[3]?.headers.authorization).toBeUndefined();
    expect(document.markdown).toBe("# Fire rating\n\npage two");
    expect(document.raw).toStrictEqual({
      job: completed({ result_id: "r1", type: "url", url }),
      stored: output,
    });
  });

  it("throws JobFailed with the job id and Reducto's reason", async () => {
    const { web } = client(...started, {
      body: { reason: "password protected", status: "Failed" },
    });
    await expect(web.parse(sheet)).rejects.toMatchObject({
      code: "JobFailed",
      jobId: "job-1",
      message: "reducto job failed: password protected",
    });
  });

  it("resumes a job without uploading the file again", async () => {
    const { web, calls } = client({ body: completed() });
    const document = await web.parse(sheet, { resume: "job-7" });
    expect(
      calls.map((call) => `${call.method} ${call.url.pathname}`)
    ).toStrictEqual(["GET /job/job-7"]);
    expect(document.id).toBe("job-7");
  });

  it("refuses a file over 100 MB before sending it", async () => {
    const { web, calls } = client();
    const big = new Blob([new Uint8Array(100 * 1024 * 1024 + 1)]);
    await expect(
      web.parse({ data: big, name: "big.pdf" })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });
});
