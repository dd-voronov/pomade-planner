// What each view shows in a context ([[views]] "Context"). The context is the active Pomade project or
// Workspace. Today is the whole day in every context — inside a project its project filter narrows
// it to the project's items. At Workspace, Project and Recurring span everything (grouped by
// project); inside a project they show the project's items plus its mixed-in sources —
// workspace-level items and other projects — and a mixed-in row carries its source's label.
// Project lists every open item of every type in two groups: tasks and recurring items, then
// notes and thoughts. All always spans everything, narrowed by its project and type filters.

import type { LocalDate } from "pomade-kit/schedule";

import { groupKey, type ListEntry } from "./folds";
import type { Task } from "./items";
import { NO_PROJECT, sectionsBySource, sourceKey, type Source } from "./projects";
import { compareTasks, isVisibleOn, recurringRow } from "./today";
import type { PlannerView, PlannerViewId } from "./view-state";

export type Context = { kind: "workspace" } | { kind: "project"; id: string };

/** Whether `source` is the context's own: the project itself, or — at Workspace — the workspace-level items. */
export function isOwn(context: Context, source: Source): boolean {
  return context.kind === "workspace" ? source.kind === "none" : source.kind === "project" && source.id === context.id;
}

/** Whether Today shows `source`'s items in `context`: always, but with the project filter on (`onlyProject`) only the project's own. */
export function inToday(context: Context, view: Pick<PlannerView, "onlyProject">, source: Source): boolean {
  return context.kind === "workspace" || !view.onlyProject || isOwn(context, source);
}

/** Whether Project and Recurring show `source`'s items in `context` with `view`'s mix-ins. */
export function inScope(context: Context, view: Pick<PlannerView, "mixins">, source: Source): boolean {
  return context.kind === "workspace" || isOwn(context, source) || view.mixins.includes(sourceKey(source));
}

/** Whether All shows an item of `source` and `type` with `view`'s filters (an empty filter passes everything). */
export function inAllFilter(view: Pick<PlannerView, "projects" | "types">, source: Source, type: string): boolean {
  return (view.projects.length === 0 || view.projects.includes(sourceKey(source))) && (view.types.length === 0 || view.types.includes(type));
}

/** Where an item just added shows: the view, and whether that view lists it as it stands. */
export interface Listing {
  view: PlannerViewId;
  listed: boolean;
}

/**
 * Where an item just added from `current` shows: `current` when it lists the item; else Project or
 * Recurring when they do (the context's scope holds it); else All — which lists every open item
 * once its filters pass it (`revealInAll`), so there `listed` says whether they do.
 */
export function viewListing(path: string, current: PlannerViewId, rows: Readonly<Record<PlannerViewId, readonly string[]>>): Listing {
  if (rows[current].includes(path)) return { view: current, listed: true };
  if (rows.project.includes(path)) return { view: "project", listed: true };
  if (rows.recurring.includes(path)) return { view: "recurring", listed: true };
  return { view: "all", listed: rows.all.includes(path) };
}

/** `view` on All, its filters widened just enough to pass an item of `source` and `type`. */
export function revealInAll(view: PlannerView, source: Source, type: string): PlannerView {
  const key = sourceKey(source);
  return {
    ...view,
    view: "all",
    projects: view.projects.length === 0 || view.projects.includes(key) ? view.projects : [...view.projects, key],
    types: view.types.length === 0 || view.types.includes(type) ? view.types : [...view.types, type],
  };
}

/** Project's two groups: the tasks and recurring items, then the notes and thoughts. */
export type ProjectGroup = "tasks" | "notes";

export const PROJECT_GROUPS: readonly ProjectGroup[] = ["tasks", "notes"];

/**
 * The Project group that lists `task` on `day`, or `null` when Project doesn't: a task while open
 * or ticked that day (crossed out until the boundary), every recurring item not stopped by hand —
 * between its runs and once ended too, each with where it stands — and every open note and
 * thought. Archived items, done tasks, resolved thoughts and daily notes are All's.
 */
export function projectGroupOf(task: Task, day: LocalDate): ProjectGroup | null {
  if (task.archived) return null;
  switch (task.type) {
    case "task":
      return isVisibleOn(task, day) ? "tasks" : null;
    case "recurring":
      return task.done ? null : "tasks";
    case "note":
    case "thought":
      return task.done ? null : "notes";
    case "daily-note":
      return null;
  }
}

/** Project's rows on `day`, each group in list order. */
export function projectRows(tasks: readonly Task[], day: LocalDate): Record<ProjectGroup, Task[]> {
  const rows: Record<ProjectGroup, Task[]> = { tasks: [], notes: [] };
  for (const task of tasks) {
    const group = projectGroupOf(task, day);
    if (group !== null) rows[group].push(task);
  }
  return { tasks: rows.tasks.sort(compareTasks), notes: rows.notes.sort(compareTasks) };
}

/**
 * Project's list as entries ([[views]] "Groups"): inside a project "Tasks" then "Notes and
 * thoughts", each a level-2 group keyed by its group; at Workspace (`sourceOf` given) a level-1
 * group per source in heading order (`sectionsBySource`), each holding the same two groups keyed
 * under it (`groupKey`). A group with no row has no heading. Rows keep the order given.
 */
export function projectEntries<R>(rows: readonly R[], groupOf: (row: R) => ProjectGroup, sourceOf?: (row: R) => Source): ListEntry<R>[] {
  const inner = (items: readonly R[], outer: string | null): ListEntry<R>[] =>
    PROJECT_GROUPS.flatMap((g) => {
      const mine = items.filter((r) => groupOf(r) === g);
      if (mine.length === 0) return [];
      return [{ kind: "group" as const, key: outer === null ? g : groupKey([outer, g]), level: 2 as const }, ...mine.map((row) => ({ kind: "row" as const, row }))];
    });
  if (sourceOf === undefined) return inner(rows, null);
  return sectionsBySource(rows, sourceOf).flatMap((sec) => {
    const key = sourceKey(sec.source);
    return [{ kind: "group" as const, key, level: 1 as const }, ...inner(sec.items, key)];
  });
}

/**
 * Whether a row of Project's "Tasks" counts — on the switcher, on "Tasks" and on a project's
 * heading: an open task, and a recurring item while it is in Today (due). Notes and thoughts
 * don't; "Notes and thoughts" counts its rows.
 */
export function countsInProject(task: Task, day: LocalDate): boolean {
  if (task.done || task.archived) return false;
  if (task.type === "task") return true;
  return task.type === "recurring" && recurringRow(task, day) !== null;
}

/** The mix-ins as they stay valid: the project's own key and keys of projects no longer there dropped; the no-project items always stay. */
export function liveMixins(context: Context, view: Pick<PlannerView, "mixins">, known: ReadonlySet<string>): string[] {
  const own = context.kind === "project" ? context.id : null;
  return view.mixins.filter((k) => k !== own && (k === NO_PROJECT || known.has(k)));
}
