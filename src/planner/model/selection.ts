// All's select mode (DESIGN §3.6 "Trimming"): which rows are selected, the confirmation a delete
// shows, and what the Host API's per-file answers mean for the rows. The selection is always a
// subset of the rows All shows — a filter that hides a row drops it — so a delete never touches a
// file the user can't see.

import type { PlannerType } from "./items";

export interface Selection {
  /** The selected rows' paths. */
  paths: ReadonlySet<string>;
  /** The row a Shift-click or Shift+Space extends from: the last one toggled on its own. */
  anchor: string | null;
}

export const EMPTY_SELECTION: Selection = { paths: new Set(), anchor: null };

/**
 * Toggle `path` among the `visible` rows (top to bottom). Alone, it flips the row and becomes the
 * anchor. With `range` (Shift) and an anchor still listed, every row from the anchor to `path`
 * takes the anchor's state — selected unless the anchor was just unselected — and the anchor stays.
 */
export function toggleRow(selection: Selection, path: string, visible: readonly string[], range: boolean): Selection {
  const at = visible.indexOf(path);
  if (at === -1) return selection;
  const from = range && selection.anchor !== null ? visible.indexOf(selection.anchor) : -1;
  if (from === -1) {
    const next = new Set(selection.paths);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    return { paths: next, anchor: path };
  }
  const on = selection.paths.has(visible[from] as string);
  const next = new Set(selection.paths);
  for (const p of visible.slice(Math.min(from, at), Math.max(from, at) + 1)) {
    if (on) next.add(p);
    else next.delete(p);
  }
  return { paths: next, anchor: selection.anchor };
}

export type SelectAllState = "none" | "some" | "all";

/** The select-all checkbox: none, some (mixed) or all of the visible rows selected. */
export function selectAllState(selection: Selection, visible: readonly string[]): SelectAllState {
  const n = visible.filter((p) => selection.paths.has(p)).length;
  if (n === 0) return "none";
  return n === visible.length ? "all" : "some";
}

/** The select-all checkbox clicked: every visible row, or none when all of them already are. */
export function toggleAll(selection: Selection, visible: readonly string[]): Selection {
  return selectAllState(selection, visible) === "all" ? EMPTY_SELECTION : { paths: new Set(visible), anchor: null };
}

/** The selection kept to the rows still shown (a filter changed, a file left); the same object when nothing changed. */
export function pruneSelection(selection: Selection, visible: readonly string[]): Selection {
  const shown = new Set(visible);
  const kept = [...selection.paths].filter((p) => shown.has(p));
  const anchor = selection.anchor !== null && shown.has(selection.anchor) ? selection.anchor : null;
  if (kept.length === selection.paths.size && anchor === selection.anchor) return selection;
  return { paths: new Set(kept), anchor };
}

/** A row All shows, as select mode needs it. */
export interface SelectableRow {
  path: string;
  /** The title the row shows (an unreadable file: its name). */
  title: string;
  type: PlannerType;
  archived: boolean;
  /** `false`: a file whose frontmatter can't be read (a greyed row). */
  readable: boolean;
}

/** The selected rows, in the order All shows them. */
export function selectedRows(rows: readonly SelectableRow[], selection: Selection): SelectableRow[] {
  return rows.filter((r) => selection.paths.has(r.path));
}

/** A readable note not yet archived — the one kind of row Archive moves (DESIGN §3.6 "Row actions"). */
export const isArchivable = (row: SelectableRow): boolean => row.type === "note" && row.readable && !row.archived;

/** Bulk Archive applies when every selected row is a note not yet archived. */
export function canArchive(selected: readonly SelectableRow[]): boolean {
  return selected.length > 0 && selected.every(isArchivable);
}

/** The confirmation's heading: "Delete “Buy milk”?" for one row, "Delete 3 files?" for more. */
export function deleteHeading(selected: readonly SelectableRow[]): string {
  const [only] = selected;
  if (selected.length === 1 && only !== undefined) return `Delete “${only.title}”?`;
  return `Delete ${String(selected.length)} files?`;
}

/** The Host API's answer for one path of `files.delete` (HOST-API §4 `files.write`). */
export interface DeleteResult {
  path: string;
  ok: boolean;
  error?: { code: string; message: string };
}

/** A row the delete or the archive left in place, and why, in one short sentence. */
export interface RowFailure {
  path: string;
  text: string;
  /** The host's own message, for the row's tooltip. */
  detail: string;
}

/**
 * What a delete did: `gone` — deleted, or already not there (`not-found`: what the user asked
 * for is true); `failed` — still there, each with its reason. A path the answer leaves out counts
 * as failed.
 */
export function deleteOutcome(paths: readonly string[], results: readonly DeleteResult[]): { gone: string[]; failed: RowFailure[] } {
  const byPath = new Map(results.map((r) => [r.path, r]));
  const gone: string[] = [];
  const failed: RowFailure[] = [];
  for (const path of paths) {
    const r = byPath.get(path);
    if (r === undefined) failed.push({ path, text: "Couldn't delete it: Pomade didn't answer for it.", detail: "" });
    else if (r.ok || r.error?.code === "not-found") gone.push(path);
    else failed.push({ path, text: deleteFailure(r.error?.code ?? ""), detail: r.error?.message ?? "" });
  }
  return { gone, failed };
}

const FAILURES: Record<string, string> = {
  "io-error": "Couldn't move it to the Trash.",
  "capability-denied": "Couldn't delete it: Pomade keeps that file.",
  "outside-workspace": "Couldn't delete it: it's outside the workspace.",
  "invalid-params": "Couldn't delete it: it's a folder.",
};

/** A `files.delete` error code as the row says it. */
export const deleteFailure = (code: string): string => FAILURES[code] ?? "Couldn't delete it: Pomade refused.";

/** Split `paths` into `files.delete` calls of at most `max` paths each. */
export function deleteBatches(paths: readonly string[], max: number): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < paths.length; i += max) batches.push(paths.slice(i, i + max));
  return batches;
}
