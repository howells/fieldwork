"use client";

// The bar above the guide: its three pages as tabs, and the way back to the
// task, which kept its place while the guide was open.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { GUIDE_PAGES } from "@/lib/guide";

const TAB =
  "flex h-11 shrink-0 items-center border-b-2 border-transparent type-body text-graphite transition-colors duration-150 hover:text-ink aria-[current=page]:border-ink aria-[current=page]:text-ink aria-[current=page]:strong";

interface GuideFrameProps {
  children: ReactNode;
  hasTask: boolean;
}

export const GuideFrame = ({ children, hasTask }: GuideFrameProps) => {
  const pathname = usePathname();
  return (
    <div className="flex min-h-0 grow basis-0 flex-col">
      <div className="border-rule flex shrink-0 flex-col border-b lg:h-11 lg:flex-row lg:items-center lg:gap-6 lg:px-4">
        <div className="flex h-11 items-center justify-between gap-3 px-4 lg:contents">
          <p className="type-title shrink-0">Tool guide</p>
          <Link
            className="text-graphite type-body hover:text-ink order-last flex min-h-11 shrink-0 items-center whitespace-nowrap transition-colors duration-150 lg:ml-auto"
            href="/"
          >
            {hasTask ? "Back to task" : "Start a task"}
          </Link>
        </div>
        <nav
          aria-label="Tool guide pages"
          className="-mb-px flex gap-5 overflow-x-auto px-4 lg:self-stretch lg:px-0"
        >
          {GUIDE_PAGES.map((page) => (
            <Link
              aria-current={pathname === page.href ? "page" : undefined}
              className={TAB}
              href={page.href}
              key={page.href}
            >
              {page.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="min-h-0 grow basis-0 overflow-y-auto">{children}</div>
    </div>
  );
};
