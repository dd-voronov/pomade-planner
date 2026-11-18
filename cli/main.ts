// `pomade-planner` — the Planner's command on PATH (DESIGN §7, HOST-API §2 "Commands"). It reads
// the app's synced settings (with the project-id → folder map) and the tasks root with its project
// sub-folders straight from the workspace — never through Pomade — so it works whether Pomade runs
// or not, and hands the files to the same Today and projects modules the Planner's views use; it
// names the day's daily note (`Daily/<day>.md`) when that file exists. Built into one file with everything it imports (vite.cli.config.ts): an
// installed app folder has no node_modules.

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { resolveWorkspace } from "pomade-kit/node";
import { readFrontmatter } from "pomade-kit/protocol";

import { parseArgs, todayOutput, USAGE } from "../src/planner/model/command";
import { brokenItemType, mergeItems, needsText, needsTypeCheck, projectFolders, readItems, type ItemEntry, type Items, type PlannerType } from "../src/planner/model/items";
import { parsePlannerSettings, SYNCED_SETTINGS_PATH } from "../src/planner/model/settings";
import { dailyNotePath } from "../src/planner/model/daily";
import { plannerDay } from "../src/planner/model/today";

class Exit extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

const errnoOf = (error: unknown): string | undefined => (error as NodeJS.ErrnoException | null)?.code;

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (errnoOf(error) === "ENOENT") return null;
    throw error;
  }
}

/** One folder's entries as a folder listing with frontmatter gives them (Markdown files read, sub-folders listed), the types the unreadable ones name, and the recurring ones' texts. */
async function readFolderEntries(workspace: string, rel: string): Promise<{ entries: ItemEntry[]; brokenTypes: Map<string, PlannerType | null>; texts: Map<string, string> }> {
  const folder = join(workspace, rel);
  const names = (await readdir(folder)).sort();
  const entries: ItemEntry[] = [];
  const brokenTypes = new Map<string, PlannerType | null>();
  const texts = new Map<string, string>();
  for (const name of names) {
    const abs = join(folder, name);
    const info = await stat(abs).catch(() => null);
    const path = rel === "" ? name : `${rel}/${name}`;
    if (info?.isDirectory()) {
      entries.push({ path, name, kind: "dir", mtimeMs: info.mtimeMs });
      continue;
    }
    if (!info?.isFile() || !name.toLowerCase().endsWith(".md")) continue;
    const text = await readText(abs);
    if (text === null) continue;
    const entry: ItemEntry = { path, name, kind: "file", mtimeMs: info.mtimeMs, ...readFrontmatter(text) };
    entries.push(entry);
    if (needsTypeCheck(entry)) brokenTypes.set(path, brokenItemType(text));
    if (needsText(entry)) texts.set(path, text);
  }
  return { entries, brokenTypes, texts };
}

/** The tasks root's items: its own Markdown files and each project sub-folder's. */
async function readRoot(workspace: string, root: string): Promise<Items> {
  let top;
  try {
    top = await readFolderEntries(workspace, root);
  } catch (error) {
    const code = errnoOf(error);
    if (code === "ENOENT") throw new Exit(1, `The tasks folder ${root || "(the workspace root)"} doesn't exist. Choose another one in the Planner's settings.`);
    if (code === "ENOTDIR") throw new Exit(1, `The tasks folder ${root} is a file, not a folder. Choose another one in the Planner's settings.`);
    throw error;
  }
  const folders = projectFolders(top.entries);
  const parts = [readItems(top.entries, top.brokenTypes, null, top.texts)];
  for (const folder of folders) {
    const sub = await readFolderEntries(workspace, root === "" ? folder : `${root}/${folder}`).catch(() => null);
    if (sub !== null) parts.push(readItems(sub.entries, sub.brokenTypes, folder, sub.texts));
  }
  return mergeItems(parts, folders);
}

async function run(argv: readonly string[]): Promise<string> {
  const args = parseArgs(argv);
  if (args.kind === "help") return `${USAGE}\n`;
  if (args.kind === "error") throw new Exit(2, `${args.message}\n\n${USAGE}`);

  const workspace = resolveWorkspace();
  if (workspace === null) throw new Exit(1, "No Pomade workspace found. Open Pomade once, so it records its workspace.");
  const { settings, problem } = parsePlannerSettings(await readText(join(workspace, SYNCED_SETTINGS_PATH)));
  if (settings.tasksRoot === null) {
    const why = problem === null ? "" : ` (${SYNCED_SETTINGS_PATH}: ${problem})`;
    throw new Exit(1, `No tasks folder is set${why}. Open the Planner in Pomade and choose where your tasks live.`);
  }

  const items = await readRoot(workspace, settings.tasksRoot);
  const day = args.date ?? plannerDay(new Date(), settings.dayBoundary);
  const note = dailyNotePath(settings.tasksRoot, day);
  const noteThere = await stat(join(workspace, note)).then(
    (s) => s.isFile(),
    () => false,
  );
  const out = todayOutput(args, day, items, settings.projectFolders, noteThere ? note : null);
  if (!out.ok) throw new Exit(out.code, out.message);
  return out.text;
}

run(process.argv.slice(2)).then(
  (out) => process.stdout.write(out),
  (error: unknown) => {
    const exit = error instanceof Exit ? error : new Exit(1, error instanceof Error ? error.message : String(error));
    process.stderr.write(`pomade-planner: ${exit.message}\n`);
    process.exitCode = exit.code;
  },
);
