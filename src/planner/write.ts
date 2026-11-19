// The Planner's writes through the Host API: ticking a task and resolving a thought (field-only
// writes, never over a newer file), done and skip on a recurring item (its log line, then its
// `do-on`), an item's fields and body edited in its compact view, creating an item (the Host API's file create; a taken name steps to `-2`, `-3`, …),
// the day's daily note (the file create; a taken path is the note already there), archiving and
// restoring a note (the Host API's move; a taken name steps to `-2`, …), renaming a project's
// folder (the Host API's move; never over a folder that is there), and saving its settings (only
// the Planner's keys of the shared settings file).

import { getBody } from "pomade-kit/frontmatter";
import { HostError, type HostClient, type IfMtime } from "pomade-kit/sdk";
import { formatSchedule, type LocalDate } from "pomade-kit/schedule";

import { joinPath } from "pomade-kit/protocol";

import { diskReason, errorText, isNotFound } from "../core/host";
import { mergeSettingsText, parseSettingsText, type SettingsValue } from "../core/settings-file";
import { archivePath, restorePath } from "./model/archive";
import { newTaskContent, taskFilePath, type NewTask } from "./model/create";
import { dailyNotePath, dailyNoteText, type TemplateRead } from "./model/daily";
import type { ItemEdit } from "./model/item-edit";
import { FIELD, type Task } from "./model/items";
import { advancedDoOn, appendLog, type LogWord } from "./model/recurring";
import { parseFolderMap, PROJECT_FOLDERS_KEY, serializeFolderMap, type FolderMap } from "./model/projects";
import { SYNCED_SETTINGS_PATH } from "./model/settings";
import { resolveWrites, tickWrites, type FieldWrite } from "./model/tick";
import { SETTINGS_CHANGED_KEY } from "./usePlannerData";

/** A write the Planner didn't make, in words for the row or the form. */
export class WriteError extends Error {}

/** The file changed on disk since the view read it: nothing was written. */
export class StaleError extends WriteError {
  constructor() {
    super("Changed on disk since the Planner read it — not saved. The row shows the file as it is now.");
  }
}

function hostReason(error: unknown): string {
  if (error instanceof HostError) {
    if (error.code === "not-found") return "the file is gone";
    if (error.code === "unreadable-frontmatter") return "its frontmatter can't be read — open it to fix";
    return diskReason(error.message);
  }
  return errorText(error);
}

/**
 * Tick (`done`) or untick a task read at `task.mtimeMs`: refused when the file changed since — the
 * row then shows the file as it is now; otherwise field-only writes of `status` and `done-on`.
 */
export async function tickTask(host: HostClient, task: Task, done: boolean, day: LocalDate): Promise<void> {
  await writeFields(host, task, tickWrites(done, day));
}

/** Resolve (`resolved`) or reopen a thought read at `task.mtimeMs` — as ticking: `status` and `done-on`, never over a newer file. */
export async function resolveThought(host: HostClient, task: Task, resolved: boolean, day: LocalDate): Promise<void> {
  await writeFields(host, task, resolveWrites(resolved, day));
}

/** A refused write of an item: `StaleError` when the host refused it as changed on disk. */
function notSaved(error: unknown): WriteError {
  if (error instanceof HostError && error.code === "changed-on-disk") return new StaleError();
  return new WriteError(`Not saved: ${hostReason(error)}.`);
}

/** One Host API write of an item, given the `ifMtime` it is conditional on (or none). */
type ItemWrite = (guard: IfMtime) => Promise<unknown>;

/**
 * An action's writes to an item read at `task.mtimeMs`, in order. The first is conditional on that
 * mtime (`ifMtime`): when the file changed since, the host refuses it (`changed-on-disk` →
 * `StaleError`) and nothing is written. The writes after it follow the action's own.
 */
async function writeOver(task: Task, writes: readonly ItemWrite[]): Promise<void> {
  for (const [i, write] of writes.entries()) {
    try {
      await write(i === 0 ? { ifMtime: task.mtimeMs } : {});
    } catch (error) {
      throw notSaved(error);
    }
  }
}

/** A field-only write: set the key, or remove it when `value` is `null`. */
function fieldWrite(host: HostClient, path: string, { key, value }: FieldWrite): ItemWrite {
  return (guard) => (value === null ? host.files.removeField({ path, key, ...guard }) : host.files.setField({ path, key, value, ...guard }));
}

/** Field-only writes to an item read at `task.mtimeMs`; refused when the file changed since. */
async function writeFields(host: HostClient, task: Task, writes: readonly FieldWrite[]): Promise<void> {
  await writeOver(
    task,
    writes.map((w) => fieldWrite(host, task.path, w)),
  );
}

/**
 * The fields edited in an item's compact view, over the item read at `task.mtimeMs` (refused when
 * the file changed since): a recurring item's rule first — a mapping, written as the `repeat:`
 * key's own lines (`files.setKeyLines`; every other byte of the file stays) — then each field as a
 * field-only write.
 */
export async function saveItemEdit(host: HostClient, task: Task, edit: ItemEdit): Promise<void> {
  const { path } = task;
  const rule = edit.repeat;
  const repeat: ItemWrite[] = rule === null ? [] : [(guard) => host.files.setKeyLines({ path, key: FIELD.repeat, text: formatSchedule(FIELD.repeat, rule), ...guard })];
  await writeOver(task, [...repeat, ...edit.fields.map((w) => fieldWrite(host, path, w))]);
}

/** The body typed in an item's compact view, over the item read at `task.mtimeMs` (refused when the file changed since): a body-only write. */
export async function saveBody(host: HostClient, task: Task, body: string): Promise<void> {
  await writeOver(task, [(guard) => host.files.setBody({ path: task.path, body, ...guard })]);
}

/**
 * Done or skip on a recurring item read at `task.mtimeMs` ([[recurring]] "One action, two writes, log first") — one logical action of two
 * writes, refused when the file changed since the read:
 * 1. the body gets `- <day> <word>` as the newest `## Log` entry (`setBody`, conditional on the
 *    mtime read; the frontmatter's bytes stay);
 * 2. `do-on` moves to the next occurrence (a field-only write; removed when the rule has none).
 * The log goes first, so a failure never leaves the item advanced without its log line. When the
 * second write fails, the file's text from before is written back; only when that fails too does
 * the error say the log line is in and `do-on` needs setting by hand.
 * Resolves to the `do-on` written (`null`: removed).
 */
export async function completeRecurring(host: HostClient, task: Task, word: LogWord, day: LocalDate): Promise<LocalDate | null> {
  if (task.repeat?.kind !== "ok") throw new WriteError("Not saved: fix the repeat rule first.");
  let content: string;
  try {
    ({ content } = await host.files.readFile({ path: task.path }));
  } catch (error) {
    throw notSaved(error);
  }
  const next = advancedDoOn(task, task.repeat.schedule, day);
  // A text read newer than `task.mtimeMs` is refused here: the log line goes only into the version the row shows.
  await writeOver(task, [(guard) => host.files.setBody({ path: task.path, body: appendLog(getBody(content), day, word), ...guard })]);
  try {
    if (next === null) await host.files.removeField({ path: task.path, key: FIELD.doOn });
    else await host.files.setField({ path: task.path, key: FIELD.doOn, value: next });
  } catch (error) {
    const reason = hostReason(error);
    const restored = await host.files.write({ path: task.path, content }).then(
      () => true,
      () => false,
    );
    if (restored) throw new WriteError(`Not saved: ${reason}.`);
    const fix = next === null ? "remove do-on by hand" : `set “do-on: ${next}” by hand`;
    throw new WriteError(`Logged “${word}”, but do-on couldn't be moved (${reason}) — ${fix}.`);
  }
  return next;
}

/** How many taken names in a row a create steps over before it gives up. */
const MAX_TRIES = 100;

/** Create a task in `folder` (a project's sub-folder, made when missing; `null`: the tasks root itself); resolves to its path. */
export async function createTask(host: HostClient, root: string, folder: string | null, task: NewTask): Promise<string> {
  const content = newTaskContent(task);
  const dir = folder === null ? root : joinPath(root, folder);
  for (let n = 1; n <= MAX_TRIES; n++) {
    const path = taskFilePath(dir, task.created, task.title, n);
    try {
      await host.files.create({ path, content });
      return path;
    } catch (error) {
      if (error instanceof HostError && error.code === "already-exists") continue;
      throw new WriteError(`Couldn't add it: ${hostReason(error)}.`);
    }
  }
  throw new WriteError(`Couldn't add it: ${MAX_TRIES} file names in a row are taken.`);
}

/** Move an item to the first free path `target(n)` gives (n = 1, 2, …); resolves to it. */
async function moveToFree(host: HostClient, from: string, target: (n: number) => string | null, what: string): Promise<string> {
  for (let n = 1; n <= MAX_TRIES; n++) {
    const to = target(n);
    if (to === null) throw new WriteError(`Couldn't ${what} it: it isn't in the tasks folder.`);
    try {
      await host.files.move({ from, to });
      return to;
    } catch (error) {
      if (error instanceof HostError && error.code === "already-exists") continue;
      throw new WriteError(`Couldn't ${what} it: ${hostReason(error)}.`);
    }
  }
  throw new WriteError(`Couldn't ${what} it: ${MAX_TRIES} file names in a row are taken.`);
}

/** Archive a note: move it into `_archive/`, into the sub-folder it was in; resolves to its new path. */
export function archiveItem(host: HostClient, root: string, task: Task): Promise<string> {
  return moveToFree(host, task.path, (n) => archivePath(root, task.path, n), "archive");
}

/** Move an archived item back where it was archived from; resolves to its new path. */
export function restoreItem(host: HostClient, root: string, task: Task): Promise<string> {
  return moveToFree(host, task.path, (n) => restorePath(root, task.path, n), "restore");
}

/** The daily-note template's text, or why it can't be read ([[daily-notes]] "Template"). */
export async function readTemplate(host: HostClient, path: string | null): Promise<TemplateRead> {
  if (path === null) return { kind: "none" };
  try {
    return { kind: "text", text: (await host.files.readFile({ path })).content };
  } catch (error) {
    if (isNotFound(error)) return { kind: "error", reason: "it isn't there" };
    return { kind: "error", reason: hostReason(error) };
  }
}

/**
 * Make `day`'s daily note from the template ([[daily-notes]]) unless its file is there. `created`:
 * this call made it; `exists`: it was there (another frame's, or the user's).
 */
export async function createDailyNote(host: HostClient, root: string, day: LocalDate, template: string | null): Promise<{ path: string; result: "created" | "exists" }> {
  const path = dailyNotePath(root, day);
  const { text } = dailyNoteText(day, await readTemplate(host, template));
  try {
    await host.files.create({ path, content: text });
    return { path, result: "created" };
  } catch (error) {
    if (error instanceof HostError && error.code === "already-exists") return { path, result: "exists" };
    throw new WriteError(`Couldn't make today's daily note: ${hostReason(error)}.`);
  }
}

/**
 * Rename a project's sub-folder of the tasks root. `taken`: a folder of the new name is already
 * there — nothing is moved or merged. A folder already gone counts as moved when the new one is
 * there (another frame of the Planner did it).
 */
export async function moveProjectFolder(host: HostClient, root: string, from: string, to: string): Promise<"moved" | "taken" | { reason: string }> {
  const target = joinPath(root, to);
  try {
    await host.files.move({ from: joinPath(root, from), to: target });
    return "moved";
  } catch (error) {
    if (error instanceof HostError && error.code === "already-exists") return "taken";
    if (isNotFound(error)) {
      const there = await host.files.readFolder({ path: target }).then(
        () => true,
        () => false,
      );
      return there ? "moved" : { reason: "the folder is gone" };
    }
    return { reason: hostReason(error) };
  }
}

/** Set some projects' entries of the project-id → folder map, keeping every other entry and key of the file. */
export async function saveProjectFolders(host: HostClient, entries: FolderMap): Promise<void> {
  let text: string | null = null;
  try {
    text = (await host.files.readFile({ path: SYNCED_SETTINGS_PATH })).content;
  } catch (error) {
    if (!isNotFound(error)) throw new WriteError(`Couldn't read ${SYNCED_SETTINGS_PATH}: ${hostReason(error)}.`);
  }
  const { object } = parseSettingsText(text, SYNCED_SETTINGS_PATH);
  const current = object === null ? {} : parseFolderMap(object[PROJECT_FOLDERS_KEY]).map;
  await saveSettings(host, { [PROJECT_FOLDERS_KEY]: serializeFolderMap({ ...current, ...entries }) });
}

/** Set (or, with `undefined`, remove) the Planner's keys in the synced settings file, keeping every other key; the app's other frames re-read it. */
export async function saveSettings(host: HostClient, patch: Record<string, SettingsValue | undefined>): Promise<void> {
  let text: string | null = null;
  try {
    text = (await host.files.readFile({ path: SYNCED_SETTINGS_PATH })).content;
  } catch (error) {
    if (!isNotFound(error)) throw new WriteError(`Couldn't read ${SYNCED_SETTINGS_PATH}: ${hostReason(error)}.`);
  }
  const merged = mergeSettingsText(text, patch, SYNCED_SETTINGS_PATH);
  if (!merged.ok) throw new WriteError(`Not saved: ${merged.problem}. Fix the file first.`);
  try {
    if (text === null) await host.files.create({ path: SYNCED_SETTINGS_PATH, content: merged.text });
    else await host.files.write({ path: SYNCED_SETTINGS_PATH, content: merged.text });
  } catch (error) {
    throw new WriteError(`Couldn't save ${SYNCED_SETTINGS_PATH}: ${hostReason(error)}.`);
  }
  await host.state.set(SETTINGS_CHANGED_KEY, Date.now()).catch(() => undefined);
}
