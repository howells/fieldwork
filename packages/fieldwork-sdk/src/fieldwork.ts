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
  supports(capability: Capability): boolean;
  /** The provider that serves a capability, or undefined when none does. */
  providerFor(capability: Capability): string | undefined;
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
  capability: Capability
): Bound | undefined => {
  const all = operations as Record<string, unknown>;
  const operation = all[capability];
  if (typeof operation === "function") {
    return (operation as (...args: unknown[]) => Promise<unknown>).bind(all);
  }
  if (
    GROUP_CAPABILITIES.includes(capability) &&
    operation &&
    typeof operation === "object"
  ) {
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
    const capabilities = {} as Record<Capability, boolean>;
    const self = this as unknown as Record<string, unknown>;
    for (const capability of CAPABILITIES) {
      const operation = bindOperation(adapter.operations, capability);
      capabilities[capability] = operation !== undefined;
      // Untyped callers and dynamic dispatch reach every name; a capability the
      // provider lacks refuses rather than falling back to another provider.
      self[capability] = operation ?? unsupported(adapter.name, capability);
    }
    this.capabilities = Object.freeze(capabilities);
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
export const Fieldwork = FieldworkClient as unknown as new <
  A extends AnyAdapter,
>(
  options: FieldworkOptions<A>
) => Fieldwork<A>;
