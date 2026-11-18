// The Board's settings (DESIGN §5) and where a project's backlog is (§4.1).
//
// - Synced settings: `<workspace>/Apps/pomade-board/settings.json` (core/settings-file), git-synced
//   with the workspace. The Board reads `backlogPathPattern` (default `docs/roadmap/`): the backlog folder,
//   relative to a project's root. A missing file means every default; the app never creates it
//   on read.
// - Per-project app settings (Host API `project.getSettings`): `backlogPath` — the folder the user
//   chose, relative to the project root, overriding the pattern — and `moveDoneToDoneFolder`
//   (default true).

import { joinPath, normalizeWorkspacePath, type JsonValue } from "pomade-kit/protocol";

import { parseSettingsText, settingsPathOf } from "../../core/settings-file";

/** Workspace-relative path of the Board's synced settings file. */
export const SYNCED_SETTINGS_PATH = settingsPathOf("pomade-board");

export const DEFAULT_BACKLOG_PATTERN = "docs/roadmap/";

export interface SyncedSettings {
  backlogPathPattern: string;
}

export const DEFAULT_SYNCED_SETTINGS: SyncedSettings = { backlogPathPattern: DEFAULT_BACKLOG_PATTERN };

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

/** Synced settings from the file's text (`null` = the file does not exist). */
export function parseSyncedSettings(text: string | null): ParsedSyncedSettings {
  const { object, problem } = parseSettingsText(text, SYNCED_SETTINGS_PATH);
  if (object === null) return { settings: DEFAULT_SYNCED_SETTINGS, problem };
  const pattern = object.backlogPathPattern;
  if (pattern === undefined) return { settings: DEFAULT_SYNCED_SETTINGS, problem: null };
  if (typeof pattern !== "string" || pattern.trim() === "" || normalizeRelative(pattern.trim()) === null) {
    return { settings: DEFAULT_SYNCED_SETTINGS, problem: `backlogPathPattern must be a folder inside the project, like "docs/roadmap/"` };
  }
  return { settings: { backlogPathPattern: pattern.trim() }, problem: null };
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
export function backlogLocation(projectRoot: string, project: ProjectBoardSettings, synced: SyncedSettings): BacklogLocation {
  if (project.backlogPath !== null) {
    return { path: joinPath(projectRoot, project.backlogPath), relative: project.backlogPath, source: "chosen" };
  }
  const relative = normalizeRelative(synced.backlogPathPattern) ?? normalizeRelative(DEFAULT_BACKLOG_PATTERN) ?? "docs/roadmap";
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
