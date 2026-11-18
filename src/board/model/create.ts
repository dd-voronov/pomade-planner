// Creating a ticket from the Board (DESIGN §4.4): the next free ID per kind, the file name, and the
// file's text — the convention's frontmatter (Pomade BACKLOG "One item = one file", DESIGN §4.2 for
// a signal) and the body's empty sections per kind.
//
// - The next ID is the highest `<prefix>-NNN` in the backlog folder and its `done/` sub-folder plus
//   one, zero-padded to 3 (`T-999` → `T-1000`); an ID is never reused. Both the file names and the
//   tickets' `id:` count, so a ticket renamed by hand or a file whose frontmatter can't be read
//   still holds its number.
// - The file is `<ID>-<slug>.md`; the slug folds Latin accents, keeps other scripts' letters, and is
//   cut at a word boundary.

import { joinPath, type FileEntry } from "pomade-kit/protocol";

import { slugify, yamlString } from "../../core/text";
import { DONE_FOLDER, location, PARENT_KEY, type Kind } from "./ticket";

export const KIND_PREFIX: Record<Kind, string> = { problem: "P", epic: "E", task: "T", signal: "S" };

export const KIND_NAME: Record<Kind, string> = { problem: "Problem", epic: "Epic", task: "Task", signal: "Signal" };

export const PRIORITIES = ["P0", "P1", "P2", "P3"] as const;
export const DEFAULT_PRIORITY = "P2";
export const DEFAULT_SOURCE = "daniil";

/** The ID a ticket of `prefix` with number `n` has: `T-007`, `T-1000`. */
export function formatId(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

/** The number in an ID (`T-007` → 7); `null` for anything else. */
export function idNumber(id: string): number | null {
  const match = /^[A-Z]-(\d+)$/.exec(id);
  return match ? Number(match[1]) : null;
}

/** The highest number `prefix` has among the entries directly in the backlog folder and its `done/`; 0 when none. */
export function highestNumber(prefix: string, entries: readonly FileEntry[], backlog: string): number {
  const fromName = new RegExp(`^${prefix}-(\\d+)(?:[-.]|$)`);
  const fromId = new RegExp(`^${prefix}-(\\d+)$`);
  let highest = 0;
  for (const entry of entries) {
    if (entry.kind !== "file" || location(entry.path, backlog) === null) continue;
    const named = fromName.exec(entry.name);
    if (named) highest = Math.max(highest, Number(named[1]));
    const id = entry.frontmatter?.id;
    const own = typeof id === "string" ? fromId.exec(id.trim()) : null;
    if (own) highest = Math.max(highest, Number(own[1]));
  }
  return highest;
}

/** The next free ID of `kind` in the backlog. */
export function nextId(kind: Kind, entries: readonly FileEntry[], backlog: string): string {
  const prefix = KIND_PREFIX[kind];
  return formatId(prefix, highestNumber(prefix, entries, backlog) + 1);
}

/** The ID after `id` (a clash at write time bumps the number). */
export function bumpId(id: string): string {
  const n = idNumber(id);
  if (n === null) throw new Error(`not a ticket ID: ${id}`);
  return formatId(id.slice(0, 1), n + 1);
}

/** `<ID>-<slug>.md`; `<ID>.md` when the title has nothing to slug. */
export function ticketFileName(id: string, title: string): string {
  const slug = slugify(title);
  return slug === "" ? `${id}.md` : `${id}-${slug}.md`;
}

/** Where a new ticket's file goes: the backlog folder, or `done/` for an epic or task created on `done` while "move done to done/" is on. */
export function newTicketPath(backlog: string, kind: Kind, status: string, moveDone: boolean, name: string): string {
  const inDone = moveDone && status === "done" && (kind === "epic" || kind === "task");
  return inDone ? joinPath(backlog, DONE_FOLDER, name) : joinPath(backlog, name);
}

export interface NewTicket {
  id: string;
  kind: Kind;
  /** Normalized (`normalizeTitle`), non-empty. */
  title: string;
  status: string;
  priority: string;
  /** The parent's ID (`problem:` for an epic or signal, `epic:` for a task); `null` = none. */
  parent: string | null;
  /** Empty = `DEFAULT_SOURCE`. */
  source: string;
  /** `YYYY-MM-DD`. */
  today: string;
}

/** The body's empty sections per kind (DESIGN §4.4), under a `# <ID> — <title>` heading. */
const SECTIONS: Record<Kind, readonly string[]> = {
  problem: ["Problem", "Outcome"],
  epic: ["Goal", "Scope", "Acceptance"],
  task: ["Goal", "Acceptance"],
  signal: [],
};

/**
 * A new ticket's text. Keys in the convention's order — a signal's after DESIGN §4.2 (`source`
 * after `status`, no `type`); scalars written plain when they read back the same, else quoted.
 */
export function newTicketContent(t: NewTicket): string {
  const source = t.source.trim() === "" ? DEFAULT_SOURCE : t.source.trim();
  const parentKey = PARENT_KEY[t.kind];
  const parent = parentKey !== null && t.parent !== null ? [`${parentKey}: ${yamlString(t.parent)}`] : [];
  const head = [`id: ${t.id}`, `kind: ${t.kind}`, `title: ${yamlString(t.title)}`, `status: ${yamlString(t.status)}`];
  const dates = [`created: ${t.today}`, `updated: ${t.today}`];
  const fields =
    t.kind === "signal"
      ? [...head, `priority: ${yamlString(t.priority)}`, `source: ${yamlString(source)}`, ...parent, ...dates]
      : [...head, "type: feature", `priority: ${yamlString(t.priority)}`, ...parent, ...dates, `source: ${yamlString(source)}`];
  const body = [`# ${t.id} — ${t.title}`, ...SECTIONS[t.kind].map((s) => `\n## ${s}`)].join("\n");
  return `---\n${fields.join("\n")}\n---\n\n${body}\n`;
}
