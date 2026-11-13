// An error as the page shows it: the Fieldwork code when there is one, and a
// message that never includes the provider's response body.
import { FieldworkError } from "@howells/fieldwork-sdk";

export interface Described {
  code?: string;
  message: string;
}

const MAX_DEPTH = 4;

const findFieldworkError = (
  error: Error,
  depth = 0
): FieldworkError | undefined => {
  if (error instanceof FieldworkError) {
    return error;
  }
  const { cause } = error;
  return depth < MAX_DEPTH && cause instanceof Error
    ? findFieldworkError(cause, depth + 1)
    : undefined;
};

/** An error as the page shows it. */
export const describeError = (error: Error): Described => {
  const fieldwork = findFieldworkError(error);
  return fieldwork === undefined
    ? { message: error.message }
    : { code: fieldwork.code, message: fieldwork.message };
};

export { CaughtSchema } from "@/lib/caught";
