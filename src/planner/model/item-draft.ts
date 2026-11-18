// An item's fields as the form holds them (DESIGN §3.7): the type, the title, the project, a
// task's date phrases and importance, a recurring item's repeat editor, Details — and what they
// come to: each field's value or problem, and the item to write.

import type { LocalDate, Time } from "pomade-kit/schedule";

import { normalizeTitle } from "../../core/text";
import { detailsBody, parseImportance, resolveDateField, type DateField, type ImportanceField, type NewTask } from "./create";
import { DEFAULT_DRAFT, resolveDraft, type DraftResult, type RepeatDraft } from "./repeat-draft";
import { plannerDay } from "./today";

export type ItemKind = "task" | "recurring" | "note" | "thought" | "daily-note";

/** The types in the order the switch shows and walks them. */
export const ITEM_KINDS: readonly ItemKind[] = ["task", "recurring", "note", "thought", "daily-note"];

/** The type `by` steps along the switch from `kind`, round at both ends. */
export function stepKind(kind: ItemKind, by: 1 | -1): ItemKind {
  const at = ITEM_KINDS.indexOf(kind);
  return ITEM_KINDS[(at + by + ITEM_KINDS.length) % ITEM_KINDS.length] ?? kind;
}

/** Every type but the daily note (the day's own file, made from its template) takes Details. */
export const hasDetails = (kind: ItemKind): boolean => kind !== "daily-note";

export interface ItemDraft {
  kind: ItemKind;
  title: string;
  /** A Pomade project's id; `null`: no project. */
  project: string | null;
  /** Date phrases, as typed. */
  doOn: string;
  deadline: string;
  importance: string;
  repeat: RepeatDraft;
  /** The file's body, as typed. */
  details: string;
}

export function newDraft(start: { kind?: ItemKind; project?: string | null; doOn?: string } = {}): ItemDraft {
  return { kind: start.kind ?? "task", title: "", project: start.project ?? null, doOn: start.doOn ?? "", deadline: "", importance: "", repeat: DEFAULT_DRAFT, details: "" };
}

/** What the typed fields come to at `now`: shown beside them as they are typed. */
export interface DraftCheck {
  /** The planner day the phrases count from. */
  day: LocalDate;
  doOn: DateField;
  deadline: DateField;
  importance: ImportanceField;
  repeat: DraftResult;
  /** The day the repeat editor's "On" falls back to: its start date, else `day`. */
  repeatAnchor: LocalDate;
}

export function checkDraft(draft: ItemDraft, now: Date, boundary: Time): DraftCheck {
  const day = plannerDay(now, boundary);
  const start = resolveDateField(draft.repeat.start, now, boundary);
  return {
    day,
    doOn: resolveDateField(draft.doOn, now, boundary),
    deadline: resolveDateField(draft.deadline, now, boundary),
    importance: parseImportance(draft.importance),
    repeat: resolveDraft(draft.repeat, now, boundary),
    repeatAnchor: start.kind === "date" ? start.date : day,
  };
}

export type DraftItem =
  | { kind: "ok"; item: NewTask }
  /** Nothing to write yet: the title is empty (`field: "title"`), or a field of the type is marked. */
  | { kind: "error"; field: "title" | "fields"; message: string };

/**
 * The item a draft of a file type (not a daily note) writes on `created`: the fields of its type
 * only — a note or thought carries no dates whatever was typed while it was a task.
 */
export function draftItem(draft: ItemDraft, check: DraftCheck, created: LocalDate): DraftItem {
  const title = normalizeTitle(draft.title);
  if (title === "") return { kind: "error", field: "title", message: `Give the ${draft.kind === "recurring" ? "task" : draft.kind} a title.` };
  const common = { title, created, body: detailsBody(draft.details) };
  if (draft.kind === "recurring") {
    if (check.repeat.kind === "error") return { kind: "error", field: "fields", message: "Fix the marked field first." };
    return { kind: "ok", item: { ...common, type: "recurring", doOn: check.repeat.doOn, deadline: null, importance: null, repeat: check.repeat.schedule } };
  }
  if (draft.kind === "task") {
    if (check.doOn.kind === "error" || check.deadline.kind === "error" || check.importance.kind === "error") return { kind: "error", field: "fields", message: "Fix the marked field first." };
    return {
      kind: "ok",
      item: {
        ...common,
        type: "task",
        doOn: check.doOn.kind === "date" ? check.doOn.date : null,
        deadline: check.deadline.kind === "date" ? check.deadline.date : null,
        importance: check.importance.kind === "number" ? check.importance.value : null,
      },
    };
  }
  return { kind: "ok", item: { ...common, type: draft.kind === "thought" ? "thought" : "note", doOn: null, deadline: null, importance: null } };
}
