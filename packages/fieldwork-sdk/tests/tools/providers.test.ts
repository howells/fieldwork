import { describe, expect, it } from "vitest";

import { SPECS } from "../../src/tool-specs/index.js";
import { EXCLUDED_BY_DEFAULT, toolsFor } from "../../src/tools.js";
import { fakeFetch } from "../helpers.js";
import {
  alternate,
  baseInput,
  companions,
  isRequired,
  offeredFields,
  providersWith,
  requestsFor,
  sample,
  webFor,
} from "./support.js";

/**
 * The provider lists in tool-specs are claims about each adapter's options.
 * These tests hold every claim to the adapter: a declared (field, provider)
 * pair must change the request the provider receives, and a pair that is not
 * declared must be refused before any request is sent.
 */

const declared = SPECS.flatMap((spec) =>
  providersWith(spec.capability).flatMap((provider) =>
    offeredFields(spec, provider).map((field) => ({
      field,
      provider,
      spec,
    }))
  )
);

const undeclared = SPECS.flatMap((spec) =>
  providersWith(spec.capability).flatMap((provider) => {
    const offered = new Set(
      offeredFields(spec, provider).map((field) => field.name)
    );
    return [...new Set(spec.fields.map((field) => field.name))]
      .filter((name) => !offered.has(name))
      .map((name) => ({ name, provider, spec }));
  })
);

const label = (spec: { name: string }, field: string, provider: string) =>
  `${spec.name} ${field} on ${provider}`;

describe("the provider lists in the tool specs", () => {
  it("name only providers that have the capability", () => {
    for (const spec of SPECS) {
      const have = providersWith(spec.capability);
      for (const field of spec.fields) {
        for (const provider of field.providers ?? []) {
          expect(have, label(spec, field.name, provider)).toContain(provider);
        }
      }
    }
  });

  it("never offer one provider two fields of the same name", () => {
    for (const spec of SPECS) {
      for (const provider of providersWith(spec.capability)) {
        const names = offeredFields(spec, provider).map((field) => field.name);
        expect(new Set(names).size, `${spec.name} on ${provider}`).toBe(
          names.length
        );
      }
    }
  });

  it.each(declared)(
    "send $field.name to $provider for $spec.name",
    async ({ field, provider, spec }) => {
      const base = {
        ...baseInput(spec, provider),
        ...companions(spec.name, field.name, provider),
      };
      const required = isRequired(field, provider);
      const withField = {
        ...base,
        [field.name]: sample(spec.name, field.name),
      };
      const without = required
        ? { ...base, [field.name]: alternate(spec.name, field.name) }
        : base;
      const sent = await requestsFor(provider, spec.name, withField);
      const other = await requestsFor(provider, spec.name, without);
      expect(sent.length, `${spec.name} sent nothing`).toBeGreaterThan(0);
      expect(sent, label(spec, field.name, provider)).not.toStrictEqual(other);
    }
  );

  it.each(undeclared)(
    "refuse $name on $provider for $spec.name before sending anything",
    async ({ name, provider, spec }) => {
      const { calls, fetch } = fakeFetch();
      const tool = toolsFor(webFor(provider, fetch), {
        allow: [...EXCLUDED_BY_DEFAULT],
      }).find((candidate) => candidate.name === spec.name);
      expect(tool?.inputSchema.properties).not.toHaveProperty(name);
      await expect(
        tool?.execute({
          ...baseInput(spec, provider),
          [name]: sample(spec.name, name),
        })
      ).rejects.toMatchObject({ code: "InvalidRequest" });
      expect(calls).toHaveLength(0);
    }
  );
});
