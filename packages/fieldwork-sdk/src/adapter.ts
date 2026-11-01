import type { RawClient } from "./http.js";
import type { Capability } from "./types.js";

type Method = (...args: never[]) => Promise<unknown>;

/**
 * The methods an adapter implements, keyed by capability. Most capabilities
 * are one method; `monitor` and `browser` are a group of methods.
 */
export type Operations = Partial<
  Record<Capability, Method | Readonly<Record<string, Method>>>
>;

/**
 * A provider bound to its credentials. `operations` holds only the
 * capabilities the provider offers, each typed with that provider's options,
 * so a capability or option the provider lacks cannot be called.
 */
export interface Adapter<
  Name extends string = string,
  Ops extends Operations = Operations,
  Raw = RawClient,
> {
  readonly name: Name;
  readonly operations: Ops;
  /** The provider's HTTP API, for anything Fieldwork does not wrap. */
  readonly raw: Raw;
  /**
   * The provider behind each capability, when it is not `name`. Only a router
   * sets this.
   */
  readonly providers?: Partial<Record<Capability, string>>;
}

// oxlint-disable-next-line typescript/no-explicit-any -- any adapter, whatever its operations
export type AnyAdapter = Adapter<string, any, unknown>;

export function defineAdapter<
  Name extends string,
  Ops extends Operations,
  Raw = RawClient,
>(adapter: Adapter<Name, Ops, Raw>): Adapter<Name, Ops, Raw> {
  return adapter;
}
