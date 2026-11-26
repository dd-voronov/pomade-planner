// An app's synced settings file read live ([[settings-and-state]] "Synced settings file"): re-read
// when the file changes on disk (a hand edit, a git pull) and when another frame of the app wrote
// it. The file's folder is a live folder ([[file-model]] "Live from disk"); a frame that writes the
// file also bumps a state key of the app, since a frame may not see the file's folder yet.

import { useCallback, useEffect, useMemo } from "react";
import type { HostClient } from "pomade-kit/sdk";

import { isNotFound } from "./host";
import { useLiveFolder, type FolderChange } from "./live-folder";

const folderOf = (path: string): string => path.slice(0, path.lastIndexOf("/"));

/** The text of the settings file at `path` (`null`: no file), or `undefined` when its folder doesn't exist either. */
export async function readSettingsText(host: HostClient, path: string): Promise<string | null | undefined> {
  try {
    return (await host.files.readFile({ path })).content;
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  try {
    await host.files.readFolder({ path: folderOf(path) });
    return null;
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

export type SettingsFileState<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; value: T };

/**
 * The settings file at `path`, parsed and live. `parse` (stable: a module-level function) takes the
 * file's text, `null` for a missing file. `changedKey` is the state key the app's writes bump
 * (`settingsWritten`). `reload` re-reads it now and resolves once the result is shown.
 */
export function useSettingsFile<T extends object>(
  host: HostClient,
  path: string,
  changedKey: string,
  parse: (text: string | null) => T,
): { state: SettingsFileState<T>; reload: () => Promise<void> } {
  const folder = folderOf(path);
  const read = useCallback(async () => {
    const text = await readSettingsText(host, path);
    return text === undefined ? null : parse(text);
  }, [host, path, parse]);
  const isChange = useCallback((change: FolderChange) => change.path === path || change.oldPath === path || change.path === folder, [path, folder]);
  const { state: live, reload } = useLiveFolder(host, folder, read, isChange, { watchWorkspaceTop: true });

  useEffect(
    () =>
      host.state.onChange((key) => {
        if (key === changedKey) void reload();
      }),
    [host, changedKey, reload],
  );

  const state = useMemo<SettingsFileState<T>>(() => {
    switch (live.status) {
      case "loading":
        return live;
      case "error":
        return { status: "error", message: `${path} can't be read (${live.message})` };
      case "missing":
        return { status: "ready", value: parse(null) };
      case "ready":
        return live;
    }
  }, [live, path, parse]);
  return { state, reload };
}

/** Tell the app's other frames that the settings file was written (`changedKey`, as `useSettingsFile` follows it). */
export async function announceSettingsWrite(host: HostClient, changedKey: string): Promise<void> {
  await host.state.set(changedKey, Date.now()).catch(() => undefined);
}
