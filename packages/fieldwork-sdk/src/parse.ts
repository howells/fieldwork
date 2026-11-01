import * as z from "zod/mini";

/**
 * Building blocks for the schemas that parse a provider's response at the
 * boundary. Every block is lenient: it never fails, so a provider that adds,
 * removes or retypes a field cannot make a working call throw. A field of the
 * wrong type reads as absent, and unknown keys pass through. Build each
 * adapter's response schema only from these, then `z.parse` the response once.
 * The provider's untouched response still goes in `raw`; the parsed value is
 * for reading only.
 */

/** The result of a field that is absent or of the wrong type. */
const nothing = (): undefined => undefined;

/** Reads any value as absent. A union's last member, so a value of the wrong type does not fail. */
const absent = z.pipe(z.unknown(), z.transform(nothing));

/** A string that is not empty; any other value fails. Use inside `arrayOf`. */
export const nonEmptyString = z.string().check(z.minLength(1));

/** The string, or undefined when the value is absent, empty or not a string. */
export const optionalString = z.optional(z.union([nonEmptyString, absent]));

/** The number, or undefined when the value is absent, not a number, NaN or infinite. */
export const optionalNumber = z.optional(z.union([z.number(), absent]));

/** The boolean, or undefined when the value is absent or not a boolean. */
export const optionalBoolean = z.optional(z.union([z.boolean(), absent]));

/**
 * An object that keeps unknown keys. A value that is not an object (absent,
 * null, an array, a string) reads as an object with every field absent, so
 * nested reads need no `?.`. Declare every field with these blocks, so the
 * object itself never fails.
 */
export const looseObject = <Shape extends z.core.$ZodShape>(shape: Shape) => {
  const object = z.looseObject(shape);
  return z.prefault(
    z.union([
      object,
      z.pipe(
        z.pipe(
          z.unknown(),
          z.transform(() => ({}))
        ),
        object
      ),
    ]),
    {}
  );
};

/**
 * An array of the items that parse. A value that is not an array, or is
 * absent, reads as an empty one. An item schema built from the blocks above
 * never fails, so every position is kept; a strict one such as
 * `nonEmptyString` drops the bad items.
 */
export const arrayOf = <Item extends z.ZodMiniType>(item: Item) =>
  z.prefault(
    z.union([
      z.pipe(
        z.array(z.unknown()),
        z.transform((entries) =>
          entries.flatMap((entry) => {
            const parsed = z.safeParse(item, entry);
            return parsed.success ? [parsed.data] : [];
          })
        )
      ),
      z.pipe(
        z.unknown(),
        z.transform((): z.output<Item>[] => [])
      ),
    ]),
    []
  );

/**
 * A dictionary keyed by string, its values read through `item`. A value that
 * is not an object, or is absent, reads as an empty dictionary.
 */
export const recordOf = <Item extends z.ZodMiniType>(item: Item) =>
  z.prefault(
    z.union([
      z.record(z.string(), item),
      z.pipe(
        z.unknown(),
        z.transform((): Record<string, z.output<Item>> => ({}))
      ),
    ]),
    {}
  );
