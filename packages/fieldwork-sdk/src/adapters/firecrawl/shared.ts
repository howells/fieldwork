import { FieldworkError } from "../../errors.js";
import { list } from "../../util.js";

export const provider = "firecrawl";

export function invalid(message: string): FieldworkError {
  return new FieldworkError("InvalidRequest", message, { provider });
}

/** A path segment from an id the caller supplied. */
export function segment(id: string): string {
  return encodeURIComponent(id);
}

/** Every warning in the given values, whether each is a string or a list. */
export function warnings(...values: unknown[]): string[] {
  return values.flatMap((value) =>
    typeof value === "string" ? [value] : list(value).map(String)
  );
}

/** Firecrawl takes country codes in upper case. */
export function country(code: string | undefined): string | undefined {
  return code?.toUpperCase();
}
