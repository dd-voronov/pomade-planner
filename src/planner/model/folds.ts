// Folding a list's groups ([[views]] "Groups"): every heading of a list folds and unfolds. Groups
// nest two levels deep — a group inside a group folds on its own, and a folded outer group hides
// it whole. What is folded is machine-local app state per context (`planner.folds.<contextId>`),
// each view's folded groups by key: a level-1 group's key is its own (a source key), a level-2
// group's is its outer group's key, `/`, and its own (`groupKey`).

import type { JsonValue } from "pomade-kit/protocol";

import { VIEWS, type PlannerViewId } from "./view-state";

export type Folds = Record<PlannerViewId, string[]>;

export const NO_FOLDS: Folds = { today: [], project: [], recurring: [], all: [] };

export const foldsKey = (contextId: string): string => `planner.folds.${contextId}`;

/** A group's key: its own, under its outer group's when it has one. */
export const groupKey = (path: readonly string[]): string => path.join("/");

/** At most this many folded groups per view — a guard against a hand-edited state file. */
const FOLDS_MAX = 500;

function keys(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === "string" && v !== ""))].slice(0, FOLDS_MAX);
}

export function parseFolds(value: JsonValue | null): Folds {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return NO_FOLDS;
  return Object.fromEntries(VIEWS.map((v) => [v, keys(value[v])])) as Folds;
}

export const serializeFolds = (folds: Folds): JsonValue => Object.fromEntries(VIEWS.map((v) => [v, [...folds[v]]]));

/** `folds` with `key` folded on `view` (`folded`), or unfolded. */
export function setFolded(folds: Folds, view: PlannerViewId, key: string, folded: boolean): Folds {
  const list = folds[view];
  if (list.includes(key) === folded) return folds;
  return { ...folds, [view]: folded ? [...list, key] : list.filter((k) => k !== key) };
}

/** `folds` with every one of `keys` unfolded on `view`; `folds` itself when none was folded. */
export function unfoldAll(folds: Folds, view: PlannerViewId, keys: readonly string[]): Folds {
  const list = folds[view];
  if (!keys.some((k) => list.includes(k))) return folds;
  return { ...folds, [view]: list.filter((k) => !keys.includes(k)) };
}

/** One entry of a grouped list, top to bottom: a group's heading (level 1, or 2 inside the level-1 group above it), or a row of the group above it. */
export type ListEntry<R> = { kind: "group"; key: string; level: 1 | 2 } | { kind: "row"; row: R };

/**
 * The entries a list shows with `folded` folded: every level-1 heading; a level-2 heading unless
 * its outer group is folded; a row unless a group it is in is folded. A folded heading stays.
 */
export function unfoldedEntries<R>(entries: readonly ListEntry<R>[], folded: ReadonlySet<string>): ListEntry<R>[] {
  /** The level of the folded group hiding what follows; `null`: nothing is hidden. */
  let hiding: number | null = null;
  const shown: ListEntry<R>[] = [];
  for (const entry of entries) {
    if (entry.kind === "row") {
      if (hiding === null) shown.push(entry);
      continue;
    }
    if (hiding !== null && entry.level > hiding) continue;
    hiding = folded.has(entry.key) ? entry.level : null;
    shown.push(entry);
  }
  return shown;
}

/** The rows a list shows with `folded` folded, top to bottom: what select mode's select all and a Shift-range take. */
export const unfoldedRows = <R>(entries: readonly ListEntry<R>[], folded: ReadonlySet<string>): R[] => unfoldedEntries(entries, folded).flatMap((e) => (e.kind === "row" ? [e.row] : []));

/** The rows under each group of `entries`, by key, in list order: a level-1 group's include its inner groups' rows. */
export function rowsByGroup<R>(entries: readonly ListEntry<R>[]): Map<string, R[]> {
  const rows = new Map<string, R[]>();
  /** The groups the next row is in, outermost first. */
  let open: { key: string; level: number }[] = [];
  for (const entry of entries) {
    if (entry.kind === "group") {
      open = [...open.filter((g) => g.level < entry.level), { key: entry.key, level: entry.level }];
      rows.set(entry.key, []);
    } else for (const g of open) rows.get(g.key)?.push(entry.row);
  }
  return rows;
}
