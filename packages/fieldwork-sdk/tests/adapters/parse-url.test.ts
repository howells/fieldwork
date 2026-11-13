import { describe, expect, it } from "vitest";

import { toolsFor } from "../../src/tools.js";
import { fakeFetch, nth } from "../helpers.js";
import { toolNamed, webFor } from "../tools/support.js";

const url = "https://example.test/large-spec.pdf";
const cases = [
  {
    body: { source_url: url, tier: "agentic", version: "latest" },
    endpoint: "/api/v2/parse",
    provider: "llamaparse",
    replies: [
      { body: { id: "job" } },
      {
        body: {
          job: { id: "job", status: "COMPLETED" },
          markdown: { pages: [{ markdown: "Specification", page_number: 1 }] },
        },
      },
    ],
  },
  {
    body: { input: url },
    endpoint: "/parse_async",
    provider: "reducto",
    replies: [
      { body: { job_id: "job" } },
      {
        body: {
          result: {
            job_id: "job",
            result: {
              chunks: [{ blocks: [], content: "Specification" }],
              type: "full",
            },
          },
          status: "Completed",
        },
      },
    ],
  },
];

describe("parsing public document URLs", () => {
  it.each(cases)(
    "uses $provider's native URL input without a download or upload",
    async ({ body, endpoint, provider, replies }) => {
      const { calls, fetch } = fakeFetch(...replies);
      const parse = toolNamed(
        toolsFor(webFor(provider, fetch)),
        "parse_document"
      );
      const result = await parse.execute({ url });
      expect(result).toMatchObject({ markdown: "Specification" });
      expect(nth(calls, 0)).toMatchObject({
        body,
        method: "POST",
        url: expect.objectContaining({ pathname: endpoint }),
      });
      expect(calls).toHaveLength(2);
      expect(parse.inputSchema.properties).toHaveProperty("url");
    }
  );

  it.each(["llamaparse", "reducto"])(
    "refuses URL plus bytes with %s before sending",
    async (provider) => {
      const { calls, fetch } = fakeFetch();
      await expect(
        toolNamed(toolsFor(webFor(provider, fetch)), "parse_document").execute({
          contentBase64: "cGRm",
          name: "spec.pdf",
          url,
        })
      ).rejects.toMatchObject({
        code: "InvalidRequest",
        message: expect.stringContaining("url and contentBase64"),
      });
      expect(calls).toHaveLength(0);
    }
  );

  it.each([
    { contentBase64: "cGRm", url },
    { name: "spec.pdf", url },
  ])(
    "refuses a url beside either inline field, in the schema and when run: %o",
    async (input) => {
      const { calls, fetch } = fakeFetch();
      const parse = toolNamed(
        toolsFor(webFor("llamaparse", fetch)),
        "parse_document"
      );
      expect(parse.inputSchema.oneOf).toStrictEqual([
        {
          not: {
            anyOf: [{ required: ["name"] }, { required: ["contentBase64"] }],
          },
          required: ["url"],
        },
        { not: { required: ["url"] }, required: ["name", "contentBase64"] },
      ]);
      await expect(parse.execute(input)).rejects.toMatchObject({
        code: "InvalidRequest",
      });
      expect(calls).toHaveLength(0);
    }
  );

  it("leaves URL parsing out of Firecrawl, whose description names read_page", async () => {
    const { calls, fetch } = fakeFetch();
    const parse = toolNamed(
      toolsFor(webFor("firecrawl", fetch)),
      "parse_document"
    );
    expect(parse.inputSchema.properties).not.toHaveProperty("url");
    expect(parse.description).toContain("read_page");
    await expect(parse.execute({ url })).rejects.toMatchObject({
      code: "InvalidRequest",
      message: expect.stringContaining("url is not an input with firecrawl"),
    });
    expect(calls).toHaveLength(0);
  });
});
