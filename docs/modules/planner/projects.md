---
doc: docs/modules/planner/projects.md
audience: engineers, product
holds: project membership as a sub-folder, safe folder names and their candidates, the project-id → folder map that makes renames and regroups follow, collisions, each project's folder in its Pomade scope, headings and labels, a project removed
kind: reference
---

# Projects — sub-folders, the project-id → folder map, renames

**Module:** `planner` · **UI:** the context (Workspace or the active project), the project headings,
the project picker (in quick add and as Project's "+ Add from…") and All's project filter · **Code:** `src/planner/model/projects.ts`,
`src/planner/useProjects.ts`, `src/planner/write.ts` (`moveProjectFolder`, `saveProjectFolders`,
`syncScopeFolders`, `addProjectScopeFolder`),
`src/planner/model/settings.ts` · **e2e:** `planner-projects-fake.spec.ts`,
`pomade-planner-projects.spec.ts`, `pomade-project-removed.spec.ts` · **Unit:**
`src/planner/model/projects.test.ts`

## What it does

A Planner item belongs to a Pomade project by living in that project's sub-folder of the tasks root,
named after the project. Pomade's project id is stable; its name and group are not. So the synced
settings keep a project-id → folder map, and every open re-plans the folders from it — a rename or
regroup in Pomade, even one made while the Planner was closed, moves the folder and never orphans
the project's tasks.

## Folder names

`sanitizeFolderName`, `folderCandidates`:

- The project name made safe on disk: `/`, `\` and `:` become `-`, control characters go, leading
  dots and spaces and trailing dots and spaces are trimmed, at most 80 characters (`NAME_MAX`),
  nothing left is `Project`.
- **Candidates**, in order: the name; `<name> (<innermost group>)`; `<name> (<whole › group ›
  path>)` when nested; then `<name> (<group> 2)`, `(… 3)`, … (`<name> (2)` ungrouped).
- A candidate is **free** unless another project's map entry holds it or it is `Daily` /
  `_archive` (`RESERVED_FOLDERS`). Names compare Unicode-normalised and case-insensitively
  (`folderKey`; macOS volumes).
- Two projects with one name: the later one — whoever isn't mapped yet — gets its group appended in
  parentheses. A mapped project keeps its folder while that folder is still one of its free
  candidates.

## The map

`projectFolders` in the synced settings ([[settings-and-state]]), keyed by Pomade's stable project
id; each entry `{ folder, name, groupPath }`, the name and group path as last seen — for the
[[today-command]], which runs without Pomade. It is the source of truth once written.

- An entry is written when quick add makes a project's folder (`folderForNew`), and when a folder
  already carrying a project's first free candidate is taken over (the first such project in
  sidebar order).
- Entries of projects Pomade no longer lists stay and keep their folder's name reserved.
- Writes merge into the file's current map (`saveProjectFolders`), keeping every other entry and
  key.

## Renames and regroups

`planFolders(projects, map, disk)` is one pure rule for a rename heard as an event, a rename made
while Pomade was closed, and a regroup. `useFolderReconciliation` (`useProjects.ts`), in the
Planner panel and tab, runs it whenever Pomade's project list (re-read on `project.created` /
`renamed` / `updated` / `removed` and `project.changed`), the map or the root's sub-folders change —
so on a rename or regroup and on every open — planning from the map and the folders read fresh from
disk, one pass at a time per frame. It renames what changed through the Host API's move
(`moveProjectFolder`) and writes the entries that changed. It is idempotent, so several Planner
frames doing it at once agree.

- A folder changes only when its project's free candidates no longer include it — a regroup moves a
  suffixed folder (`QuizLab (Archive)` → `QuizLab (Life)`), never a plain one; a case-only rename
  keeps the folder.
- **Collision:** the target folder already there (and not the project's) — nothing moves or merges,
  the tasks stay in the old folder, and the panel says so until one of the folders is renamed or
  moved; then the rename catches up by itself.
- A mapped folder that is gone points the entry at the new name.
- A move another Planner frame already made (old folder gone, new one there) counts as moved.

## Scope folders

Each pass ends by making every listed project's Planner scope folders (Host API
`project.getScopeFolders` / `addScopeFolder` / `removeScopeFolder`, `pomade:E-047`; manifest
capabilities `project.read` and `project.write`) exactly its folder in the tasks root
(`planScopeFolders`, `syncScopeFolders`): `<tasks root>/<folder>` for a mapped project, none for an
unmapped one. So Pomade counts a project's items as the project's — no "Outside this project" mark
on its editor tabs ([[host-api-usage]] "Editor tabs in their project").

- It reads each project's folders (`project.getScopeFolders`) and changes only the difference —
  removals first — so a second frame's pass writes nothing.
- A rename or regroup swaps the old path for the new one; a changed tasks folder moves every
  project's; a collision keeps the folder the tasks stay in. The pass runs when the tasks root is
  gone too, from the map alone.
- Quick add making a project's folder adds it at once (`addProjectScopeFolder`), before the item's
  editor tab can open.
- A refused call is skipped silently and the next pass tries again: only the mark depends on it.
- No-project items have no scope folder; the Workspace project has none (Pomade refuses one).

## Sources and labels

Whose an item is (`folderSources`): the map — with what a plan would do, so a folder shows as its
project's before the map is written — names and groups from Pomade's live list (the command has
only the map); a sub-folder nobody owns is its own source, named after the folder.

- **Headings** (`sectionsBySource`, `compareSources`): "No project" first, then each project by
  name (ungrouped before grouped), each with its open count; each folds ([[views]] "Groups"). In
  Project at Workspace each holds the project's "Tasks" and "Notes and thoughts" ([[views]] "The
  views").
- **Labels** (`sourceLabels`): the name, with a qualifier when another source has the same name —
  the group path ("QuizLab (Archive)"), "Ungrouped", or "folder only" for a folder no project
  owns. The [[today-command]] prints the same headings.
- `matchProject` resolves the command's `--project` ([[today-command]]).

## A project removed

A project removed from the workspace (`project.removed`) leaves the project pickers and All's
project filter at once (the project list re-reads on it). Its folder and map entry stay: its tasks are listed under its last-seen name. When it
was the active project, the Planner shows the Workspace (Pomade's `project.changed`).
