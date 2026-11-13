// The agent's steps: its plan, then each tool call with the provider that
// served it, how long it took and what the provider said it cost.
import { signature } from "@/lib/code";
import { domainOf, duration, usageLabel } from "@/lib/format";
import { modelLabel } from "@/lib/models";
import { PROVIDER_LABELS, isProviderId } from "@/lib/providers";
import type { CallState } from "@/lib/run-state";
import { pageRows, stepSummary, stepTitle } from "@/lib/steps";

import { AgentMark, StepDone, StepFailed, StepRunning } from "./icons";

const providerLabel = (id: string): string =>
  isProviderId(id) ? PROVIDER_LABELS[id] : id;

const StepIcon = ({ status }: { status: CallState["status"] }) => {
  if (status === "done") {
    return <StepDone />;
  }
  return status === "failed" ? <StepFailed /> : <StepRunning />;
};

const PageRows = ({ call }: { call: CallState }) => {
  const rows = pageRows(call);
  if (rows.length === 0) {
    return null;
  }
  const running = call.status === "running";
  return (
    <ul className="flex flex-col gap-0.5 pt-1">
      {rows.map((row) => {
        const mark = row.ok ? "✓" : "✕";
        const markTone = row.ok ? "" : "text-error";
        const note = row.note ?? (row.ok ? "Read" : "Not read");
        return (
          <li className="flex items-center gap-2" key={row.url}>
            <span
              aria-hidden
              className={`type-label w-3 shrink-0 ${running ? "text-map-blue" : markTone}`}
            >
              {running ? "…" : mark}
            </span>
            <span className="type-label min-w-0 grow basis-0 truncate">
              {domainOf(row.url)}
            </span>
            <span
              className={`type-label shrink-0 ${running ? "text-map-blue" : "text-graphite"}`}
            >
              {running ? "Reading" : note}
            </span>
          </li>
        );
      })}
    </ul>
  );
};

const costLine = (call: CallState): string => {
  if (call.status === "running") {
    return "Running";
  }
  const parts = [
    call.ms === undefined ? undefined : duration(call.ms),
    usageLabel(call.usage),
  ];
  return parts.filter((part) => part !== undefined).join(" · ");
};

const Step = ({ call, last }: { call: CallState; last: boolean }) => {
  const summary = stepSummary(call);
  return (
    <li
      className={`animate-rise flex gap-2.5 py-2 ${last ? "" : "border-rule border-b"}`}
    >
      <span className="flex w-5 shrink-0 justify-center">
        <StepIcon status={call.status} />
      </span>
      <div className="flex min-w-0 grow basis-0 flex-col gap-0.5">
        <h3 className="type-body strong">{stepTitle(call)}</h3>
        <code
          className="text-graphite type-code truncate"
          title={signature(call)}
        >
          {signature(call)}
        </code>
        {call.error === undefined ? null : (
          <p className="text-error type-label">{call.error}</p>
        )}
        {summary === null ? null : (
          <p className="text-graphite type-label">{summary}</p>
        )}
        <PageRows call={call} />
      </div>
      <div className="flex w-24 shrink-0 flex-col items-end gap-0.5 sm:w-28">
        <span className="type-body">{providerLabel(call.provider)}</span>
        <span
          className={`figures type-label ${call.status === "running" ? "text-map-blue" : "text-graphite"}`}
        >
          {costLine(call)}
        </span>
      </div>
    </li>
  );
};

interface StepsProps {
  calls: readonly CallState[];
  model: string;
  plan?: string;
  thinking: boolean;
}

export const Steps = ({ calls, model, plan, thinking }: StepsProps) => (
  <div className="flex flex-col gap-3">
    <div className="flex gap-2.5">
      <AgentMark />
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <span className="type-body strong">Agent</span>
          <span className="text-graphite type-label">
            {modelLabel(model)}, with Fieldwork tools
          </span>
        </div>
        <p className="text-graphite type-body">
          {plan ?? (thinking ? "Planning…" : "")}
        </p>
      </div>
    </div>
    {calls.length === 0 ? null : (
      <ol className="border-rule flex flex-col border-t">
        {calls.map((call, index) => (
          <Step call={call} key={call.id} last={index === calls.length - 1} />
        ))}
      </ol>
    )}
  </div>
);
