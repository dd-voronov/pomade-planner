// Recurring items (DESIGN §3.2, §3.4): the `repeat:` rule in `pomade-kit`'s schedule format, the
// `## Log` section of the body, and — relative to the planner day — where an item stands: waiting
// for its lead time, inside it, due, missed, or ended. Pure; the Today module and the views call it.
//
// - `do-on` is the next occurrence. A missing or unreadable `do-on` is derived: the occurrence
//   after the newest log entry, else the first on or after `start` (else `created`, else today);
//   for an after-completion rule, the newest log entry plus the period, else `start`, `created` or
//   today.
// - Ended: `end` has passed, or there is no next occurrence (`do-on` past `end`, a `once` done).
// - Done and skip advance `do-on`: a fixed rule to its first date after the later of `do-on` and
//   today — so a missed run jumps to the next future occurrence, logged once; an after-completion
//   rule to today plus the period. `end` doesn't stop the advance: a next date past `end` is
//   written and reads as ended.

import { daysBetween, datesBetween, describeSchedule, formatScheduleError, isLocalDate, leadStart, nextDate, parseSchedule, type LocalDate, type Schedule } from "pomade-kit/schedule";

/** The `repeat:` rule as read: a schedule, or the kit's readable errors. */
export type Repeat = { kind: "ok"; schedule: Schedule; description: string } | { kind: "error"; message: string };

export const REPEAT_KEY = "repeat";

export function readRepeat(value: unknown): Repeat {
  const r = parseSchedule(value, { resolution: "day" });
  if (!r.ok) return { kind: "error", message: r.errors.map((e) => formatScheduleError(REPEAT_KEY, e)).join("; ") };
  return { kind: "ok", schedule: r.schedule, description: describeSchedule(r.schedule) };
}

export type LogWord = "done" | "skipped";

/** One `## Log` line: `- <date> <words>`. */
export interface LogEntry {
  date: LocalDate;
  /** The words after the date (`done`, `skipped`, or whatever was written by hand). */
  text: string;
}

const HEADING = /^##\s+Log\s*$/i;
const ANY_HEADING = /^#{1,2}\s/;
const ENTRY = /^\s*[-*]\s+(\d{4}-\d{2}-\d{2})\b\s*(.*?)\s*$/;

/** The entries of the body's `## Log` section, in file order. */
export function readLog(body: string): LogEntry[] {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => HEADING.test(l));
  if (start < 0) return [];
  const entries: LogEntry[] = [];
  for (const line of lines.slice(start + 1)) {
    if (ANY_HEADING.test(line)) break;
    const m = ENTRY.exec(line);
    if (m && isLocalDate(m[1] ?? "")) entries.push({ date: m[1] ?? "", text: m[2] ?? "" });
  }
  return entries;
}

/**
 * Where the body's `## Log` section starts (the offset of its heading's line) when the section is
 * the body's last one; -1 when there is none, or another heading follows it.
 */
export function trailingLogStart(body: string): number {
  let offset = 0;
  let at = -1;
  for (const line of body.split("\n")) {
    const text = line.replace(/\r$/, "");
    if (at >= 0 && ANY_HEADING.test(text)) return -1;
    if (at < 0 && HEADING.test(text)) at = offset;
    offset += line.length + 1;
  }
  return at;
}

/** The newest entry: the latest date, the first written of a day's entries. */
export function newestLog(entries: readonly LogEntry[]): LogEntry | null {
  let best: LogEntry | null = null;
  for (const e of entries) if (best === null || e.date > best.date) best = e;
  return best;
}

/**
 * The body with `- <date> <word>` as the newest entry of `## Log`: the section's first line (newest
 * first), right after the heading and any blank lines under it when a list follows. A body without
 * the section gets it at the end, one blank line before it. Every other byte stays; the body's line
 * ending is kept.
 */
export function appendLog(body: string, date: LocalDate, word: LogWord): string {
  const eol = body.includes("\r\n") ? "\r\n" : "\n";
  const entry = `- ${date} ${word}`;
  const lines = body.split(eol);
  const at = lines.findIndex((l) => HEADING.test(l));
  if (at >= 0) {
    let i = at + 1;
    while (i < lines.length && (lines[i] ?? "").trim() === "") i++;
    const insertAt = i < lines.length && ENTRY.test(lines[i] ?? "") ? i : at + 1;
    // A heading on the body's last line without a line break gets one.
    if (insertAt === lines.length) return `${body}${eol}${entry}${eol}`;
    return [...lines.slice(0, insertAt), entry, ...lines.slice(insertAt)].join(eol);
  }
  const section = `## Log${eol}${entry}${eol}`;
  if (body === "") return `${eol}${section}`;
  if (body.endsWith(`${eol}${eol}`)) return `${body}${section}`;
  if (body.endsWith(eol)) return `${body}${eol}${section}`;
  return `${body}${eol}${eol}${section}`;
}

/** What a recurring item carries for these rules. */
export interface RecurringFields {
  doOn: LocalDate | null;
  created: LocalDate | null;
  /** `null` reads as a rule that can't be read. */
  repeat: Repeat | null;
  lastLog: LogEntry | null;
}

const isAfterCompletion = (s: Schedule): boolean => s.rule.kind === "after-completion";

/** The schedule without `end`: where the rule would go next, ended or not. */
const unbounded = (s: Schedule): Schedule => ({ ...s, end: null });

const later = (a: LocalDate, b: LocalDate): LocalDate => (a > b ? a : b);

/** The next occurrence: `do-on`, or derived when it is missing (module comment). `null`: none. */
export function nextOccurrenceOf(item: RecurringFields, day: LocalDate): LocalDate | null {
  if (item.doOn !== null) return item.doOn;
  if (item.repeat?.kind !== "ok") return null;
  const s = item.repeat.schedule;
  const s0 = unbounded(s);
  if (isAfterCompletion(s)) {
    if (item.lastLog !== null) return nextDate(s0, item.lastLog.date);
    return s.start ?? item.created ?? day;
  }
  if (item.lastLog !== null) return nextDate(s0, item.lastLog.date);
  return nextDate(s0, s.start ?? item.created ?? day, { inclusive: true });
}

export type Phase =
  /** Before its lead time: only in the Recurring view. */
  | "waiting"
  /** Inside its lead time: in Today, "due in N days". */
  | "lead"
  /** Due today. */
  | "due"
  /** `do-on` has passed: one row, "missed N×". */
  | "missed"
  | "ended";

export interface RecurringState {
  phase: Phase;
  /** The next occurrence (`null` when there is none). */
  next: LocalDate | null;
  /** Days until `next` (lead), else 0. */
  dueInDays: number;
  /** Missed occurrences: `do-on` and every occurrence after it up to today (≥ 1 when missed), else 0. */
  missed: number;
}

/**
 * Where a recurring item stands on `day`. A rule that can't be read keeps its `do-on`: due on and
 * after it (missed once), never in a lead time; without a `do-on` it only waits.
 */
export function recurringState(item: RecurringFields, day: LocalDate): RecurringState {
  const next = nextOccurrenceOf(item, day);
  const schedule = item.repeat?.kind === "ok" ? item.repeat.schedule : null;
  const end = schedule?.end ?? null;
  if (schedule === null && next === null) return { phase: "waiting", next, dueInDays: 0, missed: 0 };
  if (next === null || (end !== null && (end < day || next > end))) return { phase: "ended", next, dueInDays: 0, missed: 0 };
  if (next === day) return { phase: "due", next, dueInDays: 0, missed: 0 };
  if (next < day) {
    const later = schedule === null ? [] : datesBetween(schedule, next, day);
    return { phase: "missed", next, dueInDays: 0, missed: 1 + later.length };
  }
  if (schedule !== null && leadStart(schedule, next) <= day) return { phase: "lead", next, dueInDays: daysBetween(day, next), missed: 0 };
  return { phase: "waiting", next, dueInDays: daysBetween(day, next), missed: 0 };
}

/** Whether a recurring item is in Today on `day`. */
export const inToday = (state: RecurringState): boolean => state.phase === "lead" || state.phase === "due" || state.phase === "missed";

/**
 * The `do-on` that done or skip on `day` writes (module comment); `null` when the rule has no
 * further date at all (a `once`) — the key is then removed and the item reads as ended.
 */
export function advancedDoOn(item: RecurringFields, schedule: Schedule, day: LocalDate): LocalDate | null {
  const s0 = unbounded(schedule);
  if (isAfterCompletion(schedule)) return nextDate(s0, day);
  const current = nextOccurrenceOf(item, day);
  return nextDate(s0, current === null ? day : later(current, day));
}

/**
 * The `do-on` of an item whose rule became `schedule` on `day`: a fixed rule's first date on or
 * after the earlier of its `do-on` and today — a run still open stays open, a future one moves to
 * the new rule's next date; after completion, the newest log entry plus the period, else as a new
 * item made on its `created` day. `null`: the rule has no such date.
 */
export function doOnAfterRuleChange(item: RecurringFields, schedule: Schedule, day: LocalDate): LocalDate | null {
  const s0 = unbounded(schedule);
  if (isAfterCompletion(schedule)) return item.lastLog !== null ? nextDate(s0, item.lastLog.date) : firstDoOn(s0, item.created ?? day);
  return nextDate(s0, item.doOn !== null && item.doOn < day ? item.doOn : day, { inclusive: true });
}

/** The first `do-on` of a new item made on `day`: a fixed rule's first date on or after today (and `start`); after completion, `start` (today when it has passed), else today plus the period. */
export function firstDoOn(schedule: Schedule, day: LocalDate): LocalDate | null {
  if (isAfterCompletion(schedule)) return schedule.start !== null ? later(schedule.start, day) : nextDate(schedule, day);
  return nextDate(schedule, day, { inclusive: true });
}
