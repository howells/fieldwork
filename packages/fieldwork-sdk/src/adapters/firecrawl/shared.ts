import { FieldworkError } from "../../errors.js";
import { list } from "../../util.js";

export const provider = "firecrawl";

export const invalid = (message: string): FieldworkError =>
  new FieldworkError("InvalidRequest", message, { provider });

export const segment = (id: string): string => encodeURIComponent(id);

export const warnings = (...values: unknown[]): string[] =>
  values.flatMap((value) =>
    typeof value === "string" ? [value] : list(value).map(String)
  );

export const country = (code: string | undefined): string | undefined =>
  code?.toUpperCase();
