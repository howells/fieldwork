import type {
  Answer,
  CallOptions,
  ImageSearch,
  Recency,
  SearchResponse,
} from "../../types.js";

export interface BraveConfig {
  /** Defaults to the BRAVE_API_KEY environment variable. */
  apiKey?: string;
  /** Defaults to https://api.search.brave.com/res/v1. */
  baseUrl?: string;
  fetch?: typeof fetch;
}

export type BraveSafeSearch = "off" | "moderate" | "strict";

/** Brave's named freshness windows start at a day; it has no hour window. */
export type BraveRecency = Exclude<Recency, "hour">;

/** Options every Brave search shares, whichever endpoint serves it. */
export interface BraveSearchBase extends CallOptions {
  /**
   * Results to return. Web search allows 1 to 20 (web results only), news and
   * video search 1 to 50, content search 1 to 50. Brave may return fewer.
   */
  limit?: number;
  /** ISO 3166-1 alpha-2 code such as "GB", or "ALL" for worldwide. */
  country?: string;
  /** Content language such as "en", "en-gb", "zh-hans" or "pt-br". */
  language?: string;
  /** Pages from the last day, 7 days, 31 days or 365 days. */
  recency?: BraveRecency;
  /**
   * YYYY-MM-DD. Brave's date range needs both ends: without `publishedBefore`
   * the range ends today. Not combinable with `recency`.
   */
  publishedAfter?: string;
  /** YYYY-MM-DD. Needs `publishedAfter`. Not combinable with `recency`. */
  publishedBefore?: string;
  /** Web and news default to "moderate"; Brave's news default is "strict". */
  safesearch?: BraveSafeSearch;
}

/** Result types web search can return besides web results. */
export type BraveResultType =
  | "web"
  | "news"
  | "videos"
  | "discussions"
  | "locations";

/** `/web/search`: web results, plus news, videos, discussions and locations. */
export interface BraveWebSearchOptions extends BraveSearchBase {
  vertical?: "web";
  content?: false;
  maxTokens?: never;
  maxTokensPerUrl?: never;
  relevance?: never;
  sourceMetadata?: never;
  /**
   * The page of results, counting from 0 (Brave allows 0 to 9). It counts pages
   * of `limit` results, and pages can overlap.
   */
  offset?: number;
  /** Keep only these result types. Brave returns every type the plan has when unset. */
  resultTypes?: BraveResultType[];
  /**
   * Add up to 5 more excerpts from each result to `snippet`, after the
   * description.
   */
  extraSnippets?: boolean;
  /** Search the spell-corrected query (Brave's default). */
  spellcheck?: boolean;
  /** Language of response metadata, such as "en-US". */
  uiLanguage?: string;
  units?: "metric" | "imperial";
  /** Apply search operators such as `site:` in the query (Brave's default). */
  operators?: boolean;
  /** A Goggle URL or inline rules, up to 3. Re-ranks the results. */
  goggles?: string | string[];
  /** Keep Brave's highlight markers in snippets. Fieldwork asks for none. */
  textDecorations?: boolean;
}

/** `/news/search`. */
export interface BraveNewsSearchOptions extends BraveSearchBase {
  vertical: "news";
  content?: false;
  resultTypes?: never;
  units?: never;
  textDecorations?: never;
  maxTokens?: never;
  maxTokensPerUrl?: never;
  relevance?: never;
  sourceMetadata?: never;
  offset?: number;
  extraSnippets?: boolean;
  spellcheck?: boolean;
  uiLanguage?: string;
  operators?: boolean;
  goggles?: string | string[];
}

/** `/videos/search`. */
export interface BraveVideoSearchOptions extends BraveSearchBase {
  vertical: "videos";
  content?: false;
  resultTypes?: never;
  extraSnippets?: never;
  units?: never;
  textDecorations?: never;
  goggles?: never;
  maxTokens?: never;
  maxTokensPerUrl?: never;
  relevance?: never;
  sourceMetadata?: never;
  offset?: number;
  spellcheck?: boolean;
  uiLanguage?: string;
  operators?: boolean;
}

/**
 * `/llm/context`: Brave fetches each result and returns the passages of its
 * text that fit the query, as `content`.
 */
export interface BraveContentSearchOptions extends BraveSearchBase {
  content: true;
  vertical?: never;
  offset?: never;
  resultTypes?: never;
  extraSnippets?: never;
  spellcheck?: never;
  uiLanguage?: never;
  units?: never;
  textDecorations?: never;
  /** Total token budget for all passages, 1024 to 32768 (Brave's default is 8192). */
  maxTokens?: number;
  /** Token cap for one page's passages, 512 to 8192 (default 4096). */
  maxTokensPerUrl?: number;
  /** How strictly passages must match the query. */
  relevance?: "strict" | "balanced" | "lenient" | "disabled";
  /** Return the site name, favicon, thumbnail and description of each source. */
  sourceMetadata?: boolean;
  operators?: boolean;
  goggles?: string | string[];
}

export type BraveSearchOptions =
  | BraveWebSearchOptions
  | BraveNewsSearchOptions
  | BraveVideoSearchOptions
  | BraveContentSearchOptions;

export interface BraveImageOptions extends CallOptions {
  /** Images to return, 1 to 200 (Brave's default is 50). Brave has no paging. */
  limit?: number;
  country?: string;
  language?: string;
  /** "strict" removes all adult content; "off" removes only illegal content. */
  safesearch?: "off" | "strict";
  spellcheck?: boolean;
}

export interface BraveAnswerOptions extends CallOptions {
  /** Brave's answer model; "brave-pro" is its default. */
  model?: "brave" | "brave-pro";
  country?: string;
  language?: string;
  safesearch?: BraveSafeSearch;
  /** Caps the answer's length in tokens. */
  maxTokens?: number;
  /** How much search material Brave puts behind the answer. */
  searchContextSize?: "low" | "medium" | "high";
  /** Where the asker is, to answer local questions. */
  userLocation?: {
    city?: string;
    region?: string;
    country?: string;
    timezone?: string;
  };
}

export interface BraveOperations {
  search(query: string, options?: BraveSearchOptions): Promise<SearchResponse>;
  images(query: string, options?: BraveImageOptions): Promise<ImageSearch>;
  answer(
    question: string,
    options?: BraveAnswerOptions
  ): Promise<Answer<unknown>>;
}

/** Every search option in one shape; the public types split it by endpoint. */
export interface SearchInput extends BraveSearchBase {
  vertical?: string;
  content?: boolean;
  offset?: number;
  resultTypes?: BraveResultType[];
  extraSnippets?: boolean;
  spellcheck?: boolean;
  uiLanguage?: string;
  units?: string;
  operators?: boolean;
  goggles?: string | string[];
  textDecorations?: boolean;
  maxTokens?: number;
  maxTokensPerUrl?: number;
  relevance?: string;
  sourceMetadata?: boolean;
}
