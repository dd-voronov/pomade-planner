// How a task's dates read on a row: short and relative to the planner day ("today", "Fri",
// "Nov 20", "Nov 20, 2027"), and the hints each view shows under a title.

import { daysBetween, weekdayOf, type LocalDate } from "pomade-kit/schedule";

import { progressText } from "./body";
import type { Task } from "./items";
import type { RecurringState } from "./recurring";
import type { Reason, TodayRow } from "./today";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

/** "Nov 20" in the day's year, else "Nov 20, 2027". */
export function shortDate(date: LocalDate, day: LocalDate): string {
  const [y, m, d] = date.split("-").map(Number);
  const md = `${MONTHS[(m ?? 1) - 1] ?? ""} ${d ?? ""}`;
  return date.slice(0, 4) === day.slice(0, 4) ? md : `${md}, ${y ?? ""}`;
}

/** A date as it reads next to the planner day: today, tomorrow, yesterday, a weekday within the next six days, else `shortDate`. */
export function relativeDate(date: LocalDate, day: LocalDate): string {
  const diff = daysBetween(day, date);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff > 1 && diff < 7) return WEEKDAY[weekdayOf(date)] ?? date;
  return shortDate(date, day);
}

/** "Fri, Nov 20" (", 2027" in another year than the planner day) — a resolved date beside a quick-add field. */
export function longDate(date: LocalDate, day: LocalDate): string {
  return `${WEEKDAY[weekdayOf(date)] ?? ""}, ${shortDate(date, day)}`;
}

/** "Tue, Nov 17" — the planner day as Today's header shows it. */
export const dayHeading = (day: LocalDate): string => longDate(day, day);

export type HintTone = "danger" | "warning" | "accent" | "muted";

export interface Hint {
  /** Stable name for tests and styling. */
  kind: "reason" | "rolled" | "deadline" | "do-on" | "done" | "problem" | "repeat" | "next" | "log" | "ack" | "progress" | "created" | "archived";
  text: string;
  tone: HintTone;
}

const REASON_TEXT: Partial<Record<Reason, { text: string; tone: HintTone }>> = {
  overdue: { text: "Overdue", tone: "danger" },
  "due-today": { text: "Due today", tone: "warning" },
};

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "planned 1 day ago", "planned 3 days ago". */
export const rolledOverText = (days: number): string => `planned ${plural(days, "day")} ago`;

/** "Due in 3 days", "Due today", "Overdue" (with its date), "Missed 2×" (since its first missed date), "Ended": where a recurring item stands. */
function phaseHints(state: RecurringState, day: LocalDate): Hint[] {
  switch (state.phase) {
    case "lead":
      return [{ kind: "reason", text: `Due in ${plural(state.dueInDays, "day")}`, tone: "accent" }];
    case "due":
      return [{ kind: "reason", text: "Due today", tone: "warning" }];
    case "missed": {
      const since = state.next === null ? "" : relativeDate(state.next, day);
      return state.missed === 1
        ? [
            { kind: "reason", text: "Overdue", tone: "danger" },
            { kind: "next", text: `due ${since}`, tone: "danger" },
          ]
        : [
            { kind: "reason", text: `Missed ${state.missed}×`, tone: "danger" },
            { kind: "next", text: `since ${since}`, tone: "muted" },
          ];
    }
    case "ended":
      return [{ kind: "reason", text: "Ended", tone: "muted" }];
    case "waiting":
      return state.next === null ? [] : [{ kind: "next", text: `next ${shortDate(state.next, day)}`, tone: "muted" }];
  }
}

/** The rule in words, or why it can't be read. */
function repeatHint(task: Task): Hint[] {
  if (task.repeat === null) return [];
  return task.repeat.kind === "ok" ? [{ kind: "repeat", text: task.repeat.description, tone: "muted" }] : [{ kind: "problem", text: task.repeat.message, tone: "warning" }];
}

const problemHints = (task: Task): Hint[] => (task.problems.length > 0 ? [{ kind: "problem", text: task.problems.join("; "), tone: "warning" }] : []);

/** A recurring item's row outside Today (the Recurring view, All): where it stands, its rule, its next date, its newest log entry. */
export function recurringHints(task: Task, state: RecurringState, day: LocalDate): Hint[] {
  const hints = [...phaseHints(state, day), ...repeatHint(task)];
  // Inside the lead time the chip counts the days; the date itself is worth seeing here too.
  if (state.phase === "lead" && state.next !== null) hints.push({ kind: "next", text: `next ${shortDate(state.next, day)}`, tone: "muted" });
  if (task.lastLog !== null) hints.push({ kind: "log", text: `${task.lastLog.text || "logged"} ${relativeDate(task.lastLog.date, day)}`, tone: "muted" });
  return [...hints, ...problemHints(task)];
}

/** A Today row's hints: why it is there (overdue, due today, planned N days ago, due in N days, missed N×) and its deadline when that isn't the reason; a recurring row's rule; a note's or thought's own. */
export function todayHints(row: TodayRow, day: LocalDate): Hint[] {
  const { task, reason } = row;
  if (task.type === "note" || task.type === "thought") return noteHints(task, day, false);
  if (row.recurring !== null) return [...phaseHints(row.recurring, day), ...repeatHint(task), ...problemHints(task)];
  const hints: Hint[] = [];
  const r = REASON_TEXT[reason];
  if (r) hints.push({ kind: "reason", ...r });
  if (reason === "overdue" && task.deadline !== null) hints.push({ kind: "deadline", text: `due ${relativeDate(task.deadline, day)}`, tone: "danger" });
  if (reason === "rolled-over") hints.push({ kind: "rolled", text: rolledOverText(row.plannedDaysAgo), tone: "muted" });
  if ((reason === "planned" || reason === "rolled-over") && task.deadline !== null) {
    hints.push({ kind: "deadline", text: `due ${relativeDate(task.deadline, day)}`, tone: "muted" });
  }
  if (task.problems.length > 0) hints.push({ kind: "problem", text: task.problems.join("; "), tone: "warning" });
  return hints;
}

/** A daily note's checklist progress ("5/8"), in the accent once every line is ticked. */
export function progressHint(task: Task): Hint[] {
  const text = progressText(task.progress);
  if (text === null || task.progress === null) return [];
  return [{ kind: "progress", text, tone: task.progress.done === task.progress.total ? "accent" : "muted" }];
}

/** How a row titles an item: its `title:` — a daily note without one by its date ("Wed, Nov 18"). */
export function displayTitle(task: Task, day: LocalDate): string {
  return task.type === "daily-note" && !task.titled && task.date !== null ? longDate(task.date, day) : task.title;
}

/** A note's, thought's or daily note's hints: today's note, its progress; the day an open note or thought is planned for (`withDoOn`; Today leaves it out); when it was added, resolved or archived. */
function noteHints(task: Task, day: LocalDate, withDoOn: boolean): Hint[] {
  const hints: Hint[] = [];
  if (task.type === "daily-note") {
    if (task.date === day) hints.push({ kind: "reason", text: "Today", tone: "accent" });
    else if (task.titled && task.date !== null) hints.push({ kind: "created", text: shortDate(task.date, day), tone: "muted" });
    hints.push(...progressHint(task));
  } else if (task.done) hints.push({ kind: "done", text: task.doneOn === null ? "resolved" : `resolved ${relativeDate(task.doneOn, day)}`, tone: "muted" });
  else if (withDoOn && task.doOn !== null) hints.push({ kind: "do-on", text: `do ${relativeDate(task.doOn, day)}`, tone: "muted" });
  else if (task.created !== null) hints.push({ kind: "created", text: `added ${relativeDate(task.created, day)}`, tone: "muted" });
  if (task.archived) hints.push({ kind: "archived", text: "archived", tone: "muted" });
  if (task.problems.length > 0) hints.push({ kind: "problem", text: task.problems.join("; "), tone: "warning" });
  return hints;
}

/** An All row's hints: done day, or its `do-on` and deadline (an open task past its deadline in red); a note's, thought's or daily note's own. */
export function allHints(task: Task, day: LocalDate): Hint[] {
  if (task.type === "note" || task.type === "thought" || task.type === "daily-note") return noteHints(task, day, true);
  const hints: Hint[] = [];
  if (task.done) {
    hints.push({ kind: "done", text: task.doneOn === null ? "done" : `done ${relativeDate(task.doneOn, day)}`, tone: "muted" });
  } else {
    if (task.doOn !== null) hints.push({ kind: "do-on", text: `do ${relativeDate(task.doOn, day)}`, tone: "muted" });
    if (task.deadline !== null) {
      const tone: HintTone = task.deadline < day ? "danger" : task.deadline === day ? "warning" : "muted";
      hints.push({ kind: "deadline", text: `due ${relativeDate(task.deadline, day)}`, tone });
    }
  }
  if (task.archived) hints.push({ kind: "archived", text: "archived", tone: "muted" });
  if (task.problems.length > 0) hints.push({ kind: "problem", text: task.problems.join("; "), tone: "warning" });
  return hints;
}

/** "!3" — importance as a row shows it; `null` when unset. */
export const importanceText = (importance: number | null): string | null => (importance === null ? null : `!${importance}`);
