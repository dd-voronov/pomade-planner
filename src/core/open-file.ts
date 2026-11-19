// An editor tab the Planner opens (HOST-API §4 `tabs.open`) goes to the project that holds the
// file — the deepest project whose folder holds it, the Workspace scope for a file in none — so
// Pomade never marks it "Outside this project", whichever project is in front.

import { WORKSPACE_PROJECT_ID, type ProjectRef } from "pomade-kit/protocol";
import type { HostClient } from "pomade-kit/sdk";

/** The id of the project whose folder holds `path` (the deepest when projects nest); `"__workspace__"` for a file in none. */
export function holdingProjectId(path: string, projects: readonly Pick<ProjectRef, "id" | "root">[]): string {
  let best: { id: string; depth: number } | null = null;
  for (const p of projects) {
    const root = p.root.replace(/\/+$/, "");
    if (root === "" || !(path === root || path.startsWith(`${root}/`))) continue;
    if (best === null || root.length > best.depth) best = { id: p.id, depth: root.length };
  }
  return best?.id ?? WORKSPACE_PROJECT_ID;
}

/** Open `path` in an editor tab of the project that holds it; when the projects can't be listed, in the frame's project as Pomade defaults. */
export async function openFileInItsProject(host: HostClient, path: string): Promise<void> {
  const projects = await host.project.list().then(
    (list) => list.projects,
    () => null,
  );
  await host.tabs.openFile(projects === null ? { path } : { path, projectId: holdingProjectId(path, projects) });
}
