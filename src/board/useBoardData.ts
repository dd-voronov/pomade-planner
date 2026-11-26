// The Board's reads through the Host API: its settings (the synced settings file, live, and each
// project's own) and backlog location, and the backlog itself — read from the folder and its
// `done/` sub-folder, then re-read on every relevant watch change (core/live-folder).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HostClient } from "pomade-kit/sdk";
import { joinPath, type FileEntry, type ProjectInfo, type ProjectRef } from "pomade-kit/protocol";

import { errorText, isNotFound } from "../core/host";
import { useLiveFolder } from "../core/live-folder";
import { useSettingsFile } from "../core/live-settings";
import {
  backlogLocation,
  parseProjectSettings,
  parseSyncedSettings,
  SETTINGS_CHANGED_KEY,
  SYNCED_SETTINGS_PATH,
  type BacklogLocation,
  type ParsedSyncedSettings,
  type ProjectBoardSettings,
} from "./model/settings";
import { nextId } from "./model/create";
import { DONE_FOLDER, isBacklogChange, KINDS, readBacklog, type Backlog, type Kind } from "./model/ticket";

/** The synced settings file as it is now; a missing file is every default. */
export async function readSyncedSettings(host: HostClient): Promise<ParsedSyncedSettings> {
  try {
    const { content } = await host.files.readFile({ path: SYNCED_SETTINGS_PATH });
    return parseSyncedSettings(content);
  } catch (error) {
    if (isNotFound(error)) return parseSyncedSettings(null);
    return { ...parseSyncedSettings(null), problem: `${SYNCED_SETTINGS_PATH} can't be read (${errorText(error)})` };
  }
}

/**
 * The synced settings, live — re-read when the file changes on disk or another frame wrote it;
 * `null` until the first read. A file that can't be read is every default with the problem.
 */
export function useSyncedSettings(host: HostClient): { synced: ParsedSyncedSettings | null; reload: () => Promise<void> } {
  const { state, reload } = useSettingsFile(host, SYNCED_SETTINGS_PATH, SETTINGS_CHANGED_KEY, parseSyncedSettings);
  const synced = useMemo<ParsedSyncedSettings | null>(() => {
    switch (state.status) {
      case "loading":
        return null;
      case "error":
        return { ...parseSyncedSettings(null), problem: state.message };
      case "ready":
        return state.value;
    }
  }, [state]);
  return { synced, reload };
}

/** Calls `onChange` when the app's own settings for a project change — from this frame or any other (`project.updated`). */
export function useProjectSettingsChanges(host: HostClient, onChange: (projectId: string) => void): void {
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });
  useEffect(() => {
    const sub = host.events
      .subscribe("project.updated", ({ project, changes }) => {
        if (changes.includes("settings")) latest.current(project.id);
      })
      .catch(() => null);
    return () => {
      void sub.then((s) => s?.close());
    };
  }, [host]);
}

export type ProjectBoardState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; synced: ParsedSyncedSettings; settings: ProjectBoardSettings; location: BacklogLocation };

type OwnSettingsState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; settings: ProjectBoardSettings };

/**
 * The project's Board settings and where its backlog is, following the synced settings file and the
 * project's own settings as they change; `reload` re-reads both now.
 */
export function useProjectBoard(host: HostClient, project: ProjectRef): { state: ProjectBoardState; reload: () => Promise<void> } {
  const { synced, reload: reloadSynced } = useSyncedSettings(host);
  const [own, setOwn] = useState<OwnSettingsState>({ status: "loading" });
  const seq = useRef(0);
  const { id, root } = project;
  const reloadOwn = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const { settings } = await host.project.getSettings({ projectId: id });
      if (mine === seq.current) setOwn({ status: "ready", settings: parseProjectSettings(settings) });
    } catch (error) {
      if (mine === seq.current) setOwn({ status: "error", message: errorText(error) });
    }
  }, [host, id]);
  useEffect(() => {
    void reloadOwn();
  }, [reloadOwn]);
  useProjectSettingsChanges(host, (changed) => {
    if (changed === id) void reloadOwn();
  });
  const state = useMemo<ProjectBoardState>(() => {
    if (own.status === "error") return own;
    if (own.status === "loading" || synced === null) return { status: "loading" };
    return { status: "ready", synced, settings: own.settings, location: backlogLocation(root, own.settings, synced.settings) };
  }, [own, synced, root]);
  const reload = useCallback(async () => {
    await Promise.all([reloadSynced(), reloadOwn()]);
  }, [reloadSynced, reloadOwn]);
  return { state, reload };
}

export type BacklogState =
  | { status: "loading" }
  /** The folder does not exist. */
  | { status: "missing" }
  | { status: "error"; message: string }
  /** `nextIds`: the next free ID per kind, as of this read (a create re-checks it). */
  | { status: "ready"; backlog: Backlog; nextIds: Record<Kind, string> };

/** The backlog folder's and `done/`'s entries with frontmatter; `null` when the folder does not exist. */
export async function readEntries(host: HostClient, path: string): Promise<FileEntry[] | null> {
  let root: FileEntry[];
  try {
    ({ entries: root } = await host.files.readFolder({ path, frontmatter: true }));
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  if (!root.some((e) => e.kind === "dir" && e.name === DONE_FOLDER)) return root;
  try {
    const { entries: done } = await host.files.readFolder({ path: joinPath(path, DONE_FOLDER), frontmatter: true });
    return [...root, ...done];
  } catch (error) {
    if (isNotFound(error)) return root;
    throw error;
  }
}

/** The backlog and the next free ID per kind, as of one read of the folder and `done/`; `null` when the folder does not exist. */
async function readBacklogAt(host: HostClient, path: string): Promise<{ backlog: Backlog; nextIds: Record<Kind, string> } | null> {
  const entries = await readEntries(host, path);
  if (entries === null) return null;
  return { backlog: readBacklog(entries, path), nextIds: Object.fromEntries(KINDS.map((k) => [k, nextId(k, entries, path)])) as Record<Kind, string> };
}

/**
 * The backlog at `path` (`null` = nothing to read yet), live: a watch on the folder re-reads it
 * after each burst of relevant changes. `reload` re-reads it now and resolves once the result is
 * shown (or a newer one already is).
 */
export function useBacklog(host: HostClient, path: string | null): { state: BacklogState; reload: () => Promise<void> } {
  const read = useCallback((p: string) => readBacklogAt(host, p), [host]);
  const { state: live, reload } = useLiveFolder(host, path, read, isBacklogChange);
  const state = useMemo<BacklogState>(() => (live.status === "ready" ? { status: "ready", ...live.value } : live), [live]);
  return { state, reload };
}

export interface Candidate {
  project: ProjectInfo;
  /** Where its backlog would be. */
  path: string;
  /** The project's own backlog folder, relative to its root; `null` while it uses the workspace's default. */
  own: string | null;
}

export type CandidatesState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; candidates: Candidate[] };

/**
 * Every project with where its backlog would be, in sidebar order; re-read when a project is added,
 * renamed, moved, regrouped or removed, its settings change, or the workspace's default folder does.
 */
export function useCandidates(host: HostClient): CandidatesState {
  const { synced } = useSyncedSettings(host);
  const pattern = synced?.settings.backlogPathPattern ?? null;
  const [state, setState] = useState<CandidatesState>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (pattern === null) return;
    const run = { live: true };
    void (async () => {
      try {
        const { projects } = await host.project.list();
        const candidates = await Promise.all(
          projects.map(async (project) => {
            const { settings } = await host.project.getSettings({ projectId: project.id });
            const own = parseProjectSettings(settings);
            return { project, path: backlogLocation(project.root, own, { backlogPathPattern: pattern }).path, own: own.backlogPath };
          }),
        );
        if (run.live) setState({ status: "ready", candidates });
      } catch (error) {
        if (run.live) setState({ status: "error", message: errorText(error) });
      }
    })();
    return () => {
      run.live = false;
    };
  }, [host, version, pattern]);

  useEffect(() => {
    const subs = (["project.created", "project.renamed", "project.removed", "project.updated"] as const).map((name) =>
      host.events.subscribe(name, bump).catch(() => null),
    );
    return () => {
      for (const sub of subs) void sub.then((s) => s?.close());
    };
  }, [host, bump]);
  return state;
}
