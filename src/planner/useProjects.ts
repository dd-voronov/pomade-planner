// The Planner's view of Pomade's projects ([[projects]], [[views]]): the groups → projects tree, live,
// and the reconciliation that keeps each project's sub-folder of the tasks root in line with its
// name and group — on a `project.renamed` or `project.updated` event, and on every open, so a rename
// made while Pomade (or the Planner) was closed is caught up through the map and the stable id — and
// that keeps the folder in its project's scope in Pomade.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GroupInfo, ProjectInfo } from "pomade-kit/protocol";
import type { HostClient } from "pomade-kit/sdk";

import { errorText } from "../core/host";
import { parseSettingsText } from "../core/settings-file";
import { projectFolders } from "./model/items";
import { parseFolderMap, planFolders, PROJECT_FOLDERS_KEY, type FolderCollision, type FolderMap } from "./model/projects";
import { SYNCED_SETTINGS_PATH } from "./model/settings";
import { readSettingsText } from "./usePlannerData";
import { moveProjectFolder, saveProjectFolders, syncScopeFolders, WriteError } from "./write";

export type ProjectList = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; groups: GroupInfo[]; projects: ProjectInfo[] };

/** Pomade's groups and projects in sidebar order, re-read when a project is added, renamed, moved, regrouped or removed. */
export function useProjectList(host: HostClient): ProjectList {
  const [state, setState] = useState<ProjectList>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let live = true;
    host.project.list().then(
      ({ groups, projects }) => live && setState({ status: "ready", groups, projects }),
      (error: unknown) => live && setState({ status: "error", message: errorText(error) }),
    );
    return () => {
      live = false;
    };
  }, [host, version]);

  useEffect(() => {
    const subs = (["project.created", "project.renamed", "project.removed", "project.updated"] as const).map((name) => host.events.subscribe(name, bump).catch(() => null));
    // The active project renamed or moved arrives as project.changed too; a switch costs one re-read.
    const off = host.project.onChange(bump);
    return () => {
      off();
      for (const sub of subs) void sub.then((s) => s?.close());
    };
  }, [host, bump]);
  return state;
}

/** A rename the Planner didn't make (the folder it should have is taken, or the move failed), or a map it couldn't save — in words for the panel. */
export interface FolderProblem {
  key: string;
  text: string;
}

/** A collision as the panel says it: never merged, the tasks stay where they are. */
export function collisionText(root: string, c: FolderCollision): string {
  const at = (folder: string) => `${root === "" ? "" : `${root}/`}${folder}/`;
  return `“${c.name}” can't take ${at(c.to)} — a folder with that name is already there. Its tasks stay in ${at(c.from)}; rename or move one of the two folders and it follows.`;
}

/** The map as the settings file holds it now; `null` when the file isn't a JSON object (its problem shows already). */
async function readFolderMap(host: HostClient): Promise<FolderMap | null> {
  const text = await readSettingsText(host);
  const { object } = parseSettingsText(text ?? null, SYNCED_SETTINGS_PATH);
  return object === null ? null : parseFolderMap(object[PROJECT_FOLDERS_KEY]).map;
}

/** The root's project sub-folders as they are on disk now; `null` when the root is gone. */
async function readRootFolders(host: HostClient, root: string): Promise<string[] | null> {
  try {
    const { entries } = await host.files.readFolder({ path: root });
    return projectFolders(entries);
  } catch {
    return null;
  }
}

/**
 * Keep the project folders in line (model/projects `planFolders`): rename what a rename or regroup
 * calls for through the Host API's move, take over folders that already carry a project's name,
 * and write the map when it changed; then make each project's scope folder its folder (`syncScopeFolders`),
 * so Pomade counts the project's tasks as the project's. Runs whenever the projects, the map or the root's sub-folders
 * change, planning from the map and the folders read fresh from disk — never from a view that may
 * lag a write; idempotent, so several Planner frames doing it at once agree. Returns the renames it
 * couldn't make, for the panel to show.
 */
export function useFolderReconciliation(host: HostClient, root: string, map: FolderMap, folders: readonly string[], projects: ProjectList): FolderProblem[] {
  const [problems, setProblems] = useState<FolderProblem[]>([]);
  const running = useRef<Promise<void>>(Promise.resolve());
  const list = projects.status === "ready" ? projects.projects : null;
  // What triggers a pass: the effect runs again only when one of them really changed.
  const trigger = JSON.stringify([map, folders]);
  const listJson = useMemo(() => (list === null ? null : JSON.stringify(list.map((p) => ({ id: p.id, name: p.name, groupPath: p.groupPath })))), [list]);

  useEffect(() => {
    if (listJson === null) return;
    let live = true;
    const isLive = () => live;
    const projectsNow = JSON.parse(listJson) as { id: string; name: string; groupPath: string[] }[];
    // One pass at a time per frame; the next one plans from what the last one left.
    running.current = running.current.then(async () => {
      if (!isLive()) return;
      const mapNow = await readFolderMap(host).catch(() => null);
      if (mapNow === null) return;
      const foldersNow = await readRootFolders(host, root);
      const ids = projectsNow.map((p) => p.id);
      if (foldersNow === null) {
        await syncScopeFolders(host, root, mapNow, ids);
        return;
      }
      const plan = planFolders(projectsNow, mapNow, foldersNow);
      const found: FolderProblem[] = plan.collisions.map((c) => ({ key: `collision:${c.id}`, text: collisionText(root, c) }));
      const next: FolderMap = { ...plan.map };
      for (const move of plan.moves) {
        const outcome = await moveProjectFolder(host, root, move.from, move.to);
        if (outcome === "moved") continue;
        const before = mapNow[move.id];
        if (before === undefined) delete next[move.id];
        else next[move.id] = { ...before, name: next[move.id]?.name ?? before.name, groupPath: next[move.id]?.groupPath ?? before.groupPath };
        const collision = { id: move.id, name: projectsNow.find((p) => p.id === move.id)?.name ?? move.to, from: move.from, to: move.to };
        found.push({ key: `collision:${move.id}`, text: outcome === "taken" ? collisionText(root, collision) : `Couldn't rename ${move.from}/ to ${move.to}/ for “${collision.name}”: ${outcome.reason}.` });
      }
      const changed = Object.fromEntries(Object.entries(next).filter(([id, e]) => JSON.stringify(mapNow[id]) !== JSON.stringify(e)));
      if (Object.keys(changed).length > 0) {
        await saveProjectFolders(host, changed).catch((e: unknown) => {
          found.push({ key: "map", text: e instanceof WriteError ? e.message : `Couldn't save the project folders: ${errorText(e)}.` });
        });
      }
      await syncScopeFolders(host, root, next, ids);
      if (isLive()) setProblems(found);
    });
    return () => {
      live = false;
    };
  }, [host, root, trigger, listJson]);
  return problems;
}
