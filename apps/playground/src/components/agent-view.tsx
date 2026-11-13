"use client";

// One agent task: while it runs, its steps beside what has turned up so far;
// once done, the answer and what it found, with the sources and code beside.
import { useEffect, useRef, useState } from "react";

import type { Answer } from "@/lib/answer";
import { parseAnswer } from "@/lib/answer";
import { codeFor } from "@/lib/code";
import type { RunEvent } from "@/lib/events";
import {
  fieldsOf,
  monitorsOf,
  productOf,
  searchResultsOf,
  targetOf,
} from "@/lib/findings";
import { count, duration, spendText as spendWords } from "@/lib/format";
import { modelLabel } from "@/lib/models";
import type { ProviderInfo } from "@/lib/providers";
import type { CallState, RunState } from "@/lib/run-state";
import { answerOf, callsOf, planOf, runOf, spendOf } from "@/lib/run-state";
import type { Task } from "@/lib/tasks";
import { firstUrl } from "@/lib/tasks";

import { Clock } from "./icons";
import { AnswerBlock, FieldsTable, FollowUp, VariantTable } from "./result";
import {
  CodePanel,
  LowestPrice,
  MonitorCard,
  PaneHeading,
  ProductCard,
  SourcesCard,
  capabilityNote,
} from "./side-panels";
import { Steps } from "./steps";
import type { Tone } from "./task-bar";
import { BarButton, TaskBar } from "./task-bar";
import { ago, useNow } from "./use-now";

const productUrl = (task: Task): string | undefined =>
  firstUrl(task.turns.at(-1)?.question ?? "") ?? task.url;

type Phase = "running" | "done" | "failed" | "stopped";

const phaseOf = (run: RunState, live: boolean): Phase => {
  if (live) {
    return "running";
  }
  if (run.status === "done" || run.status === "failed") {
    return run.status;
  }
  return "stopped";
};

const spendText = (run: RunState): string => {
  const spend = spendOf(run);
  return spendWords(spend.usd, spend.credits);
};

const statusText = (run: RunState, phase: Phase, elapsed: number): string => {
  const steps = callsOf(run).length;
  const stepWords = `${String(steps)} ${steps === 1 ? "step" : "steps"}`;
  const words: Readonly<Record<Phase, string>> = {
    done: `Done · ${stepWords} · ${duration(run.ms ?? elapsed)} · ${spendText(run)}`,
    failed: `Failed · ${stepWords} · ${spendText(run)}`,
    running: `Running · step ${String(Math.max(steps, 1))} · ${duration(elapsed)} · ${spendText(run)}`,
    stopped: `Stopped · ${stepWords} · ${spendText(run)}`,
  };
  return words[phase];
};

/** The line under the answer: the model, the sources and the tokens it used. */
const metaOf = (run: RunState, answer: Answer): string => {
  const sources = answer.sources.length;
  return [
    run.model === undefined ? undefined : modelLabel(run.model),
    sources === 0
      ? undefined
      : `${String(sources)} ${sources === 1 ? "source" : "sources"}`,
    run.tokens > 0 ? `${count(run.tokens)} tokens` : undefined,
    run.ms === undefined ? undefined : duration(run.ms),
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
};

const TONES: Readonly<Record<Phase, Tone>> = {
  done: "done",
  failed: "failed",
  running: "running",
  stopped: "failed",
};

const SoFar = ({
  calls,
  providers,
  url,
}: {
  calls: readonly CallState[];
  providers: readonly ProviderInfo[];
  url?: string;
}) => {
  const product = productOf(calls, url)?.output;
  const results = searchResultsOf(calls).slice(0, 5);
  const latest = calls.at(-1);
  const note =
    latest === undefined
      ? undefined
      : capabilityNote(latest.provider, latest.capability, providers);
  const empty = product === undefined && results.length === 0;
  return (
    <section className="flex flex-col gap-3">
      <PaneHeading>So far</PaneHeading>
      {product === undefined ? null : <ProductCard product={product} />}
      {product === undefined ? null : <LowestPrice product={product} />}
      {product === undefined && results.length > 0 ? (
        <SourcesCard
          heading="Found"
          sources={results.map((result, index) => ({
            number: index + 1,
            title: result.title,
            url: result.url,
          }))}
        />
      ) : null}
      {empty ? <p className="text-muted type-body">Nothing yet</p> : null}
      {note === undefined ? null : (
        <p className="text-graphite type-label">{note}</p>
      )}
    </section>
  );
};

/** Why there is no written answer, in the words of what stopped the model. */
const NO_ANSWER = new Map([
  [
    "length",
    "The model ran out of room before it wrote the answer. What it found is below.",
  ],
  [
    "tool-calls",
    "The agent used every step it had before it wrote the answer. What it found is below.",
  ],
]);

const NoAnswer = ({ reason }: { reason?: string }) =>
  reason === undefined ? null : (
    <p className="text-graphite type-body">
      {NO_ANSWER.get(reason) ??
        "The agent stopped without writing an answer. What it found is below."}
    </p>
  );

interface FindingsProps {
  answer: Answer;
  calls: readonly CallState[];
  error?: string;
  /** "GPT-6 Luna · 3 sources · 10,452 tokens", under the answer. */
  meta: string;
  model: string;
  onRetry?: () => void;
  plan?: string;
  reason?: string;
  task: Task;
}

const Findings = ({
  answer,
  calls,
  error,
  meta,
  model,
  onRetry,
  plan,
  reason,
  task,
}: FindingsProps) => {
  const [showSteps, setShowSteps] = useState(false);
  const now = useNow(false);
  const product = productOf(calls, productUrl(task));
  const fields = fieldsOf(calls);
  const stepWords = `${String(calls.length)} ${calls.length === 1 ? "step" : "steps"}`;
  return (
    <>
      {answer.headline === undefined && answer.paragraphs.length === 0 ? (
        <NoAnswer reason={reason} />
      ) : (
        <AnswerBlock answer={answer} />
      )}
      {calls.length === 0 ? null : (
        <div className="-mt-2 flex flex-col gap-2">
          <p className="figures text-muted type-label flex flex-wrap items-center gap-x-1.5">
            {meta === "" ? null : (
              <>
                <span>{meta}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <button
              aria-expanded={showSteps}
              className="hit-area text-map-blue hover:text-ink transition-colors duration-150"
              onClick={() => {
                setShowSteps(!showSteps);
              }}
              type="button"
            >
              {showSteps ? "Hide the steps" : `See the ${stepWords}`}
            </button>
          </p>
          {showSteps ? (
            <div className="border-rule rounded-group border px-3 py-2.5">
              <Steps calls={calls} model={model} plan={plan} thinking={false} />
            </div>
          ) : null}
        </div>
      )}
      {error === undefined ? null : (
        <div className="rounded-control border-error-rule bg-error-wash flex items-start justify-between gap-4 border px-3 py-2">
          <p className="text-error-ink type-body">{error}</p>
          {onRetry === undefined ? null : (
            <button
              className="hit-area text-error-ink type-body strong shrink-0 underline-offset-2 hover:underline"
              onClick={onRetry}
              type="button"
            >
              Try again
            </button>
          )}
        </div>
      )}
      {product === undefined ? null : (
        <VariantTable
          ago={ago(task.createdAt, now)}
          product={product.output}
          provider={product.call.provider}
        />
      )}
      {fields === undefined ? null : (
        <FieldsTable
          fields={fields.fields}
          provider={fields.call.provider}
          url={targetOf(fields.call)}
        />
      )}
    </>
  );
};

interface AsideProps {
  answer: Answer;
  calls: readonly CallState[];
  onStopMonitor: (provider: string, id: string) => Promise<void>;
  showCode: boolean;
  stopped: readonly string[];
  task: Task;
}

const DoneAside = ({
  answer,
  calls,
  onStopMonitor,
  showCode,
  stopped,
  task,
}: AsideProps) => {
  const titles = new Map(
    searchResultsOf(calls).map((result) => [result.url, result.title])
  );
  const code = codeFor(calls, task.url);
  const raw = JSON.stringify(
    calls.map((call) => ({
      input: call.input,
      output: call.output ?? null,
      provider: call.provider,
      tool: call.tool,
    })),
    null,
    2
  );
  return (
    <>
      {answer.sources.length === 0 ? null : (
        <SourcesCard
          heading="Sources"
          sources={answer.sources.map((source) => ({
            ...source,
            title: titles.get(source.url),
          }))}
        />
      )}
      {monitorsOf(calls).map(({ call, output }) => (
        <MonitorCard
          key={output.id}
          monitor={output}
          onStop={async () => {
            await onStopMonitor(call.provider, output.id);
          }}
          provider={call.provider}
          stopped={stopped.includes(output.id)}
          target={targetOf(call)}
        />
      ))}
      {showCode && code.length > 0 ? (
        <CodePanel lines={code} raw={raw} />
      ) : null}
    </>
  );
};

const CodeToggle = ({
  onToggle,
  shown,
}: {
  onToggle: (shown: boolean) => void;
  shown: boolean;
}) => (
  <BarButton
    onClick={() => {
      onToggle(!shown);
    }}
  >
    {shown ? "Hide code" : "Show code"}
  </BarButton>
);

interface AgentViewProps {
  disabled: boolean;
  liveEvents?: readonly RunEvent[];
  liveStartedAt?: number;
  onFollowUp: (question: string) => void;
  onRetry?: () => void;
  onStop: () => void;
  onStopMonitor: (provider: string, id: string) => Promise<void>;
  providers: readonly ProviderInfo[];
  stopped: readonly string[];
  task: Task;
}

export const AgentView = (props: AgentViewProps) => {
  const { liveEvents, task } = props;
  const [showCode, setShowCode] = useState(true);
  const live = liveEvents !== undefined;
  const now = useNow(live);
  const turn = task.turns.at(-1);
  const run = runOf(liveEvents ?? turn?.events ?? [], task.createdAt);
  const phase = phaseOf(run, live);
  const calls = callsOf(run);
  const answer = parseAnswer(live ? "" : (answerOf(run) ?? ""));
  const column = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  // Keep the newest step in view while the run adds them; start the answer
  // from its top. On a phone the whole page scrolls, so it starts at the top.
  useEffect(() => {
    column.current?.scrollTo({
      behavior: live ? "smooth" : "instant",
      top: live ? column.current.scrollHeight : 0,
    });
    if (!live) {
      page.current?.scrollTo({ behavior: "instant", top: 0 });
    }
  }, [calls.length, live, task.id]);
  const action = live ? (
    <BarButton onClick={props.onStop}>Stop</BarButton>
  ) : (
    <CodeToggle onToggle={setShowCode} shown={showCode} />
  );
  return (
    <>
      <TaskBar
        action={action}
        status={statusText(
          run,
          phase,
          now - (props.liveStartedAt ?? task.createdAt)
        )}
        title={task.title}
        tone={TONES[phase]}
        url={task.url}
      />
      <div
        className="flex min-h-0 grow basis-0 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden"
        ref={page}
      >
        <div className="border-rule max-lg:contents lg:flex lg:w-[min(760px,58%)] lg:shrink-0 lg:flex-col lg:border-r">
          <div
            className="flex flex-col gap-5 px-4 pt-4 pb-6 lg:min-h-0 lg:grow lg:basis-0 lg:overflow-y-auto lg:px-6 lg:pt-5 lg:pb-4"
            ref={column}
          >
            {task.turns.length > 1 && turn !== undefined ? (
              <p className="text-graphite type-label">
                You asked: {turn.question}
              </p>
            ) : null}
            {live ? (
              <Steps
                calls={calls}
                model={run.model ?? ""}
                plan={planOf(run)}
                thinking
              />
            ) : (
              <Findings
                answer={answer}
                calls={calls}
                error={run.error}
                meta={metaOf(run, answer)}
                model={run.model ?? ""}
                onRetry={props.onRetry}
                plan={planOf(run)}
                reason={run.reason}
                task={task}
              />
            )}
          </div>
          <div className="bg-paper sticky bottom-0 order-last shrink-0 px-4 pt-2 pb-3 lg:static lg:px-6 lg:pt-0 lg:pb-4">
            {live ? (
              <div className="border-rule flex items-center gap-2 border-t pt-3">
                <Clock />
                <p className="text-graphite type-label">
                  It keeps running if you open another task.
                </p>
              </div>
            ) : (
              <FollowUp
                disabled={props.disabled}
                onAsk={props.onFollowUp}
                placeholder="Ask a follow-up"
              />
            )}
          </div>
        </div>
        <aside className="border-rule flex shrink-0 flex-col gap-5 border-t px-4 pt-4 pb-6 lg:min-w-0 lg:shrink lg:grow lg:basis-0 lg:overflow-y-auto lg:border-t-0 lg:px-5 lg:pt-5 lg:pb-4">
          {live ? (
            <SoFar
              calls={calls}
              providers={props.providers}
              url={productUrl(task)}
            />
          ) : (
            <DoneAside
              answer={answer}
              calls={calls}
              onStopMonitor={props.onStopMonitor}
              showCode={showCode}
              stopped={props.stopped}
              task={task}
            />
          )}
        </aside>
      </div>
    </>
  );
};
