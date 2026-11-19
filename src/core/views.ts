// Which view a frame renders. Each app's bundle serves every surface of that app; the host's
// `welcome` (surface, strip icon, route) and later `route.changed` pick the view (HOST-API §3, §4
// `tabs.openApp`). An app has views only for its own routes: the Planner none of the Board's, the
// Board none of the Planner's.

import type { OpenOverlayParams, Surface } from "pomade-kit/protocol";

import { ITEM_KINDS, type ItemKind } from "../planner/model/item-draft";

/** The two apps' routes: the strip icons' `route` / `panelRoute` (each app's manifest.json) and the tab routes. */
export const ROUTES = {
  planner: "planner",
  board: "board",
  needsYou: "needs-you",
  quickAdd: "quick-add",
  /** The Planner tab on its settings page. */
  settings: "settings",
  /** The Planner tab on the Workspace Today (the morning summary's click). */
  today: "today",
  /** The Planner tab with an item's compact view open (`itemRoute`). */
  item: "item",
} as const;

/** What quick add starts with besides the active project: `do-on` as a date phrase (`today` from a Today view, else empty) and the type (Recurring from the Recurring view, else Task). */
export interface QuickAddPrefill {
  doOn: string;
  kind: ItemKind;
}

/**
 * The overlay route that opens quick add with `prefill`: `quick-add`, `quick-add?do-on=today`,
 * `quick-add?type=recurring`. The overlay is a fresh frame at each open, so what it starts with
 * travels in its route; a task with no date is the bare route, the shortcut's.
 */
export function quickAddRoute(prefill: QuickAddPrefill): string {
  const query = new URLSearchParams();
  if (prefill.doOn !== "") query.set("do-on", prefill.doOn);
  if (prefill.kind !== "task") query.set("type", prefill.kind);
  return query.size === 0 ? ROUTES.quickAdd : `${ROUTES.quickAdd}?${query.toString()}`;
}

/**
 * The height of quick add's form for each type it can start on, in px: the overlay opens at it and
 * the form keeps the frame that tall from there (overlay-fit.ts). A task's is 220, the frame
 * Pomade's ⌘⇧A opens at; the fake-host e2e pins each to the form as drawn.
 */
export const QUICK_ADD_HEIGHT: Record<ItemKind, number> = { task: 220, recurring: 235, note: 205, thought: 189, "daily-note": 171 };

/** `overlay.open` for quick add with `prefill` from the Planner panel: at its form's height, beside the panel. */
export const quickAddOverlay = (prefill: QuickAddPrefill): OpenOverlayParams => ({ route: quickAddRoute(prefill), height: QUICK_ADD_HEIGHT[prefill.kind], anchor: "panel" });

/** The pre-fills of a quick-add route; `null` when `route` is not one. Unknown parameters, and a type that isn't one, are ignored. */
export function parseQuickAddRoute(route: string): QuickAddPrefill | null {
  const at = route.indexOf("?");
  if ((at === -1 ? route : route.slice(0, at)) !== ROUTES.quickAdd) return null;
  const query = new URLSearchParams(at === -1 ? "" : route.slice(at + 1));
  return { doOn: query.get("do-on")?.trim() ?? "", kind: ITEM_KINDS.find((k) => k === query.get("type")) ?? "task" };
}

/** The tab route that opens the item at `path` (workspace-relative) in its compact view: `item?path=Tasks%2Fa.md`. */
export const itemRoute = (path: string): string => `${ROUTES.item}?${new URLSearchParams({ path }).toString()}`;

/** The path an item route names; `null` when `route` is not one. */
export function parseItemRoute(route: string): string | null {
  const at = route.indexOf("?");
  if (at === -1 || route.slice(0, at) !== ROUTES.item) return null;
  return new URLSearchParams(route.slice(at + 1)).get("path") || null;
}

export type PlannerViewId = "planner-panel" | "planner-tab" | "quick-add" | "unknown";

/**
 * The Planner's view for a frame. A tab renders the Planner at `planner`, `settings` (its settings
 * page), `today` (the Workspace Today), an item route (that item's compact view) or `""` (the new-tab menu's default view); a panel renders it at
 * `planner` or `""`; an overlay renders the quick-add form at `quick-add` (with its pre-fills, `quickAddRoute`). Anything else is
 * `unknown`.
 */
export function plannerView(surface: Surface, route: string): PlannerViewId {
  switch (surface) {
    case "tab":
      if (route === ROUTES.planner || route === ROUTES.settings || route === ROUTES.today || route === "" || parseItemRoute(route) !== null) return "planner-tab";
      return "unknown";
    case "panel":
      if (route === ROUTES.planner || route === "") return "planner-panel";
      return "unknown";
    case "overlay":
      return parseQuickAddRoute(route) !== null ? "quick-add" : "unknown";
    case "backend":
    case "command":
      return "unknown";
  }
}

export type BoardViewId = "board-tab" | "needs-you-panel" | "unknown";

/**
 * The Board's view for a frame. A tab renders the Board at `board` or `""` (the new-tab menu's
 * default view); a panel renders "Needs you" at `needs-you`. Anything else is `unknown`.
 */
export function boardView(surface: Surface, route: string): BoardViewId {
  switch (surface) {
    case "tab":
      return route === ROUTES.board || route === "" ? "board-tab" : "unknown";
    case "panel":
      return route === ROUTES.needsYou ? "needs-you-panel" : "unknown";
    case "overlay":
    case "backend":
    case "command":
      return "unknown";
  }
}
