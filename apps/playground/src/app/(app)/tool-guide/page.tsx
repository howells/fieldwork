import type { Metadata } from "next";

import { TaskMatrix } from "@/components/guide/task-matrix";
import { filtersFrom } from "@/lib/guide";

export const metadata: Metadata = {
  title: "Task matrix · Fieldwork Playground",
};

const Page = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => <TaskMatrix initial={filtersFrom(await searchParams)} />;

export default Page;
