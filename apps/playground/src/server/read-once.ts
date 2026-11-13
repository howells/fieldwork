// One read of one page by one provider, measured: what the compare view puts
// in each column. A provider that fails returns a typed failure rather than
// throwing, so one bad read never sinks the others.
import type { ReadOutcome } from "@/lib/events";
import type { ReadPage } from "@/mastra/context";

import { CaughtSchema, describeError } from "./errors";

/** Enough of the page to check it fairly: menus often fill the first few thousand characters. */
const KEPT_CHARACTERS = 30_000;
const READ_TIMEOUT_MS = 60_000;

/** Images in Markdown, as `![alt](src)`. */
const countImages = (text: string): number =>
  text.match(/!\[[^\]]*\]\([^)]+\)/gu)?.length ?? 0;

const countWords = (text: string): number =>
  text.split(/\s+/u).filter((word) => word !== "").length;

export const readOnce = async (
  provider: string,
  read: ReadPage,
  url: string,
  signal?: AbortSignal
): Promise<ReadOutcome> => {
  const started = performance.now();
  try {
    const page = await read(url, { signal, timeout: READ_TIMEOUT_MS });
    const text = page.markdown ?? page.excerpts?.join("\n\n") ?? "";
    return {
      excerpts: page.markdown === undefined ? page.excerpts : undefined,
      // What the read holds: the images the provider listed, or those in its Markdown.
      images: Math.max(
        page.images?.length ?? 0,
        countImages(page.markdown ?? "")
      ),
      markdown: page.markdown?.slice(0, KEPT_CHARACTERS),
      ms: Math.round(performance.now() - started),
      ok: true,
      provider,
      title: page.title,
      usage: page.meta?.usage,
      words: countWords(text),
    };
  } catch (error) {
    const described = describeError(CaughtSchema.parse(error));
    return {
      error:
        described.code === undefined
          ? described.message
          : `${described.code}: ${described.message}`,
      images: 0,
      ms: Math.round(performance.now() - started),
      ok: false,
      provider,
      words: 0,
    };
  }
};
