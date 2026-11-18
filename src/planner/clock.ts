// The Planner's clock and its day. "Now" is the Mac's clock; the planner day follows it across the
// day boundary while Pomade stays open: a timer set for the next boundary, and a check every
// minute and whenever the frame is shown again (a timer runs late after the Mac slept).
//
// Test hook: the app state key `test.clock` (`{ "offsetMs": n }`) shifts this app's "now" by n ms
// in every frame — tab, panel and quick-add overlay — so specs reach 01:30 or 02:59:59 without
// waiting. Nothing in the app sets it; `window.__plannerTest.setClock(instantMs | null)` sets it
// from a spec (null clears it).

import { useEffect, useMemo, useState } from "react";
import type { HostClient } from "pomade-kit/sdk";
import type { JsonValue } from "pomade-kit/protocol";
import type { LocalDate, Time } from "pomade-kit/schedule";

import { nextDayStart, plannerDay } from "./model/today";

export const TEST_CLOCK_KEY = "test.clock";

declare global {
  interface Window {
    __plannerTest?: { setClock(instantMs: number | null): Promise<void> };
  }
}

const offsetOf = (value: JsonValue | null): number =>
  typeof value === "object" && value !== null && !Array.isArray(value) && typeof value.offsetMs === "number" && Number.isFinite(value.offsetMs) ? value.offsetMs : 0;

export interface Clock {
  now(): Date;
}

/** The app's clock; `null` until the test hook has been read. */
export function useClock(host: HostClient): Clock | null {
  const [offset, setOffset] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    const off = host.state.onChange((key, value) => {
      if (key === TEST_CLOCK_KEY) setOffset(offsetOf(value));
    });
    void host.state.get(TEST_CLOCK_KEY).then(
      (value) => live && setOffset(offsetOf(value)),
      () => live && setOffset(0),
    );
    window.__plannerTest = {
      async setClock(instantMs) {
        const value = instantMs === null ? null : { offsetMs: instantMs - Date.now() };
        await host.state.set(TEST_CLOCK_KEY, value);
        setOffset(offsetOf(value));
      },
    };
    return () => {
      live = false;
      off();
    };
  }, [host]);
  return useMemo(() => (offset === null ? null : { now: () => new Date(Date.now() + offset) }), [offset]);
}

/** How often the day is checked besides the boundary timer. */
const CHECK_MS = 60_000;

/** The planner day by `clock`, re-evaluated at every day boundary. */
export function usePlannerDay(clock: Clock, boundary: Time): LocalDate {
  const [day, setDay] = useState(() => plannerDay(clock.now(), boundary));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      const now = clock.now();
      setDay(plannerDay(now, boundary));
      clearTimeout(timer);
      // At least 1 ms; setTimeout caps a delay at 2^31 − 1 ms, far beyond a day.
      timer = setTimeout(check, Math.max(1, nextDayStart(now, boundary).getTime() - now.getTime()));
    };
    check();
    const interval = setInterval(check, CHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, [clock, boundary]);
  return day;
}
