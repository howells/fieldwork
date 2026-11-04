// Values the Firecrawl adapter's modules share: the provider name and a country-code helper.

export const provider = "firecrawl";

/** A country code in upper case, as sent to Firecrawl. */
export const country = (code: string | undefined): string | undefined =>
  code?.toUpperCase();
