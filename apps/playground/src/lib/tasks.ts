// A task as the page keeps it: what was asked, and the events each run
// streamed. The view is rebuilt from the events, so what Recent shows is
// exactly what the run sent, and nothing is stored twice.
import { z } from "zod";

import { CompareEventSchema, RunEventSchema } from "./events";

export const TurnSchema = z.object({
  events: z.array(RunEventSchema),
  question: z.string(),
});
export type Turn = z.infer<typeof TurnSchema>;

export const CompareRunSchema = z.object({
  events: z.array(CompareEventSchema),
  providers: z.array(z.string()),
});
export type CompareRun = z.infer<typeof CompareRunSchema>;

export const TaskSchema = z.object({
  compare: z.array(CompareRunSchema).optional(),
  createdAt: z.number(),
  id: z.string(),
  kind: z.enum(["agent", "compare"]),
  /** The short name under Recent, when it differs from the title. */
  label: z.string().optional(),
  title: z.string(),
  turns: z.array(TurnSchema),
  url: z.string().optional(),
});
export type Task = z.infer<typeof TaskSchema>;

export const TasksSchema = z.array(TaskSchema);

/** How many tasks Recent keeps; older ones drop off. */
export const MAX_TASKS = 12;

/** The URL a task is about: the first link in what was asked. */
export const firstUrl = (text: string): string | undefined =>
  /https?:\/\/[^\s)]+/u.exec(text)?.[0];

/** A short title for Recent from free text. */
export const titleFrom = (text: string): string => {
  const words = text
    .replaceAll(/https?:\/\/\S+/gu, "")
    .trim()
    .split(/\s+/u);
  const title = words.slice(0, 7).join(" ");
  return title === "" ? "A page" : title.replace(/[?.!,]$/u, "");
};

/**
 * True when an older task asks the same of the same page as a newer one, so
 * the newer run replaces it under Recent. A task taken further, with a
 * follow-up or an added provider, is its own thing and stays.
 */
export const sameAsk = (newer: Task, older: Task): boolean => {
  if (newer.id === older.id) {
    return true;
  }
  if (
    newer.kind !== older.kind ||
    newer.url !== older.url ||
    newer.title !== older.title ||
    newer.label !== older.label
  ) {
    return false;
  }
  if (older.kind === "compare") {
    return (older.compare?.length ?? 0) <= 1;
  }
  return (
    older.turns.length <= 1 &&
    older.turns[0]?.question === newer.turns[0]?.question
  );
};

/** Recent with `task` first, each ask once, and the oldest dropped past the limit. */
export const withTask = (tasks: readonly Task[], task: Task): Task[] =>
  [task, ...tasks.filter((item) => !sameAsk(task, item))].slice(0, MAX_TASKS);

/** Recent as stored before asks were kept once: the newest of each. */
export const distinctTasks = (tasks: readonly Task[]): Task[] =>
  tasks.filter(
    (task, index) =>
      !tasks.slice(0, index).some((newer) => sameAsk(newer, task))
  );
