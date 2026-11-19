// Which backlog files are tickets: a Markdown file directly in the backlog folder or its `done/`
// sub-folder whose frontmatter carries a known `kind:` ([[file-model]] "Recognised files only", [[backlog-location]]).
// A file named like a ticket whose frontmatter can't be parsed is "unreadable" — shown, never
// dropped ([[file-model]] "Unreadable is visible"). Everything else is ignored.

import type { FileEntry } from "pomade-kit/protocol";

export const KINDS = ["problem", "epic", "task", "signal"] as const;
export type Kind = (typeof KINDS)[number];

/** The sub-folder done epics and tasks move into (Pomade BACKLOG "One item = one file"). */
export const DONE_FOLDER = "done";

/** A ticket's file name: `<P|E|T|S>-NNN-<slug>.md` (the slug may be missing). */
const TICKET_NAME = /^([PETS])-(\d+)(?:-.*)?\.md$/;

export interface Ticket {
  /** Workspace-relative. */
  path: string;
  name: string;
  /** `id:` from the frontmatter, else the ID in the file name. */
  id: string;
  kind: Kind;
  /** `title:`, else the file name without `.md`. */
  title: string;
  /** `status:`; `null` when missing or not a string. */
  status: string | null;
  /** `priority:` as written (`P1`); `null` when missing. */
  priority: string | null;
  /** The parent the convention names: `problem:` for an epic or a signal, `epic:` for a task. */
  parent: string | null;
  /** `reporter:` — who raised the ticket: a person's handle, or `claude` (`AGENT_REPORTER`) when an agent filed it on its own. */
  reporter: string | null;
  /** `source:` — where the ticket came from: a testing round, a session, a review… (a signal's evidence). */
  source: string | null;
  /** The file sits in the backlog's `done/` sub-folder. */
  inDone: boolean;
  mtimeMs: number;
}

export interface UnreadableFile {
  path: string;
  name: string;
  /** The ID in the file name (`T-999`). */
  id: string;
  /** Why it can't be read, as the host reported it. */
  reason: string;
  inDone: boolean;
}

export type Classified =
  | { type: "ticket"; ticket: Ticket }
  | { type: "unreadable"; file: UnreadableFile }
  | { type: "ignored" };

/** The `reporter:` an agent writes when it files a ticket on its own (Pomade BACKLOG "One item = one file"). */
export const AGENT_REPORTER = "claude";

/** The frontmatter key naming a kind's parent (`null`: a problem has none) — BACKLOG "One item = one file", [[convention-areas-columns]] "Convention". */
export const PARENT_KEY: Record<Kind, "problem" | "epic" | null> = { problem: null, epic: "problem", task: "epic", signal: "problem" };

/** The kind a kind's parent is. */
export const PARENT_KIND: Record<Kind, Kind | null> = { problem: null, epic: "problem", task: "epic", signal: "problem" };

function isKind(value: unknown): value is Kind {
  return typeof value === "string" && (KINDS as readonly string[]).includes(value);
}

/** A scalar frontmatter value as text: strings as they are, numbers as written; anything else `null`. */
function text(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** The ID a ticket file name carries (`E-017-x.md` → `E-017`), or `null` for any other name. */
export function idFromName(name: string): string | null {
  const match = TICKET_NAME.exec(name);
  return match ? `${match[1]}-${match[2]}` : null;
}

/** Where an entry sits relative to the backlog folder: directly in it, directly in `done/`, or elsewhere. */
export function location(path: string, backlog: string): "root" | "done" | null {
  const prefix = backlog === "" ? "" : `${backlog}/`;
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length).split("/");
  if (rest.length === 1) return "root";
  if (rest.length === 2 && rest[0] === DONE_FOLDER) return "done";
  return null;
}

/** Classify one `files.readFolder` entry (read with `frontmatter: true`) of the backlog at `backlog`. */
export function classifyEntry(entry: FileEntry, backlog: string): Classified {
  if (entry.kind !== "file" || !entry.name.endsWith(".md")) return { type: "ignored" };
  const where = location(entry.path, backlog);
  if (where === null) return { type: "ignored" };
  const inDone = where === "done";

  if (entry.frontmatterError !== undefined) {
    const id = idFromName(entry.name);
    if (id === null) return { type: "ignored" };
    return { type: "unreadable", file: { path: entry.path, name: entry.name, id, reason: entry.frontmatterError, inDone } };
  }

  const fm = entry.frontmatter;
  if (!fm || !isKind(fm.kind)) return { type: "ignored" };
  const kind = fm.kind;
  const parentKey = PARENT_KEY[kind];
  return {
    type: "ticket",
    ticket: {
      path: entry.path,
      name: entry.name,
      id: text(fm.id) ?? idFromName(entry.name) ?? entry.name.replace(/\.md$/, ""),
      kind,
      title: text(fm.title) ?? entry.name.replace(/\.md$/, ""),
      status: text(fm.status),
      priority: text(fm.priority),
      parent: parentKey === null ? null : text(fm[parentKey]),
      reporter: text(fm.reporter),
      source: text(fm.source),
      inDone,
      mtimeMs: entry.mtimeMs,
    },
  };
}

/**
 * Whether a watch change under the backlog folder can change the board: the folder itself, a file
 * directly in it, `done/` itself, or a file directly in `done/` — at either end of a rename.
 */
export function isBacklogChange(change: { path: string; oldPath?: string }, backlog: string): boolean {
  const concerns = (path: string): boolean => {
    if (path === backlog) return true;
    const prefix = backlog === "" ? "" : `${backlog}/`;
    if (!path.startsWith(prefix)) return false;
    const rest = path.slice(prefix.length).split("/");
    return rest.length === 1 || (rest.length === 2 && rest[0] === DONE_FOLDER);
  };
  return concerns(change.path) || (change.oldPath !== undefined && concerns(change.oldPath));
}

export interface Backlog {
  tickets: Ticket[];
  unreadable: UnreadableFile[];
}

/** Every ticket and unreadable ticket file among `entries` (the backlog folder's and `done/`'s listings). */
export function readBacklog(entries: readonly FileEntry[], backlog: string): Backlog {
  const tickets: Ticket[] = [];
  const unreadable: UnreadableFile[] = [];
  for (const entry of entries) {
    const c = classifyEntry(entry, backlog);
    if (c.type === "ticket") tickets.push(c.ticket);
    else if (c.type === "unreadable") unreadable.push(c.file);
  }
  unreadable.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { tickets, unreadable };
}
