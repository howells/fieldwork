// The shape of a tool declaration. `toolsFor` (tools.ts) builds an agent tool
// from each `Spec`, keeping the `Field`s its provider offers.

import type { Capability } from "../types.js";
import type { FieldSchema } from "./schema.js";

/** Every provider with an adapter, so a misspelt name in a spec fails to compile. */
export type ProviderName =
  | "brave"
  | "browserbase"
  | "exa"
  | "firecrawl"
  | "kernel"
  | "llamaparse"
  | "parallel"
  | "perplexity"
  | "reducto"
  | "serpapi"
  | "tavily";

/**
 * One input of a tool. A field that is not one of the spec's `positional`
 * names goes in the method's options object under its `name`, so the name
 * must be the option's name in the provider's options type.
 */
export interface Field {
  /** The input's key, and the name of the option it sets. */
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
  /** Advertised to the model as the input's schema, and the input is checked against it. */
  schema: FieldSchema;
}

/** One agent tool: what it is called, what it tells the model, which inputs each provider takes and what it returns. */
export interface Spec {
  /** The capability whose method the tool calls. */
  capability: Capability;
  /** Set when the result is nothing but a confirmation: `{ [confirmAs]: true, id }`. */
  confirmAs?: string;
  /** True when the tool can make changes that cannot be undone. */
  destructive: boolean;
  /** Told to the model: what the tool does, when to use it and which tool to use instead. */
  description: string;
  /** Every input, with the providers each applies to. `toolsFor` keeps those the instance's provider is offered. */
  fields: Field[];
  /** True when repeating a call with the same input has no further effect. */
  idempotent: boolean;
  /** The method of a group capability, such as `create` for `monitor`. */
  method?: string;
  /** The tool's name, a verb_noun such as `search_web`. */
  name: string;
  /** The result's shape, as `forModel` returns it, with no `raw`. */
  output: FieldSchema;
  /**
   * Fields passed as the method's leading arguments, in order. Every other
   * field goes in the options object that follows them.
   */
  positional: readonly string[];
  /** True when the tool changes nothing outside Fieldwork. */
  readOnly: boolean;
  /** A short human name for clients that show one. */
  title: string;
  /** Set when the result is a list: it is returned as `{ [wrapAs]: list }`. */
  wrapAs?: string;
}
