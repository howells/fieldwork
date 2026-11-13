// The column every guide page sits in, and its heading.
import type { ReactNode } from "react";

export const GuidePage = ({
  children,
  lead,
  title,
}: {
  children: ReactNode;
  lead: ReactNode;
  title: string;
}) => (
  <div className="mx-auto flex w-full max-w-[1040px] flex-col px-4 pt-8 pb-16 sm:px-6 lg:pt-10">
    <h1 className="type-prompt text-balance">{title}</h1>
    <div className="text-graphite type-body mt-2 max-w-[640px]">{lead}</div>
    {children}
  </div>
);
