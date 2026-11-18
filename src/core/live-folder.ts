// A folder read live through the Host API: read once, again once its watch holds (a change made
// in between reaches no watch), then after each burst of relevant watch changes (DESIGN §2 "Live
// from disk"). While the folder is missing, its nearest existing
// ancestor is watched, so the folder showing up (made, moved in, checked out) loads it.

import { useCallback, useEffect, useRef, useState } from "react";
import type { FileWatch, HostClient } from "pomade-kit/sdk";

import { errorText, isNotFound } from "./host";

/** How long a burst of watch changes is gathered before the folder is re-read. */
const RELOAD_DEBOUNCE_MS = 60;

export interface FolderChange {
  path: string;
  oldPath?: string;
}

export type LiveFolderState<T> =
  | { status: "loading" }
  /** The folder does not exist. */
  | { status: "missing" }
  | { status: "error"; message: string }
  | { status: "ready"; value: T };

/**
 * Whether a watch change seen from an ancestor of a missing folder can make it appear: a change at
 * the folder, at one of its ancestors (a parent folder made or moved in), or below it — at either
 * end of a rename.
 */
export function isFolderAppearance(change: FolderChange, folder: string): boolean {
  const leadsTo = (path: string): boolean => path === folder || folder.startsWith(`${path}/`) || path.startsWith(`${folder}/`);
  return leadsTo(change.path) || (change.oldPath !== undefined && leadsTo(change.oldPath));
}

/** The folders a missing `path` would sit in, nearest first, down to the top-level folder (never the workspace root). */
export function ancestorsOf(path: string): string[] {
  const parts = path.split("/").filter((p) => p !== "");
  const out: string[] = [];
  for (let i = parts.length - 1; i >= 1; i--) out.push(parts.slice(0, i).join("/"));
  return out;
}

/**
 * The folder at `path` (`null` = nothing to read yet), live. `read` turns the folder into the
 * caller's value, or `null` when the folder does not exist; `isChange` says which watch changes
 * under it can change that value. `reload` re-reads it now and resolves once the result is shown
 * (or a newer one already is). `watchWorkspaceTop`: when no ancestor of a missing folder exists,
 * watch the workspace root itself, not recursively, for its top-level folder to appear.
 */
export function useLiveFolder<T>(
  host: HostClient,
  path: string | null,
  read: (path: string) => Promise<T | null>,
  isChange: (change: FolderChange, path: string) => boolean,
  { watchWorkspaceTop = false }: { watchWorkspaceTop?: boolean } = {},
): { state: LiveFolderState<T>; reload: () => Promise<void> } {
  const [state, setState] = useState<LiveFolderState<T>>({ status: "loading" });
  const started = useRef(0);
  const applied = useRef(0);
  const reader = useRef(read);
  const relevant = useRef(isChange);
  useEffect(() => {
    reader.current = read;
    relevant.current = isChange;
  });

  const reload = useCallback(async () => {
    if (path === null) return;
    const mine = ++started.current;
    let next: LiveFolderState<T>;
    try {
      const value = await reader.current(path);
      next = value === null ? { status: "missing" } : { status: "ready", value };
    } catch (error) {
      next = { status: "error", message: errorText(error) };
    }
    // Loads may finish out of order: never show an older read over a newer one.
    if (mine < applied.current) return;
    applied.current = mine;
    setState(next);
  }, [path]);

  useEffect(() => {
    if (path === null) return;
    setState({ status: "loading" });
    void reload();
  }, [path, reload]);

  const missing = state.status === "missing";
  useEffect(() => {
    if (path === null) return;
    let closed = false;
    const isClosed = () => closed;
    let watch: FileWatch | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const targets = missing ? [path, ...ancestorsOf(path), ...(watchWorkspaceTop ? [""] : [])] : [path];
    void (async () => {
      for (const target of targets) {
        if (isClosed()) return;
        const concerns = target === path && !missing ? (c: FolderChange) => relevant.current(c, path) : (c: FolderChange) => isFolderAppearance(c, path);
        try {
          const w = await host.files.watch({ path: target, recursive: target !== "" }, (changes) => {
            if (!changes.some(concerns)) return;
            clearTimeout(timer);
            timer = setTimeout(() => void reload(), RELOAD_DEBOUNCE_MS);
          });
          if (isClosed()) void w.close();
          else {
            watch = w;
            // A change between the first read and the watch taking hold reaches no one: read once more.
            if (target === path && !missing) void reload();
          }
          return;
        } catch (error) {
          // A missing folder can't be watched: try the next one up. Any other refusal ends it; the read reports it.
          if (!isNotFound(error)) return;
        }
      }
    })();
    return () => {
      closed = true;
      clearTimeout(timer);
      void watch?.close();
    };
  }, [host, path, reload, missing, watchWorkspaceTop]);

  return { state, reload };
}
