import * as z from "zod/mini";

import { FieldworkError } from "../errors.js";
import type { JsonValue } from "./json.js";

export const DEFAULT_MAX_CHARACTERS = 20_000;

/** Checks configured and per-call budgets against the same optional cap. */
export const checkMaxCharacters = (
  value: JsonValue | undefined,
  limit = Number.MAX_SAFE_INTEGER
): number => {
  const parsed = z.safeParse(
    z.number().check(z.int(), z.minimum(1), z.maximum(limit)),
    value
  );
  if (!parsed.success) {
    throw new FieldworkError(
      "InvalidRequest",
      `maxCharacters must be an integer from 1 to ${limit}`
    );
  }
  return parsed.data;
};
