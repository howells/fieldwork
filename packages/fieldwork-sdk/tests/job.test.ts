import { afterEach, describe, expect, it, vi } from "vitest";

import { FieldworkError } from "../src/errors.js";
import { runJob } from "../src/job.js";

const done = { state: "done" };

/** A check of a job that is still running: it has no finished state yet. */
const finishedStates: (typeof done)[] = [];
const running = async () => finishedStates.at(0);

describe("running an asynchronous job", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts the job, checks it until it finishes, then builds the result", async () => {
    const start = vi.fn<() => Promise<string>>(async () => "job-1");
    let checks = 0;
    const result = await runJob(
      "test",
      {
        check: async (id) => {
          checks += 1;
          expect(id).toBe("job-1");
          return checks === 2 ? done : undefined;
        },
        finish: (found, id) => ({ found, id }),
        start,
      },
      { interval: 1 }
    );
    expect(result).toStrictEqual({ found: done, id: "job-1" });
    expect(start).toHaveBeenCalledOnce();
    expect(checks).toBe(2);
  });

  it("stops at once when cancelled during a check, keeping the job id", async () => {
    const controller = new AbortController();
    const started = Date.now();
    await expect(
      runJob(
        "test",
        {
          check: async () => {
            controller.abort();
          },
          finish: () => done,
          start: async () => "job-3",
        },
        { interval: 60_000, signal: controller.signal }
      )
    ).rejects.toMatchObject({ code: "Aborted", jobId: "job-3" });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("waits for the resumed job without starting another", async () => {
    const start = vi.fn<() => Promise<string>>(async () => "new-job");
    const result = await runJob(
      "test",
      { check: async () => done, finish: (_found, id) => id, start },
      { resume: "old-job" }
    );
    expect(result).toBe("old-job");
    expect(start).not.toHaveBeenCalled();
  });

  it("gives an error from a check the job id", async () => {
    await expect(
      runJob(
        "test",
        {
          check: async () => {
            throw new FieldworkError("JobFailed", "test job failed");
          },
          finish: () => done,
          start: async () => "job-2",
        },
        {}
      )
    ).rejects.toMatchObject({ code: "JobFailed", jobId: "job-2" });
  });

  it("gives an error while building the result the job id", async () => {
    await expect(
      runJob(
        "test",
        {
          check: async () => done,
          finish: () => {
            throw new FieldworkError("ProviderError", "test lost the output");
          },
          start: async () => "job-3",
        },
        {}
      )
    ).rejects.toMatchObject({
      code: "ProviderError",
      jobId: "job-3",
      retryable: false,
    });
  });

  it("keeps the job id when cancellation arrives during the polling interval", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const check = vi.fn<typeof running>(async () => {
      expect(controller.signal.aborted).toBe(false);
    });
    const pending = runJob(
      "test",
      { check, finish: () => done, start: async () => "job-4" },
      { interval: 1000, signal: controller.signal, timeout: 10_000 }
    );
    const abort = async () => {
      await vi.advanceTimersByTimeAsync(1);
      controller.abort();
    };
    await expect(Promise.all([pending, abort()])).rejects.toMatchObject({
      code: "Aborted",
      jobId: "job-4",
      retryable: false,
    });
    expect(check).toHaveBeenCalledOnce();
  });

  it("times out with the job id when the job does not finish in time", async () => {
    await expect(
      runJob(
        "test",
        {
          check: running,
          finish: () => done,
          start: async () => "job-5",
        },
        { interval: 5, timeout: 1 }
      )
    ).rejects.toMatchObject({ code: "Timeout", jobId: "job-5" });
  });
});
