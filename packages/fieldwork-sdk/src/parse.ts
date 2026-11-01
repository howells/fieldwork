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

/** The string, an empty one too, or undefined when the value is absent or not a string. */
export const optionalAnyString = z.optional(z.union([z.string(), absent]));

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

/**
 * A string, number or boolean read as a string: `"a"` is `"a"` (an empty
 * string stays empty), `3` is `"3"` and `true` is `"true"`. Any other value,
 * or an absent one, reads as undefined. Numbers must be finite.
 */
export const optionalScalar = z.optional(
  z.union([
    z.string(),
    z.pipe(z.number(), z.transform(String)),
    z.pipe(z.boolean(), z.transform(String)),
    absent,
  ])
);

/** A warning entry: a string as it is, or an object's non-empty `message`, else its non-empty `detail`. */
export const warningEntry = z.union([
  z.string(),
  z.pipe(
    looseObject({ detail: optionalString, message: optionalString }),
    z.transform((entry) => entry.message ?? entry.detail)
  ),
]);

/**
 * The warnings a provider reports, as a list of strings. A string (an empty
 * one too) is one warning. An array gives its strings as they are and, for
 * each object, its non-empty `message` or else its non-empty `detail`; any
 * other entry is dropped. Anything else, or an absent value, is no warnings.
 */
export const warnings = z.pipe(
  z.union([
    z.pipe(
      z.string(),
      z.transform((message) => [message])
    ),
    arrayOf(warningEntry),
  ]),
  z.transform((entries) =>
    entries.filter((entry): entry is string => entry !== undefined)
  )
);

/** Any value, as it arrived. Absent reads as undefined. */
export const anything = z.optional(z.unknown());

/** What `withOriginal` reads: the value through its schema, and as it arrived. */
export interface Original<Value> {
  original: unknown;
  value: Value;
}

/**
 * The item read through `item`, and the value as it arrived beside it, for a
 * result that must keep its own `raw`. An absent value gives an `original` of
 * undefined. `item` must never fail, so build it from the blocks above.
 */
export const withOriginal = <Item extends z.ZodMiniType>(item: Item) =>
  z.prefault(
    z.pipe(
      z.unknown(),
      z.transform((original) => ({ original, value: z.parse(item, original) }))
    ),
    nothing
  );

/**
 * An id that is a finite number or a non-empty string, as a string: `7`
 * is `"7"`. Any other value, or an absent one, reads as undefined.
 */
export const optionalId = z.optional(
  z.union([z.pipe(z.number(), z.transform(String)), nonEmptyString, absent])
);

/**
 * One value read two ways at once, for a key a provider's result needs
 * twice: `first` is the value through `first`, `second` through `second`.
 */
export const both = <First extends z.ZodMiniType, Second extends z.ZodMiniType>(
  first: First,
  second: Second
) =>
  z.prefault(
    z.pipe(
      z.unknown(),
      z.transform((value) => ({
        first: z.parse(first, value),
        second: z.parse(second, value),
      }))
    ),
    nothing
  );

/**
 * Excerpts of a page: a string is one excerpt (an empty one too), an array
 * gives its strings, empty ones too. Any other value, or an empty list, reads
 * as undefined.
 */
export const excerpts = z.pipe(
  z.union([
    z.pipe(
      z.string(),
      z.transform((passage) => [passage])
    ),
    arrayOf(z.string()),
  ]),
  z.transform((passages) => (passages.length > 0 ? passages : undefined))
);

/** What a provider says about a cited source: its URL, title and excerpts. */
export const sourceShape = {
  excerpts,
  title: optionalString,
  url: optionalString,
};

/** A cited source. */
export const Source = looseObject(sourceShape);

export type SourceBlock = z.output<typeof Source>;

/** A non-empty string, else a finite number, else undefined. */
export const optionalStringOrNumber = z.optional(
  z.union([nonEmptyString, z.number(), absent])
);

/** An object or an array as it arrived, or undefined for any other value, or an absent one. */
export const optionalStructure = z.optional(
  z.union([z.array(z.unknown()), z.record(z.string(), z.unknown()), absent])
);

/**
 * A non-empty string; or, for an array, its first non-empty string. Any other
 * value, or an absent one, reads as undefined.
 */
export const optionalFirstString = z.optional(
  z.union([
    nonEmptyString,
    z.pipe(
      arrayOf(nonEmptyString),
      z.transform((items) => items[0])
    ),
  ])
);

/**
 * An object that keeps unknown keys, or undefined when the value is absent or
 * is not an object (null, an array, a string). Declare every field with the
 * blocks above, so an object never fails.
 */
export const optionalObject = <Shape extends z.core.$ZodShape>(shape: Shape) =>
  z.optional(z.union([z.looseObject(shape), absent]));

/**
 * Like `arrayOf`, but a value that is not an array, or is absent, reads as
 * undefined instead of an empty array.
 */
export const optionalArrayOf = <Item extends z.ZodMiniType>(item: Item) =>
  z.optional(
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
      absent,
    ])
  );
