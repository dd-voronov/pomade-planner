// The Planner's synced settings file, `<workspace>/Apps/pomade-planner/settings.json` (DESIGN §5,
// core/settings-file), and its keys: `tasksRoot` — the
// workspace-relative folder the tasks live in, chosen on first run (no default) — `dayBoundary` —
// when a planner day starts, `H:MM`, default 3:00 — and `projectFolders`, the project-id → folder
// map (model/projects). The UI and the `today` command read them the same way.

import { normalizeWorkspacePath } from "pomade-kit/protocol";
import { formatTime, parseTime, type Time } from "pomade-kit/schedule";

import { parseSettingsText, settingsPathOf } from "../../core/settings-file";
import { parseFolderMap, PROJECT_FOLDERS_KEY, type FolderMap } from "./projects";

/** Workspace-relative path of the Planner's synced settings file. */
export const SYNCED_SETTINGS_PATH = settingsPathOf("pomade-planner");

export const DEFAULT_DAY_BOUNDARY: Time = { hour: 3, minute: 0 };

export const PLANNER_KEYS = { tasksRoot: "tasksRoot", dayBoundary: "dayBoundary", dailyNoteTemplate: "dailyNoteTemplate", projectFolders: PROJECT_FOLDERS_KEY } as const;

export interface PlannerSettings {
  /** Workspace-relative; `null` until the user chooses one. */
  tasksRoot: string | null;
  dayBoundary: Time;
  /** Workspace-relative path of the daily-note template; `null`: the built-in one. */
  dailyNoteTemplate: string | null;
  /** Project id → its sub-folder of the tasks root. */
  projectFolders: FolderMap;
}

export interface ParsedPlannerSettings {
  settings: PlannerSettings;
  /** What was wrong with the file or a key, when something was; the defaults stand in for it. */
  problem: string | null;
}

/** A workspace-relative folder as the settings store it; `null` when it is absolute or climbs out. */
export function normalizeTasksRoot(path: string): string | null {
  if (path.startsWith("/") || path.includes("\\")) return null;
  const normalized = normalizeWorkspacePath(path);
  return normalized.ok ? normalized.path : null;
}

/**
 * A daily-note template path as the settings store it — workspace-relative, a Markdown file — or
 * why it can't be one.
 */
export function normalizeTemplatePath(path: string): { ok: true; path: string } | { ok: false; problem: string } {
  const trimmed = path.trim();
  const normalized = normalizeTasksRoot(trimmed);
  if (normalized === null || normalized === "") return { ok: false, problem: "A path inside the workspace, like Templates/Daily.md" };
  if (!normalized.toLowerCase().endsWith(".md")) return { ok: false, problem: "A Markdown file — its name ends in .md" };
  return { ok: true, path: normalized };
}

/** The Planner's settings from the file's text (`null` = the file does not exist). */
export function parsePlannerSettings(text: string | null): ParsedPlannerSettings {
  const { object, problem } = parseSettingsText(text, SYNCED_SETTINGS_PATH);
  const settings: PlannerSettings = { tasksRoot: null, dayBoundary: DEFAULT_DAY_BOUNDARY, dailyNoteTemplate: null, projectFolders: {} };
  if (object === null) return { settings, problem };
  const problems: string[] = [];

  const root = object[PLANNER_KEYS.tasksRoot];
  if (typeof root === "string" && normalizeTasksRoot(root) !== null) settings.tasksRoot = normalizeTasksRoot(root);
  else if (root !== undefined && root !== null) problems.push(`tasksRoot must be a folder inside the workspace, like "Tasks"`);

  const boundary = object[PLANNER_KEYS.dayBoundary];
  const time = typeof boundary === "string" ? parseTime(boundary.trim()) : null;
  if (time !== null) settings.dayBoundary = time;
  else if (boundary !== undefined && boundary !== null) problems.push(`dayBoundary must be a time like "3:00"`);

  const template = object[PLANNER_KEYS.dailyNoteTemplate];
  const templatePath = typeof template === "string" && template.trim() !== "" ? normalizeTemplatePath(template) : null;
  if (templatePath?.ok) settings.dailyNoteTemplate = templatePath.path;
  else if (template !== undefined && template !== null && !(typeof template === "string" && template.trim() === "")) {
    problems.push(`dailyNoteTemplate must be a Markdown file inside the workspace, like "Templates/Daily.md"`);
  }

  const folders = parseFolderMap(object[PLANNER_KEYS.projectFolders]);
  settings.projectFolders = folders.map;
  if (folders.problem !== null) problems.push(folders.problem);

  return { settings, problem: problems.length > 0 ? problems.join("; ") : null };
}

/** The boundary as the settings file writes it: `3:00`, `23:30`. */
export const formatBoundary = (time: Time): string => formatTime(time);
