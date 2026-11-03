import type { Capability } from "../types.js";
import type { FieldSchema } from "./schema.js";

/** Every provider with an adapter, so a misspelt name in a spec fails to compile. */
export type ProviderName =
  | "brave"
  | "browserbase"
  | "exa"
  | "firecrawl"
  | "llamaparse"
  | "parallel"
  | "perplexity"
  | "reducto"
  | "serpapi"
  | "tavily";

export interface Field {
  name: string;
  /**
   * Providers whose options type has this option with this meaning; every
   * provider that has the capability when absent. The same name can appear
   * twice with different providers, when the providers differ in the values
   * they accept.
   */
  providers?: readonly ProviderName[];
  /** Required for every provider that is offered the field. */
  required?: boolean;
  /** Providers that need the field though other providers do not. */
  requiredFor?: readonly ProviderName[];
  schema: FieldSchema;
}

export interface Spec {
  capability: Capability;
  /** Set when the result is nothing but a confirmation: `{ [confirmAs]: true, id }`. */
  confirmAs?: string;
  /** True when the tool can make changes that cannot be undone. */
  destructive: boolean;
  description: string;
  fields: Field[];
  idempotent: boolean;
  /** The method of a group capability, such as `create` for `monitor`. */
  method?: string;
  name: string;
  output: FieldSchema;
  /**
   * Fields passed as the method's leading arguments, in order. Every other
   * field goes in the options object that follows them.
   */
  positional: readonly string[];
  readOnly: boolean;
  title: string;
  /** Set when the result is a list: it is returned as `{ [wrapAs]: list }`. */
  wrapAs?: string;
}
