import { describe, expect, it } from "vitest";

import type { FieldSchema } from "../../src/tool-specs/schema.js";
import { toolsFor } from "../../src/tools.js";
import { problem } from "../../src/tools/validate.js";
import { fakeFetch } from "../helpers.js";
import { toolNamed, webFor } from "./support.js";

describe("checking URL and base64 inputs", () => {
  it("refuses a URL that is not http or https before sending anything", async () => {
    const { calls, fetch } = fakeFetch();
    const read = toolNamed(toolsFor(webFor("exa", fetch)), "read_page");
    const urls = [
      "file:///etc/passwd",
      "localhost:3000",
      "example.com:8080/path",
    ];
    await Promise.all(
      urls.map(async (url) => {
        await expect(read.execute({ url })).rejects.toMatchObject({
          code: "InvalidRequest",
          message: expect.stringContaining("url must be a full URL"),
        });
      })
    );
    expect(calls).toHaveLength(0);
  });

  it("accepts http and https URLs", () => {
    const url: FieldSchema = { format: "uri", type: "string" };
    expect(problem(url, "https://a.test/p", "url")).toBeUndefined();
    expect(problem(url, "http://a.test/p", "url")).toBeUndefined();
  });

  it("refuses contentBase64 that is not base64 before sending anything", async () => {
    const { calls, fetch } = fakeFetch();
    const parse = toolNamed(
      toolsFor(webFor("firecrawl", fetch)),
      "parse_document"
    );
    await expect(
      parse.execute({
        contentBase64: "data:application/pdf;base64,JVBERi0=",
        name: "a.pdf",
      })
    ).rejects.toMatchObject({
      code: "InvalidRequest",
      message: expect.stringContaining("remove the data: prefix"),
    });
    const bad = ["!!!not base64???", "aGVsbG8", "aGVsbG8==", "="];
    await Promise.all(
      bad.map(async (contentBase64) => {
        await expect(
          parse.execute({ contentBase64, name: "a.pdf" })
        ).rejects.toMatchObject({ code: "InvalidRequest" });
      })
    );
    expect(calls).toHaveLength(0);
  });

  it("takes contentBase64 with and without padding, and a large one", async () => {
    const { calls, fetch } = fakeFetch(
      { body: { data: { markdown: "a" }, success: true } },
      { body: { data: { markdown: "b" }, success: true } },
      { body: { data: { markdown: "c" }, success: true } }
    );
    const parse = toolNamed(
      toolsFor(webFor("firecrawl", fetch)),
      "parse_document"
    );
    await parse.execute({ contentBase64: "aGVsbG8=", name: "a.pdf" });
    await parse.execute({ contentBase64: "aGVs", name: "a.pdf" });
    await parse.execute({
      contentBase64: "QUJD".repeat(5_000_000),
      name: "a.pdf",
    });
    expect(calls).toHaveLength(3);
  });
});
