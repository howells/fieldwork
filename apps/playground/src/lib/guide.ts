// The tool guide's routes and links. The research itself is the docs site's
// data, imported as is, so the playground and the website show the same facts.
import { GUIDE_PROVIDERS, TASK_GROUPS } from "@guide/tool-guide";

export const DOCS_SITE = "https://fieldwork-sdk.dev";

export const GUIDE_ROOT = "/tool-guide";

export const GUIDE_PAGES = [
  { href: GUIDE_ROOT, label: "Task matrix" },
  { href: `${GUIDE_ROOT}/choosing`, label: "How to choose" },
] as const;

export const isGuide = (pathname: string): boolean =>
  pathname === GUIDE_ROOT || pathname.startsWith(`${GUIDE_ROOT}/`);

export type GroupId = (typeof TASK_GROUPS)[number]["id"];

export interface Filters {
  group: GroupId;
  provider: string;
  query: string;
}

export const NO_FILTERS: Filters = { group: "all", provider: "", query: "" };

const first = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value) ?? "";

/** Filters from the address, so a filtered matrix can be linked to. Unknown values are ignored. */
export const filtersFrom = (
  params: Readonly<Record<string, string | string[] | undefined>>
): Filters => {
  const group = TASK_GROUPS.find((item) => item.id === first(params.group));
  const provider = first(params.provider);
  return {
    group: group?.id ?? "all",
    provider: GUIDE_PROVIDERS.includes(provider) ? provider : "",
    query: first(params.q),
  };
};

/** The address for a set of filters; the defaults are left out. */
export const filtersQuery = (filters: Filters): string => {
  const params = new URLSearchParams();
  if (filters.query.trim() !== "") {
    params.set("q", filters.query);
  }
  if (filters.provider !== "") {
    params.set("provider", filters.provider);
  }
  if (filters.group !== "all") {
    params.set("group", filters.group);
  }
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
};
