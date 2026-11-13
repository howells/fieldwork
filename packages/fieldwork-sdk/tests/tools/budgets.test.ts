import { describe, expect, it } from "vitest";

import { toolsFor } from "../../src/tools.js";
import { fakeFetch } from "../helpers.js";
import { toolNamed, webFor } from "./support.js";

describe("per-call tool budgets", () => {
  it("returns the result without raw, with long text cut", async () => {
    const { calls, fetch } = fakeFetch({
      body: {
        data: {
          markdown: "x".repeat(2000),
          metadata: { title: "Spec", url: "https://a.test/p" },
        },
        success: true,
      },
    });
    const read = toolNamed(
      toolsFor(webFor("firecrawl", fetch), { maxCharacters: 1000 }),
      "read_page"
    );
    const page = await read.execute({ url: "https://a.test/p" });
    expect(page).not.toHaveProperty("raw");
    expect(page).toMatchObject({
      title: "Spec",
      truncated: [{ length: 2000, path: "markdown", shown: 1000 }],
    });
    expect(page.markdown).toMatch(
      /^x{1000}\n\n\[cut: 1000 of 2000 characters shown\]$/u
    );
    expect(calls[0]?.body).toMatchObject({ url: "https://a.test/p" });
  });

  it("uses the per-call budget without sending it to the capability", async () => {
    const { calls, fetch } = fakeFetch({
      body: { data: { markdown: "x".repeat(2000) }, success: true },
    });
    const read = toolNamed(
      toolsFor(webFor("firecrawl", fetch), { maxCharacters: 1000 }),
      "read_page"
    );
    const page = await read.execute({
      maxCharacters: 2000,
      url: "https://a.test/p",
    });
    expect(page.markdown).toBe("x".repeat(2000));
    expect(page).not.toHaveProperty("truncated");
    expect(calls[0]?.body).not.toHaveProperty("maxCharacters");
  });

  it.each([0, -1, 1.5, "1000", null])(
    "refuses invalid per-call budgets: %s",
    async (maxCharacters) => {
      const { calls, fetch } = fakeFetch();
      await expect(
        toolNamed(toolsFor(webFor("firecrawl", fetch)), "read_page").execute({
          maxCharacters,
          url: "https://a.test/p",
        })
      ).rejects.toMatchObject({ code: "InvalidRequest" });
      expect(calls).toHaveLength(0);
    }
  );

  it("advertises and enforces the configured cap in the SDK", async () => {
    const { fetch, calls } = fakeFetch();
    const read = toolNamed(
      toolsFor(webFor("firecrawl", fetch), {
        maxCharacters: 1000,
        maxCharactersLimit: 2000,
      }),
      "read_page"
    );
    expect(read.inputSchema.properties).toMatchObject({
      maxCharacters: { maximum: 2000, minimum: 1, type: "integer" },
    });
    await expect(
      read.execute({ maxCharacters: 2001, url: "https://a.test" })
    ).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(calls).toHaveLength(0);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "refuses invalid configured budgets: %s",
    (maxCharacters) => {
      expect(() =>
        toolsFor(webFor("firecrawl", fakeFetch().fetch), { maxCharacters })
      ).toThrow(expect.objectContaining({ code: "InvalidRequest" }));
    }
  );
});
