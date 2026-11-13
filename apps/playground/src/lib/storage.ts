"use client";

// Values the page keeps in this browser: provider keys, the chosen model,
// the person's provider picks and recent tasks. Each is read through a
// schema, so a stored value from an older version is dropped, not trusted.
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { z } from "zod";

const listeners = new Set<() => void>();

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
};

const notify = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

const readRaw = (key: string): string | null =>
  window.localStorage.getItem(key);

/**
 * A stored value, parsed with `schema`, and a setter that writes it back.
 * Before hydration and on the server it is `fallback`.
 */
export const useStored = <T>(
  key: string,
  schema: z.ZodType<T>,
  fallback: T
): [T, (next: T) => void] => {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null
  );
  const value = useMemo(() => {
    if (raw === null) {
      return fallback;
    }
    try {
      const stored: unknown = JSON.parse(raw);
      const parsed = schema.safeParse(stored);
      return parsed.success ? parsed.data : fallback;
    } catch {
      return fallback;
    }
  }, [fallback, raw, schema]);
  const set = useCallback(
    (next: T) => {
      window.localStorage.setItem(key, JSON.stringify(next));
      notify();
    },
    [key]
  );
  return [value, set];
};
