// Attention (DESIGN §3.8), run by the Planner's launch panel frame only — the panel Pomade starts
// hidden at launch (`startOnLaunch`) and later shows for the Planner icon — so no two frames set
// the badge or post the summary: the badge on the Planner icon, live with the items and the
// planner day; and the morning summary, once per planner day on Pomade's start (`pomade.ready`).

import { useEffect, useMemo, useRef, useState } from "react";
import type { HostClient } from "pomade-kit/sdk";
import { WORKSPACE_PROJECT_ID } from "pomade-kit/protocol";
import type { LocalDate } from "pomade-kit/schedule";

import { ROUTES } from "../core/views";
import { attentionOf, badgeOf, PLANNER_ICON, shouldSummarize, SUMMARY_DAY_KEY, summaryOf } from "./model/attention";
import type { Task } from "./model/items";

/**
 * Keep the Planner icon's badge on overdue + due today of `tasks` on `day` (red when anything is
 * overdue, cleared at zero). Set only when it changes; cleared when the frame stops counting (the
 * tasks root gone, the frame unloaded).
 */
function useBadge(host: HostClient, enabled: boolean, tasks: readonly Task[], day: LocalDate): void {
  const { count, urgent } = useMemo(() => badgeOf(attentionOf(tasks, day)), [tasks, day]);
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const key = `${count}:${urgent}`;
    if (shown.current === key) return;
    shown.current = key;
    void host.strip.setBadge({ icon: PLANNER_ICON, count, urgent }).catch(() => {
      if (shown.current === key) shown.current = null;
    });
  }, [host, enabled, count, urgent]);
  useEffect(() => {
    if (!enabled) return;
    return () => {
      shown.current = null;
      void host.strip.setBadge({ icon: PLANNER_ICON, count: 0 }).catch(() => undefined);
    };
  }, [host, enabled]);
}

/**
 * The morning summary: each time Pomade is ready (sticky — a frame that subscribes later hears it
 * at once), when the planner day is after the last summary day, post one notice naming what is
 * due, whose click opens the Planner on the Workspace Today. The day is recorded once the notice
 * is posted, or at once when nothing is due — a task added later that day never makes a late
 * "morning" summary. The boundary passing while Pomade stays open posts nothing; the next start does.
 */
function useMorningSummary(host: HostClient, enabled: boolean, tasks: readonly Task[], day: LocalDate): number {
  const [readies, setReadies] = useState(0);
  const [checked, setChecked] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    let close: (() => Promise<void>) | null = null;
    void host.events
      .subscribe("pomade.ready", () => {
        if (live) setReadies((n) => n + 1);
      })
      .then(
        (sub) => {
          if (live) close = () => sub.close();
          else void sub.close();
        },
        () => undefined,
      );
    return () => {
      live = false;
      void close?.();
    };
  }, [host, enabled]);

  // What the next ready is judged on — the items and day at that moment.
  const latest = useRef({ tasks, day });
  useEffect(() => {
    latest.current = { tasks, day };
  }, [tasks, day]);
  const handled = useRef(0);
  useEffect(() => {
    if (!enabled || readies === handled.current) return;
    handled.current = readies;
    const { tasks: now, day: today } = latest.current;
    const ready = readies;
    void (async () => {
      const last = await host.state.get(SUMMARY_DAY_KEY);
      if (!shouldSummarize(today, typeof last === "string" ? last : null)) return;
      const summary = summaryOf(attentionOf(now, today));
      if (summary !== null) {
        await host.notices.post({
          title: summary.title,
          ...(summary.body === "" ? {} : { body: summary.body }),
          action: { kind: "openApp", route: ROUTES.today, projectId: WORKSPACE_PROJECT_ID },
        });
      }
      await host.state.set(SUMMARY_DAY_KEY, today);
    })()
      .catch(() => undefined)
      .finally(() => setChecked(ready));
  }, [host, enabled, readies]);
  return checked;
}

/** The badge and the morning summary, when `enabled` (the Planner panel frame); how many of Pomade's ready events the summary has been checked for. */
export function useAttention(host: HostClient, enabled: boolean, tasks: readonly Task[], day: LocalDate): number {
  useBadge(host, enabled, tasks, day);
  return useMorningSummary(host, enabled, tasks, day);
}
