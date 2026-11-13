"use client";

// The sidebar: a new task, the recent ones kept in this browser, the tool
// guide, and where each provider's key comes from. Beside the task on a wide screen; in a
// sheet from the header's menu button on a narrow one.
import Link from "next/link";
import { usePathname } from "next/navigation";

import { GUIDE_PAGES } from "@/lib/guide";
import type { KeySource, ProviderId, ProviderInfo } from "@/lib/providers";
import { keySource } from "@/lib/providers";
import type { Task } from "@/lib/tasks";

import { Plus } from "./icons";

const ROW = "flex h-11 lg:h-7 shrink-0 items-center rounded-control px-2";

// The guide's pages are where the sidebar sends you, so they keep a full
// 44px target at every width.
const GUIDE_ROW = "flex h-11 shrink-0 items-center rounded-control px-2";

const SOURCE_WORDS: Readonly<Record<Exclude<KeySource, "none">, string>> = {
  browser: "Browser",
  server: "Server",
};

interface SidebarProps {
  activeId?: string;
  className?: string;
  keys: Readonly<Record<string, string>>;
  onAddKey: (provider: ProviderId) => void;
  onGuide?: () => void;
  onNew: () => void;
  onOpen: (id: string) => void;
  providers: readonly ProviderInfo[];
  running?: string;
  tasks: readonly Task[];
}

const KeyRows = ({
  keys,
  onAddKey,
  providers,
}: Pick<SidebarProps, "keys" | "onAddKey" | "providers">) => (
  <section className="flex flex-col">
    <h2 className="text-muted type-label px-2 pb-1">Keys</h2>
    <ul className="flex flex-col">
      {providers
        .toSorted(
          (a, b) =>
            Number(keySource(a, keys) === "none") -
            Number(keySource(b, keys) === "none")
        )
        .map((provider) => {
          const source = keySource(provider, keys);
          return (
            <li
              className="flex h-11 shrink-0 items-center justify-between gap-3 px-2 lg:h-7"
              key={provider.id}
            >
              <span
                className={`type-body ${source === "none" ? "text-muted" : ""}`}
              >
                {provider.label}
              </span>
              {source === "none" ? (
                <button
                  className="hit-area text-graphite type-label hover:text-ink underline-offset-2 transition-colors duration-150 hover:underline"
                  onClick={() => {
                    onAddKey(provider.id);
                  }}
                  type="button"
                >
                  Add key
                </button>
              ) : (
                <span className="text-muted type-label">
                  {SOURCE_WORDS[source]}
                </span>
              )}
            </li>
          );
        })}
    </ul>
  </section>
);

const GuideRows = ({ onGuide }: { onGuide?: () => void }) => {
  const pathname = usePathname();
  return (
    <section className="flex flex-col gap-px">
      <h2 className="text-muted type-label px-2 pb-1">Tool guide</h2>
      {GUIDE_PAGES.map((page) => (
        <Link
          aria-current={pathname === page.href ? "page" : undefined}
          className={`${GUIDE_ROW} hover:bg-paper/60 aria-[current=page]:bg-paper type-body transition-colors duration-150 aria-[current=page]:shadow-[0_0_0_1px_var(--color-rule)]`}
          href={page.href}
          key={page.href}
          onClick={onGuide}
        >
          {page.label}
        </Link>
      ))}
    </section>
  );
};

export const Sidebar = ({
  activeId,
  className = "",
  keys,
  onAddKey,
  onGuide,
  onNew,
  onOpen,
  providers,
  running,
  tasks,
}: SidebarProps) => (
  <nav
    aria-label="Tasks, guide and keys"
    className={`bg-wash flex shrink-0 flex-col justify-between gap-6 overflow-y-auto px-2 py-2 ${className}`}
  >
    <div className="flex flex-col gap-4">
      <button
        className={`${ROW} border-rule bg-paper shadow-hairline hover:border-rule-strong gap-2 border transition-colors duration-150`}
        onClick={onNew}
        type="button"
      >
        <Plus />
        <span className="type-body strong">New task</span>
      </button>
      <section className="flex flex-col gap-px">
        <h2 className="text-muted type-label px-2 pb-1">Recent</h2>
        {tasks.length === 0 ? (
          <p className="text-muted type-body px-2">None yet</p>
        ) : (
          tasks.map((task) => (
            <button
              aria-current={task.id === activeId ? "page" : undefined}
              className={`${ROW} hover:bg-paper/60 aria-[current=page]:bg-paper justify-between gap-2 text-left transition-colors duration-150 aria-[current=page]:shadow-[0_0_0_1px_var(--color-rule)]`}
              key={task.id}
              onClick={() => {
                onOpen(task.id);
              }}
              type="button"
            >
              <span className="type-body truncate">
                {task.label ?? task.title}
              </span>
              {task.id === running ? (
                <span
                  aria-label="Running"
                  className="bg-map-blue size-1.5 shrink-0 animate-pulse rounded-full"
                />
              ) : null}
            </button>
          ))
        )}
      </section>
      <GuideRows onGuide={onGuide} />
    </div>
    <KeyRows keys={keys} onAddKey={onAddKey} providers={providers} />
  </nav>
);
