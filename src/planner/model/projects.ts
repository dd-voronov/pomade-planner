// Projects in the tasks root (DESIGN §3.1): each project's items live in a sub-folder named after
// it, and the synced settings hold a project-id → folder map (`projectFolders`) that is the
// source of truth once written — so a rename in Pomade never orphans a project's tasks. Pure: the
// UI, the reconciliation and the `today` command all decide with these functions.
//
// - A folder name is the project's name made safe on disk: `/`, `\` and `:` become `-`, control
//   characters go, leading dots and spaces and trailing dots and spaces are trimmed, at most
//   `NAME_MAX` characters; nothing left is "Project".
// - Candidates, in order: the name; `<name> (<group>)` (its innermost group); `<name> (<a › b>)`
//   (its whole group path, when nested); then `<name> (<group> 2)`, `(… 3)`, … (`<name> (2)` when
//   ungrouped). A candidate is free unless another project's map entry holds it or it is a
//   reserved folder (`Daily`, `_archive`). Folder names compare case-insensitively (macOS volumes).
// - Whoever is mapped keeps its folder while that folder is still one of its free candidates: the
//   later project of a same-named pair gets the suffix, and a folder only changes when the suffix
//   rule requires it (a rename, a regroup).

/** The settings key of the project-id → folder map. */
export const PROJECT_FOLDERS_KEY = "projectFolders";

/** Sub-folders of the tasks root that are never a project's. */
export const RESERVED_FOLDERS = ["Daily", "_archive"] as const;

/** The longest folder name made from a project name (and from each group part), in characters. */
export const NAME_MAX = 80;

/** How many candidates a plan looks at — far more than any workspace has same-named projects. */
const CANDIDATES = 100;

/** One map entry: the folder, and the project's name and group path as last seen (for the `today` command, which runs without Pomade). */
export interface FolderEntry {
  folder: string;
  name: string;
  groupPath: string[];
}

/** Project id → its folder, in the file's order. */
export type FolderMap = Record<string, FolderEntry>;

/** What a plan needs of a Pomade project (`ProjectInfo`). */
export interface ProjectLike {
  id: string;
  name: string;
  groupPath: readonly string[];
}

/** How folder names compare: Unicode-normalized, case-insensitive. */
export const folderKey = (name: string): string => name.normalize("NFC").toLowerCase();

const RESERVED_KEYS = new Set(RESERVED_FOLDERS.map(folderKey));

/** Whether a sub-folder of the tasks root can hold a project's items (not hidden, not reserved). */
export const isProjectFolder = (name: string): boolean => !name.startsWith(".") && !RESERVED_KEYS.has(folderKey(name));

function cap(text: string): string {
  const chars = Array.from(text);
  return chars.length <= NAME_MAX ? text : chars.slice(0, NAME_MAX).join("");
}

/** A name part made safe on disk; `""` when nothing is left. */
function safePart(raw: string): string {
  const clean = raw
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[/\\:]/g, "-")
    .replace(/^[.\s]+/, "")
    .replace(/[.\s]+$/, "");
  return cap(clean).replace(/[.\s]+$/, "");
}

/** A project name as a folder name. */
export function sanitizeFolderName(name: string): string {
  return safePart(name) || "Project";
}

/** The folder names a project may take, in order of preference (the first `count`). */
export function folderCandidates(name: string, groupPath: readonly string[], count = CANDIDATES): string[] {
  const base = sanitizeFolderName(name);
  const groups = groupPath.map(safePart).filter((g) => g !== "");
  const last = groups.at(-1);
  const out = [base];
  if (last !== undefined) out.push(`${base} (${last})`);
  if (groups.length > 1) out.push(`${base} (${groups.join(" › ")})`);
  for (let n = 2; out.length < count; n++) out.push(`${base} (${last === undefined ? "" : `${last} `}${n})`);
  return out.slice(0, count);
}

/** The map as the settings file holds it; entries that aren't `{ folder, name?, groupPath? }` are dropped and named. */
export function parseFolderMap(value: unknown): { map: FolderMap; problem: string | null } {
  if (value === undefined || value === null) return { map: {}, problem: null };
  if (typeof value !== "object" || Array.isArray(value)) return { map: {}, problem: `${PROJECT_FOLDERS_KEY} must be an object of project id → folder` };
  const map: FolderMap = {};
  const bad: string[] = [];
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    const entry = raw as Partial<Record<keyof FolderEntry, unknown>> | null;
    const folder = typeof entry === "object" && entry !== null && typeof entry.folder === "string" ? entry.folder : null;
    if (folder === null || folder === "" || folder.includes("/") || !isProjectFolder(folder)) {
      bad.push(id);
      continue;
    }
    const name = typeof entry?.name === "string" && entry.name !== "" ? entry.name : folder;
    const groupPath = Array.isArray(entry?.groupPath) ? entry.groupPath.filter((g): g is string => typeof g === "string") : [];
    map[id] = { folder, name, groupPath };
  }
  return { map, problem: bad.length === 0 ? null : `${PROJECT_FOLDERS_KEY}: ${bad.join(", ")} ${bad.length === 1 ? "has" : "have"} no usable folder` };
}

/** The map as the settings file writes it. */
export function serializeFolderMap(map: FolderMap): Record<string, { folder: string; name: string; groupPath: string[] }> {
  return Object.fromEntries(Object.entries(map).map(([id, e]) => [id, { folder: e.folder, name: e.name, groupPath: [...e.groupPath] }]));
}

const heldByOther = (map: FolderMap, key: string, id: string): boolean => Object.entries(map).some(([other, e]) => other !== id && folderKey(e.folder) === key);

/** A project's candidates that are free for it: not reserved, not another project's. */
function freeCandidates(project: ProjectLike, map: FolderMap): string[] {
  return folderCandidates(project.name, project.groupPath).filter((c) => isProjectFolder(c) && !heldByOther(map, folderKey(c), project.id));
}

const entryOf = (project: ProjectLike, folder: string): FolderEntry => ({ folder, name: project.name, groupPath: [...project.groupPath] });

/**
 * The folder a new item of `project` goes into: its mapped folder, else its first free candidate
 * (an existing folder of that name, not another project's, is taken over). `entry` is what the map
 * must hold for it afterwards; `isNew` when the map has no entry yet.
 */
export function folderForNew(project: ProjectLike, map: FolderMap): { folder: string; entry: FolderEntry; isNew: boolean } {
  const mapped = map[project.id];
  if (mapped !== undefined) return { folder: mapped.folder, entry: entryOf(project, mapped.folder), isNew: false };
  const folder = freeCandidates(project, map)[0] ?? sanitizeFolderName(project.name);
  return { folder, entry: entryOf(project, folder), isNew: true };
}

export interface FolderMove {
  id: string;
  from: string;
  to: string;
}

export interface FolderCollision {
  id: string;
  /** The project's name now. */
  name: string;
  /** Where its items stay. */
  from: string;
  /** The folder it should have, already there and not its own. */
  to: string;
}

export interface FolderPlan {
  /** The map once every move is done. */
  map: FolderMap;
  /** Folders to rename, in order. */
  moves: FolderMove[];
  /** Renames refused: the target folder is already there. Never merged. */
  collisions: FolderCollision[];
  /** Whether `map` differs from the map given. */
  changed: boolean;
}

/**
 * Bring the map and the folders in line with the projects as Pomade has them now (`projects` in
 * sidebar order; `disk` = the tasks root's sub-folders). One rule covers a rename heard as an
 * event, a rename made while Pomade was closed, and a regroup:
 *
 * - A mapped project keeps its folder while the folder is one of its free candidates. Otherwise
 *   its folder should become its first free candidate: renamed when the old folder is there and
 *   the new one isn't; refused as a collision when both are there; when the old folder is gone,
 *   the entry simply points at the new name (made on the next add, or already there).
 * - An unmapped project whose first free candidate is already a folder takes it over — the first
 *   one in sidebar order, so a same-named pair resolves the same way every time.
 * - Entries of projects Pomade no longer lists stay: they keep their folder's name reserved.
 */
export function planFolders(projects: readonly ProjectLike[], map: FolderMap, disk: readonly string[]): FolderPlan {
  const next: FolderMap = Object.fromEntries(Object.entries(map).map(([id, e]) => [id, { ...e, groupPath: [...e.groupPath] }]));
  const onDisk = new Set(disk.map(folderKey));
  const moves: FolderMove[] = [];
  const collisions: FolderCollision[] = [];

  for (const project of projects) {
    const current = next[project.id];
    if (current === undefined) continue;
    const free = freeCandidates(project, next);
    const currentKey = folderKey(current.folder);
    if (free.some((c) => folderKey(c) === currentKey)) {
      next[project.id] = entryOf(project, current.folder);
      continue;
    }
    const target = free[0];
    if (target === undefined) continue;
    if (!onDisk.has(currentKey)) {
      next[project.id] = entryOf(project, target);
    } else if (onDisk.has(folderKey(target))) {
      collisions.push({ id: project.id, name: project.name, from: current.folder, to: target });
      next[project.id] = entryOf(project, current.folder);
    } else {
      moves.push({ id: project.id, from: current.folder, to: target });
      onDisk.delete(currentKey);
      onDisk.add(folderKey(target));
      next[project.id] = entryOf(project, target);
    }
  }

  for (const project of projects) {
    if (next[project.id] !== undefined) continue;
    const target = freeCandidates(project, next)[0];
    if (target !== undefined && onDisk.has(folderKey(target))) next[project.id] = entryOf(project, target);
  }

  return { map: next, moves, collisions, changed: JSON.stringify(serializeFolderMap(next)) !== JSON.stringify(serializeFolderMap(map)) };
}

// ── Sources: whose an item is ──

/** The key of workspace-level items (no project) wherever sources are keyed. */
export const NO_PROJECT = "none";

export interface ProjectSource {
  kind: "project";
  /** The project id, or `folder:<folder>` for a folder no project owns. */
  key: string;
  /** `null` for a folder no project owns. */
  id: string | null;
  name: string;
  groupPath: string[];
  folder: string;
}

export type Source = { kind: "none" } | ProjectSource;

export const NONE_SOURCE: Source = { kind: "none" };

export const sourceKey = (source: Source): string => (source.kind === "none" ? NO_PROJECT : source.key);

/**
 * Who owns each sub-folder: the map (with what a plan would do — a takeover, an entry pointed at
 * its renamed folder — so a folder shows as its project's before the map is written; a mapped
 * folder still there stays its project's until its move is made), names and groups from Pomade's
 * live list when given
 * (`null` in the command, which has only the map); a folder nobody owns is its own source, named
 * after the folder. Keyed by `folderKey`.
 */
export function folderSources(disk: readonly string[], map: FolderMap, projects: readonly ProjectLike[] | null): Map<string, ProjectSource> {
  const planned = projects === null ? {} : planFolders(projects, map, disk).map;
  const onDisk = new Set(disk.map(folderKey));
  // A mapped folder that is there stays its project's until the move is made; one that isn't shows where the plan points.
  const effective: FolderMap = { ...planned, ...Object.fromEntries(Object.entries(map).filter(([id, e]) => onDisk.has(folderKey(e.folder)) || planned[id] === undefined)) };
  const live = new Map((projects ?? []).map((p) => [p.id, p]));
  const out = new Map<string, ProjectSource>();
  for (const [id, entry] of Object.entries(effective)) {
    const p = live.get(id);
    out.set(folderKey(entry.folder), { kind: "project", key: id, id, name: p?.name ?? entry.name, groupPath: [...(p?.groupPath ?? entry.groupPath)], folder: entry.folder });
  }
  for (const folder of disk) {
    if (!out.has(folderKey(folder))) out.set(folderKey(folder), { kind: "project", key: `folder:${folderKey(folder)}`, id: null, name: folder, groupPath: [], folder });
  }
  return out;
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** Section order: no project first, then by name, group path, folder. */
export function compareSources(a: Source, b: Source): number {
  if (a.kind === "none" || b.kind === "none") return a.kind === b.kind ? 0 : a.kind === "none" ? -1 : 1;
  return collator.compare(a.name, b.name) || collator.compare(a.groupPath.join("\u0000"), b.groupPath.join("\u0000")) || collator.compare(a.folder, b.folder);
}

/** What tells a source apart from a same-named one: its group path, "Ungrouped", or "folder only" for a folder no project owns. */
const qualifierOf = (s: ProjectSource): string => (s.id === null ? "folder only" : s.groupPath.length > 0 ? s.groupPath.join(" › ") : "Ungrouped");

/** Each source's label: its name, with its qualifier in parentheses when another source has the same name. */
export function sourceLabels(sources: readonly Source[]): Map<string, { name: string; qualifier: string | null; text: string }> {
  const counts = new Map<string, number>();
  for (const s of sources) if (s.kind === "project") counts.set(folderKey(s.name), (counts.get(folderKey(s.name)) ?? 0) + 1);
  const out = new Map<string, { name: string; qualifier: string | null; text: string }>();
  for (const s of sources) {
    if (s.kind === "none") {
      out.set(NO_PROJECT, { name: "No project", qualifier: null, text: "No project" });
      continue;
    }
    const qualifier = (counts.get(folderKey(s.name)) ?? 0) > 1 ? qualifierOf(s) : null;
    out.set(s.key, { name: s.name, qualifier, text: qualifier === null ? s.name : `${s.name} (${qualifier})` });
  }
  return out;
}

export interface Section<T> {
  source: Source;
  items: T[];
}

/** Items split by source, each keeping the order given; sections in `compareSources` order. */
export function sectionsBySource<T>(items: readonly T[], sourceOf: (item: T) => Source): Section<T>[] {
  const sections = new Map<string, Section<T>>();
  for (const item of items) {
    const source = sourceOf(item);
    const key = sourceKey(source);
    const section = sections.get(key) ?? { source, items: [] };
    section.items.push(item);
    sections.set(key, section);
  }
  return [...sections.values()].sort((a, b) => compareSources(a.source, b.source));
}

export type ProjectMatch = { kind: "one"; source: ProjectSource } | { kind: "ambiguous"; choices: string[] } | { kind: "none"; known: string[] };

/**
 * The project `--project <query>` names, case-insensitively: its label (`QuizLab`, or
 * `QuizLab (Archive)` / `QuizLab (Ungrouped)` when two share the name), `<name> (<innermost
 * group>)`, or its folder's name. Two projects of that name: ambiguous, with the labels to choose
 * from.
 */
export function matchProject(query: string, sources: readonly ProjectSource[]): ProjectMatch {
  const q = folderKey(query.trim());
  const labels = sourceLabels(sources);
  const textOf = (s: ProjectSource) => labels.get(s.key)?.text ?? s.name;
  const byName = sources.filter((s) => folderKey(s.name) === q);
  if (byName.length === 1 && byName[0] !== undefined) return { kind: "one", source: byName[0] };
  if (byName.length > 1) return { kind: "ambiguous", choices: byName.map(textOf).sort(collator.compare) };
  const spelled = (s: ProjectSource): string[] => {
    const last = s.groupPath.at(-1);
    return [textOf(s), s.folder, ...(last === undefined ? [] : [`${s.name} (${last})`])].map(folderKey);
  };
  const hits = sources.filter((s) => spelled(s).includes(q));
  if (hits.length === 1 && hits[0] !== undefined) return { kind: "one", source: hits[0] };
  if (hits.length > 1) return { kind: "ambiguous", choices: hits.map(textOf).sort(collator.compare) };
  return { kind: "none", known: sources.map(textOf).sort(collator.compare) };
}
