import core from "@howells/lint/oxlint/core";

export default {
  extends: [core],
  rules: {
    // Adapters translate provider wire formats, so key order is the provider's.
    "sort-keys": "off",
    // Polling waits between requests on purpose.
    "no-await-in-loop": "off",
    "func-style": "off",
    "no-use-before-define": "off",
    // Provider responses arrive as untyped JSON and pass through the small
    // guards in src/util.ts (record, list, text, num). Structured output is
    // typed by the caller's schema, so returning it as the caller's `T` is an
    // assertion by design, and the guards themselves inspect `unknown`.
    "gdp-ts/no-type-assertion": "off",
    "anti-slop/require-safety-comment-for-type-assertion": "off",
    "typescript/no-unsafe-type-assertion": "off",
    "anti-slop/no-chained-type-assertions": "off",
    "anti-slop/no-runtime-typeof": "off",
    "anti-slop/no-unknown-parameters": "off",
    "anti-slop/no-unknown-returns": "off",
    "anti-slop/no-unsafe-dictionary-type": "off",
    "typescript/no-unnecessary-type-parameters": "off",
    "typescript/strict-boolean-expressions": "off",
    // Operation tables are declared as methods so each adapter's generic
    // signatures read like the API they document.
    "typescript/method-signature-style": "off",
    // The public entry re-exports the SDK surface; that is its job.
    "oxc/no-barrel-file": "off",
  },
  overrides: [
    {
      // The one place a provider key is read from the environment.
      files: ["packages/fieldwork-sdk/src/http.ts"],
      rules: { "no-restricted-properties": "off", "promise/avoid-new": "off" },
    },
    {
      files: ["**/tests/**/*.ts"],
      rules: {
        "no-restricted-properties": "off",
        "max-lines": "off",
        "max-lines-per-function": "off",
        "typescript/no-non-null-assertion": "off",
        "vitest/prefer-describe-function-title": "off",
      },
    },
  ],
};
