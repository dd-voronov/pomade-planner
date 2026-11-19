// Which files in the tasks root are Planner items ([[file-model]], [[storage-and-item-types]]): a Markdown file directly
// in the root or in `Daily/` (a workspace-level item), directly in one of its project sub-folders
// (that project's item), or directly in `_archive/` or one of its sub-folders (an archived item of
// the same place), whose frontmatter carries a `type:` the Planner knows. A file with a known `type:` line
// whose frontmatter can't be parsed is "unreadable" — shown greyed, never dropped. Every other
// file (no frontmatter, no `type:`, a type the Planner doesn't know) is ignored.
//
// Fields ([[storage-and-item-types]] "Item types"): `title`, `status` (`done` — `resolved` for a thought — else open), `do-on`,
// `deadline`, `created`, `done-on`, a daily note's `date` (`YYYY-MM-DD`), `importance` (a number;
// higher = more important). A field that is set but isn't a value of its kind counts as unset, and
// the item names it in `problems`. A `recurring` item also carries its `repeat:` rule (or the kit's
// error) and the newest entry of its `## Log`, read from its text (recurring.ts); a daily note its
// checkbox progress, and any item read with its text its description excerpt (body.ts).

import { getBody } from "pomade-kit/frontmatter";
import { isLocalDate, type LocalDate } from "pomade-kit/schedule";

import { checkboxProgress, excerptOf, type Progress } from "./body";
import { isProjectFolder } from "./projects";
import { newestLog, readLog, readRepeat, REPEAT_KEY, type LogEntry, type Repeat } from "./recurring";

/** The item types this Planner reads. */
export const PLANNER_TYPES = ["task", "recurring", "daily-note", "note", "thought"] as const;
export type PlannerType = (typeof PLANNER_TYPES)[number];

/** The types with a checkbox and dates — the only ones Today and Project show. */
export const isTaskType = (type: PlannerType): boolean => type === "task" || type === "recurring";

export const FIELD = {
  type: "type",
  title: "title",
  status: "status",
  doOn: "do-on",
  deadline: "deadline",
  importance: "importance",
  created: "created",
  doneOn: "done-on",
  date: "date",
  repeat: REPEAT_KEY,
} as const;

export const STATUS = { open: "open", done: "done", resolved: "resolved" } as const;

export interface Task {
  /** Workspace-relative. */
  path: string;
  name: string;
  /** The project sub-folder it is in; `null` for a workspace-level item. */
  folder: string | null;
  type: PlannerType;
  /** `title:`, else the file name without `.md`. */
  title: string;
  /** `title:` is set (a daily note without one reads as its date). */
  titled: boolean;
  /** Done (`status: done`), or — a thought — resolved (`status: resolved`). Notes and daily notes never are. */
  done: boolean;
  /** In `_archive/` (or one of its sub-folders). */
  archived: boolean;
  /** A daily note's `date:`. */
  date: LocalDate | null;
  doOn: LocalDate | null;
  deadline: LocalDate | null;
  importance: number | null;
  created: LocalDate | null;
  doneOn: LocalDate | null;
  /** Fields set to something that isn't a value of their kind ("do-on isn't a date"). */
  problems: string[];
  mtimeMs: number;
  /** A recurring item's rule; `null` for every other type. */
  repeat: Repeat | null;
  /** A recurring item's newest `## Log` entry. */
  lastLog: LogEntry | null;
  /** A daily note's ticked and all checklist lines; `null` until its text is read. */
  progress: Progress | null;
  /** The first lines of the description, markdown stripped; `null` when its text wasn't read or it has none. */
  excerpt: string | null;
}

export interface UnreadableItem {
  path: string;
  name: string;
  folder: string | null;
  archived: boolean;
  type: PlannerType;
  /** Why it can't be read, as the parser reported it. */
  reason: string;
}

/** What a folder listing gives for one file (`files.readFolder` with `frontmatter: true`, or the command's own read). */
export interface ItemEntry {
  path: string;
  name: string;
  kind: "file" | "dir";
  mtimeMs: number;
  frontmatter?: Record<string, unknown> | null;
  frontmatterError?: string;
}

export function isPlannerType(value: unknown): value is PlannerType {
  return typeof value === "string" && (PLANNER_TYPES as readonly string[]).includes(value.trim());
}

const isMarkdown = (entry: ItemEntry): boolean => entry.kind === "file" && entry.name.toLowerCase().endsWith(".md");

/** Whether an entry with a frontmatter error needs its text read to see if it is a Planner item. */
export const needsTypeCheck = (entry: ItemEntry): boolean => isMarkdown(entry) && entry.frontmatterError !== undefined;

/** The type of an entry with readable frontmatter, or `null` when it isn't a Planner item. */
function typeOf(entry: ItemEntry): PlannerType | null {
  if (!isMarkdown(entry) || entry.frontmatterError !== undefined) return null;
  const type = entry.frontmatter?.[FIELD.type];
  return isPlannerType(type) ? (type.trim() as PlannerType) : null;
}

/**
 * Whether an entry's text must be read: a recurring item's for its `## Log`, a daily note's for its
 * checkbox progress — and, with `all` (the full tab's excerpts), every item's.
 */
export function needsText(entry: ItemEntry, all = false): boolean {
  const type = typeOf(entry);
  return type !== null && (all || type === "recurring" || type === "daily-note");
}

/**
 * The `type:` of a file whose frontmatter can't be parsed, read from its text: a top-level
 * `type: <known type>` line inside the leading `---` block (quoted or not, with or without a
 * trailing comment). `null` when there is none or it names a type the Planner doesn't know.
 */
export function brokenItemType(text: string): PlannerType | null {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;
  for (const line of lines.slice(1)) {
    if (line.trim() === "---" || line.trim() === "...") break;
    const match = /^type\s*:\s*(["']?)([A-Za-z-]+)\1\s*(?:#.*)?$/.exec(line);
    if (match && isPlannerType(match[2])) return match[2] as PlannerType;
  }
  return null;
}

function textOf(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

const isEmpty = (value: unknown): boolean => value === undefined || value === null || (typeof value === "string" && value.trim() === "");

function dateField(fm: Record<string, unknown>, key: string, problems: string[]): LocalDate | null {
  const value = fm[key];
  if (isEmpty(value)) return null;
  if (typeof value === "string" && isLocalDate(value.trim())) return value.trim();
  problems.push(`${key} isn't a date (YYYY-MM-DD)`);
  return null;
}

function numberField(fm: Record<string, unknown>, key: string, problems: string[]): number | null {
  const value = fm[key];
  if (isEmpty(value)) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(value.trim())) return Number(value.trim());
  problems.push(`${key} isn't a number`);
  return null;
}

/** Whether an item of `type` with `status` is closed: a task done, a thought resolved. */
function isClosed(type: PlannerType, status: string | null): boolean {
  if (type === "thought") return status === STATUS.resolved;
  if (type === "task" || type === "recurring") return status === STATUS.done;
  return false;
}

/**
 * One entry with readable frontmatter as an item (in `folder`, or workspace-level; `archived`: in
 * `_archive/`); `null` when it isn't a Planner item. `text`: its whole text, when read — a
 * recurring item's log, a daily note's progress, the excerpt.
 */
export function taskOf(entry: ItemEntry, folder: string | null = null, text: string | null = null, archived = false): Task | null {
  const type = typeOf(entry);
  const fm = entry.frontmatter;
  if (type === null || !fm) return null;
  const problems: string[] = [];
  const recurring = type === "recurring";
  const title = textOf(fm[FIELD.title]);
  const body = text === null ? null : getBody(text);
  return {
    path: entry.path,
    name: entry.name,
    folder,
    type,
    title: title ?? entry.name.replace(/\.md$/i, ""),
    titled: title !== null,
    done: isClosed(type, textOf(fm[FIELD.status])),
    archived,
    date: type === "daily-note" ? dateField(fm, FIELD.date, problems) : null,
    doOn: dateField(fm, FIELD.doOn, problems),
    deadline: dateField(fm, FIELD.deadline, problems),
    importance: numberField(fm, FIELD.importance, problems),
    created: dateField(fm, FIELD.created, problems),
    doneOn: dateField(fm, FIELD.doneOn, problems),
    problems,
    mtimeMs: entry.mtimeMs,
    repeat: recurring ? readRepeat(fm[FIELD.repeat]) : null,
    lastLog: recurring && body !== null ? newestLog(readLog(body)) : null,
    progress: type === "daily-note" && body !== null ? checkboxProgress(body) : null,
    excerpt: body === null ? null : excerptOf(body),
  };
}

export interface Items {
  tasks: Task[];
  unreadable: UnreadableItem[];
  /** The tasks root's project sub-folders (`isProjectFolder`), by name, sorted. */
  folders: string[];
}

/** The project sub-folders among the tasks root's entries. */
export function projectFolders(rootEntries: readonly ItemEntry[]): string[] {
  return rootEntries
    .filter((e) => e.kind === "dir" && isProjectFolder(e.name))
    .map((e) => e.name)
    .sort();
}

/**
 * The items among one folder's entries — the root's or `Daily/`'s (`folder` null), a project
 * sub-folder's, or (`archived`) `_archive/`'s and its sub-folders'. `brokenTypes` holds, for each
 * entry `needsTypeCheck` picked, the type its text names (`brokenItemType`), or `null`; `texts` the
 * whole text of each entry `needsText` picked.
 */
export function readItems(
  entries: readonly ItemEntry[],
  brokenTypes: ReadonlyMap<string, PlannerType | null>,
  folder: string | null = null,
  texts: ReadonlyMap<string, string> = new Map(),
  archived = false,
): Omit<Items, "folders"> {
  const tasks: Task[] = [];
  const unreadable: UnreadableItem[] = [];
  for (const entry of entries) {
    if (needsTypeCheck(entry)) {
      const type = brokenTypes.get(entry.path) ?? null;
      if (type !== null) unreadable.push({ path: entry.path, name: entry.name, folder, archived, type, reason: entry.frontmatterError ?? "" });
      continue;
    }
    const task = taskOf(entry, folder, texts.get(entry.path) ?? null, archived);
    if (task) tasks.push(task);
  }
  unreadable.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { tasks, unreadable };
}

/** The items of the root and its project sub-folders together: tasks in read order, unreadable ones by path. */
export function mergeItems(parts: readonly Omit<Items, "folders">[], folders: readonly string[]): Items {
  const unreadable = parts.flatMap((p) => p.unreadable);
  unreadable.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { tasks: parts.flatMap((p) => p.tasks), unreadable, folders: [...folders] };
}

/** The folders the Planner reads besides the project sub-folders ([[storage-and-item-types]] "Storage"). */
export const DAILY_FOLDER = "Daily";
export const ARCHIVE_FOLDER = "_archive";

/**
 * Whether a watch change under the tasks root can change its items or folders: the root itself,
 * an entry directly in it, an entry directly in one of its sub-folders, or one directly in a
 * sub-folder of `_archive/` — at either end of a rename.
 */
export function isItemChange(change: { path: string; oldPath?: string }, root: string): boolean {
  const concerns = (path: string): boolean => {
    if (path === root) return true;
    const prefix = root === "" ? "" : `${root}/`;
    if (!path.startsWith(prefix)) return false;
    const parts = path.slice(prefix.length).split("/");
    return parts.length <= 2 || (parts.length === 3 && parts[0] === ARCHIVE_FOLDER);
  };
  return concerns(change.path) || (change.oldPath !== undefined && concerns(change.oldPath));
}
