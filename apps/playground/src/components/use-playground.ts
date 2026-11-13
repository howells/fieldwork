"use client";

// The playground's tasks and the one run in flight. A run streams its events
// into memory and is written to Recent when it ends, so storage is touched
// once per run, not once per event.
import { useCallback, useMemo, useRef, useState } from "react";
import type { z } from "zod";

import { CaughtSchema, isAbort } from "@/lib/caught";
import type { CompareEvent, RunEvent } from "@/lib/events";
import { CompareEventSchema, RunEventSchema } from "@/lib/events";
import type { ProviderId, ProviderInfo } from "@/lib/providers";
import { answerOf, compactEvents, runOf } from "@/lib/run-state";
import { useStored } from "@/lib/storage";
import { readLines } from "@/lib/stream";
import type { Task, Turn } from "@/lib/tasks";
import { TasksSchema, distinctTasks, withTask } from "@/lib/tasks";

import { useSettings } from "./use-settings";

const NO_TASKS: Task[] = [];

export interface Live {
  compareEvents: CompareEvent[];
  events: RunEvent[];
  startedAt: number;
  taskId: string;
}

interface Message {
  content: string;
  role: "assistant" | "user";
}

/** The conversation so far, as the agent should see it: each question and the answer it gave. */
const messagesFor = (turns: readonly Turn[]): Message[] =>
  turns.flatMap((turn, index) => {
    const user: Message = { content: turn.question, role: "user" };
    if (index === turns.length - 1) {
      return [user];
    }
    const answer = answerOf(runOf(turn.events, 0));
    return answer === undefined || answer === ""
      ? [user]
      : [user, { content: answer, role: "assistant" }];
  });

interface Stream<E> {
  body: string;
  failure: (message: string) => E;
  onEvents: (events: E[]) => void;
  path: string;
  schema: z.ZodType<E>;
  signal: AbortSignal;
}

/** Posts a request and gathers the events it streams back. A stop ends it quietly; any other failure becomes its last event. */
const collect = async <E>(stream: Stream<E>): Promise<E[]> => {
  const events: E[] = [];
  try {
    const response = await fetch(stream.path, {
      body: stream.body,
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: stream.signal,
    });
    await readLines(response, stream.schema, (event) => {
      events.push(event);
      stream.onEvents([...events]);
    });
  } catch (error) {
    const caught = CaughtSchema.parse(error);
    if (!isAbort(caught)) {
      // A network failure means the request never reached the playground's own server.
      const message =
        caught.name === "TypeError"
          ? "Couldn't reach the playground's server. Check it's running, then try again."
          : caught.message;
      events.push(stream.failure(message));
    }
  }
  return events;
};

interface TaskOptions {
  label?: string;
  title?: string;
  url?: string;
}

interface TaskParts extends TaskOptions {
  compare?: Task["compare"];
  turns?: Task["turns"];
}

const newTask = (
  kind: Task["kind"],
  title: string,
  parts: TaskParts
): Task => ({
  compare: parts.compare,
  createdAt: Date.now(),
  id: crypto.randomUUID(),
  kind,
  label: parts.label,
  title,
  turns: parts.turns ?? [],
  url: parts.url,
});

/** Recent tasks, newest first, and the one in view. */
const useTasks = () => {
  const [stored, setTasks] = useStored(
    "fieldwork.tasks",
    TasksSchema,
    NO_TASKS
  );
  const tasks = useMemo(() => distinctTasks(stored), [stored]);
  const [activeId, setActiveId] = useState<string | undefined>();
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const saveTask = useCallback(
    (task: Task) => {
      setTasks(withTask(tasksRef.current, task));
    },
    [setTasks]
  );
  return { activeId, saveTask, setActiveId, tasks };
};

/** The one run in flight: its events so far, and a way to stop it. */
const useLive = () => {
  const [live, setLive] = useState<Live | undefined>();
  const controller = useRef<AbortController | null>(null);
  const begin = useCallback((taskId: string) => {
    const abort = new AbortController();
    controller.current = abort;
    const startedAt = Date.now();
    const show = (events: RunEvent[], compareEvents: CompareEvent[]) => {
      setLive({ compareEvents, events, startedAt, taskId });
    };
    show([], []);
    const end = () => {
      setLive(undefined);
      controller.current = null;
    };
    return { end, show, signal: abort.signal };
  }, []);
  const stop = useCallback(() => {
    controller.current?.abort();
  }, []);
  return { begin, live, stop };
};

export const usePlayground = (providers: readonly ProviderInfo[]) => {
  const settings = useSettings(providers);
  const { activeId, saveTask, setActiveId, tasks } = useTasks();
  const { begin, live, stop } = useLive();
  const { browserKeys, model, preferences } = settings;

  const runTurns = useCallback(
    async (task: Task) => {
      saveTask(task);
      const run = begin(task.id);
      const events = await collect<RunEvent>({
        body: JSON.stringify({
          keys: browserKeys,
          messages: messagesFor(task.turns),
          model,
          preferences,
        }),
        failure: (message) => ({ message, type: "error" }),
        onEvents: (next) => {
          run.show(next, []);
        },
        path: "/api/run",
        schema: RunEventSchema,
        signal: run.signal,
      });
      const last = task.turns.length - 1;
      saveTask({
        ...task,
        turns: task.turns.map((turn, index) =>
          index === last ? { ...turn, events: compactEvents(events) } : turn
        ),
      });
      run.end();
    },
    [begin, browserKeys, model, preferences, saveTask]
  );

  const runCompare = useCallback(
    async (task: Task, added: readonly ProviderId[]) => {
      const withRun = (events: CompareEvent[]): Task => ({
        ...task,
        compare: [...(task.compare ?? []), { events, providers: [...added] }],
      });
      saveTask(withRun([]));
      const run = begin(task.id);
      const events = await collect<CompareEvent>({
        body: JSON.stringify({
          keys: browserKeys,
          model,
          providers: added,
          url: task.url,
        }),
        failure: (message) => ({ message, type: "error" }),
        onEvents: (next) => {
          run.show([], next);
        },
        path: "/api/compare",
        schema: CompareEventSchema,
        signal: run.signal,
      });
      saveTask(withRun(events));
      run.end();
    },
    [begin, browserKeys, model, saveTask]
  );

  const startAgent = useCallback(
    async (question: string, title: string, options: TaskOptions) => {
      const task = newTask("agent", title, {
        ...options,
        turns: [{ events: [], question }],
      });
      setActiveId(task.id);
      await runTurns(task);
    },
    [runTurns, setActiveId]
  );

  const followUp = useCallback(
    async (task: Task, question: string) => {
      await runTurns({
        ...task,
        turns: [...task.turns, { events: [], question }],
      });
    },
    [runTurns]
  );

  const startCompare = useCallback(
    async (
      url: string,
      chosen: readonly ProviderId[],
      options: TaskOptions
    ) => {
      const task = newTask("compare", options.title ?? "Compare reads", {
        ...options,
        compare: [],
        url,
      });
      setActiveId(task.id);
      await runCompare(task, chosen);
    },
    [runCompare, setActiveId]
  );

  return {
    active: tasks.find((task) => task.id === activeId),
    followUp,
    live: live?.taskId === activeId ? live : undefined,
    liveTaskId: live?.taskId,
    retry: runTurns,
    runCompare,
    running: live !== undefined,
    setActiveId,
    settings,
    startAgent,
    startCompare,
    stop,
    tasks,
  };
};

export type PlaygroundState = ReturnType<typeof usePlayground>;
