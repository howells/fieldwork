// Turns a monitor's schedule into the cron expression Firecrawl takes, and checks the minimum gap between runs.
// request.ts calls `cronFor` when it builds a monitor's body.

import { invalidRequest } from "../../errors.js";
import type { MonitorSchedule } from "../../types.js";
import { provider } from "./shared.js";

/** The fewest minutes Firecrawl allows between two checks of a monitor. */
const MIN_MINUTES = 5;

const NAMED_CRON = new Map([
  ["hour", "0 * * * *"],
  ["day", "0 0 * * *"],
  ["week", "0 0 * * 0"],
]);

/** The day counts that have a cron: every day, and every seven days (Sunday). */
const DAILY_CRON = new Map([
  [1, "0 0 * * *"],
  [7, "0 0 * * 0"],
]);

const CRON_PART = /^(?:\*|(?<from>\d+)(?:-(?<to>\d+))?)(?:\/(?<step>\d+))?$/u;
const INTERVAL = /^(?<count>\d+)(?<unit>[hd])$/u;

const rangeEnd = (
  groups: Record<string, string | undefined>,
  wildcard: boolean,
  from: number,
  max: number
): number => {
  if (wildcard || (groups.to === undefined && groups.step !== undefined)) {
    return max;
  }
  return groups.to === undefined ? from : Number(groups.to);
};

/** The sorted values a minute or hour field matches (lists, ranges and steps), or undefined for a field it cannot read, such as one with names. */
const cronValues = (field: string, max: number): number[] | undefined => {
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
};

/** The minutes between runs within an hour, and across the hour boundary when two consecutive hours both run. */
const runGaps = (minutes: number[], hours: number[] | undefined): number[] => {
  const gaps = minutes
    .slice(1)
    .map((minute, index) => minute - (minutes[index] ?? 0));
  const [first] = minutes;
  const last = minutes.at(-1);
  const consecutive = hours?.some((hour) => hours.includes((hour + 1) % 24));
  if (consecutive === true && first !== undefined && last !== undefined) {
    gaps.push(60 - last + first);
  }
  return gaps;
};

/**
 * Refuses an expression that is not five fields, or that can run less than
 * `MIN_MINUTES` apart. A minute or hour field `cronValues` cannot read is not
 * checked.
 */
const checkCron = (cron: string): string => {
  const fields = cron.trim().split(/\s+/u);
  if (fields.length !== 5) {
    throw invalidRequest(
      provider,
      `needs a five-field cron expression, got "${cron}"`
    );
  }
  const [minuteField = "", hourField = ""] = fields;
  const minutes = cronValues(minuteField, 59);
  const hours = cronValues(hourField, 23);
  if (minutes && runGaps(minutes, hours).some((gap) => gap < MIN_MINUTES)) {
    throw invalidRequest(
      provider,
      `monitors run at most every ${MIN_MINUTES} minutes, got "${cron}"`
    );
  }
  return cron.trim();
};

/** The cron for every `count` hours. Only counts that divide 24 have one. */
const hourlyCron = (count: number): string | undefined => {
  if (!Number.isInteger(count) || count < 1 || 24 % count !== 0) {
    return undefined;
  }
  if (count === 1) {
    return "0 * * * *";
  }
  return count === 24 ? "0 0 * * *" : `0 */${count} * * *`;
};

/**
 * The cron expression for a schedule. A cron is checked and passed through. A
 * named interval becomes a cron: `hour` (on the hour), `day`, `1d` (midnight),
 * `week`, `7d` (midnight on Sunday), or `Nh` for an N that divides 24. Throws
 * `InvalidRequest` for any other interval.
 */
export const cronFor = (schedule: MonitorSchedule): string => {
  if ("cron" in schedule) {
    return checkCron(schedule.cron);
  }
  const every: string = schedule.every;
  const named = NAMED_CRON.get(every);
  if (named !== undefined) {
    return named;
  }
  const groups = INTERVAL.exec(every)?.groups;
  const count = Number(groups?.count);
  const cron = groups?.unit === "h" ? hourlyCron(count) : DAILY_CRON.get(count);
  if (cron !== undefined) {
    return cron;
  }
  throw invalidRequest(
    provider,
    `cannot run a monitor every "${every}"; use hour, day, week, a number of hours that divides 24, 1d, 7d or a cron expression`
  );
};
