// Pins (DESIGN §3.6): per view and per context, in machine-local app state — one key per context
// (`planner.pins.<projectId>`, `__workspace__` for Workspace) holding each view's pinned paths in
// pin order. A pinned row shows above the view's list, in pin order, while the view lists it; a
// pin whose item is gone or out of the view simply isn't shown. The daily note is pinned on the
// Workspace Today by itself each day; unpinning it holds for that planner day only
// (`DAILY_UNPINNED_KEY` holds the day).

import type { JsonValue } from "pomade-kit/protocol";
import type { LocalDate } from "pomade-kit/schedule";

import { VIEWS, type PlannerViewId } from "./view-state";

export type Pins = Record<PlannerViewId, string[]>;

export const NO_PINS: Pins = { today: [], project: [], recurring: [], all: [] };

export const pinsKey = (contextId: string): string => `planner.pins.${contextId}`;

/** The state key holding the planner day the daily note was unpinned on. */
export const DAILY_UNPINNED_KEY = "planner.dailyNoteUnpinned";

/** At most this many pins per view — a guard against a hand-edited state file. */
const PINS_MAX = 200;

function paths(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === "string" && v !== ""))].slice(0, PINS_MAX);
}

export function parsePins(value: JsonValue | null): Pins {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return NO_PINS;
  return Object.fromEntries(VIEWS.map((v) => [v, paths(value[v])])) as Pins;
}

export const serializePins = (pins: Pins): JsonValue => Object.fromEntries(VIEWS.map((v) => [v, [...pins[v]]]));

export const isPinned = (pins: Pins, view: PlannerViewId, path: string): boolean => pins[view].includes(path);

/** `pins` with `path` pinned last on `view`, or unpinned when it was pinned. */
export function togglePin(pins: Pins, view: PlannerViewId, path: string): Pins {
  const list = pins[view];
  return { ...pins, [view]: list.includes(path) ? list.filter((p) => p !== path) : [...list, path] };
}

/** `rows` split into the pinned ones (in pin order) and the rest (in list order). */
export function splitPinned<T>(rows: readonly T[], pinned: readonly string[], pathOf: (row: T) => string): { pinned: T[]; rest: T[] } {
  if (pinned.length === 0) return { pinned: [], rest: [...rows] };
  const byPath = new Map(rows.map((r) => [pathOf(r), r]));
  const first = pinned.flatMap((p) => {
    const row = byPath.get(p);
    return row === undefined ? [] : [row];
  });
  const set = new Set(pinned);
  return { pinned: first, rest: rows.filter((r) => !set.has(pathOf(r))) };
}

/** Whether the daily note is pinned on the Workspace Today on `day`: unless it was unpinned that very day. */
export const dailyNotePinned = (day: LocalDate, unpinnedOn: JsonValue | null): boolean => unpinnedOn !== day;
