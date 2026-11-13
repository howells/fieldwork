"use client";

// The same page read by several providers at once, side by side: a column
// for each provider with its own header, the six things a shop page should
// carry as rows aligned across the columns, and under them the text that
// provider returned, each column scrolling on its own. A miss is a dash.
import { Menu } from "@base-ui/react/menu";
import type { CSSProperties } from "react";
import { useState } from "react";

import { compareCode } from "@/lib/code";
import type { CompareState } from "@/lib/compare-state";
import {
  bestOf,
  compareStateOf,
  factValue,
  factsOnPage,
  previewOf,
  scoreOf,
} from "@/lib/compare-state";
import type { CompareEvent, Fact, ReadOutcome } from "@/lib/events";
import { FACTS } from "@/lib/events";
import { count, duration, spendText, usageLabel } from "@/lib/format";
import type { ProviderId, ProviderInfo } from "@/lib/providers";
import { PROVIDER_LABELS, isProviderId, keySource } from "@/lib/providers";
import type { Task } from "@/lib/tasks";

import { Plus, StepRunning, Tick } from "./icons";
import { CodePanel } from "./side-panels";
import type { Tone } from "./task-bar";
import { BarButton, TaskBar } from "./task-bar";

const FACT_LABELS: Readonly<Record<Fact, string>> = {
  images: "Images",
  name: "Name",
  price: "Price",
  reviews: "Reviews",
  size: "Size",
  stock: "Stock",
};

const labelOf = (id: string): string =>
  isProviderId(id) ? PROVIDER_LABELS[id] : id;

/** Most providers a compare can hold; the add column goes once it is full. */
const MAX_PROVIDERS = 5;

/** The rail of row labels on the left, sticky as the columns scroll sideways. */
const RAIL =
  "bg-paper border-rule sticky left-0 z-10 border-b border-r px-3 text-graphite type-label";

/** Every provider cell: a hairline on the left, the row's rule below. */
const CELL = "border-rule border-b border-r min-w-0 px-3";

const Pending = ({
  label,
  width = "w-20",
}: {
  label: string;
  width?: string;
}) => (
  <span className="flex h-5 items-center">
    <span className={`bg-wash block h-2 animate-pulse rounded-full ${width}`} />
    <span className="sr-only">{label}</span>
  </span>
);

const Missing = () => (
  <span className="text-muted">
    <span aria-hidden>–</span>
    <span className="sr-only">Not found</span>
  </span>
);

const Value = ({
  fact,
  provider,
  state,
}: {
  fact: Fact;
  provider: string;
  state: CompareState;
}) => {
  const read = state.reads.get(provider);
  if (read === undefined) {
    return state.done ? <Missing /> : <Pending label="Reading" />;
  }
  if (!read.ok) {
    return <Missing />;
  }
  const value = factValue(fact, read, state.checked.get(provider));
  if (value !== null) {
    return <span>{value}</span>;
  }
  const checking = !state.done && state.checked.size === 0;
  return checking && fact !== "images" ? (
    <Pending label="Checking" />
  ) : (
    <Missing />
  );
};

/** "0.7s · 1 credit": how long the read took and what the provider charged. */
const readCost = (read: ReadOutcome): string =>
  [duration(read.ms), usageLabel(read.usage)]
    .filter((part) => part !== undefined)
    .join(" · ");

interface PreferProps {
  onPrefer: (provider: ProviderId) => void;
  preferred?: string;
  provider: ProviderId;
}

const Prefer = ({ onPrefer, preferred, provider }: PreferProps) =>
  preferred === provider ? (
    <span className="text-graphite type-label flex h-6 shrink-0 items-center gap-1 whitespace-nowrap">
      <Tick />
      Does your reads
    </span>
  ) : (
    <button
      className="hit-area rounded-control border-rule bg-paper type-label strong hover:border-rule-strong flex h-6 shrink-0 items-center border px-2 whitespace-nowrap transition-colors duration-150"
      onClick={() => {
        onPrefer(provider);
      }}
      type="button"
    >
      Use for reads
    </button>
  );

interface ColumnHeadProps extends Omit<PreferProps, "provider"> {
  best: boolean;
  provider: string;
  state: CompareState;
}

const ColumnHead = ({
  best,
  onPrefer,
  preferred,
  provider,
  state,
}: ColumnHeadProps) => {
  const read = state.reads.get(provider);
  const score = scoreOf(state, provider);
  const checking = !state.done && state.checked.size === 0;
  const meta = (() => {
    if (read === undefined) {
      return state.done ? "Didn't finish" : null;
    }
    if (!read.ok) {
      return null;
    }
    const found =
      score === undefined || checking
        ? undefined
        : `${String(score.caught)} of ${String(score.total)} found`;
    return [found, readCost(read)]
      .filter((part) => part !== undefined)
      .join(" · ");
  })();
  return (
    <div
      className={`${CELL} flex flex-col justify-center gap-0.5 py-2`}
      role="columnheader"
    >
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span className="type-body strong min-w-0 truncate">
          {labelOf(provider)}
        </span>
        {state.done && read?.ok === true && isProviderId(provider) ? (
          <Prefer
            onPrefer={onPrefer}
            preferred={preferred}
            provider={provider}
          />
        ) : null}
      </div>
      {read === undefined && !state.done ? (
        <span className="text-graphite type-label flex items-center gap-1.5">
          <StepRunning />
          Reading
        </span>
      ) : null}
      {meta === null ? null : (
        <span
          className="figures text-graphite type-label truncate"
          title={meta}
        >
          {best && state.done && state.providers.length > 1 ? (
            <span className="text-map-blue">Most found · </span>
          ) : null}
          {meta}
        </span>
      )}
      {read !== undefined && !read.ok ? (
        <span className="text-error type-label">
          {read.error ?? "The read failed."}
        </span>
      ) : null}
    </div>
  );
};

interface AddProviderProps {
  current: readonly string[];
  disabled: boolean;
  keys: Readonly<Record<string, string>>;
  onAdd: (provider: ProviderId) => void;
  providers: readonly ProviderInfo[];
}

const AddProvider = ({
  current,
  disabled,
  keys,
  onAdd,
  providers,
}: AddProviderProps) => (
  <Menu.Root>
    <Menu.Trigger
      className="hit-area rounded-control border-rule-strong text-graphite type-body hover:text-ink hover:border-ink data-popup-open:text-ink flex h-7 items-center gap-1.5 border border-dashed px-2 whitespace-nowrap transition-colors duration-150 disabled:opacity-50"
      disabled={disabled}
    >
      <Plus />
      Add provider
    </Menu.Trigger>
    <Menu.Portal>
      <Menu.Positioner
        align="start"
        className="z-30 outline-none"
        collisionPadding={8}
        sideOffset={6}
      >
        <Menu.Popup className="rounded-panel border-rule bg-paper shadow-float flex w-[min(260px,calc(100vw-16px))] origin-(--transform-origin) flex-col border p-1 transition-[opacity,scale] duration-150 outline-none data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
          {providers.map((provider) => {
            const reads = provider.capabilities.read;
            const keyed = keySource(provider, keys) !== "none";
            const added = current.includes(provider.id);
            const note = (() => {
              if (!reads) {
                return "Can't read pages";
              }
              if (added) {
                return "Added";
              }
              return keyed ? "" : "No key";
            })();
            return (
              <Menu.Item
                className="rounded-control data-disabled:text-muted data-highlighted:bg-wash flex h-11 shrink-0 cursor-default items-center justify-between gap-3 px-2 outline-none sm:h-7"
                disabled={!reads || !keyed || added}
                key={provider.id}
                onClick={() => {
                  onAdd(provider.id);
                }}
              >
                <span className="type-body">{provider.label}</span>
                <span className="text-muted type-label">{note}</span>
              </Menu.Item>
            );
          })}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  </Menu.Root>
);

/** The text a read returned, cleaned for reading, in its own scroll. */
const Returned = ({ read }: { read: ReadOutcome }) => {
  if (!read.ok) {
    return (
      <p className="text-error type-label">
        {read.error ?? "The read failed."}
      </p>
    );
  }
  const excerpts = read.excerpts ?? [];
  const blocks =
    (read.markdown ?? "") === ""
      ? excerpts.map((excerpt) => ({
          kind: "text" as const,
          text: `…${excerpt.trim()}…`,
        }))
      : previewOf(read.markdown ?? "");
  if (blocks.length === 0) {
    return <p className="text-muted type-label">No text came back.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((block, index) =>
        block.kind === "heading" ? (
          <h4 className="type-label strong pt-1" key={String(index)}>
            {block.text}
          </h4>
        ) : (
          <p className="text-graphite type-label" key={String(index)}>
            {block.text}
          </p>
        )
      )}
    </div>
  );
};

const ReturnedCell = ({
  provider,
  state,
}: {
  provider: string;
  state: CompareState;
}) => {
  const read = state.reads.get(provider);
  const content = (() => {
    if (read !== undefined) {
      return <Returned read={read} />;
    }
    if (state.done) {
      return <Missing />;
    }
    return (
      <div className="flex flex-col gap-2">
        <Pending label="Reading" width="w-full" />
        <Pending label="Reading" width="w-4/5" />
        <Pending label="Reading" width="w-3/5" />
      </div>
    );
  })();
  return (
    <div className="border-rule min-h-0 min-w-0 overflow-y-auto overscroll-contain border-r px-3 py-2.5">
      {content}
    </div>
  );
};

interface GridProps extends Omit<AddProviderProps, "current"> {
  onPrefer: (provider: ProviderId) => void;
  preferred?: string;
  state: CompareState;
}

const CompareGrid = ({
  disabled,
  keys,
  onAdd,
  onPrefer,
  preferred,
  providers,
  state,
}: GridProps) => {
  const best = bestOf(state);
  const onPage = factsOnPage(state);
  const canAdd = state.providers.length < MAX_PROVIDERS;
  const style: CSSProperties = {
    gridTemplateColumns: `4.5rem repeat(${String(state.providers.length)}, minmax(15rem, 1fr))${canAdd ? " 9.5rem" : ""}`,
    gridTemplateRows: `auto repeat(${String(FACTS.length)}, auto) auto minmax(0, 1fr)`,
  };
  const words = (provider: string): string => {
    const read = state.reads.get(provider);
    if (read === undefined) {
      return "";
    }
    return read.ok ? `${count(read.words)} words` : "Failed";
  };
  return (
    <div
      aria-label="Each provider's read of the page"
      className="grid h-full min-h-0 w-max min-w-full"
      role="table"
      style={style}
    >
      <div className={`${RAIL} flex items-end py-2`} role="columnheader">
        <span className="sr-only">What the page has</span>
      </div>
      {state.providers.map((provider) => (
        <ColumnHead
          best={provider === best}
          key={provider}
          onPrefer={onPrefer}
          preferred={preferred}
          provider={provider}
          state={state}
        />
      ))}
      {canAdd ? (
        <div
          className="border-rule flex items-center border-b px-3 py-2"
          role="columnheader"
        >
          <AddProvider
            current={state.providers}
            disabled={disabled}
            keys={keys}
            onAdd={onAdd}
            providers={providers}
          />
        </div>
      ) : null}
      {FACTS.map((fact) => {
        const nowhere = state.done && !onPage.includes(fact);
        return (
          <div className="contents" key={fact} role="row">
            <div
              className={`${RAIL} flex items-start py-1.5 ${nowhere ? "text-muted" : ""}`}
              role="rowheader"
            >
              {FACT_LABELS[fact]}
            </div>
            {state.providers.map((provider) => (
              <div
                className={`${CELL} figures type-body py-1`}
                key={provider}
                role="cell"
              >
                <Value fact={fact} provider={provider} state={state} />
              </div>
            ))}
            {canAdd ? <div className="border-rule border-b" /> : null}
          </div>
        );
      })}
      <div className={`${RAIL} flex items-center py-1.5`} role="rowheader">
        Text
      </div>
      {state.providers.map((provider) => (
        <div
          className={`${CELL} figures text-muted type-label flex items-center py-1.5`}
          key={provider}
          role="cell"
        >
          {words(provider)}
        </div>
      ))}
      {canAdd ? <div className="border-rule border-b" /> : null}
      <div className="bg-paper border-rule sticky left-0 z-10 border-r" />
      {state.providers.map((provider) => (
        <ReturnedCell key={provider} provider={provider} state={state} />
      ))}
      {canAdd ? <div /> : null}
    </div>
  );
};

interface CompareViewProps {
  disabled: boolean;
  keys: Readonly<Record<string, string>>;
  liveEvents?: readonly CompareEvent[];
  onAdd: (provider: ProviderId) => void;
  onPrefer: (provider: ProviderId) => void;
  onStop: () => void;
  preferred?: string;
  providers: readonly ProviderInfo[];
  task: Task;
}

/** "Done · 3 reads · 5.0s · $0.003 · 1 credit": the reads and the check, as the providers reported them. */
const statusOf = (state: CompareState, live: boolean): string => {
  const reads = [...state.reads.values()];
  if (state.error !== undefined) {
    return `Failed · ${state.error}`;
  }
  if (live) {
    return reads.length < state.providers.length
      ? `Reading · ${String(reads.length)} of ${String(state.providers.length)}`
      : "Checking what each found";
  }
  let dollars = state.modelCostUsd;
  let creditsUsed = 0;
  for (const read of reads) {
    dollars += read.usage?.costUsd ?? 0;
    creditsUsed += read.usage?.credits ?? 0;
  }
  const readWords = `${String(reads.length)} ${reads.length === 1 ? "read" : "reads"}`;
  return `Done · ${readWords} · ${duration(state.ms)} · ${spendText(dollars, creditsUsed)}`;
};

const toneOf = (state: CompareState, live: boolean): Tone => {
  if (state.error !== undefined) {
    return "failed";
  }
  return live ? "running" : "done";
};

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five"];

export const CompareView = ({
  disabled,
  keys,
  liveEvents,
  onAdd,
  onPrefer,
  onStop,
  preferred,
  providers,
  task,
}: CompareViewProps) => {
  const [showCode, setShowCode] = useState(false);
  const live = liveEvents !== undefined;
  const runs = (task.compare ?? []).map((run, index, all) =>
    live && index === all.length - 1 ? { ...run, events: [...liveEvents] } : run
  );
  const state = compareStateOf(runs, live);
  return (
    <>
      <TaskBar
        action={
          live ? (
            <BarButton onClick={onStop}>Stop</BarButton>
          ) : (
            <BarButton
              onClick={() => {
                setShowCode(!showCode);
              }}
            >
              {showCode ? "Hide code" : "Show code"}
            </BarButton>
          )
        }
        status={statusOf(state, live)}
        title={`Compare ${NUMBER_WORDS[state.providers.length] ?? count(state.providers.length)} ${state.providers.length === 1 ? "read" : "reads"}`}
        tone={toneOf(state, live)}
        url={task.url}
      />
      <div className="flex min-h-0 grow basis-0 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="flex h-[min(720px,calc(100dvh-140px))] shrink-0 overflow-x-auto overscroll-x-contain lg:h-auto lg:min-w-0 lg:shrink lg:grow lg:basis-0">
          <CompareGrid
            disabled={disabled}
            keys={keys}
            onAdd={onAdd}
            onPrefer={onPrefer}
            preferred={preferred}
            providers={providers}
            state={state}
          />
        </div>
        {showCode && task.url !== undefined ? (
          <aside className="border-rule flex shrink-0 flex-col border-t p-3 lg:w-[min(440px,36%)] lg:overflow-y-auto lg:border-t-0 lg:border-l">
            <CodePanel
              lines={compareCode(state.providers, task.url)}
              raw={JSON.stringify([...state.reads.values()], null, 2)}
            />
          </aside>
        ) : null}
      </div>
    </>
  );
};
