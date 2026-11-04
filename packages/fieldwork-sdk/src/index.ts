// The package's root export: the client, the adapter contract, the router, the
// error and the result types. Adapters and agent tools are separate entry points.

export {
  type Adapter,
  type AnyAdapter,
  defineAdapter,
  type Operations,
} from "./adapter.js";
export { FieldworkError, type FieldworkErrorCode } from "./errors.js";
export { Fieldwork, type FieldworkOptions } from "./fieldwork.js";
export type { RawClient, RequestOptions } from "./http.js";
export { router, runtimeRouter, type Routes } from "./router.js";
export type { OutputSchema, StandardSchemaWithJSON } from "./schema.js";
export * from "./types.js";
