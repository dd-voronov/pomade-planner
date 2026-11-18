// "Needs you" (DESIGN §4.5): what waits on Daniil in a backlog — tickets in `review` (any kind) and
// signals in `new` — each group ordered by priority, then ID; the counts shown next to a project;
// and the Workspace panel's levels: the list of projects, every project at once, or one project.

import { compareTickets } from "./order";
import type { Ticket } from "./ticket";

export interface NeedsYou {
  review: Ticket[];
  signals: Ticket[];
}

export function needsYou(tickets: readonly Ticket[]): NeedsYou {
  return {
    review: tickets.filter((t) => t.status === "review").sort(compareTickets),
    signals: tickets.filter((t) => t.kind === "signal" && t.status === "new").sort(compareTickets),
  };
}

export function needsYouCount(n: NeedsYou): number {
  return n.review.length + n.signals.length;
}

export interface NeedsYouCounts {
  review: number;
  signals: number;
}

/** The counts of several backlogs together. */
export function needsYouCounts(list: readonly NeedsYou[]): NeedsYouCounts {
  return list.reduce<NeedsYouCounts>((sum, n) => ({ review: sum.review + n.review.length, signals: sum.signals + n.signals.length }), { review: 0, signals: 0 });
}

/** "3 in review", "1 new signal" — the non-zero parts, in that order. */
export function needsYouParts({ review, signals }: NeedsYouCounts): string[] {
  const parts: string[] = [];
  if (review > 0) parts.push(`${review} in review`);
  if (signals > 0) parts.push(`${signals} new signal${signals === 1 ? "" : "s"}`);
  return parts;
}

/** Where the Workspace panel is: on the list of projects, on every project's sections, or inside one project. */
export type Level = { kind: "list" } | { kind: "all" } | { kind: "project"; id: string };

export const LIST_LEVEL: Level = { kind: "list" };

/** The level to show: an opened project that is no longer among the workspace's projects falls back to the list. */
export function shownLevel(level: Level, projectIds: readonly string[]): Level {
  return level.kind === "project" && !projectIds.includes(level.id) ? LIST_LEVEL : level;
}

/** One project's part of the Workspace panel; `items` is `null` until its backlog has been read. */
export interface ProjectNeeds<P> {
  project: P;
  items: NeedsYou | null;
}

/** A project whose backlog has been read and holds something that waits. */
export interface WaitingProject<P> {
  project: P;
  items: NeedsYou;
}

/** The projects with something waiting, in the given order. */
export function waitingProjects<P>(projects: readonly ProjectNeeds<P>[]): WaitingProject<P>[] {
  return projects.filter((p): p is WaitingProject<P> => p.items !== null && needsYouCount(p.items) > 0);
}
