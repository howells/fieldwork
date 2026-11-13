import { describe, expect, it } from "vitest";

import { productOf } from "@/lib/findings";
import type { CallState } from "@/lib/run-state";

const TARGET = "https://www.kinstore.co.uk/products/hay-mags-sofa";
const OTHER = "https://www.utilitydesign.co.uk/hay-mags-sofa";

const product = (id: string, url: string): CallState => ({
  capability: "product",
  id,
  input: { url },
  output: { url, variants: [{ sku: id }] },
  provider: "firecrawl",
  status: "done",
  tool: "read_product",
});

describe("the task's product", () => {
  it("keeps the requested product after a competitor is read", () => {
    const calls = [product("target", TARGET), product("competitor", OTHER)];
    expect(productOf(calls, TARGET)?.call.id).toBe("target");
    expect(productOf(calls, OTHER)?.call.id).toBe("competitor");
  });

  it("does not substitute a competitor when the requested product failed", () => {
    const failed = { ...product("target", TARGET), status: "failed" } as const;
    expect(
      productOf([failed, product("other", OTHER)], TARGET)
    ).toBeUndefined();
  });

  it("takes the latest successful read of the target, ignoring invalid results", () => {
    const invalid = {
      ...product("invalid", TARGET),
      output: { variants: null },
    };
    const calls = [
      product("first", TARGET),
      product("latest", TARGET),
      invalid,
    ];
    expect(productOf(calls, TARGET)?.call.id).toBe("latest");
  });

  it("retains the latest product when the task has no target URL", () => {
    expect(
      productOf([product("first", TARGET), product("last", OTHER)])?.call.id
    ).toBe("last");
  });
});
