// The parent picker's candidates ([[editing-drag-create]] "Parent list"): problems for an epic or a signal, epics for a task.
// Open ones first, then closed ones (a done epic can still be a task's parent); newest ID first in
// each. Type-to-filter matches every word of the query against the ID and the title.

import { isOpen } from "./areas";
import { compareIds } from "./order";
import { PARENT_KIND, type Kind, type Ticket } from "./ticket";

/** Who may be a parent of a `kind` ticket, in picker order; one entry per ID. */
export function parentCandidates(tickets: readonly Ticket[], kind: Kind): Ticket[] {
  const parentKind = PARENT_KIND[kind];
  if (parentKind === null) return [];
  const seen = new Set<string>();
  const unique = tickets.filter((t) => {
    if (t.kind !== parentKind || seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
  return unique.sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || compareIds(b.id, a.id));
}

/** The candidates matching `query`: every whitespace-separated word, case-insensitively, in the ID or the title. */
export function filterParents(candidates: readonly Ticket[], query: string): Ticket[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w !== "");
  if (words.length === 0) return [...candidates];
  return candidates.filter((t) => {
    const text = `${t.id} ${t.title}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
