/**
 * The shapes every adapter returns. Each result keeps the provider's own
 * response in `raw`, so nothing the provider sent is lost by normalizing it.
 */

/** A JSON Schema object describing the values to extract. */
export type JsonSchema = Record<string, unknown>;

/** Every capability Fieldwork knows. An adapter implements a subset. */
export const CAPABILITIES = [
  "search",
  "read",
  "extract",
  "product",
  "map",
  "crawl",
  "research",
  "act",
  "parse",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** Settings every call accepts, whatever the provider. */
export interface CallOptions {
  /** Cancels the call, including any polling for an asynchronous job. */
  signal?: AbortSignal;
  /** Milliseconds before the call gives up. */
  timeout?: number;
}

/** A source a provider cited. */
export interface Citation {
  url: string;
  title?: string;
  /** Passages the provider quoted from the source, when it returned any. */
  excerpts?: string[];
}

/** The sources a provider gave for one field of a structured result. */
export interface FieldSource {
  /** The field's name or path, as the provider reports it. */
  field: string;
  citations: Citation[];
  /** The provider's own confidence label or score, unchanged. */
  confidence?: string | number;
  reasoning?: string;
}

export interface SearchResult {
  url: string;
  title?: string;
  /** Text from the page that matched the query. */
  snippet?: string;
  /** Page text, when the search was asked to include it. */
  content?: string;
  publishedAt?: string;
  score?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  /** A generated answer, when the provider was asked for one. */
  answer?: string;
  raw: unknown;
}

export interface Page {
  url: string;
  title?: string;
  /** The page as Markdown. */
  markdown?: string;
  /** Cleaned HTML. */
  html?: string;
  /** The HTML exactly as the provider received it. */
  rawHtml?: string;
  links?: string[];
  images?: string[];
  /** Passages that answer the query, when the read was given one. */
  excerpts?: string[];
  raw: unknown;
}

export interface Extraction<T> {
  /** The values, in the shape of the schema. */
  data: T;
  /** Per-field sources, when the provider returns them. */
  fields?: FieldSource[];
  raw: unknown;
}

export interface ProductVariant {
  id?: string;
  sku?: string;
  title?: string;
  /** Option values that pick this variant, such as color or size. */
  values?: Record<string, string>;
  price?: { amount?: string; currency?: string };
  inStock?: boolean;
  images?: string[];
}

export interface Product {
  title?: string;
  brand?: string;
  category?: string;
  description?: string;
  url?: string;
  variants: ProductVariant[];
  raw: unknown;
}

export interface SiteLink {
  url: string;
  title?: string;
  description?: string;
}

export interface SiteMap {
  links: SiteLink[];
  raw: unknown;
}

export interface Crawl {
  pages: Page[];
  raw: unknown;
}

export interface Research<T> {
  /** The provider's id for the run. */
  id: string;
  /** Structured output when a schema was given, otherwise the report text. */
  output: T;
  sources: Citation[];
  fields?: FieldSource[];
  raw: unknown;
}

export interface ActResult {
  /** What the script printed. */
  stdout: string;
  stderr: string;
  /** The value the script returned, as the provider reports it. */
  result?: unknown;
  exitCode?: number;
  raw: unknown;
}

export interface DocumentPage {
  /** The physical page number, starting at 1. */
  pageNumber: number;
  markdown: string;
}

export interface ParsedDocument {
  markdown: string;
  pages?: DocumentPage[];
  /** Layout blocks with positions, as the provider returns them. */
  blocks?: unknown[];
  raw: unknown;
}

/** A file to parse: its bytes and its name, which tells the provider the type. */
export interface DocumentInput {
  data: Blob | Uint8Array | ArrayBuffer;
  name: string;
}
