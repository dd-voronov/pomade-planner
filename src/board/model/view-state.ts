// The Board's machine-local view state per project (Host API `state`, DESIGN §5): the open area
// and which columns the user expanded or collapsed against their default.

import type { JsonValue } from "pomade-kit/protocol";

import { defaultAreaId, type AreaDef, type ColumnDef } from "./areas";

export interface BoardView {
  area: string;
  /** Per area id, the statuses whose open/closed state differs from the column's default. */
  toggled: Record<string, string[]>;
}

export const viewKey = (projectId: string): string => `board.view.${projectId}`;

/** The stored view, checked against the areas; anything unknown falls back to the default area and the column defaults. */
export function parseView(value: JsonValue | null, areas: readonly AreaDef[]): BoardView {
  const first = defaultAreaId(areas);
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { area: first, toggled: {} };
  const area = typeof value.area === "string" && areas.some((a) => a.id === value.area) ? value.area : first;
  const toggled: Record<string, string[]> = {};
  const raw = value.toggled;
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    for (const a of areas) {
      const list = raw[a.id];
      if (Array.isArray(list)) {
        const statuses = list.filter((s): s is string => typeof s === "string" && a.columns.some((c) => c.status === s));
        if (statuses.length > 0) toggled[a.id] = [...new Set(statuses)];
      }
    }
  }
  return { area, toggled };
}

export function serializeView(view: BoardView): JsonValue {
  return { area: view.area, toggled: view.toggled };
}

export function isCollapsed(view: BoardView, areaId: string, column: ColumnDef): boolean {
  const toggled = view.toggled[areaId]?.includes(column.status) ?? false;
  return column.startsCollapsed !== toggled;
}

/** The view with `column` of `areaId` expanded or collapsed. */
export function setCollapsed(view: BoardView, areaId: string, column: ColumnDef, collapsed: boolean): BoardView {
  const current = view.toggled[areaId] ?? [];
  const shouldToggle = collapsed !== column.startsCollapsed;
  const next = shouldToggle ? [...new Set([...current, column.status])] : current.filter((s) => s !== column.status);
  const toggled = { ...view.toggled };
  if (next.length > 0) toggled[areaId] = next;
  else delete toggled[areaId];
  return { ...view, toggled };
}
