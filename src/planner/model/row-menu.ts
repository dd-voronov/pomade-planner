// A row's own actions and its right-click menu ([[views]] "Rows"): which actions a row offers for
// its type and state, the words they carry, and the menu built from them — Open in tab, the pin,
// the row's actions, then Delete… set apart and last. The row's buttons and its menu read the same
// list, so the menu never offers what the row doesn't.

import type { Task } from "./items";

/** A row's action besides pinning. */
export type RowActionId = "skip" | "resolve" | "reopen" | "archive" | "restore";

/** Each action's words: its label, its accessible name before the title when it differs, its tooltip. */
export const ROW_ACTIONS: Record<RowActionId, { label: string; ariaLabel?: string; title: string }> = {
  skip: { label: "Skip", ariaLabel: "Skip this time", title: "Skip this time — logs “skipped” and moves to the next date" },
  resolve: { label: "Resolve", title: "Mark it resolved — status: resolved, done-on today" },
  reopen: { label: "Reopen", title: "Set it open again" },
  archive: { label: "Archive", title: "Move it into _archive/ — All shows it with “Show archived”" },
  restore: { label: "Restore", title: "Move it back out of _archive/" },
};

/**
 * A readable row's actions, in order: an archived item's Restore; a recurring item's Skip (not
 * while `locked` — its rule can't be read, it ended, a write is under way); a note's Archive; a
 * thought's Resolve, or Reopen once `done` (resolved, as the row shows it). A task and a daily note
 * have none.
 */
export function rowActionIds(task: Pick<Task, "type" | "archived" | "repeat">, done: boolean, locked = false): RowActionId[] {
  if (task.archived) return ["restore"];
  if (task.repeat !== null) return locked ? [] : ["skip"];
  if (task.type === "note") return ["archive"];
  if (task.type === "thought") return done ? ["reopen"] : ["resolve"];
  return [];
}

/** An entry of a row's menu. */
export type RowMenuEntry = "open-tab" | "pin" | "unpin" | "unpin-today" | RowActionId | "delete";

/** The row's pin as the menu offers it: pinned or not on this view, the daily note's card (unpinned for the day), or no pin. */
export type RowMenuPin = "pinned" | "unpinned" | "card" | null;

const PIN_ENTRY: Record<Exclude<RowMenuPin, null>, RowMenuEntry> = { pinned: "unpin", unpinned: "pin", card: "unpin-today" };

/** A row's menu: Open in tab, its pin, its actions, then Delete… — set apart by a separator before it. */
export function rowMenuEntries(actions: readonly RowActionId[], pin: RowMenuPin): RowMenuEntry[] {
  return ["open-tab", ...(pin === null ? [] : [PIN_ENTRY[pin]]), ...actions, "delete"];
}

/** Each entry's label: the words the row's own buttons use. */
export const ROW_MENU_LABELS: Record<RowMenuEntry, string> = {
  "open-tab": "Open in tab",
  pin: "Pin",
  unpin: "Unpin",
  "unpin-today": "Unpin for today",
  skip: ROW_ACTIONS.skip.label,
  resolve: ROW_ACTIONS.resolve.label,
  reopen: ROW_ACTIONS.reopen.label,
  archive: ROW_ACTIONS.archive.label,
  restore: ROW_ACTIONS.restore.label,
  delete: "Delete…",
};
