// What each view shows in a context ([[views]] "Context"). The context is the active Pomade project or
// Workspace. Today is the whole day in every context — inside a project its project filter narrows
// it to the project's items. At Workspace, Project and Recurring span everything (grouped by
// project); inside a project they show the project's items plus its mixed-in sources —
// workspace-level items and other projects — and a mixed-in row carries its source's label. All
// always spans everything, narrowed by its project and type filters.

import type { LocalDate } from "pomade-kit/schedule";

import type { Task } from "./items";
import { NO_PROJECT, sourceKey, type Source } from "./projects";
import { compareTasks, isScheduled, recurringRow } from "./today";
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
export function inScope(context: Context, view: Pick<PlannerView, "mixNoProject" | "mixProjects">, source: Source): boolean {
  if (context.kind === "workspace") return true;
  if (isOwn(context, source)) return true;
  return source.kind === "none" ? view.mixNoProject : view.mixProjects.includes(source.key);
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

/**
 * The Project view's rows (tasks and recurring items — notes, thoughts and daily notes live in
 * All): every open task, and the ones ticked on `day` (crossed out until the
 * boundary), in list order; a recurring item only while it is in Today — between occurrences it
 * shows in the Recurring view alone ([[recurring]] "`do-on` and where an item stands").
 */
export function projectRows(tasks: readonly Task[], day: LocalDate): Task[] {
  return tasks.filter((t) => isScheduled(t) && (t.repeat !== null ? recurringRow(t, day) !== null : !t.done || t.doneOn === day)).sort(compareTasks);
}

/** The mix-ins as they stay valid: the project's own key and keys of sources no longer there dropped. */
export function liveMixins(context: Context, view: Pick<PlannerView, "mixProjects">, known: ReadonlySet<string>): string[] {
  const own = context.kind === "project" ? context.id : null;
  return view.mixProjects.filter((k) => k !== own && k !== NO_PROJECT && known.has(k));
}
