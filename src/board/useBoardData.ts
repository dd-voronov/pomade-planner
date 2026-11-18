// The Board's reads through the Host API: its settings and backlog location, and the backlog
// itself — read from the folder and its `done/` sub-folder, then re-read on every relevant watch
// change (core/live-folder).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HostClient } from "pomade-kit/sdk";
import { joinPath, type FileEntry, type ProjectInfo, type ProjectRef } from "pomade-kit/protocol";

import { errorText, isNotFound } from "../core/host";
import { useLiveFolder } from "../core/live-folder";
import {
  backlogLocation,
  parseProjectSettings,
  parseSyncedSettings,
  SYNCED_SETTINGS_PATH,
  type BacklogLocation,
  type ParsedSyncedSettings,
  type ProjectBoardSettings,
} from "./model/settings";
import { nextId } from "./model/create";
import { DONE_FOLDER, isBacklogChange, KINDS, readBacklog, type Backlog, type Kind } from "./model/ticket";

/** The synced settings file; a missing file is every default. */
export async function readSyncedSettings(host: HostClient): Promise<ParsedSyncedSettings> {
  try {
    const { content } = await host.files.readFile({ path: SYNCED_SETTINGS_PATH });
    return parseSyncedSettings(content);
  } catch (error) {
    if (isNotFound(error)) return parseSyncedSettings(null);
    return { ...parseSyncedSettings(null), problem: `${SYNCED_SETTINGS_PATH} can't be read (${errorText(error)})` };
  }
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

/** The project's Board settings and where its backlog is; `reload` re-reads both. */
export function useProjectBoard(host: HostClient, project: ProjectRef): { state: ProjectBoardState; reload: () => Promise<void> } {
  const [state, setState] = useState<ProjectBoardState>({ status: "loading" });
  const seq = useRef(0);
  const { id, root } = project;
  const reload = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const [synced, { settings: raw }] = await Promise.all([readSyncedSettings(host), host.project.getSettings({ projectId: id })]);
      if (mine !== seq.current) return;
      const settings = parseProjectSettings(raw);
      setState({ status: "ready", synced, settings, location: backlogLocation(root, settings, synced.settings) });
    } catch (error) {
      if (mine === seq.current) setState({ status: "error", message: errorText(error) });
    }
  }, [host, id, root]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useProjectSettingsChanges(host, (changed) => {
    if (changed === id) void reload();
  });
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
}

export type CandidatesState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; candidates: Candidate[] };

/** Every project with where its backlog would be, in sidebar order; re-read when a project is added, renamed, moved or regrouped, or its settings change. */
export function useCandidates(host: HostClient): CandidatesState {
  const [state, setState] = useState<CandidatesState>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const run = { live: true };
    void (async () => {
      try {
        const [{ projects }, synced] = await Promise.all([host.project.list(), readSyncedSettings(host)]);
        const candidates = await Promise.all(
          projects.map(async (project) => {
            const { settings } = await host.project.getSettings({ projectId: project.id });
            return { project, path: backlogLocation(project.root, parseProjectSettings(settings), synced.settings).path };
          }),
        );
        if (run.live) setState({ status: "ready", candidates });
      } catch (error) {
        if (run.live) setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => {
      run.live = false;
    };
  }, [host, version]);

  useEffect(() => {
    const subs = (["project.created", "project.renamed", "project.updated"] as const).map((name) =>
      host.events.subscribe(name, bump).catch(() => null),
    );
    return () => {
      for (const sub of subs) void sub.then((s) => s?.close());
    };
  }, [host, bump]);
  return state;
}
