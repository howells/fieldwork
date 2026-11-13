// Numbers as the interface shows them. Costs are US dollars to three
// decimals, as the providers report them; prices on shop pages keep the
// currency the page showed and are never converted.
import type { Usage } from "./events";
import type { Price } from "./outputs";

const usdFormat = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 3,
  minimumFractionDigits: 3,
  style: "currency",
});

/** "$0.005"; a charge below a tenth of a cent shows as "<$0.001", not "$0.000". */
export const usd = (amount: number): string =>
  amount > 0 && amount < 0.0005 ? "<$0.001" : usdFormat.format(amount);

/** "3.1s" under a minute, then "1m 12s". */
export const duration = (ms: number): string => {
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
};

const countFormat = new Intl.NumberFormat("en-GB");

export const count = (value: number): string => countFormat.format(value);

/** "1 credit", "5 credits". */
export const credits = (value: number): string =>
  `${count(value)} ${value === 1 ? "credit" : "credits"}`;

/**
 * "$0.004 · 13 credits": what a run cost, dollars and credits side by side.
 * They are different units, so they are never added together; credits show
 * only when some were used.
 */
export const spendText = (dollars: number, creditsUsed: number): string =>
  creditsUsed > 0 ? `${usd(dollars)} · ${credits(creditsUsed)}` : usd(dollars);

/**
 * What a call cost, in the unit the provider reported: dollars when it
 * reports dollars, credits when it bills in credits, nothing when it says
 * nothing.
 */
export const usageLabel = (usage: Usage | undefined): string | undefined => {
  if (usage?.costUsd !== undefined) {
    return usd(usage.costUsd);
  }
  if (usage?.credits !== undefined) {
    return credits(usage.credits);
  }
  return undefined;
};

/** "heals.com" from a URL, without "www.". */
export const domainOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return url;
  }
};

/** A URL as the task bar shows it: host and path, without the scheme. */
export const shortUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    const path =
      parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/u, "");
    return `${parsed.hostname.replace(/^www\./u, "")}${path}`;
  } catch {
    return url;
  }
};

export const clip = (text: string, length: number): string =>
  text.length <= length ? text : `${text.slice(0, length - 1).trimEnd()}…`;

/**
 * A shop price in the page's own currency, written the British way
 * ("£2,960.00"). It is never converted; without a currency the page's own
 * text is shown as it was.
 */
export const priceText = (price: Price | undefined): string | undefined => {
  const amount = Number(price?.amount);
  if (
    price?.amount === undefined ||
    price.currency === undefined ||
    !Number.isFinite(amount)
  ) {
    return price?.formatted ?? price?.amount;
  }
  try {
    return new Intl.NumberFormat("en-GB", {
      currency: price.currency,
      style: "currency",
    }).format(amount);
  } catch {
    return price.formatted ?? `${price.amount} ${price.currency}`;
  }
};

/** "0 9 * * *" as "every day at 09:00 UTC"; other schedules as written. */
export const scheduleText = (schedule: string): string => {
  const daily = /^(?<minute>\d{1,2}) (?<hour>\d{1,2}) \* \* \*$/u.exec(
    schedule.trim()
  );
  if (daily?.groups === undefined) {
    return schedule;
  }
  const { hour = "0", minute = "0" } = daily.groups;
  return `every day at ${hour.padStart(2, "0")}:${minute.padStart(2, "0")} UTC`;
};
