// Reads a streamed response one JSON line at a time and hands each parsed
// event to `onEvent`. A line that doesn't match the schema throws, so the
// page never draws an event it doesn't understand.
import type { z } from "zod";

const emitLines = <E>(
  lines: readonly string[],
  schema: z.ZodType<E>,
  onEvent: (event: E) => void
): void => {
  for (const line of lines) {
    if (line.trim() !== "") {
      const parsed: unknown = JSON.parse(line);
      onEvent(schema.parse(parsed));
    }
  }
};

/** Reads chunk after chunk, in order, carrying a partial last line forward. */
const pump = async <E>(
  reader: ReadableStreamDefaultReader<string>,
  schema: z.ZodType<E>,
  onEvent: (event: E) => void,
  carried: string
): Promise<void> => {
  const { done, value } = await reader.read();
  if (done) {
    emitLines([carried], schema, onEvent);
    return;
  }
  const lines = `${carried}${value}`.split("\n");
  const rest = lines.pop() ?? "";
  emitLines(lines, schema, onEvent);
  await pump(reader, schema, onEvent, rest);
};

export const readLines = async <E>(
  response: Response,
  schema: z.ZodType<E>,
  onEvent: (event: E) => void
): Promise<void> => {
  if (!response.ok || response.body === null) {
    const text = await response.text();
    throw new Error(
      text === "" ? `The server answered ${response.status}` : text
    );
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  await pump(reader, schema, onEvent, "");
};
