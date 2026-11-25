// The Planner's machine-local view state per context (Host API `state`, [[views]], [[settings-and-state]]): one key
// per project and one for Workspace, holding the selected view, the All view's "Show done", "Show
// archived" and filters (projects, types; empty = everything), and — in a project — Today's project
// filter, Project's "Due today" and the sources mixed into Project and Recurring. A view saved
// with the no-project items as a flag of their own (`mixNoProject`) beside the mixed-in projects
// (`mixProjects`) reads them as the same sources, the no-project items first.

import type { JsonValue } from "pomade-kit/protocol";

import { NO_PROJECT } from "./projects";

export const VIEWS = ["today", "project", "recurring", "all"] as const;
export type PlannerViewId = (typeof VIEWS)[number];

export interface PlannerView {
  view: PlannerViewId;
  showDone: boolean;
  /** All shows archived items (`_archive/`). */
  showArchived: boolean;
  /** Today's project filter (a project context): on, Today lists the project's items alone. */
  onlyProject: boolean;
  /** Project's "Due today" (a project context): on, Project lists the project's Today items alone. */
  dueToday: boolean;
  /** The sources mixed into Project and Recurring (a project context), in the order added, by source key (`projects.ts` `sourceKey`; `none` = the no-project items). */
  mixins: string[];
  /** All's project filter, by source key (`none` = no project); empty = every project. */
  projects: string[];
  /** All's type filter; empty = every type. */
  types: string[];
}

export const DEFAULT_VIEW: PlannerView = { view: "today", showDone: false, showArchived: false, onlyProject: false, dueToday: false, mixins: [], projects: [], types: [] };

/** The state key of a context: a project id, or the Workspace scope's. */
export const plannerViewKey = (contextId: string): string => `planner.view.${contextId}`;

/** At most this many keys in one list — a guard against a hand-edited state file. */
const LIST_MAX = 500;

function stringList(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === "string" && v !== ""))].slice(0, LIST_MAX);
}

/** The mixed-in sources of a saved view: `mixins`, else `mixNoProject` and `mixProjects` read as the same sources. */
function parseMixins(value: { [key: string]: JsonValue }): string[] {
  if ("mixins" in value) return stringList(value.mixins);
  return stringList([...(value.mixNoProject === true ? [NO_PROJECT] : []), ...stringList(value.mixProjects)]);
}

export function parsePlannerView(value: JsonValue | null): PlannerView {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return DEFAULT_VIEW;
  const view = VIEWS.find((v) => v === value.view) ?? DEFAULT_VIEW.view;
  return {
    view,
    showDone: value.showDone === true,
    showArchived: value.showArchived === true,
    onlyProject: value.onlyProject === true,
    dueToday: value.dueToday === true,
    mixins: parseMixins(value),
    projects: stringList(value.projects),
    types: stringList(value.types),
  };
}

export const serializePlannerView = (view: PlannerView): JsonValue => ({
  view: view.view,
  showDone: view.showDone,
  showArchived: view.showArchived,
  onlyProject: view.onlyProject,
  dueToday: view.dueToday,
  mixins: [...view.mixins],
  projects: [...view.projects],
  types: [...view.types],
});

/** `list` with `key` added when absent, removed when present. */
export const toggled = (list: readonly string[], key: string): string[] => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
