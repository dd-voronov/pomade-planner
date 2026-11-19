# Backlog location — which folder a board reads, and the Workspace chooser

**Module:** `board` · **UI:** the Board tab (a project's board, "Choose backlog folder", the ⋯
"Board settings" menu; at Workspace the project chooser) · **Code:** `src/board/BoardTab.tsx`,
`src/board/BoardMenu.tsx`, `src/board/ProjectChooser.tsx`, `src/board/useBoardData.ts`,
`src/board/model/settings.ts`, `src/board/model/ticket.ts` (`readBacklog`, `isBacklogChange`),
`src/core/live-folder.ts` · **e2e:** `board-fake.spec.ts`, `board-manage-fake.spec.ts`,
`pomade-board.spec.ts`, `pomade-two-apps.spec.ts`, `pomade-project-removed.spec.ts` · **Unit:**
`src/board/model/settings.test.ts`, `src/board/model/ticket.test.ts` · **Contract:**
`../Pomade/docs/HOST-API.md` §4 `files.pickFolder`, `project.getSettings` / `setSettings`

## What it does

The Board shows one project's backlog — a folder of ticket files in Pomade's convention
([[convention-areas-columns]]). It finds the folder from a workspace-wide pattern, lets a project
choose its own, and loads live, so a backlog made or checked out later appears by itself. At
Workspace it offers the projects that have a backlog.

## Where it looks

- **The Board tab shows the active project.** Every Board tab follows `project.changed`
  (`useActiveProject`), so switching projects in Pomade switches the board; the area and column
  state are remembered per project ([[settings-and-state]]).
- **Default backlog path pattern** for the whole workspace: `backlogPathPattern` in
  `Apps/pomade-board/settings.json`, a folder relative to each project's root (default
  `docs/roadmap/`). A missing settings file means the default; an invalid value falls back to it and
  the Board says so (`parseSyncedSettings`). This is the only key the Board reads from that file.
- **Chosen folder.** If a project has no backlog there, the Board offers **Choose backlog folder**
  (Pomade's folder dialog bounded by the project, `files.pickFolder`); a folder outside the project
  is refused with a message. The folder, relative to the project root, is stored as the per-project
  app setting `backlogPath` and overrides the pattern (`backlogLocation`). The tab's ⋯ menu ("Board
  settings") offers **Change backlog folder…** later, and the switch "Move done epics and tasks to
  `done/`" (`moveDoneToDoneFolder`, [[editing-drag-create]] "Done moves the file").
- **Missing folder.** While the folder is missing, the Board watches its nearest existing parent, so
  a backlog folder made, moved in or checked out later loads the board by itself ([[file-model]]
  "Live from disk").
- **What it reads:** the folder and its `done/` sub-folder (not deeper), re-read after each burst of
  watch changes. Files without a known `kind:` (`BACKLOG.md`, `PLAN.md`, hand-made lists) are
  ignored ([[file-model]] "Recognised files only").

## At Workspace: the project chooser

With no active project the Board tab shows **Choose a project** (`ProjectChooser`): every project
whose backlog resolves, in sidebar order with its group, each with its count of open tickets (not
done, dropped, parked, triaged or dismissed — `isOpen`) and what needs you there ("14 open · 2 in
review · 1 new signal", [[needs-you]]). Counts update live. The project list re-reads on
`project.created` / `renamed` / `updated` / `removed` (`useCandidates`), so a project removed from
the workspace leaves the list at once. A click opens that project's Board tab
(`tabs.openApp` at `board`). A Board tab whose project is removed shows the chooser. With no
project holding a backlog, the chooser says how to choose one.
