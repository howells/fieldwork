import { describe, expect, it } from "vitest";

import { filtersFrom, filtersQuery } from "@/lib/guide";

describe("tool guide filters", () => {
  it("reads filters from the address and ignores values it doesn't know", () => {
    expect(
      filtersFrom({ group: "read", provider: "Exa", q: "pdf" })
    ).toStrictEqual({
      group: "read",
      provider: "Exa",
      query: "pdf",
    });
    expect(filtersFrom({ group: "nope", provider: "Bing" })).toStrictEqual({
      group: "all",
      provider: "",
      query: "",
    });
  });

  it("writes only the filters that differ from the defaults", () => {
    expect(filtersQuery({ group: "all", provider: "", query: " " })).toBe("");
    expect(filtersQuery({ group: "find", provider: "", query: "dates" })).toBe(
      "?q=dates&group=find"
    );
  });
});
