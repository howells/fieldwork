import { defineAdapter } from "./adapter.js";
import type { Adapter, AnyAdapter, Operations } from "./adapter.js";
import { FieldworkError } from "./errors.js";
import { bindOperation } from "./fieldwork.js";
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
    operations: Record<C, infer Op extends NonNullable<Operations[C]>>;
  }
    ? Op
    : never;
};

type RouterRaw<R extends Routes> = {
  [
    C in keyof R & Capability as R[C] extends AnyAdapter ? R[C]["name"] : never
  ]: R[C] extends AnyAdapter ? R[C]["raw"] : never;
};

const build = (routes: Routes) => {
  const operations: Record<string, unknown> = {};
  const raw: Record<string, unknown> = {};
  const providers: Partial<Record<Capability, string>> = {};
  for (const [capability, adapter] of Object.entries(routes)) {
    if (!adapter) {
      continue;
    }
    const operation = bindOperation(
      adapter.operations,
      capability as Capability
    );
    if (operation === undefined) {
      throw new FieldworkError(
        "Unsupported",
        `${adapter.name} does not offer ${capability}`,
        {
          provider: adapter.name,
        }
      );
    }
    operations[capability] = operation;
    providers[capability as Capability] = adapter.name;
    raw[adapter.name] = adapter.raw;
  }
  return { operations, providers, raw };
};

/**
 * One adapter per capability: `router({ search: parallel(), read: firecrawl() })`.
 * Each capability goes to exactly the adapter named for it; a capability with
 * no route is unsupported, and nothing falls back to another provider.
 */
export const router = <const R extends Routes>(
  routes: R & ValidRoutes<R>
): Adapter<"router", RouterOperations<R>, RouterRaw<R>> => {
  const built = build(routes);
  return defineAdapter({
    name: "router",
    // SAFETY: ValidRoutes proved at compile time that each route's adapter
    // offers its capability, and build() bound exactly those operations.
    operations: built.operations as RouterOperations<R>,
    providers: built.providers,
    // SAFETY: build() keys each adapter's raw client by the adapter's name.
    raw: built.raw as RouterRaw<R>,
  });
};

/**
 * A router for routes known only at run time, such as from command-line
 * flags. A route to an adapter that lacks its capability throws
 * `Unsupported` here instead of failing to compile.
 */
export const runtimeRouter = (routes: Routes): AnyAdapter =>
  defineAdapter({ name: "router", ...build(routes) });
