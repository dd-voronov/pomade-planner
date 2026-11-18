// Order inside a column (DESIGN §4.3): priority, P0 first, then ID — `E-9` before `E-10`, and by
// kind letter across kinds (`E-…` before `T-…`). A missing or unknown priority sorts after P3.

import type { Ticket } from "./ticket";

const PRIORITY = /^P([0-3])$/;
const ID = /^([A-Za-z]+)-(\d+)$/;

/** 0–3 for `P0`–`P3`; 4 for anything else, including no priority. */
export function priorityRank(priority: string | null): number {
  const match = priority === null ? null : PRIORITY.exec(priority);
  return match ? Number(match[1]) : 4;
}

/** IDs by kind letter, then by number, then by text; an ID outside the convention sorts after every conventional one. */
export function compareIds(a: string, b: string): number {
  const ma = ID.exec(a);
  const mb = ID.exec(b);
  if (ma && mb) {
    const [, la = "", na = "0"] = ma;
    const [, lb = "", nb = "0"] = mb;
    if (la !== lb) return la < lb ? -1 : 1;
    const diff = Number(na) - Number(nb);
    if (diff !== 0) return diff;
  } else if (ma) return -1;
  else if (mb) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Priority, then ID, then path (two files with one ID keep a stable order). */
export function compareTickets(a: Ticket, b: Ticket): number {
  return priorityRank(a.priority) - priorityRank(b.priority) || compareIds(a.id, b.id) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
