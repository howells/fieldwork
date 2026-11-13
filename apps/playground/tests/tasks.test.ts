import { describe, expect, it } from "vitest";

import type { Task } from "@/lib/tasks";
import { distinctTasks, withTask } from "@/lib/tasks";

const compare = (id: string, runs = 1): Task => ({
  compare: Array.from({ length: runs }, () => ({
    events: [],
    providers: ["exa"],
  })),
  createdAt: 0,
  id,
  kind: "compare",
  label: "Metro White, three reads",
  title: "Compare three reads",
  turns: [],
  url: "https://www.toppstiles.co.uk/metro/metro-white-tile",
});

const agent = (id: string, questions: string[]): Task => ({
  createdAt: 0,
  id,
  kind: "agent",
  label: "HAY Mags sofa price",
  title: "Track this sofa's price",
  turns: questions.map((question) => ({ events: [], question })),
});

describe("Recent", () => {
  it("keeps one task for a starter run twice", () => {
    const recent = withTask([compare("old")], compare("new"));
    expect(recent.map((task) => task.id)).toStrictEqual(["new"]);
  });

  it("keeps a task that was taken further", () => {
    const added = withTask([compare("old", 2)], compare("new"));
    expect(added.map((task) => task.id)).toStrictEqual(["new", "old"]);
    const followed = withTask(
      [agent("old", ["Track it", "And in green?"])],
      agent("new", ["Track it"])
    );
    expect(followed.map((task) => task.id)).toStrictEqual(["new", "old"]);
  });

  it("drops duplicates already stored, keeping the newest", () => {
    const stored = [
      compare("newest"),
      agent("sofa", ["Track it"]),
      compare("older"),
    ];
    expect(distinctTasks(stored).map((task) => task.id)).toStrictEqual([
      "newest",
      "sofa",
    ]);
  });
});
