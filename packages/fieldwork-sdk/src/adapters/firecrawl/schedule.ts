import type { MonitorSchedule } from "../../types.js";
import { invalid } from "./shared.js";

/** The fewest minutes Firecrawl allows between two checks of a monitor. */
const MIN_MINUTES = 5;

const NAMED_CRON = new Map([
  ["hour", "0 * * * *"],
  ["day", "0 0 * * *"],
  ["week", "0 0 * * 0"],
]);

const DAILY_CRON = new Map([
  [1, "0 0 * * *"],
  [7, "0 0 * * 0"],
]);

const CRON_PART = /^(?:\*|(?<from>\d+)(?:-(?<to>\d+))?)(?:\/(?<step>\d+))?$/u;
const INTERVAL = /^(?<count>\d+)(?<unit>[hd])$/u;

function rangeEnd(
  groups: Record<string, string | undefined>,
  wildcard: boolean,
  from: number,
  max: number
): number {
  if (wildcard || (groups.to === undefined && groups.step !== undefined)) {
    return max;
  }
  return groups.to === undefined ? from : Number(groups.to);
}

/** The values a cron field covers ("*\/5", "0,30", "10-20/2"), or undefined if it is not plain numbers. */
function cronValues(field: string, max: number): number[] | undefined {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const groups = CRON_PART.exec(part)?.groups;
    if (!groups) {
      return undefined;
    }
    const wildcard = part.startsWith("*");
    const from = wildcard ? 0 : Number(groups.from);
    const to = rangeEnd(groups, wildcard, from, max);
    const step = Number(groups.step ?? 1);
    if (step < 1 || from > to || to > max) {
      return undefined;
    }
    for (let value = from; value <= to; value += step) {
      values.add(value);
    }
  }
  return [...values].toSorted((a, b) => a - b);
}

/** Minutes between runs within an hour, and across the hour change when two hours in a row can run. */
function runGaps(minutes: number[], hours: number[] | undefined): number[] {
  const gaps = minutes
    .slice(1)
    .map((minute, index) => minute - (minutes[index] ?? 0));
  const [first] = minutes;
  const last = minutes.at(-1);
  const consecutive = hours?.some((hour) => hours.includes((hour + 1) % 24));
  if (consecutive && first !== undefined && last !== undefined) {
    gaps.push(60 - last + first);
  }
  return gaps;
}

/** Refuses a cron expression that runs more often than Firecrawl allows. */
function checkCron(cron: string): string {
  const fields = cron.trim().split(/\s+/u);
  if (fields.length !== 5) {
    throw invalid(
      `firecrawl needs a five-field cron expression, got "${cron}"`
    );
  }
  const [minuteField = "", hourField = ""] = fields;
  const minutes = cronValues(minuteField, 59);
  const hours = cronValues(hourField, 23);
  if (minutes && runGaps(minutes, hours).some((gap) => gap < MIN_MINUTES)) {
    throw invalid(
      `firecrawl monitors run at most every ${MIN_MINUTES} minutes, got "${cron}"`
    );
  }
  return cron.trim();
}

/** Whole-hour intervals that divide the day repeat evenly from midnight. */
function hourlyCron(count: number): string | undefined {
  if (!Number.isInteger(count) || count < 1 || 24 % count !== 0) {
    return undefined;
  }
  if (count === 1) {
    return "0 * * * *";
  }
  return count === 24 ? "0 0 * * *" : `0 */${count} * * *`;
}

/** The cron expression for a schedule, or InvalidRequest when Firecrawl cannot express it. */
export function cronFor(schedule: MonitorSchedule): string {
  if ("cron" in schedule) {
    return checkCron(schedule.cron);
  }
  const every: string = schedule.every;
  const named = NAMED_CRON.get(every);
  if (named) {
    return named;
  }
  const groups = INTERVAL.exec(every)?.groups;
  const count = Number(groups?.count);
  const cron = groups?.unit === "h" ? hourlyCron(count) : DAILY_CRON.get(count);
  if (cron) {
    return cron;
  }
  throw invalid(
    `firecrawl cannot run a monitor every "${every}"; use hour, day, week, a number of hours that divides 24, 1d, 7d or a cron expression`
  );
}
