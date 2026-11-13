"use client";

// The empty screen: one question, the composer, and six examples to start
// from. The only place the serif appears, at 28px.
import { useState } from "react";

import type { Routes } from "@/lib/routing";
import type { Starter } from "@/lib/starters";
import { STARTERS } from "@/lib/starters";

import { Contours } from "./contours";

interface ComposerProps {
  disabled: boolean;
  onRun: (text: string) => void;
}

const Composer = ({ disabled, onRun }: ComposerProps) => {
  const [text, setText] = useState("");
  const ready = text.trim() !== "" && !disabled;
  const submit = () => {
    if (ready) {
      onRun(text.trim());
      setText("");
    }
  };
  return (
    <form
      className="rounded-panel border-rule bg-paper shadow-dock focus-within:border-rule-strong flex w-full flex-col border transition-colors duration-150"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        aria-label="Paste a link or ask anything"
        className="type-body caret-map-blue placeholder:text-muted field-sizing-content max-h-60 min-h-16 resize-none bg-transparent px-3 pt-2.5 pb-1 outline-none"
        onChange={(event) => {
          setText(event.target.value);
        }}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder="Paste a link or ask anything"
        rows={1}
        value={text}
      />
      <div className="flex justify-end px-2 pb-2">
        <button
          className="hit-area rounded-control border-rule bg-wash text-muted enabled:border-ink enabled:bg-ink enabled:text-paper flex h-7 items-center gap-1.5 border px-2.5 transition-colors duration-150"
          disabled={!ready}
          type="submit"
        >
          <span className="type-body strong">Run</span>
          <span aria-hidden className="type-label">
            ⏎
          </span>
        </button>
      </div>
    </form>
  );
};

interface StarterRowProps {
  disabled: boolean;
  onStart: (starter: Starter) => void;
  routes: Routes;
  starter: Starter;
}

const StarterRow = ({
  disabled,
  onStart,
  routes,
  starter,
}: StarterRowProps) => (
  <button
    className="group hover:bg-wash rounded-control -mx-2 flex min-h-11 shrink-0 flex-col justify-center gap-0.5 px-2 py-1.5 text-left transition-colors duration-150 disabled:opacity-60 sm:min-h-9 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    disabled={disabled}
    onClick={() => {
      onStart(starter);
    }}
    type="button"
  >
    <span className="type-body group-enabled:group-hover:text-map-blue min-w-0 truncate transition-colors duration-150">
      {starter.title}
    </span>
    <span className="text-muted type-label shrink-0">
      {starter.hint(routes)}
    </span>
  </button>
);

interface StartViewProps {
  disabled: boolean;
  onRun: (text: string) => void;
  onStart: (starter: Starter) => void;
  routes: Routes;
}

export const StartView = ({
  disabled,
  onRun,
  onStart,
  routes,
}: StartViewProps) => (
  <div className="relative flex min-w-0 grow basis-0 flex-col overflow-hidden">
    <Contours />
    <div className="relative mx-auto flex w-full max-w-[720px] flex-col gap-4 overflow-y-auto px-4 pt-10 pb-12 sm:px-6 sm:pt-[18vh]">
      <h1 className="animate-rise type-prompt text-balance">
        What do you want to find out?
      </h1>
      <Composer disabled={disabled} onRun={onRun} />
      <section className="flex flex-col gap-1 pt-4">
        <h2 className="text-muted type-label pb-1">Examples</h2>
        <div className="flex w-full flex-col">
          {STARTERS.map((starter) => (
            <StarterRow
              disabled={disabled}
              key={starter.label}
              onStart={onStart}
              routes={routes}
              starter={starter}
            />
          ))}
        </div>
      </section>
    </div>
  </div>
);
