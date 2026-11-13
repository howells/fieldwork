"use client";

// Provider keys: where each comes from, and a field to add or replace one.
// A key typed here stays in this browser's storage and travels only with
// requests for its own provider. The field is a password field, so the key
// is never shown back.
import { useState } from "react";

import type { KeySource, ProviderId, ProviderInfo } from "@/lib/providers";
import { keySource } from "@/lib/providers";

const SOURCE_WORDS: Readonly<Record<KeySource, string>> = {
  browser: "In this browser",
  none: "No key",
  server: "From the server",
};

interface KeyFieldProps {
  label: string;
  onCancel: () => void;
  onSave: (value: string) => void;
}

const KeyField = ({ label, onCancel, onSave }: KeyFieldProps) => {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex min-w-0 grow items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(value);
      }}
    >
      <input
        aria-label={`${label} key`}
        autoComplete="off"
        // A key field is the one place focus moves on its own: it opened because the person asked for it.
        autoFocus
        className="rounded-control border-rule bg-paper type-code focus:border-map-blue h-6 min-w-0 grow border px-1.5 outline-none"
        onChange={(event) => {
          setValue(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onCancel();
          }
        }}
        placeholder="Paste the key"
        spellCheck={false}
        type="password"
        value={value}
      />
      <button
        className="hit-area text-map-blue type-body strong disabled:text-muted"
        disabled={value.trim() === ""}
        type="submit"
      >
        Save
      </button>
    </form>
  );
};

interface KeyRowProps {
  editing: boolean;
  onEdit: (editing: boolean) => void;
  onSetKey: (provider: ProviderId, value: string) => void;
  provider: ProviderInfo;
  source: KeySource;
}

const KeyRow = ({
  editing,
  onEdit,
  onSetKey,
  provider,
  source,
}: KeyRowProps) => {
  const action = (() => {
    if (source === "browser") {
      return {
        label: "Remove",
        run: () => {
          onSetKey(provider.id, "");
        },
      };
    }
    return {
      label: source === "server" ? "Use your own" : "Add key",
      run: () => {
        onEdit(true);
      },
    };
  })();
  return (
    <div className="rounded-control hover:bg-wash flex h-8 shrink-0 items-center gap-3 px-2 transition-colors duration-150">
      <span
        className={`type-body w-22 shrink-0 ${source === "none" ? "text-graphite" : ""}`}
      >
        {provider.label}
      </span>
      {editing ? (
        <KeyField
          label={provider.label}
          onCancel={() => {
            onEdit(false);
          }}
          onSave={(value) => {
            onSetKey(provider.id, value);
            onEdit(false);
          }}
        />
      ) : (
        <>
          <span className="text-graphite type-label grow">
            {SOURCE_WORDS[source]}
          </span>
          <button
            className="hit-area text-map-blue type-body"
            onClick={action.run}
            type="button"
          >
            {action.label}
          </button>
        </>
      )}
    </div>
  );
};

interface KeyListProps {
  focus?: ProviderId;
  keys: Readonly<Record<string, string>>;
  onSetKey: (provider: ProviderId, value: string) => void;
  providers: readonly ProviderInfo[];
}

export const KeyList = ({ focus, keys, onSetKey, providers }: KeyListProps) => {
  const [editing, setEditing] = useState<ProviderId | undefined>(focus);
  return (
    <div className="flex flex-col">
      {providers.map((provider) => (
        <KeyRow
          editing={editing === provider.id}
          key={provider.id}
          onEdit={(next) => {
            setEditing(next ? provider.id : undefined);
          }}
          onSetKey={onSetKey}
          provider={provider}
          source={keySource(provider, keys)}
        />
      ))}
    </div>
  );
};
