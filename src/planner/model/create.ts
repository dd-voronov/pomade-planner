// Quick add ([[quick-add]]): the fields as typed — date phrases resolved against the planner day,
// importance as a number — and the new item's file: `<created>-<slug>.md` in the tasks root (a
// taken name becomes `-2`, `-3`, …), its frontmatter in the order of [[storage-and-item-types]] "Writing an item". A recurring item carries
// its `repeat:` block as `pomade-kit` formats it; a note or a thought takes a `do-on` alone. Details
// are the file's body, as typed.

import { parseDatePhrase } from "pomade-kit/dates";
import { joinPath } from "pomade-kit/protocol";
import { formatSchedule, type LocalDate, type Schedule, type Time } from "pomade-kit/schedule";

import { slugify, yamlString } from "../../core/text";
import { FIELD, STATUS } from "./items";

export type DateField =
  | { kind: "empty" }
  | { kind: "date"; date: LocalDate }
  /** The text isn't a date; `message` says why. */
  | { kind: "error"; message: string };

/** A date field's text: empty, a date (a phrase resolved against the planner day; a phrase with a time keeps its day), or why it isn't one. */
export function resolveDateField(text: string, now: Date, boundary: Time): DateField {
  if (text.trim() === "") return { kind: "empty" };
  const r = parseDatePhrase(text, { now, dayBoundary: boundary });
  switch (r.kind) {
    case "date":
    case "date-time":
      return { kind: "date", date: r.date };
    case "invalid":
      return { kind: "error", message: r.message };
    case "not-a-date":
      return { kind: "error", message: "Not a date — try fri, tomorrow, +3d, nov 20" };
  }
}

export type ImportanceField = { kind: "empty" } | { kind: "number"; value: number } | { kind: "error"; message: string };

/** The importance field's text: empty, or a number (higher = more important). */
export function parseImportance(text: string): ImportanceField {
  const t = text.trim();
  if (t === "") return { kind: "empty" };
  if (/^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(t)) return { kind: "number", value: Number(t) };
  return { kind: "error", message: "A number — higher is more important" };
}

/** The slug of a title with nothing to slug. */
const FALLBACK_SLUG = "task";

/** `<created>-<slug>.md`, with `-<n>` before `.md` for the `n`th try (n ≥ 2). */
export function taskFileName(created: LocalDate, title: string, n = 1): string {
  const slug = slugify(title) || FALLBACK_SLUG;
  return `${created}-${slug}${n > 1 ? `-${n}` : ""}.md`;
}

export const taskFilePath = (root: string, created: LocalDate, title: string, n = 1): string => joinPath(root, taskFileName(created, title, n));

/** What quick add creates as a file of its own (a daily note is the day's, daily.ts). */
export type NewItemType = "task" | "recurring" | "note" | "thought";

export interface NewTask {
  /** `task` (the default) or `recurring` (with `repeat`), `note` or `thought` (a `do-on` alone: no deadline, no importance). */
  type?: NewItemType;
  /** Normalized, non-empty. */
  title: string;
  doOn: LocalDate | null;
  deadline: LocalDate | null;
  importance: number | null;
  /** The planner day it was added on. */
  created: LocalDate;
  /** A recurring item's rule (its `do-on` is the first occurrence); absent for a task. */
  repeat?: Schedule;
  /** The file's body (`detailsBody`); absent or empty: none. */
  body?: string;
}

/**
 * Details as the file's body: the text as typed, markdown and all, closed with a line break when
 * it has none (a recurring item's `## Log` then follows it); only white space is no body.
 */
export function detailsBody(details: string): string {
  if (details.trim() === "") return "";
  return details.endsWith("\n") ? details : `${details}\n`;
}

/** A new item's text: `type`, `title`, `status`, the dates and importance that are set (a note's or thought's `do-on` alone), a recurring item's `repeat:`, `created`; then its body. */
export function newTaskContent(t: NewTask): string {
  const type = t.type ?? (t.repeat === undefined ? "task" : "recurring");
  const lines = [`${FIELD.type}: ${type}`, `${FIELD.title}: ${yamlString(t.title)}`, `${FIELD.status}: ${STATUS.open}`];
  if (type === "task" || type === "recurring") {
    if (t.doOn !== null) lines.push(`${FIELD.doOn}: ${t.doOn}`);
    if (t.deadline !== null) lines.push(`${FIELD.deadline}: ${t.deadline}`);
    if (t.importance !== null) lines.push(`${FIELD.importance}: ${t.importance}`);
    if (t.repeat !== undefined) lines.push(formatSchedule(FIELD.repeat, t.repeat));
  } else if (t.doOn !== null) lines.push(`${FIELD.doOn}: ${t.doOn}`);
  lines.push(`${FIELD.created}: ${t.created}`);
  return `---\n${lines.join("\n")}\n---\n${t.body ?? ""}`;
}
