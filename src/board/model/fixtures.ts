// Ticket builders for the model's unit tests.

import type { Kind, Ticket } from "./ticket";

const LETTER: Record<Kind, string> = { problem: "P", epic: "E", task: "T", signal: "S" };

export const BACKLOG = "Projects/alpha/docs/roadmap";

/** A ticket: `t("E-017", { status: "review" })`; the kind follows the ID's letter unless given. */
export function t(id: string, over: Partial<Ticket> = {}): Ticket {
  const kind: Kind = over.kind ?? ((Object.keys(LETTER) as Kind[]).find((k) => id.startsWith(`${LETTER[k]}-`)) ?? "task");
  const name = `${id}-x.md`;
  const inDone = over.inDone ?? false;
  return {
    path: inDone ? `${BACKLOG}/done/${name}` : `${BACKLOG}/${name}`,
    name,
    id,
    kind,
    title: id,
    status: "planned",
    priority: null,
    parent: null,
    reporter: null,
    source: null,
    inDone,
    mtimeMs: 1,
    ...over,
  };
}
