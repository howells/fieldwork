"use client";

import { useEffect, useState } from "react";

/** The current time, ticking while `running`, so a live run's clock moves. */
export const useNow = (running: boolean, every = 100): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = running
      ? setInterval(() => {
          setNow(Date.now());
        }, every)
      : null;
    return () => {
      if (timer !== null) {
        clearInterval(timer);
      }
    };
  }, [every, running]);
  return now;
};

const RELATIVE = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

/** "2 minutes ago", "yesterday". */
export const ago = (then: number, now: number): string => {
  const seconds = Math.round((then - now) / 1000);
  if (Math.abs(seconds) < 60) {
    return "just now";
  }
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) {
    return RELATIVE.format(minutes, "minute");
  }
  const hours = Math.round(minutes / 60);
  return Math.abs(hours) < 24
    ? RELATIVE.format(hours, "hour")
    : RELATIVE.format(Math.round(hours / 24), "day");
};
