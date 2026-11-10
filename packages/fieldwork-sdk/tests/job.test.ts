import { afterEach, describe, expect, it, vi } from "vitest";

import { FieldworkError } from "../src/errors.js";
import { createRawClient } from "../src/http.js";
import { jobState, requireOutput, runJob, startJob } from "../src/job.js";
import { looseObject, optionalString, withOriginal } from "../src/parse.js";
import { fakeFetch } from "./helpers.js";

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

  it("turns a plain error from a check or the result into a ProviderError with the job id", async () => {
    const thrown = new TypeError("Invalid URL");
    await expect(
      runJob(
        "test",
        {
          check: async () => {
            throw thrown;
          },
          finish: () => done,
          start: async () => "job-6",
        },
        {}
      )
    ).rejects.toMatchObject({
      cause: thrown,
      code: "ProviderError",
      jobId: "job-6",
      message: "Invalid URL",
      provider: "test",
      retryable: false,
    });
    await expect(
      runJob(
        "test",
        {
          check: async () => done,
          finish: () => {
            throw new Error("the validator broke");
          },
          start: async () => "job-7",
        },
        {}
      )
    ).rejects.toBeInstanceOf(FieldworkError);
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

/** A raw client on a fake fetch that answers with `replies`. */
const rawWith = (...replies: Parameters<typeof fakeFetch>) => {
  const { calls, fetch } = fakeFetch(...replies);
  return {
    calls,
    raw: createRawClient({
      baseUrl: "https://test.example",
      fetch,
      headers: {},
      provider: "test",
    }),
  };
};

/** A status as a poll reported it, beside the response it came in. */
const reported = (value?: string) => ({ original: { status: value }, value });

describe("starting a job", () => {
  const Reply = looseObject({ id: withOriginal(optionalString) });

  it("posts the request and returns the id it reads from the reply", async () => {
    const { calls, raw } = rawWith({ body: { id: "job-8" } });
    await expect(
      startJob(raw, "/jobs", { body: { q: 1 } }, Reply, (reply) => reply.id)
    ).resolves.toBe("job-8");
    expect(calls).toMatchObject([{ body: { q: 1 }, method: "POST" }]);
  });

  it("does not repeat a start that failed after the provider may have created the job", async () => {
    const { calls, raw } = rawWith(
      { body: {}, status: 500 },
      { body: { id: "job-9" } }
    );
    await expect(
      startJob(raw, "/jobs", { retries: 1 }, Reply, (reply) => reply.id)
    ).rejects.toMatchObject({ code: "ProviderError", retryable: false });
    expect(calls).toHaveLength(1);
  });

  it("throws ProviderError when the reply has no id", async () => {
    const { raw } = rawWith({ body: {} });
    await expect(
      startJob(raw, "/jobs", {}, Reply, (reply) => reply.id)
    ).rejects.toMatchObject({ code: "ProviderError", provider: "test" });
  });
});

describe("reading a job's status", () => {
  const states = {
    done: ["completed"],
    failed: ["failed"],
    running: ["queued"],
  };

  it("sorts a status into running, done or failed, comparing exactly", () => {
    expect(jobState("test", "j", states, reported("queued"))).toBe("running");
    expect(jobState("test", "j", states, reported("completed"))).toBe("done");
    expect(jobState("test", "j", states, reported("failed"))).toBe("failed");
    expect(() => jobState("test", "j", states, reported("Completed"))).toThrow(
      FieldworkError
    );
  });

  it("throws ProviderError with the job id and the response for an unknown status", () => {
    expect(() => jobState("test", "j1", states, reported("paused"))).toThrow(
      expect.objectContaining({
        cause: { status: "paused" },
        code: "ProviderError",
        jobId: "j1",
        message: expect.stringContaining('"paused"'),
      })
    );
  });

  it("throws on a missing status unless the provider may leave it out", () => {
    expect(() => jobState("test", "j2", states, reported())).toThrow(
      expect.objectContaining({ code: "ProviderError", jobId: "j2" })
    );
    expect(
      jobState("test", "j2", { ...states, missingIsRunning: true }, reported())
    ).toBe("running");
  });
});

describe("requiring a finished job's output", () => {
  const body = { status: "completed" };

  it("returns a value that is there, falsy ones included", () => {
    expect(
      requireOutput("test", "j", { original: body, value: { a: 1 } })
    ).toStrictEqual({ a: 1 });
    expect(requireOutput("test", "j", { original: body, value: 0 })).toBe(0);
    expect(requireOutput("test", "j", { original: body, value: false })).toBe(
      false
    );
  });

  it.each([undefined, null, ""])(
    "throws JobFailed with the job id and the response for %j",
    (value) => {
      expect(() =>
        requireOutput("test", "j3", { original: body, value })
      ).toThrow(
        expect.objectContaining({
          cause: body,
          code: "JobFailed",
          jobId: "j3",
          message: expect.stringContaining("j3"),
        })
      );
    }
  );
});
