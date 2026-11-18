// Quick add's repeat editor (DESIGN §3.7): "Every [1] [month] on [5]" or "[3] [months] after done",
// lead time in days, start and end as date phrases — turned into a `pomade-kit` schedule, checked
// by the kit (its own readable errors), described in its plain words, with the first `do-on`.
//
// The editor writes only what the kit's format holds: every day, every week on some weekdays,
// every 1, 2, 3, 4, 6 or 12 months on some days of the month (more than one month apart = a
// `months:` list starting at the start month, else this month), or N days, weeks or months after
// completion. "On" left empty takes the start date's (else today's) weekday or day of the month.

import { describeSchedule, parseSchedule, weekdayOf, type LocalDate, type Schedule, type Time } from "pomade-kit/schedule";

import { resolveDateField } from "./create";
import { firstDoOn } from "./recurring";
import { plannerDay } from "./today";

export type RepeatMode = "every" | "after";
export type RepeatUnit = "day" | "week" | "month";

export interface RepeatDraft {
  mode: RepeatMode;
  /** "Every [count] [unit]" / "[count] [unit] after done", as typed. */
  count: string;
  unit: RepeatUnit;
  /** Weekdays (`mon, thu`) or days of the month (`5`, `1, 15`, `last`, `first mon`), as typed. */
  on: string;
  /** Days early, as typed; empty = 0. */
  lead: string;
  /** Date phrases. */
  start: string;
  end: string;
  /** The month (1–12) a rule more than one month apart counts from; absent: the start's, else this month. */
  phase?: number;
}

export const DEFAULT_DRAFT: RepeatDraft = { mode: "every", count: "1", unit: "month", on: "", lead: "", start: "", end: "" };

/** Which part of the editor a problem belongs to. */
export type DraftField = "count" | "on" | "lead" | "start" | "end";

export type DraftResult =
  | { kind: "ok"; schedule: Schedule; description: string; doOn: LocalDate }
  | { kind: "error"; field: DraftField; message: string };

/** Month steps a `months:` list can hold. */
const MONTH_STEPS = [1, 2, 3, 4, 6, 12];

/** What "On" means when left empty: the anchor's weekday (`wed`) or day of the month (`18`). */
export function defaultOn(unit: RepeatUnit, anchor: LocalDate): string {
  if (unit === "week") return weekdayOf(anchor);
  if (unit === "month") return String(Number(anchor.slice(8, 10)));
  return "";
}

const splitList = (text: string, separators: RegExp): string[] =>
  text
    .split(separators)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t !== "");

/** `months:` every `step` months from the month `first`, as month numbers in calendar order. */
function monthsEvery(step: number, first: number): number[] {
  const months: number[] = [];
  for (let m = 0; m < 12; m += step) months.push(((first - 1 + m) % 12) + 1);
  return months.sort((a, b) => a - b);
}

function fieldOf(path: string): DraftField {
  if (path.startsWith("lead-days")) return "lead";
  if (path.startsWith("start")) return "start";
  if (path.startsWith("end")) return "end";
  if (/\.(days|months)\b/.test(path)) return "on";
  return "count";
}

type DraftSchedule = { kind: "ok"; schedule: Schedule } | Extract<DraftResult, { kind: "error" }>;

/** The draft as a schedule on the planner day of `now`, or the first problem. */
function scheduleOfDraft(draft: RepeatDraft, now: Date, boundary: Time): DraftSchedule {
  const day = plannerDay(now, boundary);
  const start = resolveDateField(draft.start, now, boundary);
  if (start.kind === "error") return { kind: "error", field: "start", message: start.message };
  const end = resolveDateField(draft.end, now, boundary);
  if (end.kind === "error") return { kind: "error", field: "end", message: end.message };
  const countText = draft.count.trim();
  if (!/^\d+$/.test(countText) || Number(countText) < 1) return { kind: "error", field: "count", message: "How often: a whole number, 1 or more" };
  const count = Number(countText);
  const anchor = start.kind === "date" ? start.date : day;

  let value: Record<string, unknown>;
  if (draft.mode === "after") {
    value = { "after-completion": { [`${draft.unit}s`]: count } };
  } else if (draft.unit === "day") {
    if (count !== 1) return { kind: "error", field: "count", message: "Fixed dates come every day — for every few days, choose “after done”" };
    value = { daily: {} };
  } else if (draft.unit === "week") {
    if (count !== 1) return { kind: "error", field: "count", message: "Fixed weekdays come every week — for every few weeks, choose “after done”" };
    const days = splitList(draft.on, /[\s,]+/);
    value = { weekly: { days: days.length > 0 ? days : [defaultOn("week", anchor)] } };
  } else {
    if (!MONTH_STEPS.includes(count)) return { kind: "error", field: "count", message: "Every 1, 2, 3, 4, 6 or 12 months" };
    const days = splitList(draft.on, /,/).map((d) => (/^\d+$/.test(d) ? Number(d) : d));
    const monthly: Record<string, unknown> = { days: days.length > 0 ? days : [Number(defaultOn("month", anchor))] };
    if (count > 1) monthly.months = monthsEvery(count, draft.phase ?? Number(anchor.slice(5, 7)));
    value = { monthly };
  }
  const lead = draft.lead.trim();
  if (lead !== "") value["lead-days"] = /^\d+$/.test(lead) ? Number(lead) : lead;
  if (start.kind === "date") value.start = start.date;
  if (end.kind === "date") value.end = end.date;

  const parsed = parseSchedule(value, { resolution: "day" });
  if (!parsed.ok) {
    const first = parsed.errors[0];
    return { kind: "error", field: fieldOf(first?.field ?? ""), message: first?.message ?? "Not a schedule" };
  }
  return { kind: "ok", schedule: parsed.schedule };
}

/** The draft as a schedule, its description and first `do-on` on the planner day of `now`; or the first problem. */
export function resolveDraft(draft: RepeatDraft, now: Date, boundary: Time): DraftResult {
  const made = scheduleOfDraft(draft, now, boundary);
  if (made.kind === "error") return made;
  const doOn = firstDoOn(made.schedule, plannerDay(now, boundary));
  if (doOn === null) return { kind: "error", field: made.schedule.end !== null ? "end" : "start", message: "No date from today on — check start and end" };
  return { kind: "ok", schedule: made.schedule, description: describeSchedule(made.schedule), doOn };
}

export const sameSchedule = (a: Schedule, b: Schedule): boolean => JSON.stringify(a) === JSON.stringify(b);

const NTH_WORDS: Record<string, string> = { 1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth", last: "last" };

/** A schedule's shape as the editor's fields, before it is checked to read back as the same schedule. */
function draftShape(s: Schedule): Pick<RepeatDraft, "mode" | "count" | "unit" | "on" | "phase"> | null {
  const { rule } = s;
  switch (rule.kind) {
    case "daily":
      return { mode: "every", count: "1", unit: "day", on: "" };
    case "weekly":
      return { mode: "every", count: "1", unit: "week", on: rule.days.join(", ") };
    case "monthly": {
      const on = rule.days.map((d) => (typeof d === "object" ? `${NTH_WORDS[String(d.nth)] ?? ""} ${d.weekday}` : String(d))).join(", ");
      if (rule.months === null) return { mode: "every", count: "1", unit: "month", on };
      const first = rule.months[0];
      if (first === undefined || 12 % rule.months.length !== 0) return null;
      return { mode: "every", count: String(12 / rule.months.length), unit: "month", on, phase: first };
    }
    case "after-completion":
      return { mode: "after", count: String(rule.count), unit: rule.unit === "days" ? "day" : rule.unit === "weeks" ? "week" : "month", on: "" };
    case "once":
    case "every":
    case "always":
      return null;
  }
}

/**
 * A schedule as the editor's draft — `null` when the editor can't hold it (a single date, a
 * weekday filter, months that aren't evenly apart): the draft is one only when it reads back as
 * the very same schedule.
 */
export function draftOfSchedule(schedule: Schedule, now: Date, boundary: Time): RepeatDraft | null {
  const shape = draftShape(schedule);
  if (shape === null) return null;
  const draft: RepeatDraft = { ...shape, lead: schedule.leadDays === 0 ? "" : String(schedule.leadDays), start: schedule.start ?? "", end: schedule.end ?? "" };
  const back = scheduleOfDraft(draft, now, boundary);
  return back.kind === "ok" && sameSchedule(back.schedule, schedule) ? draft : null;
}
