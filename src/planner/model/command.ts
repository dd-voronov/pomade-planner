// `pomade-planner today` ([[today-command]]): its arguments and what it prints — the Today module's rows as
// text or JSON, grouped by project like the Workspace Today, or narrowed to one project. The
// command itself (cli/main.ts) only reads files.

import { isLocalDate, type LocalDate } from "pomade-kit/schedule";

import { isTaskType, type Items, type UnreadableItem } from "./items";
import { dayHeading, importanceText, todayHints } from "./labels";
import { folderKey, folderSources, matchProject, NONE_SOURCE, sectionsBySource, sourceKey, sourceLabels, type FolderMap, type ProjectSource, type Source } from "./projects";
import { todayRows, type TodayRow } from "./today";

export const USAGE = `Usage: pomade-planner today [--project <name>] [--json] [--date YYYY-MM-DD]

Prints the Planner's Today: overdue tasks, tasks due today, tasks planned for today or
earlier, and recurring tasks that are due, missed or inside their lead time — the same items,
in the same order and under the same project headings, as the Workspace Today in Pomade — and
the path of the day's daily note when there is one.

  --project <name>     only that project's Today; two projects of one name: "<name> (<group>)"
  --json               one JSON object: the day, its daily note, its items (each with its reason),
                       unreadable files
  --date YYYY-MM-DD    Today as of that planner day instead of now
  -h, --help           this help`;

export type CommandArgs =
  | { kind: "today"; json: boolean; date: LocalDate | null; project: string | null }
  | { kind: "help" }
  | { kind: "error"; message: string };

export function parseArgs(argv: readonly string[]): CommandArgs {
  if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) return { kind: "help" };
  const [command, ...rest] = argv;
  if (command !== "today") return { kind: "error", message: `Unknown command "${command ?? ""}".` };
  let json = false;
  let date: LocalDate | null = null;
  let project: string | null = null;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] ?? "";
    if (arg === "--json") json = true;
    else if (arg === "--date" || arg.startsWith("--date=")) {
      const value = arg === "--date" ? rest[++i] : arg.slice("--date=".length);
      if (value === undefined || !isLocalDate(value)) return { kind: "error", message: `--date needs a date as YYYY-MM-DD, got "${value ?? ""}".` };
      date = value;
    } else if (arg === "--project" || arg.startsWith("--project=")) {
      const value = arg === "--project" ? rest[++i] : arg.slice("--project=".length);
      if (value === undefined || value.trim() === "") return { kind: "error", message: "--project needs a project's name." };
      project = value;
    } else return { kind: "error", message: `Unknown option "${arg}".` };
  }
  return { kind: "today", json, date, project };
}

export interface TodayReport {
  day: LocalDate;
  /** The day's daily note (workspace-relative) when its file exists; `null` otherwise, and with `--project`. */
  "daily-note": string | null;
  items: {
    title: string;
    type: string;
    /** The item's project; `null` for a workspace-level item. */
    project: string | null;
    status: "open" | "done";
    "do-on": LocalDate | null;
    deadline: LocalDate | null;
    importance: number | null;
    created: LocalDate | null;
    "done-on": LocalDate | null;
    reason: TodayRow["reason"];
    /** Days since `do-on` for a `rolled-over` item; 0 otherwise. */
    "planned-days-ago": number;
    /** A recurring item's missed occurrences ("missed N×"; 1 when only its `do-on` has passed); 0 otherwise. */
    missed: number;
    /** Workspace-relative. */
    path: string;
  }[];
  /** Files of a Planner type whose frontmatter can't be read. */
  unreadable: { path: string; reason: string }[];
}

/** An item's project as the command names it: its label (`QuizLab`, `QuizLab (Archive)`), `null` for a workspace-level item. */
export type ProjectName = (folder: string | null) => string | null;

const noProject: ProjectName = () => null;

export function todayReport(day: LocalDate, rows: readonly TodayRow[], unreadable: readonly UnreadableItem[], projectOf: ProjectName = noProject, dailyNote: string | null = null): TodayReport {
  return {
    day,
    "daily-note": dailyNote,
    items: rows.map(({ task, reason, plannedDaysAgo, recurring }) => ({
      title: task.title,
      type: task.type,
      project: projectOf(task.folder),
      status: task.done ? "done" : "open",
      "do-on": task.doOn,
      deadline: task.deadline,
      importance: task.importance,
      created: task.created,
      "done-on": task.doneOn,
      reason,
      "planned-days-ago": plannedDaysAgo,
      missed: recurring?.missed ?? 0,
      path: task.path,
    })),
    unreadable: unreadable.map((u) => ({ path: u.path, reason: u.reason })),
  };
}

const REASON_WORDS: Record<TodayRow["reason"], string> = {
  overdue: "overdue",
  "due-today": "due today",
  planned: "planned today",
  "rolled-over": "rolled over",
  "recurring-due": "due",
  "lead-time": "coming up",
};

function rowLine(row: TodayRow, day: LocalDate): string {
  const hints = todayHints(row, day)
    .filter((h) => h.kind !== "problem")
    .map((h) => h.text.charAt(0).toLowerCase() + h.text.slice(1));
  const details = hints.length > 0 ? hints : [REASON_WORDS[row.reason]];
  const importance = importanceText(row.task.importance);
  if (importance !== null) details.push(importance);
  return `  [${row.task.done ? "x" : " "}] ${row.task.title} — ${details.join(", ")}`;
}

export interface TextOptions {
  /** Each item's source, for the project headings. */
  sourceOf?: (folder: string | null) => Source;
  /** A source's heading (`sourceLabels` text). */
  labelOf?: (source: Source) => string;
  /** The project `--project` narrowed to: its label goes into the heading and no project headings follow. */
  narrowedTo?: string | null;
  /** The day's daily note, when its file exists: a line under the heading. */
  dailyNote?: string | null;
}

/**
 * The text output: a heading with the planner day, then the items — under project headings ("No
 * project" first, then each project by name) as soon as one item has a project, as the Workspace
 * Today shows them — then the unreadable files. The day's daily note, when there is one, under the
 * heading.
 */
export function todayText(day: LocalDate, rows: readonly TodayRow[], unreadable: readonly UnreadableItem[], options: TextOptions = {}): string {
  const { sourceOf = () => NONE_SOURCE, labelOf = () => "No project", narrowedTo = null, dailyNote = null } = options;
  const lines = [narrowedTo === null ? `Today — ${dayHeading(day)}, ${day.slice(0, 4)}` : `Today — ${narrowedTo} — ${dayHeading(day)}, ${day.slice(0, 4)}`];
  if (dailyNote !== null) lines.push(`  Daily note: ${dailyNote}`);
  const sections = sectionsBySource(rows, (row) => sourceOf(row.task.folder));
  if (rows.length === 0) lines.push("  Nothing for today.");
  else if (narrowedTo !== null || sections.every((s) => s.source.kind === "none")) for (const row of rows) lines.push(rowLine(row, day));
  else {
    for (const section of sections) {
      lines.push("", labelOf(section.source));
      for (const row of section.items) lines.push(rowLine(row, day));
    }
  }
  if (unreadable.length > 0) {
    lines.push("", "Can't read (open to fix):");
    for (const u of unreadable) lines.push(`  ${u.path} — ${u.reason}`);
  }
  return `${lines.join("\n")}\n`;
}

export type TodayOutput = { ok: true; text: string } | { ok: false; code: number; message: string };

/**
 * The command's whole answer for the tasks root's items on `day`: every item grouped by project, or
 * — with `--project` — one project's Today. `map` is the settings' project-id → folder map, which
 * names the folders' projects (a folder no project owns goes by its own name). `dailyNote`: the
 * day's daily note when its file exists — named in the workspace-wide answer only.
 */
export function todayOutput(args: { json: boolean; project: string | null }, day: LocalDate, items: Items, map: FolderMap, dailyNote: string | null = null): TodayOutput {
  const sources = folderSources(items.folders, map, null);
  const all = [...sources.values()];
  const labels = sourceLabels(all);
  const sourceOf = (folder: string | null): Source => (folder === null ? NONE_SOURCE : (sources.get(folderKey(folder)) ?? NONE_SOURCE));
  const labelOf = (source: Source): string => labels.get(sourceKey(source))?.text ?? "No project";
  const projectOf: ProjectName = (folder) => (folder === null ? null : labelOf(sourceOf(folder)));

  let narrowed: ProjectSource | null = null;
  if (args.project !== null) {
    const match = matchProject(args.project, all);
    if (match.kind === "ambiguous") {
      return { ok: false, code: 2, message: `More than one project is named "${args.project.trim()}" — name one of them: ${match.choices.map((c) => `"${c}"`).join(", ")}.` };
    }
    if (match.kind === "none") {
      const known = match.known.length === 0 ? "No project has tasks yet." : `Projects with tasks: ${match.known.join(", ")}.`;
      return { ok: false, code: 2, message: `No project named "${args.project.trim()}". ${known}` };
    }
    narrowed = match.source;
  }
  const mine = (folder: string | null): boolean => narrowed === null || (folder !== null && sourceKey(sourceOf(folder)) === narrowed.key);
  const rows = todayRows(
    items.tasks.filter((t) => mine(t.folder)),
    day,
  );
  const unreadable = items.unreadable.filter((u) => !u.archived && isTaskType(u.type) && mine(u.folder));
  const note = narrowed === null ? dailyNote : null;
  if (args.json) return { ok: true, text: `${JSON.stringify(todayReport(day, rows, unreadable, projectOf, note), null, 2)}\n` };
  return { ok: true, text: todayText(day, rows, unreadable, { sourceOf, labelOf, narrowedTo: narrowed === null ? null : labelOf(narrowed), dailyNote: note }) };
}
