// The bar above a task: its title, the page it is about, how the run is
// going, and the one action that fits the moment. On a phone the status
// drops to its own line under the title.
import type { ReactNode } from "react";

import { shortUrl } from "@/lib/format";

export type Tone = "running" | "done" | "failed";

interface TaskBarProps {
  action?: ReactNode;
  status: string;
  title: string;
  tone: Tone;
  url?: string;
}

export const TaskBar = ({ action, status, title, tone, url }: TaskBarProps) => (
  <div className="border-rule grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-b px-4 py-2 lg:flex lg:h-11 lg:gap-4 lg:px-4 lg:py-0">
    <div className="flex min-w-0 flex-col lg:flex-row lg:items-baseline lg:gap-2.5">
      <h1 className="type-title truncate lg:shrink-0">{title}</h1>
      {url === undefined ? null : (
        <a
          className="text-graphite type-code hover:text-ink min-w-0 truncate underline-offset-2 transition-colors duration-150 hover:underline"
          href={url}
          rel="noreferrer"
          target="_blank"
          title={url}
        >
          {shortUrl(url)}
        </a>
      )}
    </div>
    <p
      aria-live="polite"
      className={`figures type-label col-start-1 flex min-w-0 items-center gap-2 lg:ml-auto lg:text-right ${tone === "failed" ? "text-error" : "text-graphite"}`}
    >
      {tone === "running" ? (
        <span
          aria-hidden
          className="bg-map-blue shadow-pulse size-1.5 shrink-0 animate-pulse rounded-full"
        />
      ) : null}
      <span>{status}</span>
    </p>
    {action === undefined ? null : (
      <div className="col-start-2 row-span-2 row-start-1 flex items-center">
        {action}
      </div>
    )}
  </div>
);

export const BarButton = ({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) => (
  <button
    className="hit-area rounded-control border-rule bg-paper type-body strong hover:border-rule-strong flex h-7 items-center border px-2.5 whitespace-nowrap transition-colors duration-150"
    onClick={onClick}
    type="button"
  >
    {children}
  </button>
);
