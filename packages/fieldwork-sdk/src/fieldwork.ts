import type { AnyAdapter } from "./adapter.js";
import { FieldworkError } from "./errors.js";
import { CAPABILITIES, GROUP_CAPABILITIES } from "./types.js";
import type { Capability } from "./types.js";

export interface FieldworkOptions<A extends AnyAdapter> {
  adapter: A;
}

interface FieldworkBase<A extends AnyAdapter> {
  /** The adapter's name, such as "firecrawl" or "router". */
  readonly provider: A["name"];
  /** Which capabilities this instance can call. */
  readonly capabilities: Readonly<Record<Capability, boolean>>;
  /** The provider's HTTP API, for anything Fieldwork does not wrap. */
  readonly raw: A["raw"];
  supports: (capability: Capability) => boolean;
  /** The provider that serves a capability, or undefined when none does. */
  providerFor: (capability: Capability) => string | undefined;
}

/**
 * A Fieldwork instance has exactly the methods its adapter's provider offers.
 * `new Fieldwork({ adapter: tavily() }).act(...)` does not compile, because
 * Tavily has no browser.
 */
// oxlint-disable-next-line eslint/no-redeclare -- the constructor below shares this name, as a class would
export type Fieldwork<A extends AnyAdapter> = FieldworkBase<A> &
  Readonly<A["operations"]>;

type Bound =
  | ((...args: unknown[]) => Promise<unknown>)
  | Record<string, unknown>;

export const bindOperation = (
  operations: unknown,
  capability: string
): Bound | undefined => {
  // SAFETY: every adapter's operations is an object of capability names to
  // functions or groups of functions; it is read here by capability name.
  const all = operations as Record<string, unknown>;
  const operation = all[capability];
  if (typeof operation === "function") {
    // SAFETY: typeof says this is a function; each operation takes its own
    // arguments and returns a promise, and callers dispatch by capability name.
    return (operation as (...args: unknown[]) => Promise<unknown>).bind(all);
  }
  if (
    GROUP_CAPABILITIES.some((group) => group === capability) &&
    typeof operation === "object" &&
    operation !== null
  ) {
    // SAFETY: a group capability's operation is an object of named methods.
    const group = operation as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(group).map(([name, method]) => [
        name,
        typeof method === "function" ? method.bind(group) : method,
      ])
    );
  }
  return undefined;
};

const unsupported = (provider: string, capability: Capability): Bound => {
  const refuse = async () => {
    throw new FieldworkError(
      "Unsupported",
      `${provider} does not offer ${capability}`,
      { provider }
    );
  };
  if (!GROUP_CAPABILITIES.includes(capability)) {
    return refuse;
  }
  // Every method of a group the provider lacks refuses the same way.
  return new Proxy({}, { get: () => refuse });
};

class FieldworkClient {
  readonly provider: string;
  readonly capabilities: Readonly<Record<Capability, boolean>>;
  readonly raw: unknown;
  readonly #providers: Partial<Record<Capability, string>>;

  constructor(options: FieldworkOptions<AnyAdapter>) {
    const { adapter } = options;
    this.provider = adapter.name;
    this.raw = adapter.raw;
    this.#providers = adapter.providers ?? {};
    const has = (capability: Capability) =>
      bindOperation(adapter.operations, capability) !== undefined;
    // Listing every capability makes the compiler refuse a new one left out.
    this.capabilities = Object.freeze({
      act: has("act"),
      answer: has("answer"),
      browser: has("browser"),
      crawl: has("crawl"),
      decide: has("decide"),
      discover: has("discover"),
      extract: has("extract"),
      images: has("images"),
      map: has("map"),
      monitor: has("monitor"),
      parse: has("parse"),
      product: has("product"),
      read: has("read"),
      readMany: has("readMany"),
      research: has("research"),
      search: has("search"),
      usage: has("usage"),
    });
    // Untyped callers and dynamic dispatch reach every name; a capability the
    // provider lacks refuses rather than falling back to another provider.
    Object.assign(
      this,
      Object.fromEntries(
        CAPABILITIES.map((capability) => [
          capability,
          bindOperation(adapter.operations, capability) ??
            unsupported(adapter.name, capability),
        ])
      )
    );
  }

  supports(capability: Capability): boolean {
    return this.capabilities[capability];
  }

  providerFor(capability: Capability): string | undefined {
    if (!this.capabilities[capability]) {
      return undefined;
    }
    return this.#providers[capability] ?? this.provider;
  }
}

// The class above is untyped at the method level; this constructor signature
// gives each instance the methods of the adapter it was built with. The value
// and the type share the name `Fieldwork`, as a class would.
// SAFETY: the constructor assigns every capability name to the adapter's bound
// operation or a refusing stand-in, so an instance has the methods that
// Fieldwork<A> declares for the adapter's operations.
export const Fieldwork = FieldworkClient as new <A extends AnyAdapter>(
  options: FieldworkOptions<A>
) => Fieldwork<A>;
