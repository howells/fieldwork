// A caught value as an Error, on either side: the Error itself, or a
// stand-in when something that isn't an Error was thrown.
import { z } from "zod";

export const CaughtSchema = z.union([
  z.instanceof(Error),
  z
    .unknown()
    .transform(() => new Error("The call failed without an error message")),
]);

/** True when the person stopped the request. */
export const isAbort = (error: Error): boolean => error.name === "AbortError";
