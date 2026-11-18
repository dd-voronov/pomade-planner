// Editing an item in place (DESIGN §3.6 "The item's compact view"): the file as the form's draft —
// the title, a task's dates and importance, a recurring item's rule in the repeat editor, Details —
// and what a changed draft writes back: field-only writes for the fields, the body for Details.
//
// Details is the body without what the view shows apart or never shows: the white space at its
// end, and a recurring item's `## Log` section when it is the body's last. Both stay in the file
// byte for byte whatever is typed above them.

import type { LocalDate, Schedule, Time } from "pomade-kit/schedule";

import { normalizeTitle } from "../../core/text";
import { checkDraft, type DraftCheck, type ItemDraft } from "./item-draft";
import { FIELD, type Task } from "./items";
import { doOnAfterRuleChange, readLog, trailingLogStart, type LogEntry } from "./recurring";
import { DEFAULT_DRAFT, draftOfSchedule, sameSchedule } from "./repeat-draft";
import type { FieldWrite } from "./tick";

export interface BodyParts {
  /** The body's text as Details shows it: line breaks as `\n`, nothing after its last character. */
  details: string;
  /** The white space between the text and what follows it (the log, or the body's end), as in the file. */
  gap: string;
  /** A recurring item's `## Log` section, as in the file; `null`: none, or other text follows it. */
  log: string | null;
  eol: "\n" | "\r\n";
}

export function bodyParts(body: string, recurring: boolean): BodyParts {
  const eol = body.includes("\r\n") ? "\r\n" : "\n";
  const logAt = recurring ? trailingLogStart(body) : -1;
  const above = logAt < 0 ? body : body.slice(0, logAt);
  const text = above.trimEnd();
  return { details: text.replaceAll("\r\n", "\n"), gap: above.slice(text.length), log: logAt < 0 ? null : body.slice(logAt), eol };
}

/** Details as typed, as the view compares and writes it: nothing after its last character. */
const typedDetails = (details: string): string => details.replaceAll("\r\n", "\n").trimEnd();

/**
 * The body with `details` typed over `parts`' text: the text with the file's line endings, then
 * the gap the file had — for other text over none or over no gap, one line break (a blank line
 * before a log) — then the log. No text: the log alone, or nothing.
 */
export function bodyWith(parts: BodyParts, details: string): string {
  const text = typedDetails(details);
  const { eol, log } = parts;
  if (text === "") return log ?? "";
  const gap = text === parts.details || (parts.details !== "" && parts.gap !== "") ? parts.gap : log === null ? eol : `${eol}${eol}`;
  return `${text.replaceAll("\n", eol)}${gap}${log ?? ""}`;
}

/** The entries of the log the view shows under Details, in file order. */
export const logEntries = (parts: BodyParts): LogEntry[] => (parts.log === null ? [] : readLog(parts.log));

/** A file's version as the view holds it: its fields (the folder read) and its body. */
export interface ItemFile {
  task: Task;
  parts: BodyParts;
  /** The rule as the repeat editor's draft; `false`: the item has none the editor can hold. */
  repeatEditable: boolean;
  /** What the form shows for this version, nothing typed. */
  draft: ItemDraft;
}

/** The file as the form's draft: dates as `YYYY-MM-DD`, a title only when the file has one. */
export function itemFile(task: Task, body: string, now: Date, boundary: Time): ItemFile {
  const parts = bodyParts(body, task.type === "recurring");
  const repeat = task.repeat?.kind === "ok" ? draftOfSchedule(task.repeat.schedule, now, boundary) : null;
  return {
    task,
    parts,
    repeatEditable: repeat !== null,
    draft: {
      kind: task.type,
      title: task.titled ? task.title : "",
      project: null,
      doOn: task.doOn ?? "",
      deadline: task.deadline ?? "",
      importance: task.importance === null ? "" : String(task.importance),
      repeat: repeat ?? DEFAULT_DRAFT,
      details: parts.details,
    },
  };
}

type TextField = "title" | "doOn" | "deadline" | "importance";
const TEXT_FIELDS: readonly TextField[] = ["title", "doOn", "deadline", "importance"];
const REPEAT_FIELDS = ["mode", "count", "unit", "on", "lead", "start", "end"] as const;

const sameRepeatText = (a: ItemDraft, b: ItemDraft): boolean => REPEAT_FIELDS.every((f) => a.repeat[f] === b.repeat[f]);

/** Whether `draft` holds something typed that `file` doesn't: a field's text, the rule, Details. */
export function isDirty(draft: ItemDraft, file: ItemFile): boolean {
  return TEXT_FIELDS.some((f) => draft[f] !== file.draft[f]) || !sameRepeatText(draft, file.draft) || detailsChanged(draft, file);
}

export const detailsChanged = (draft: ItemDraft, file: ItemFile): boolean => typedDetails(draft.details) !== file.parts.details;

/** What the fields of a draft write over `file`; nothing for a field whose text isn't a value, or is the file's. */
export interface ItemEdit {
  fields: FieldWrite[];
  /** The rule to write in the `repeat:` block's place. */
  repeat: Schedule | null;
}

const dateWrite = (key: string, field: DraftCheck["doOn"], current: LocalDate | null): FieldWrite[] => {
  if (field.kind === "error") return [];
  const next = field.kind === "date" ? field.date : null;
  return next === current ? [] : [{ key, value: next }];
};

/**
 * The field-only writes that bring `file` to `draft` (`check`: what its fields come to now, on
 * planner day `check.day`). A title is written when it isn't empty; a task's dates and importance
 * when they changed (emptied: the key is removed); a recurring item's rule when the editor holds
 * it and it changed — with the `do-on` the new rule gives (`doOnAfterRuleChange`).
 */
export function itemEdit(file: ItemFile, draft: ItemDraft, check: DraftCheck): ItemEdit {
  const { task } = file;
  const fields: FieldWrite[] = [];
  const title = normalizeTitle(draft.title);
  if (title !== "" && !(task.titled && title === task.title)) fields.push({ key: FIELD.title, value: title });
  if (task.type === "task") {
    fields.push(...dateWrite(FIELD.doOn, check.doOn, task.doOn), ...dateWrite(FIELD.deadline, check.deadline, task.deadline));
    if (check.importance.kind !== "error") {
      const next = check.importance.kind === "number" ? check.importance.value : null;
      if (next !== task.importance) fields.push({ key: FIELD.importance, value: next });
    }
  }
  let repeat: Schedule | null = null;
  if (task.type === "recurring" && file.repeatEditable && task.repeat?.kind === "ok" && check.repeat.kind === "ok" && !sameSchedule(check.repeat.schedule, task.repeat.schedule)) {
    repeat = check.repeat.schedule;
    const doOn = doOnAfterRuleChange(task, repeat, check.day);
    if (doOn !== task.doOn) fields.push({ key: FIELD.doOn, value: doOn });
  }
  return { fields, repeat };
}

export const isEmptyEdit = (edit: ItemEdit): boolean => edit.fields.length === 0 && edit.repeat === null;

/**
 * `draft` once `file` is the version shown: every field whose text comes to the file's value reads
 * as the file writes it (`fri` → `2026-11-20`), an emptied title is the file's again; text that
 * isn't a value yet, and Details, stay as typed.
 */
export function settleDraft(draft: ItemDraft, file: ItemFile, now: Date, boundary: Time): ItemDraft {
  const check = checkDraft(draft, now, boundary);
  const edit = itemEdit(file, draft, check);
  const written = new Set(edit.fields.map((w) => w.key));
  const keep = (key: string, field: { kind: string }): boolean => field.kind === "error" || written.has(key);
  return {
    ...draft,
    title: written.has(FIELD.title) ? draft.title : file.draft.title,
    doOn: keep(FIELD.doOn, check.doOn) ? draft.doOn : file.draft.doOn,
    deadline: keep(FIELD.deadline, check.deadline) ? draft.deadline : file.draft.deadline,
    importance: keep(FIELD.importance, check.importance) ? draft.importance : file.draft.importance,
    repeat: file.repeatEditable && (check.repeat.kind === "error" || edit.repeat !== null) ? draft.repeat : file.draft.repeat,
  };
}
