// The Planner's reads through the Host API: its settings (the synced settings file, live) and the
// items of the tasks root (its top-level files, live). [[file-model]], [[storage-and-item-types]], [[settings-and-state]].

import { useCallback, useMemo } from "react";
import type { HostClient } from "pomade-kit/sdk";
import { joinPath } from "pomade-kit/protocol";

import { isNotFound } from "../core/host";
import { useLiveFolder, type LiveFolderState } from "../core/live-folder";
import { useSettingsFile } from "../core/live-settings";
import { ARCHIVE_FOLDER, brokenItemType, DAILY_FOLDER, isItemChange, mergeItems, needsText, needsTypeCheck, projectFolders, readItems, type ItemEntry, type Items, type PlannerType } from "./model/items";
import { parsePlannerSettings, SYNCED_SETTINGS_PATH, type ParsedPlannerSettings } from "./model/settings";

/** A frame that writes the settings tells the app's other frames, which may not see the file's folder yet (state key). */
export const SETTINGS_CHANGED_KEY = "planner.settingsWritten";

export type SettingsState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; parsed: ParsedPlannerSettings };

/** The Planner's settings, live: re-read when the file changes on disk or another frame wrote it. */
export function usePlannerSettings(host: HostClient): { state: SettingsState; reload: () => Promise<void> } {
  const { state: live, reload } = useSettingsFile(host, SYNCED_SETTINGS_PATH, SETTINGS_CHANGED_KEY, parsePlannerSettings);
  const state = useMemo<SettingsState>(() => (live.status === "ready" ? { status: "ready", parsed: live.value } : live), [live]);
  return { state, reload };
}

/** Texts read before, by path, kept while the file's mtime is the same — so a watch event reads only what changed. */
export type TextCache = Map<string, { mtimeMs: number; text: string }>;

/** What a read of the tasks root reads besides frontmatter. */
export interface ReadOptions {
  /** Every item's text (the full tab's excerpts), not only recurring items' and daily notes'. */
  allTexts: boolean;
  cache: TextCache;
}

const NO_OPTIONS: ReadOptions = { allTexts: false, cache: new Map() };

/** An entry's text: from the cache while its mtime holds, else read (and cached); `null` when it is gone. */
async function textOf(host: HostClient, entry: ItemEntry, cache: TextCache): Promise<string | null> {
  const hit = cache.get(entry.path);
  if (hit !== undefined && hit.mtimeMs === entry.mtimeMs) return hit.text;
  try {
    const { content, mtimeMs } = await host.files.readFile({ path: entry.path });
    cache.set(entry.path, { mtimeMs, text: content });
    return content;
  } catch {
    // Gone since the listing: the next watch change reads the folder again.
    return null;
  }
}

/**
 * One folder's items: its entries, the unreadable ones read once more to learn their `type:`, and
 * the texts `needsText` asks for (a recurring item's `## Log`, a daily note's checklist, excerpts).
 */
async function readFolderItems(host: HostClient, path: string, folder: string | null, options: ReadOptions, archived = false): Promise<{ entries: ItemEntry[]; items: Omit<Items, "folders"> }> {
  const { entries } = await host.files.readFolder({ path, frontmatter: true });
  const brokenTypes = new Map<string, PlannerType | null>();
  const texts = new Map<string, string>();
  await Promise.all([
    ...entries.filter(needsTypeCheck).map(async (entry) => {
      try {
        brokenTypes.set(entry.path, brokenItemType((await host.files.readFile({ path: entry.path })).content));
      } catch (error) {
        // Gone or unreadable since the listing: not an item.
        if (!isNotFound(error)) brokenTypes.set(entry.path, null);
      }
    }),
    ...entries
      .filter((e) => needsText(e, options.allTexts))
      .map(async (entry) => {
        const text = await textOf(host, entry, options.cache);
        if (text !== null) texts.set(entry.path, text);
      }),
  ]);
  return { entries, items: readItems(entries, brokenTypes, folder, texts, archived) };
}

/** A sub-folder's items; `null` when it is gone since the listing (the next watch change reads it again). */
function readSub(host: HostClient, path: string, folder: string | null, options: ReadOptions, archived = false) {
  return readFolderItems(host, path, folder, options, archived).then(
    (r) => r,
    (error: unknown) => {
      if (isNotFound(error)) return null;
      throw error;
    },
  );
}

/**
 * The tasks root's items ([[storage-and-item-types]] "Storage") — its own, `Daily/`'s, each project sub-folder's, and the
 * archived ones in `_archive/` and its sub-folders; `null` when the root doesn't exist.
 */
export async function readItemsAt(host: HostClient, root: string, options: ReadOptions = NO_OPTIONS): Promise<Items | null> {
  let top;
  try {
    top = await readFolderItems(host, root, null, options);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  const folders = projectFolders(top.entries);
  const has = (name: string) => top.entries.some((e) => e.kind === "dir" && e.name === name);
  const [daily, archive, ...subs] = await Promise.all([
    has(DAILY_FOLDER) ? readSub(host, joinPath(root, DAILY_FOLDER), null, options) : null,
    has(ARCHIVE_FOLDER) ? readSub(host, joinPath(root, ARCHIVE_FOLDER), null, options, true) : null,
    ...folders.map((folder) => readSub(host, joinPath(root, folder), folder, options)),
  ]);
  const archived = archive
    ? await Promise.all(
        archive.entries.filter((e) => e.kind === "dir" && !e.name.startsWith(".")).map((e) => readSub(host, e.path, e.name, options, true).then((r) => r?.items ?? null)),
      )
    : [];
  // Texts of files no longer listed leave the cache.
  const listed = new Set([top, daily, archive, ...subs].flatMap((r) => r?.entries.map((e) => e.path) ?? []));
  for (const r of archived) for (const t of r?.tasks ?? []) listed.add(t.path);
  for (const path of options.cache.keys()) if (!listed.has(path)) options.cache.delete(path);
  const parts = [top.items, daily?.items ?? null, archive?.items ?? null, ...subs.map((s) => s?.items ?? null), ...archived];
  return mergeItems(
    parts.filter((p) => p !== null),
    folders,
  );
}

/** The tasks root's items, live (`root === null`: no root chosen yet); `allTexts`: with every item's excerpt (the full tab). */
export function usePlannerItems(host: HostClient, root: string | null, allTexts = false): { state: LiveFolderState<Items>; reload: () => Promise<void> } {
  const cache = useMemo<TextCache>(() => new Map(), []);
  const read = useCallback((path: string) => readItemsAt(host, path, { allTexts, cache }), [host, allTexts, cache]);
  return useLiveFolder(host, root, read, isItemChange, { watchWorkspaceTop: true });
}
