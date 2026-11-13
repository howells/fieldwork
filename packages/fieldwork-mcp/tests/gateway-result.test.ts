import { describe, expect, it } from "vitest";

import { MAX_ENCODED_RESULT_BYTES } from "../src/gateway/limits.js";
import { checkedResultText } from "../src/gateway/result.js";

const large = "x".repeat(MAX_ENCODED_RESULT_BYTES);

describe(checkedResultText, () => {
  it("keeps a Parallel run id from meta.requestId as the jobId of a resumable tool", () => {
    expect(() =>
      checkedResultText(
        { data: large, meta: { requestId: "run_1" } },
        "parallel",
        true
      )
    ).toThrow(expect.objectContaining({ jobId: "run_1" }));
  });

  it("prefers the result's id, and gives no jobId for a tool that cannot resume", () => {
    expect(() =>
      checkedResultText(
        { data: large, id: "job", meta: { requestId: "run_1" } },
        "tavily",
        true
      )
    ).toThrow(expect.objectContaining({ jobId: "job" }));
    expect(() =>
      checkedResultText(
        { data: large, meta: { requestId: "request" } },
        "exa",
        false
      )
    ).toThrow(expect.objectContaining({ jobId: undefined }));
  });
});
