export const provider = "firecrawl";

export const country = (code: string | undefined): string | undefined =>
  code?.toUpperCase();
