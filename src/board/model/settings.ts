// The Board's settings ([[settings-and-state]]) and where a project's backlog is ([[backlog-location]]).
//
// - Synced settings: `<workspace>/Apps/pomade-board/settings.json` (core/settings-file), git-synced
//   with the workspace. The Board reads `backlogPathPattern` (default `private/roadmap/`): the backlog folder,
//   relative to a project's root; and `reporter` (default `d.voronov`): the handle written as
//   `reporter:` on the tickets it creates. A missing file means every default; the app never
//   creates it on read. A key with a wrong value falls back to its default on its own. Both are
//   edited on the Board's settings page.
// - Per-project app settings (Host API `project.getSettings`): `backlogPath` — the folder the user
//   chose, relative to the project root, overriding the pattern — and `moveDoneToDoneFolder`
//   (default true).

import { joinPath, normalizeWorkspacePath, type JsonValue } from "pomade-kit/protocol";

import { parseSettingsText, settingsPathOf } from "../../core/settings-file";

/** Workspace-relative path of the Board's synced settings file. */
export const SYNCED_SETTINGS_PATH = settingsPathOf("pomade-board");

/** The default backlog folder, relative to a project's root. */
const DEFAULT_BACKLOG_FOLDER = "private/roadmap";
export const DEFAULT_BACKLOG_PATTERN = `${DEFAULT_BACKLOG_FOLDER}/`;
export const DEFAULT_REPORTER = "d.voronov";

/** A frame that writes the synced settings tells the Board's other frames, which may not see the file's folder yet (state key). */
export const SETTINGS_CHANGED_KEY = "board.settingsWritten";

export const SYNCED_KEYS = { backlogPathPattern: "backlogPathPattern", reporter: "reporter" } as const;

export interface SyncedSettings {
  backlogPathPattern: string;
  /** The handle written as `reporter:` on the tickets the Board creates. */
  reporter: string;
}

export const DEFAULT_SYNCED_SETTINGS: SyncedSettings = { backlogPathPattern: DEFAULT_BACKLOG_PATTERN, reporter: DEFAULT_REPORTER };

export interface ParsedSyncedSettings {
  settings: SyncedSettings;
  /** What was wrong with the file, when something was; the defaults stand in for it. */
  problem: string | null;
}

/** A project-relative folder: no leading or trailing slash, no `.` segments; `null` when it is absolute or climbs out with `..`. */
export function normalizeRelative(path: string): string | null {
  if (path.startsWith("/") || path.includes("\\")) return null;
  const normalized = normalizeWorkspacePath(path);
  return normalized.ok ? normalized.path : null;
}

/** A reporter handle as typed, trimmed (`d.voronov`, `claude`); `null` when it is empty or holds a space. */
export function normalizeReporter(value: string): string | null {
  const handle = value.trim();
  return handle !== "" && !/\s/.test(handle) ? handle : null;
}

/**
 * What the settings page writes as `backlogPathPattern` for a typed folder: the folder with a
 * trailing slash (`./` for the project's root); `undefined` for an empty field — the key is removed
 * and the default applies; `null` when it is absolute or climbs out of the project.
 */
export function patternOf(typed: string): string | undefined | null {
  const text = typed.trim();
  if (text === "") return undefined;
  const relative = normalizeRelative(text);
  if (relative === null) return null;
  return relative === "" ? "./" : `${relative}/`;
}

/** Synced settings from the file's text (`null` = the file does not exist). */
export function parseSyncedSettings(text: string | null): ParsedSyncedSettings {
  const { object, problem } = parseSettingsText(text, SYNCED_SETTINGS_PATH);
  if (object === null) return { settings: DEFAULT_SYNCED_SETTINGS, problem };
  const settings: SyncedSettings = { ...DEFAULT_SYNCED_SETTINGS };
  const problems: string[] = [];

  const pattern = object[SYNCED_KEYS.backlogPathPattern];
  if (typeof pattern === "string" && pattern.trim() !== "" && normalizeRelative(pattern.trim()) !== null) settings.backlogPathPattern = pattern.trim();
  else if (pattern !== undefined) problems.push(`backlogPathPattern must be a folder inside the project, like "${DEFAULT_BACKLOG_PATTERN}"`);

  const reporter = object[SYNCED_KEYS.reporter];
  const handle = typeof reporter === "string" ? normalizeReporter(reporter) : null;
  if (handle !== null) settings.reporter = handle;
  else if (reporter !== undefined) problems.push(`reporter must be a handle without spaces, like "d.voronov"`);

  return { settings, problem: problems.length > 0 ? problems.join("; ") : null };
}

export interface ProjectBoardSettings {
  /** The chosen backlog folder, relative to the project root; `null` = use the pattern. */
  backlogPath: string | null;
  moveDoneToDoneFolder: boolean;
}

export const PROJECT_KEYS = { backlogPath: "backlogPath", moveDone: "moveDoneToDoneFolder" } as const;

/** The Board's per-project settings from the app's settings for the project (`project.getSettings`). */
export function parseProjectSettings(settings: Record<string, JsonValue>): ProjectBoardSettings {
  const path = settings[PROJECT_KEYS.backlogPath];
  const move = settings[PROJECT_KEYS.moveDone];
  return {
    backlogPath: typeof path === "string" ? normalizeRelative(path) : null,
    moveDoneToDoneFolder: typeof move === "boolean" ? move : true,
  };
}

export interface BacklogLocation {
  /** Workspace-relative folder. */
  path: string;
  /** Relative to the project root, as shown to the user. */
  relative: string;
  /** `chosen`: the project's own setting; `pattern`: the synced pattern under the project root. */
  source: "chosen" | "pattern";
}

/** Where to look for a project's backlog: the chosen folder when set, else the pattern under the project root. */
export function backlogLocation(projectRoot: string, project: ProjectBoardSettings, synced: Pick<SyncedSettings, "backlogPathPattern">): BacklogLocation {
  if (project.backlogPath !== null) {
    return { path: joinPath(projectRoot, project.backlogPath), relative: project.backlogPath, source: "chosen" };
  }
  const relative = normalizeRelative(synced.backlogPathPattern) ?? DEFAULT_BACKLOG_FOLDER;
  return { path: joinPath(projectRoot, relative), relative, source: "pattern" };
}

/** A picked folder (workspace-relative) as a path relative to the project root; `null` when it is outside the project. */
export function relativeToProject(projectRoot: string, picked: string): string | null {
  const root = normalizeWorkspacePath(projectRoot);
  const folder = normalizeWorkspacePath(picked);
  if (!root.ok || !folder.ok) return null;
  if (root.path === "") return folder.path;
  if (folder.path === root.path) return "";
  return folder.path.startsWith(`${root.path}/`) ? folder.path.slice(root.path.length + 1) : null;
}
