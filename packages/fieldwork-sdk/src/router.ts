import { defineAdapter } from "./adapter.js";
import type { AnyAdapter } from "./adapter.js";
import { FieldworkError } from "./errors.js";
import type { Capability } from "./types.js";

export type Routes = Partial<Record<Capability, AnyAdapter>>;

/** Each route must name an adapter whose provider offers that capability. */
type ValidRoutes<R extends Routes> = {
  [C in keyof R]: C extends Capability
    ? R[C] extends { operations: Record<C, unknown> }
      ? R[C]
      : `${R[C] extends AnyAdapter ? R[C]["name"] : "this adapter"} does not offer ${C}`
    : never;
};

type RouterOperations<R extends Routes> = {
  [C in keyof R & Capability]: R[C] extends {
    operations: Record<
      C,
      infer Op extends (...args: never[]) => Promise<unknown>
    >;
  }
    ? Op
    : never;
};

type RouterRaw<R extends Routes> = {
  [
    C in keyof R & Capability as R[C] extends AnyAdapter ? R[C]["name"] : never
  ]: R[C] extends AnyAdapter ? R[C]["raw"] : never;
};

/**
 * One adapter per capability: `router({ search: parallel(), read: firecrawl() })`.
 * Each capability goes to exactly the adapter named for it; a capability with
 * no route is unsupported, and nothing falls back to another provider.
 */
export function router<const R extends Routes>(routes: R & ValidRoutes<R>) {
  const operations: Record<string, unknown> = {};
  const raw: Record<string, unknown> = {};
  const providers: Partial<Record<Capability, string>> = {};
  for (const [capability, adapter] of Object.entries(routes as Routes)) {
    if (!adapter) {
      continue;
    }
    const operation = (adapter.operations as Record<string, unknown>)[
      capability
    ];
    if (typeof operation !== "function") {
      throw new FieldworkError(
        "Unsupported",
        `${adapter.name} does not offer ${capability}`,
        {
          provider: adapter.name,
        }
      );
    }
    operations[capability] = operation.bind(adapter.operations);
    providers[capability as Capability] = adapter.name;
    raw[adapter.name] = adapter.raw;
  }
  return defineAdapter({
    name: "router",
    operations: operations as RouterOperations<R>,
    raw: raw as RouterRaw<R>,
    providers,
  });
}
