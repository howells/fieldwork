import { FieldworkError } from "../../errors.js";

export const provider = "firecrawl";

export const invalid = (message: string): FieldworkError =>
  new FieldworkError("InvalidRequest", message, { provider });

export const segment = (id: string): string => encodeURIComponent(id);

export const country = (code: string | undefined): string | undefined =>
  code?.toUpperCase();
