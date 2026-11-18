// The Planner's machine-local view state per context (Host API `state`, DESIGN §3.6, §5): one key
// per project and one for Workspace, holding the selected view, the All view's "Show done", "Show
// archived" and filters (projects, types; empty = everything), and — in a project — the mixed-in sources.

import type { JsonValue } from "pomade-kit/protocol";

export const VIEWS = ["today", "project", "recurring", "all"] as const;
export type PlannerViewId = (typeof VIEWS)[number];

export interface PlannerView {
  view: PlannerViewId;
  showDone: boolean;
  /** All shows archived items (`_archive/`). */
  showArchived: boolean;
  /** Mix-ins (a project context): workspace-level items… */
  mixNoProject: boolean;
  /** …and other projects' items, by source key (`projects.ts` `sourceKey`). */
  mixProjects: string[];
  /** All's project filter, by source key (`none` = no project); empty = every project. */
  projects: string[];
  /** All's type filter; empty = every type. */
  types: string[];
}

export const DEFAULT_VIEW: PlannerView = { view: "today", showDone: false, showArchived: false, mixNoProject: false, mixProjects: [], projects: [], types: [] };

/** The state key of a context: a project id, or the Workspace scope's. */
export const plannerViewKey = (contextId: string): string => `planner.view.${contextId}`;

/** At most this many keys in one list — a guard against a hand-edited state file. */
const LIST_MAX = 500;

function stringList(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === "string" && v !== ""))].slice(0, LIST_MAX);
}

export function parsePlannerView(value: JsonValue | null): PlannerView {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return DEFAULT_VIEW;
  const view = VIEWS.find((v) => v === value.view) ?? DEFAULT_VIEW.view;
  return {
    view,
    showDone: value.showDone === true,
    showArchived: value.showArchived === true,
    mixNoProject: value.mixNoProject === true,
    mixProjects: stringList(value.mixProjects),
    projects: stringList(value.projects),
    types: stringList(value.types),
  };
}

export const serializePlannerView = (view: PlannerView): JsonValue => ({
  view: view.view,
  showDone: view.showDone,
  showArchived: view.showArchived,
  mixNoProject: view.mixNoProject,
  mixProjects: [...view.mixProjects],
  projects: [...view.projects],
  types: [...view.types],
});

/** `list` with `key` added when absent, removed when present. */
export const toggled = (list: readonly string[], key: string): string[] => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
