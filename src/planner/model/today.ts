// The Today module (DESIGN §3.3): the planner day, which tasks are in Today and why, the order of
// every list, and when the next planner day starts. Pure — "now" and the day boundary are inputs —
// and shared by the Planner's views and the `today` command, so both show the same items.
//
// - The planner day runs from boundary to boundary (default 3:00): at 01:30 it is still the
//   previous day. It is `pomade-kit`'s `currentDay`, the day date phrases count from.
// - Today holds tasks and recurring items only — never notes, thoughts or daily notes, nor
//   anything archived. Every open task with a reason: `overdue` (deadline before today), `due-today`
//   (deadline today), `planned` (`do-on` today) or `rolled-over` (`do-on` before today — "planned
//   N days ago"); the first that applies, in that order.
// - A task ticked today (`done-on` = the planner day) stays, crossed out, with the reason it had,
//   until the next boundary.
// - A recurring item (recurring.ts) is in Today from `do-on − lead-days`: `lead-time` before its
//   date ("due in N days"), `recurring-due` on and after it ("due today", "missed N×"). Done and
//   skip advance it rather than cross it out, so it never shows ticked.
// - Order: deadline → `do-on` → `importance` (highest first) → `created`; an unset value sorts
//   after every set one; then title and path, so the order never depends on the read.

import { currentDay } from "pomade-kit/dates";
import { addDays, daysBetween, toInstant, type LocalDate, type Time } from "pomade-kit/schedule";

import { isTaskType, type Task } from "./items";
import { inToday, recurringState, type RecurringState } from "./recurring";

export type Reason = "overdue" | "due-today" | "planned" | "rolled-over" | "recurring-due" | "lead-time";

export interface TodayRow {
  task: Task;
  reason: Reason;
  /** Days since `do-on` for a rolled-over task (≥ 1); 0 otherwise. */
  plannedDaysAgo: number;
  /** A recurring item's state on the day; `null` for a task. */
  recurring: RecurringState | null;
}

/** The planner day `now` belongs to. */
export function plannerDay(now: Date, boundary: Time): LocalDate {
  return currentDay(now, boundary);
}

/** Why a task is in Today on `day`, by its dates alone (status aside); `null` when it isn't. */
export function reasonOn(task: Task, day: LocalDate): Reason | null {
  if (task.deadline !== null && task.deadline < day) return "overdue";
  if (task.deadline === day) return "due-today";
  if (task.doOn === day) return "planned";
  if (task.doOn !== null && task.doOn < day) return "rolled-over";
  return null;
}

/** Whether a task shows in Today on `day`: open, or ticked that very day. */
export function isVisibleOn(task: Task, day: LocalDate): boolean {
  return !task.done || task.doneOn === day;
}

function compareOptional<T>(a: T | null, b: T | null, compare: (x: T, y: T) => number): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return compare(a, b);
}

const ascending = <T extends string | number>(x: T, y: T): number => (x < y ? -1 : x > y ? 1 : 0);

/** The order inside every list. */
export function compareTasks(a: Task, b: Task): number {
  return (
    compareOptional(a.deadline, b.deadline, ascending) ||
    compareOptional(a.doOn, b.doOn, ascending) ||
    compareOptional(a.importance, b.importance, (x, y) => y - x) ||
    compareOptional(a.created, b.created, ascending) ||
    a.title.localeCompare(b.title) ||
    ascending(a.path, b.path)
  );
}

/** A recurring item's Today row on `day`, or `null` when it isn't in Today. */
export function recurringRow(task: Task, day: LocalDate): TodayRow | null {
  if (task.repeat === null || task.done) return null;
  const state = recurringState(task, day);
  if (!inToday(state)) return null;
  return { task, reason: state.phase === "lead" ? "lead-time" : "recurring-due", plannedDaysAgo: 0, recurring: state };
}

/** Whether an item can be in Today, Project or Recurring at all: a task or recurring item, not archived. */
export const isScheduled = (task: Task): boolean => isTaskType(task.type) && !task.archived;

/** Today on `day`: its rows in order. */
export function todayRows(tasks: readonly Task[], day: LocalDate): TodayRow[] {
  const rows: TodayRow[] = [];
  for (const task of tasks) {
    if (!isScheduled(task)) continue;
    if (task.repeat !== null) {
      const row = recurringRow(task, day);
      if (row !== null) rows.push(row);
      continue;
    }
    if (!isVisibleOn(task, day)) continue;
    const reason = reasonOn(task, day);
    if (reason === null) continue;
    rows.push({ task, reason, plannedDaysAgo: reason === "rolled-over" && task.doOn !== null ? daysBetween(task.doOn, day) : 0, recurring: null });
  }
  return rows.sort((a, b) => compareTasks(a.task, b.task));
}

/**
 * The Recurring view: every recurring item, by next occurrence (ended last, then the list order),
 * each with its state on `day`. A recurring item marked `status: done` by hand is left out, as
 * done items are everywhere but All with "Show done".
 */
export function recurringRows(tasks: readonly Task[], day: LocalDate): { task: Task; state: RecurringState }[] {
  const rows = tasks.filter((t) => isScheduled(t) && t.repeat !== null && !t.done).map((task) => ({ task, state: recurringState(task, day) }));
  const key = (r: { state: RecurringState }): string | null => (r.state.phase === "ended" ? null : r.state.next);
  return rows.sort((a, b) => compareOptional(key(a), key(b), ascending) || compareTasks(a.task, b.task));
}

/** Daily notes newest first (by `date:`, else the file name), then by path. */
export function compareDailyNotes(a: Task, b: Task): number {
  const key = (t: Task): string => t.date ?? t.name;
  return ascending(key(b), key(a)) || ascending(a.path, b.path);
}

export interface AllOptions {
  /** Done tasks and resolved thoughts, after the open items. */
  showDone: boolean;
  /** Archived items, last. */
  showArchived: boolean;
  /** Daily notes (newest first, after the open items) — only when the type filter asks for them, so years of them don't bury the rest. */
  showDaily: boolean;
}

/**
 * The All view: every open item in order (tasks, recurring items, notes, thoughts), then the daily
 * notes newest first, then — with `showDone` — the done and resolved ones in order, then — with
 * `showArchived` — the archived ones.
 */
export function allTasks(tasks: readonly Task[], options: AllOptions): Task[] {
  const live = tasks.filter((t) => !t.archived);
  const open = live.filter((t) => !t.done && t.type !== "daily-note").sort(compareTasks);
  const daily = options.showDaily ? live.filter((t) => t.type === "daily-note").sort(compareDailyNotes) : [];
  const done = options.showDone ? live.filter((t) => t.done).sort(compareTasks) : [];
  const archived = options.showArchived ? tasks.filter((t) => t.archived && (options.showDaily || t.type !== "daily-note")).sort(compareTasks) : [];
  return [...open, ...daily, ...done, ...archived];
}

/**
 * The first instant after `now` whose planner day is another one — when Today must be evaluated
 * again. Normally the boundary on the next calendar date. Around a clock change it is found by
 * the planner day itself: a boundary a spring-forward change skips starts the day when the clock
 * jumps past it; a boundary a fall-back change repeats starts it on the first pass only.
 */
export function nextDayStart(now: Date, boundary: Time): Date {
  const day = plannerDay(now, boundary);
  let lo = now.getTime();
  let hi = toInstant(addDays(day, 1), boundary).getTime();
  if (plannerDay(new Date(hi - 1), boundary) === day) return new Date(hi);
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (plannerDay(new Date(mid), boundary) === day) lo = mid;
    else hi = mid;
  }
  return new Date(hi);
}
