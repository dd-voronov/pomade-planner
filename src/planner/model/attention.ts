// Attention ([[attention]]): the Planner icon's badge and the morning summary, from the Today
// module's rows on the planner day. Pure; the launch panel frame (useAttention.ts) calls it.
//
// - **What is due:** the open Today rows of the whole workspace, in three kinds — `overdue` (a
//   task's deadline before today; a recurring item's missed run, one row however many runs it
//   missed), `due today` (a task's deadline today; a recurring item due today) and `soon` (a
//   recurring item inside its lead time). A task only planned for today (`do-on`, no deadline) or
//   rolled over is not due. Ticked rows are out.
// - **Badge:** overdue + due today; red (`urgent`) when anything is overdue; 0 clears it.
// - **Summary:** posted once per planner day, on Pomade's start (`pomade.ready`), when the day is
//   after the last summary day and anything is due — soon included. The title is the counts, then
//   the soon items by name: "2 due today, 1 overdue, Tax report due in 3 days" (up to 3 named,
//   then "+N more"). The body names the overdue and due-today items the same way: "Overdue: Pay
//   the tax · Due today: Buy printer ink, Call the bank".

import type { LocalDate } from "pomade-kit/schedule";

import type { Task } from "./items";
import { todayRows, type TodayRow } from "./today";

/** The machine-local state key holding the planner day the last morning summary was settled for (posted, or nothing was due). */
export const SUMMARY_DAY_KEY = "planner.summaryDay";

/** The strip icon the badge is on (manifest.json). */
export const PLANNER_ICON = "planner";

export interface Attention {
  overdue: TodayRow[];
  dueToday: TodayRow[];
  soon: TodayRow[];
}

/** The open Today rows of `tasks` on `day` that need attention, each list in Today's order. */
export function attentionOf(tasks: readonly Task[], day: LocalDate): Attention {
  const out: Attention = { overdue: [], dueToday: [], soon: [] };
  for (const row of todayRows(tasks, day)) {
    if (row.task.done) continue;
    const phase = row.recurring?.phase;
    if (row.reason === "overdue" || phase === "missed") out.overdue.push(row);
    else if (row.reason === "due-today" || phase === "due") out.dueToday.push(row);
    else if (phase === "lead") out.soon.push(row);
  }
  return out;
}

export interface Badge {
  count: number;
  urgent: boolean;
}

/** The Planner icon's badge: overdue + due today, red when anything is overdue. */
export function badgeOf(attention: Attention): Badge {
  return { count: attention.overdue.length + attention.dueToday.length, urgent: attention.overdue.length > 0 };
}

/** Whether a start on `day` settles a summary: the first since `lastDay` (`null`: never one). */
export function shouldSummarize(day: LocalDate, lastDay: string | null): boolean {
  return lastDay === null || day > lastDay;
}

/** How many items a summary names in its title, and in its body. */
export const NAMED = 3;
/** A named item's title is cut to this many characters. */
const NAME_MAX = 40;
/** HOST-API §4 `notices`: a title is at most 200 characters. */
const TITLE_MAX = 200;

const nameOf = (row: TodayRow): string => {
  const title = row.task.title.replace(/\s+/g, " ").trim();
  return title.length > NAME_MAX ? `${title.slice(0, NAME_MAX - 1).trimEnd()}…` : title;
};

const dueIn = (days: number): string => (days === 1 ? "due tomorrow" : `due in ${days} days`);

const more = (n: number): string[] => (n > 0 ? [`+${n} more`] : []);

export interface Summary {
  title: string;
  body: string;
}

/** The morning summary's text; `null` when nothing is due. */
export function summaryOf(attention: Attention): Summary | null {
  const { overdue, dueToday, soon } = attention;
  if (overdue.length + dueToday.length + soon.length === 0) return null;

  const counts = [...(dueToday.length > 0 ? [`${dueToday.length} due today`] : []), ...(overdue.length > 0 ? [`${overdue.length} overdue`] : [])];
  const named = soon.slice(0, NAMED).map((r) => `${nameOf(r)} ${dueIn(r.recurring?.dueInDays ?? 1)}`);
  let title = [...counts, ...named, ...more(soon.length - named.length)].join(", ");
  if (title.length > TITLE_MAX) title = `${title.slice(0, TITLE_MAX - 1).trimEnd()}…`;

  // The body: overdue first, then due today, NAMED in all, then what's left.
  const groups: string[] = [];
  let left = NAMED;
  for (const [label, rows] of [
    ["Overdue", overdue],
    ["Due today", dueToday],
  ] as const) {
    const shown = rows.slice(0, left);
    left -= shown.length;
    if (shown.length > 0) groups.push(`${label}: ${shown.map((r) => (r.recurring !== null && r.recurring.missed > 1 ? `${nameOf(r)} (missed ${r.recurring.missed}×)` : nameOf(r))).join(", ")}`);
  }
  const unnamed = overdue.length + dueToday.length - (NAMED - left);
  return { title, body: [...groups, ...more(unnamed)].join(" · ") };
}
