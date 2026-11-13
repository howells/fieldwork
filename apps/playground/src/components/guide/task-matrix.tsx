"use client";

// The task matrix: find a task, see the capability and provider to start
// with, why, and the docs for it. The filters sit in the
// address, so a filtered view can be linked to and survives a reload.
import type { GuideTask } from "@guide/tool-guide";
import { GUIDE_PROVIDERS, GUIDE_TASKS, TASK_GROUPS } from "@guide/tool-guide";
import Link from "next/link";
import { useState } from "react";

import type { Filters } from "@/lib/guide";
import { DOCS_SITE, NO_FILTERS, filtersQuery } from "@/lib/guide";

import { GuidePage } from "./guide-page";

const FIELD =
  "rounded-control border-rule bg-paper type-body hover:border-rule-strong focus:border-rule-strong h-11 w-full border px-3 transition-colors duration-150 outline-none";

const LINK = "text-map-blue hit-area underline-offset-2 hover:underline";

const searchable = (task: GuideTask): string =>
  [task.title, ...task.capabilities, ...task.choices, task.why]
    .join(" ")
    .toLowerCase();

const matches = (task: GuideTask, filters: Filters): boolean =>
  (filters.group === "all" || task.group === filters.group) &&
  (filters.provider === "" || task.providers.includes(filters.provider)) &&
  searchable(task).includes(filters.query.trim().toLowerCase());

const Label = ({ children }: { children: string }) => (
  <span className="text-muted type-label block pb-1 lg:sr-only">
    {children}
  </span>
);

const TaskRow = ({ task }: { task: GuideTask }) => (
  <li
    className="border-rule grid scroll-mt-6 grid-cols-1 gap-x-6 gap-y-3 border-b py-5 sm:grid-cols-2 lg:grid-cols-[24%_14%_24%_minmax(0,1fr)] lg:gap-x-5 lg:py-4"
    id={`task-${task.id}`}
  >
    <div className="sm:col-span-2 lg:col-span-1">
      <Link
        className="type-body strong hover:text-map-blue flex min-h-11 items-center transition-colors duration-150 lg:-mt-3"
        href={`#task-${task.id}`}
      >
        {task.title}
      </Link>
    </div>
    <div>
      <Label>Capability</Label>
      <div className="flex flex-wrap gap-x-3 lg:-mt-3 lg:flex-col lg:items-start">
        {task.capabilities.map((capability) => (
          <span
            className="type-code text-map-blue flex min-h-11 items-center"
            key={capability}
          >
            {capability}
          </span>
        ))}
      </div>
    </div>
    <div>
      <Label>Start with</Label>
      {task.choices.map((choice) => (
        <p className="type-body" key={choice}>
          {choice}
        </p>
      ))}
    </div>
    <div className="sm:col-span-2 lg:col-span-1">
      <Label>Why</Label>
      <p className="text-graphite type-body">{task.why}</p>
      <a
        className={`${LINK} type-label flex min-h-11 items-center`}
        href={`${DOCS_SITE}${task.docs}`}
        rel="noreferrer"
        target="_blank"
      >
        Read the docs →<span className="sr-only"> (opens in a new tab)</span>
      </a>
    </div>
  </li>
);

const GroupSwitch = ({
  group,
  onChange,
}: {
  group: Filters["group"];
  onChange: (group: Filters["group"]) => void;
}) => (
  <div
    aria-label="Task type"
    className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    role="group"
  >
    <div className="rounded-group border-rule bg-wash inline-flex gap-px border p-0.5">
      {TASK_GROUPS.map((item) => (
        <button
          aria-pressed={item.id === group}
          className="rounded-control text-graphite type-label hover:text-ink aria-pressed:bg-paper aria-pressed:shadow-control aria-pressed:text-ink aria-pressed:strong flex h-11 shrink-0 items-center px-3 whitespace-nowrap transition-colors duration-150"
          key={item.id}
          onClick={() => {
            onChange(item.id);
          }}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  </div>
);

export const TaskMatrix = ({ initial }: { initial: Filters }) => {
  const [filters, setFilters] = useState(initial);
  const update = (next: Filters) => {
    setFilters(next);
    // Keep the address in step without adding a history entry per keystroke.
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${filtersQuery(next)}`
    );
  };
  const shown = GUIDE_TASKS.filter((task) => matches(task, filters));
  return (
    <GuidePage
      lead={
        <>
          <p>Find sources, read pages, extract facts and compare sources.</p>
          <p>Choose the capability, then choose a provider.</p>
          <p className="figures text-muted type-label mt-1">
            17 capabilities · 8 providers
          </p>
        </>
      }
      title="Find your task"
    >
      <div className="mt-6 flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <label className="text-graphite type-label flex flex-col gap-1">
            Search tasks
            <input
              className={`${FIELD} placeholder:text-muted text-ink`}
              onChange={(event) => {
                update({ ...filters, query: event.target.value });
              }}
              placeholder="Try dimensions, PDF or citations"
              type="search"
              value={filters.query}
            />
          </label>
          <label className="text-graphite type-label flex flex-col gap-1">
            Starting provider
            <select
              className={`${FIELD} text-ink`}
              onChange={(event) => {
                update({ ...filters, provider: event.target.value });
              }}
              value={filters.provider}
            >
              <option value="">All providers</option>
              {GUIDE_PROVIDERS.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <GroupSwitch
            group={filters.group}
            onChange={(group) => {
              update({ ...filters, group });
            }}
          />
          <p
            aria-live="polite"
            className="figures text-graphite type-label"
            role="status"
          >
            {shown.length} {shown.length === 1 ? "task" : "tasks"}
          </p>
        </div>
      </div>
      <div
        aria-hidden
        className="border-ink text-muted type-label mt-6 hidden grid-cols-[24%_14%_24%_minmax(0,1fr)] gap-x-5 border-b pb-2 lg:grid"
      >
        <span>Task</span>
        <span>Capability</span>
        <span>Start with</span>
        <span>Why</span>
      </div>
      {shown.length === 0 ? (
        <div className="border-rule flex flex-col items-center gap-1 border-b py-12 text-center">
          <p className="text-graphite type-body">
            No tasks match these filters.
          </p>
          <button
            className={`${LINK} type-body flex min-h-11 items-center`}
            onClick={() => {
              update(NO_FILTERS);
            }}
            type="button"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <ul
          aria-label="Tasks, with the capability and provider to start with"
          className="border-ink border-t lg:border-t-0"
        >
          {shown.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </ul>
      )}
    </GuidePage>
  );
};
