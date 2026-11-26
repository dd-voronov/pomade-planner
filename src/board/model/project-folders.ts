// The settings page's "Folder for a project" ([[backlog-location]] "Settings page"): the projects
// that have a backlog folder of their own, the ones that can still get one, and the picker's
// type-to-filter over them.

import type { ProjectInfo } from "pomade-kit/protocol";

export interface ProjectFolder {
  project: ProjectInfo;
  /** The project's own backlog folder, relative to its root; `null` while it uses the workspace's default. */
  own: string | null;
}

/** The projects with a folder of their own (`rows`) and without one (`free`), each in the order given — the sidebar's. */
export function splitByFolder(projects: readonly ProjectFolder[]): { rows: { project: ProjectInfo; folder: string }[]; free: ProjectInfo[] } {
  const rows: { project: ProjectInfo; folder: string }[] = [];
  const free: ProjectInfo[] = [];
  for (const { project, own } of projects) {
    if (own === null) free.push(project);
    else rows.push({ project, folder: own });
  }
  return { rows, free };
}

/** A folder relative to a project's root as the page shows it: `tickets/`; `./` for the project's root itself. */
export const folderLabel = (folder: string): string => (folder === "" ? "./" : `${folder}/`);

/** A project's group as it is shown beside its name: `Building tools › Tools`; `""` when ungrouped. */
export const groupLabel = (project: ProjectInfo): string => project.groupPath.join(" › ");

/** The projects matching `query`: every whitespace-separated word, case-insensitively, in the name or the group's path. */
export function filterProjects(projects: readonly ProjectInfo[], query: string): ProjectInfo[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w !== "");
  if (words.length === 0) return [...projects];
  return projects.filter((p) => {
    const text = `${p.name} ${p.groupPath.join(" ")}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
