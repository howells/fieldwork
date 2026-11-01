import { describe, expect, expectTypeOf, it } from "vitest";
import * as z from "zod";

import { exa } from "../src/adapters/exa.js";
import { firecrawl } from "../src/adapters/firecrawl.js";
import { parallel } from "../src/adapters/parallel.js";
import { perplexity } from "../src/adapters/perplexity.js";
import { Fieldwork, FieldworkError } from "../src/index.js";
import { checkOutput, jsonSchemaOf } from "../src/schema.js";
import { fakeFetch, nth } from "./helpers.js";

const url = "https://www.tilebar.com/product/portmore-aqua-3x8.html";

const product = z.object({ price: z.number(), title: z.string() });

/** What Zod writes for `product`, without its `$schema` key. */
const productJson = {
  properties: { price: { type: "number" }, title: { type: "string" } },
  required: ["price", "title"],
  type: "object",
};

const plain = {
  properties: { price: { type: "number" } },
  required: ["price"],
  type: "object",
};

const rejection = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof FieldworkError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected the call to throw");
};

/** The fields of a provider's reply, right or wrong. */
interface Fields {
  price?: number | string | string[];
  title?: number | string;
}

type Replies = Parameters<typeof fakeFetch>;

const withFirecrawl = (...replies: Replies) => {
  const { fetch, calls } = fakeFetch(...replies);
  return {
    calls,
    web: new Fieldwork({
      adapter: firecrawl({ apiKey: "k", fetch, retries: 0 }),
    }),
  };
};

const firecrawlJson = (json: Fields) => ({
  body: { data: { json, metadata: { scrapeId: "sc" } }, success: true },
});

const withExa = (...replies: Replies) => {
  const { fetch, calls } = fakeFetch(...replies);
  return {
    calls,
    web: new Fieldwork({ adapter: exa({ apiKey: "k", fetch, retries: 0 }) }),
  };
};

const exaRun = (structured: Fields): Replies => [
  { body: { id: "run_1", status: "queued" } },
  {
    body: {
      id: "run_1",
      output: { grounding: [], structured, text: "" },
      status: "completed",
      stopReason: "schema_satisfied",
    },
  },
];

const taskRun = (status: string) => ({
  interaction_id: "int_1",
  run_id: "trun_1",
  status,
});

const withParallel = (content: Fields) => {
  const { fetch, calls } = fakeFetch(
    { body: taskRun("queued") },
    { body: taskRun("completed") },
    {
      body: {
        output: { basis: [], content, type: "json" },
        run: taskRun("completed"),
      },
    }
  );
  return {
    calls,
    web: new Fieldwork({
      adapter: parallel({ apiKey: "k", fetch, retries: 0 }),
    }),
  };
};

const withPerplexity = (value: string) => {
  const { fetch, calls } = fakeFetch({
    body: {
      id: "resp_1",
      output: [
        {
          content: [{ annotations: [], text: value, type: "output_text" }],
          type: "message",
        },
      ],
      status: "completed",
    },
  });
  return {
    calls,
    web: new Fieldwork({
      adapter: perplexity({ apiKey: "k", fetch, retries: 0 }),
    }),
  };
};

describe(jsonSchemaOf, () => {
  it("passes a plain JSON Schema through unchanged", () => {
    expect(jsonSchemaOf(plain)).toBe(plain);
  });

  it("writes a Standard Schema as the requested draft, without $schema", () => {
    expect(jsonSchemaOf(product)).toStrictEqual(productJson);
    expect(jsonSchemaOf(product, "draft-07")).toStrictEqual(productJson);
  });

  it("refuses a schema that cannot be written as JSON Schema", () => {
    expect(() => jsonSchemaOf(z.object({ when: z.date() }))).toThrow(
      expect.objectContaining({ code: "InvalidRequest" })
    );
  });
});

describe(checkOutput, () => {
  it("leaves output unchecked without a Standard Schema", async () => {
    await expect(
      checkOutput(plain, { price: "x" }, { provider: "p" })
    ).resolves.toStrictEqual({ price: "x" });
    await expect(checkOutput(undefined, 3, { provider: "p" })).resolves.toBe(3);
  });

  it("returns the schema's own output", async () => {
    const withDefault = z.object({ n: z.number().default(7) });
    await expect(
      checkOutput(withDefault, {}, { provider: "p" })
    ).resolves.toStrictEqual({ n: 7 });
  });

  it("lists the first issues with their paths and the job id", async () => {
    const error = await rejection(
      checkOutput(
        z.object({
          a: z.string(),
          b: z.array(z.object({ c: z.number() })),
          d: z.string(),
          e: z.string(),
        }),
        { a: 1, b: [{ c: "x" }] },
        { jobId: "job_1", provider: "p" }
      )
    );
    expect(error).toMatchObject({
      code: "ProviderError",
      jobId: "job_1",
      provider: "p",
      retryable: false,
    });
    expect(error.message).toContain("a: ");
    expect(error.message).toContain("b.0.c: ");
    expect(error.message).toContain("and 1 more");
  });
});

describe("firecrawl extract with a Zod schema", () => {
  it("sends JSON Schema and returns typed data", async () => {
    const { web, calls } = withFirecrawl(
      firecrawlJson({ price: 53.5, title: "Portmore" })
    );
    const result = await web.extract(url, { schema: product });
    expect(nth(calls, 0).body).toStrictEqual({
      formats: [{ schema: productJson, type: "json" }],
      url,
    });
    expect(result.data).toStrictEqual({ price: 53.5, title: "Portmore" });
    expectTypeOf(result.data).toEqualTypeOf<{ price: number; title: string }>();
  });

  it("throws ProviderError naming the bad path", async () => {
    const { web } = withFirecrawl(
      firecrawlJson({ price: "free", title: "Portmore" })
    );
    const error = await rejection(web.extract(url, { schema: product }));
    expect(error).toMatchObject({
      code: "ProviderError",
      provider: "firecrawl",
      retryable: false,
    });
    expect(error.message).toContain("price: ");
  });
});

describe("exa research with a Zod schema", () => {
  it("sends draft-07 JSON Schema and returns typed output", async () => {
    const { web, calls } = withExa(
      ...exaRun({ price: 53.5, title: "Portmore" })
    );
    const run = await web.research("Portmore", {
      interval: 1,
      schema: product,
    });
    expect(nth(calls, 0).body).toStrictEqual({
      outputSchema: productJson,
      query: "Portmore",
    });
    expect(run.output).toStrictEqual({ price: 53.5, title: "Portmore" });
    expectTypeOf(run.output).toEqualTypeOf<{ price: number; title: string }>();
  });

  it("throws ProviderError naming the bad path, with the run id", async () => {
    const { web } = withExa(...exaRun({ price: 53.5, title: 9 }));
    const error = await rejection(
      web.research("Portmore", { interval: 1, schema: product })
    );
    expect(error).toMatchObject({
      code: "ProviderError",
      jobId: "run_1",
      retryable: false,
    });
    expect(error.message).toContain("title: ");
  });

  it("checks an answer and an extract too", async () => {
    const answered = withExa({
      body: { answer: { price: "no" }, citations: [] },
    });
    const answerError = await rejection(
      answered.web.answer("Price?", { schema: product })
    );
    expect(nth(answered.calls, 0).body).toMatchObject({
      outputSchema: productJson,
    });
    expect(answerError.message).toContain("price: ");

    const extracted = withExa({
      body: {
        results: [
          { summary: JSON.stringify({ price: "no", title: "t" }), url },
        ],
        statuses: [],
      },
    });
    const extractError = await rejection(
      extracted.web.extract(url, { schema: product })
    );
    expect(nth(extracted.calls, 0).body).toMatchObject({
      summary: { schema: productJson },
    });
    expect(extractError.message).toContain("price: ");
  });
});

describe("parallel extract with a Zod schema", () => {
  it("sends JSON Schema and returns typed data", async () => {
    const { web, calls } = withParallel({ price: 53.5, title: "Portmore" });
    const result = await web.extract(url, { interval: 1, schema: product });
    expect(nth(calls, 0).body).toMatchObject({
      task_spec: { output_schema: { json_schema: productJson, type: "json" } },
    });
    expect(result.data).toStrictEqual({ price: 53.5, title: "Portmore" });
    expectTypeOf(result.data).toEqualTypeOf<{ price: number; title: string }>();
  });

  it("throws ProviderError naming the bad path, with the run id", async () => {
    const { web } = withParallel({ price: [], title: "Portmore" });
    const error = await rejection(
      web.extract(url, { interval: 1, schema: product })
    );
    expect(error).toMatchObject({
      code: "ProviderError",
      jobId: "trun_1",
      retryable: false,
    });
    expect(error.message).toContain("price: ");
  });
});

describe("perplexity answer with a Zod schema", () => {
  it("sends JSON Schema and returns typed output", async () => {
    const { web, calls } = withPerplexity(
      JSON.stringify({ price: 1, title: "Portmore" })
    );
    const answer = await web.answer("Price?", { schema: product });
    expect(nth(calls, 0).body).toMatchObject({
      response_format: {
        json_schema: { name: "output", schema: productJson },
        type: "json_schema",
      },
    });
    expectTypeOf(answer.output).toEqualTypeOf<
      { price: number; title: string } | undefined
    >();
    expect(answer.output).toStrictEqual({ price: 1, title: "Portmore" });
  });

  it("throws ProviderError naming the bad path", async () => {
    const { web } = withPerplexity(JSON.stringify({ price: 1 }));
    const error = await rejection(web.answer("Price?", { schema: product }));
    expect(error.message).toContain("title: ");
  });
});

describe("inferring T", () => {
  const { fetch } = fakeFetch();
  const web = new Fieldwork({
    adapter: firecrawl({ apiKey: "k", fetch, retries: 0 }),
  });

  // The calls are never made: the compiler checks the types.
  const infer = async () => {
    const fromZod = await web.extract(url, { schema: product });
    expectTypeOf(fromZod.data).toEqualTypeOf<{
      price: number;
      title: string;
    }>();
    const fromArgument = await web.extract<{ price: number }>(url, {
      schema: plain,
    });
    expectTypeOf(fromArgument.data).toEqualTypeOf<{ price: number }>();
    const fromJson = await web.extract(url, { schema: plain });
    expectTypeOf(fromJson.data).toBeUnknown();
    const research = await web.research("q", { schema: product });
    expectTypeOf(research.output).toEqualTypeOf<{
      price: number;
      title: string;
    }>();
  };

  it("takes T from a Standard Schema, a type argument or neither", () => {
    expect(infer).toBeTypeOf("function");
  });
});
