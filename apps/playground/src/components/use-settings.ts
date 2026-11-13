"use client";

// What the browser keeps between visits: provider keys, the model, the
// person's provider picks, and the monitors they stopped. From the keys and
// picks it works out which provider serves each capability.
import { CAPABILITIES } from "@howells/fieldwork-sdk";
import { useCallback, useMemo } from "react";
import { z } from "zod";

import { DEFAULT_MODEL, MODEL_IDS } from "@/lib/models";
import type { ProviderId, ProviderInfo } from "@/lib/providers";
import { PROVIDER_IDS, keySource } from "@/lib/providers";
import type { Preferences, Routes } from "@/lib/routing";
import { routesFor, usablePreferences } from "@/lib/routing";
import { useStored } from "@/lib/storage";

const KeysSchema = z.record(z.string(), z.string());
const ModelSchema = z.string().refine((id) => MODEL_IDS.includes(id));
const PreferencesSchema = z.partialRecord(
  z.enum(CAPABILITIES),
  z.enum(PROVIDER_IDS)
);
const StoppedSchema = z.array(z.string());

const NO_KEYS: Record<string, string> = {};
const NO_PREFERENCES: Preferences = {};
const NONE_STOPPED: string[] = [];

export const useSettings = (providers: readonly ProviderInfo[]) => {
  const [keys, setKeys] = useStored("fieldwork.keys", KeysSchema, NO_KEYS);
  const [model, setModel] = useStored(
    "fieldwork.model",
    ModelSchema,
    DEFAULT_MODEL
  );
  const [storedPreferences, setPreferences] = useStored(
    "fieldwork.preferences",
    PreferencesSchema,
    NO_PREFERENCES
  );
  const [stopped, setStopped] = useStored(
    "fieldwork.stopped-monitors",
    StoppedSchema,
    NONE_STOPPED
  );

  const keyed = useMemo(
    () =>
      new Set<ProviderId>(
        providers
          .filter((provider) => keySource(provider, keys) !== "none")
          .map((provider) => provider.id)
      ),
    [keys, providers]
  );
  const preferences = useMemo(
    () => usablePreferences(providers, keyed, storedPreferences),
    [keyed, providers, storedPreferences]
  );
  const routes: Routes = useMemo(
    () => routesFor(providers, keyed, preferences),
    [keyed, preferences, providers]
  );
  const browserKeys = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(keys).filter(([, value]) => value !== "")
      ),
    [keys]
  );

  const setKey = useCallback(
    (provider: ProviderId, value: string) => {
      const others = Object.entries(keys).filter(([id]) => id !== provider);
      const next: [string, string][] =
        value.trim() === "" ? others : [...others, [provider, value.trim()]];
      setKeys(Object.fromEntries(next));
    },
    [keys, setKeys]
  );

  const prefer = useCallback(
    (change: Preferences) => {
      setPreferences({ ...storedPreferences, ...change });
    },
    [setPreferences, storedPreferences]
  );

  const markStopped = useCallback(
    (id: string) => {
      setStopped([...stopped.filter((item) => item !== id), id]);
    },
    [setStopped, stopped]
  );

  return {
    browserKeys,
    keyed,
    keys,
    markStopped,
    model,
    prefer,
    preferences,
    routes,
    setKey,
    setModel,
    stopped,
  };
};

export type Settings = ReturnType<typeof useSettings>;
