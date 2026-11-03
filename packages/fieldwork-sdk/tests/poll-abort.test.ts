import { afterEach, describe, expect, it, vi } from "vitest";

import { poll } from "../src/http.js";

describe("polling an existing job", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the job ID when cancellation arrives during the polling interval", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const check = vi.fn<() => Promise<void>>(async () => {
      expect(controller.signal.aborted).toBe(false);
    });
    const pending = poll("exa", "run_existing", check, {
      interval: 1000,
      signal: controller.signal,
      timeout: 10_000,
    });
    const abort = async () => {
      await vi.advanceTimersByTimeAsync(1);
      controller.abort();
    };
    await expect(Promise.all([pending, abort()])).rejects.toMatchObject({
      code: "Aborted",
      jobId: "run_existing",
      retryable: false,
    });
    expect(check).toHaveBeenCalledOnce();
  });
});
