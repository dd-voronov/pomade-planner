// The Board's areas as data ([[convention-areas-columns]] "Areas and columns"): area → kinds → columns, and which kinds each column
// takes. The Board renders whatever mapping it is given.

import { compareTickets } from "./order";
import type { Kind, Ticket } from "./ticket";

export interface ColumnDef {
  /** The `status:` value the column holds. */
  status: string;
  label: string;
  /** The kinds the convention lets sit in this column; a drop of any other kind is refused. */
  kinds: readonly Kind[];
  /**
   * `main`: a normal column, open unless `startsCollapsed`. `side`: a narrow collapsed column at the
   * right edge (dropped, parked).
   */
  placement: "main" | "side";
  startsCollapsed: boolean;
}

export interface AreaDef {
  id: string;
  label: string;
  kinds: readonly Kind[];
  /** Left to right; `side` columns after every `main` one. */
  columns: readonly ColumnDef[];
}

const column = (status: string, label: string, kinds: readonly Kind[], placement: ColumnDef["placement"] = "main", startsCollapsed = placement === "side"): ColumnDef => ({
  status,
  label,
  kinds,
  placement,
  startsCollapsed,
});

const S: readonly Kind[] = ["signal"];
const P: readonly Kind[] = ["problem"];
const ET: readonly Kind[] = ["epic", "task"];

/**
 * The default mapping, after Pomade's process/backlog "Statuses" and [[convention-areas-columns]] "Convention": a signal is new, then
 * triaged (linked to a problem) or dismissed; a problem runs backlog → grooming → planned →
 * delivering → review → done, or dropped / parked; an epic planned → in-progress → review → done,
 * or dropped / parked; a task (backlog →) planned → in-progress → review → done, or dropped.
 */
export const DEFAULT_AREAS: readonly AreaDef[] = [
  {
    id: "signals",
    label: "Signals",
    kinds: S,
    columns: [column("new", "New", S), column("triaged", "Triaged", S), column("dismissed", "Dismissed", S, "side")],
  },
  {
    id: "problems",
    label: "Problems",
    kinds: P,
    columns: [
      column("backlog", "Backlog", P),
      column("grooming", "Grooming", P),
      column("planned", "Planned", P),
      column("delivering", "Delivering", P),
      column("review", "Review", P),
      column("done", "Done", P, "main", true),
      column("dropped", "Dropped", P, "side"),
      column("parked", "Parked", P, "side"),
    ],
  },
  {
    id: "solutions",
    label: "Solutions",
    kinds: ET,
    columns: [
      column("backlog", "Backlog", ["task"]),
      column("planned", "Planned", ET),
      column("in-progress", "In progress", ET),
      column("review", "Review", ET),
      column("done", "Done", ET, "main", true),
      column("dropped", "Dropped", ET, "side"),
      column("parked", "Parked", ["epic"], "side"),
    ],
  },
];

/** The area a board opens on until the user picks another ([[convention-areas-columns]] "Areas and columns"); the first area when the mapping has no such area. */
export const DEFAULT_AREA_ID = "problems";

export function defaultAreaId(areas: readonly AreaDef[]): string {
  return areas.some((a) => a.id === DEFAULT_AREA_ID) ? DEFAULT_AREA_ID : (areas[0]?.id ?? "");
}

/** Statuses that close a ticket: it no longer counts as open. A signal is closed once triaged or dismissed. */
export const CLOSED_STATUSES: readonly string[] = ["done", "dropped", "parked", "triaged", "dismissed"];

/** Whether a ticket still counts as open. */
export function isOpen(ticket: Ticket): boolean {
  return !(ticket.status !== null && CLOSED_STATUSES.includes(ticket.status));
}

const KIND_PLURAL: Record<Kind, string> = { problem: "Problems", epic: "Epics", task: "Tasks", signal: "Signals" };

/** The area a kind is shown in, or `null` when no area shows it. */
export function areaOf(areas: readonly AreaDef[], kind: Kind): AreaDef | null {
  return areas.find((a) => a.kinds.includes(kind)) ?? null;
}

/** Whether `column` may hold a ticket of `kind`. */
export function canTake(column: ColumnDef, kind: Kind): boolean {
  return column.kinds.includes(kind);
}

/** Why `column` refuses `kind` — "Tasks can't be in Parked". */
export function refusalText(column: ColumnDef, kind: Kind): string {
  return `${KIND_PLURAL[kind]} can't be in ${column.label}`;
}

export interface BoardColumn {
  def: ColumnDef;
  /** In column order (`compareTickets`). */
  cards: Ticket[];
}

/** A ticket of the area whose status has no column there: shown in the Unreadable strip, never dropped. */
export interface Misfit {
  ticket: Ticket;
  reason: string;
}

export interface AreaBoard {
  columns: BoardColumn[];
  misfits: Misfit[];
}

/**
 * The area's columns with their cards. A ticket sits in the column of its status whenever the area
 * has one — even a column its kind can't be dropped into (the file is the truth); a ticket with no
 * status, or one the area has no column for, is a misfit.
 */
export function buildArea(area: AreaDef, tickets: readonly Ticket[]): AreaBoard {
  const byStatus = new Map<string, Ticket[]>(area.columns.map((c) => [c.status, []]));
  const misfits: Misfit[] = [];
  for (const ticket of tickets) {
    if (!area.kinds.includes(ticket.kind)) continue;
    const cards = ticket.status === null ? undefined : byStatus.get(ticket.status);
    if (cards) cards.push(ticket);
    else misfits.push({ ticket, reason: ticket.status === null ? "no status" : `status “${ticket.status}” has no column` });
  }
  misfits.sort((a, b) => compareTickets(a.ticket, b.ticket));
  return {
    columns: area.columns.map((def) => ({ def, cards: (byStatus.get(def.status) ?? []).sort(compareTickets) })),
    misfits,
  };
}

/** Tickets shown on the board that are still open (status not done, dropped or parked). */
export function countOpen(areas: readonly AreaDef[], tickets: readonly Ticket[]): number {
  return tickets.filter((t) => areaOf(areas, t.kind) !== null && isOpen(t)).length;
}

/**
 * Where an area's "+ New …" call to action creates: the first column that takes the area's first
 * kind ("+ New signal" → New, "+ New problem" → Backlog, "+ New epic" → Planned).
 */
export function createTarget(area: AreaDef): { column: ColumnDef; kind: Kind } | null {
  const kind = area.kinds[0];
  if (kind === undefined) return null;
  const target = area.columns.find((c) => c.placement === "main" && c.kinds.includes(kind));
  return target ? { column: target, kind } : null;
}

/** The kinds a create from `column` offers: the area's kinds the column takes, in the area's order. */
export function creatableKinds(area: AreaDef, column: ColumnDef): Kind[] {
  return area.kinds.filter((k) => column.kinds.includes(k));
}

/** How many of the tickets each area shows, by area id. */
export function countByArea(areas: readonly AreaDef[], tickets: readonly Ticket[]): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(areas.map((a) => [a.id, 0]));
  for (const t of tickets) {
    const area = areaOf(areas, t.kind);
    if (area) counts[area.id] = (counts[area.id] ?? 0) + 1;
  }
  return counts;
}
