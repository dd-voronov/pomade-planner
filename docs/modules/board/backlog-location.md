---
doc: docs/modules/board/backlog-location.md
audience: engineers, product
holds: the backlog folder from the workspace's default or a per-project choice, the settings page that edits both, live even while missing, and the Workspace project chooser with its counts
kind: reference
---

# Backlog location — which folder a board reads, the settings page, and the Workspace chooser

**Module:** `board` · **UI:** the Board tab (a project's board, "Choose backlog folder", the ⋯
"Board settings" menu, the settings page behind ⚙; at Workspace the project chooser) · **Code:**
`src/board/BoardTab.tsx`, `src/board/BoardMenu.tsx`, `src/board/BoardSettingsPage.tsx`,
`src/board/ProjectPicker.tsx`, `src/board/PickList.tsx`, `src/board/ProjectChooser.tsx`,
`src/board/useBoardData.ts`, `src/board/write.ts` (`saveSyncedSettings`, `chooseBacklogFolder`,
`setBacklogFolder`), `src/board/model/settings.ts`, `src/board/model/project-folders.ts`,
`src/board/model/ticket.ts` (`readBacklog`, `isBacklogChange`), `src/core/live-folder.ts`,
`src/core/live-settings.ts`, `src/core/SettingsShell.tsx`, `src/core/settings.css` · **e2e:**
`board-settings-fake.spec.ts`, `board-fake.spec.ts`, `board-manage-fake.spec.ts`,
`pomade-board.spec.ts`, `pomade-two-apps.spec.ts`, `pomade-project-removed.spec.ts` · **Unit:**
`src/board/model/settings.test.ts`, `src/board/model/project-folders.test.ts`,
`src/board/model/ticket.test.ts` · **Contract:** `../Pomade/docs/HOST-API.md` §4
`files.pickFolder`, `project.getSettings` / `setSettings`, `project.list`

## What it does

The Board shows one project's backlog — a folder of ticket files in Pomade's convention
([[convention-areas-columns]]). It finds the folder from the workspace's default, lets a project
have its own, and loads live, so a backlog made or checked out later appears by itself. Both
folders are set on one settings page that does not depend on which project is open. At Workspace
the tab offers the projects that have a backlog.

## Where it looks

- **The Board tab shows the active project.** Every Board tab follows `project.changed`
  (`useActiveProject`), so switching projects in Pomade switches the board; the area and column
  state are remembered per project ([[settings-and-state]]).
- **The workspace's default folder:** `backlogPathPattern` in `Apps/pomade-board/settings.json`, a
  folder relative to each project's root (default `private/roadmap/`). A missing settings file
  means the default; an invalid value falls back to it and the Board says so
  (`parseSyncedSettings`).
- **A project's own folder.** The per-project app setting `backlogPath`, relative to the project
  root, overrides the default (`backlogLocation`). It is set from three places, all writing that
  one value (`chooseBacklogFolder`): **Choose backlog folder**, which the Board offers when a
  project has no backlog at its folder; the tab's ⋯ menu ("Board settings") → **Change backlog
  folder…**; and the project's row on the settings page. Each opens Pomade's folder dialog bounded
  by the project (`files.pickFolder`); a folder outside the project is refused with a message.
- **The ⋯ menu** holds the open project's two own settings: **Change backlog folder…** and the
  switch "Move done epics and tasks to `done/`" (`moveDoneToDoneFolder`, [[editing-drag-create]]
  "Done moves the file").
- **Missing folder.** While the folder is missing, the Board watches its nearest existing parent, so
  a backlog folder made, moved in or checked out later loads the board by itself ([[file-model]]
  "Live from disk").
- **What it reads:** the folder and its `done/` sub-folder (not deeper), re-read after each burst of
  watch changes. Files without a known `kind:` (`BACKLOG.md`, `PLAN.md`, hand-made lists) are
  ignored ([[file-model]] "Recognised files only").

## Settings page

**⚙** — in the board's header, right of ⋯, and beside the title of "Choose a project" — shows the
settings page in the tab (`BoardSettingsPage`); **← Board** goes back to the board or the chooser.
The page is the workspace's: it shows the same content whichever project is active, and stays up
while the active project changes. It is built from the same shell, rows and styles as the
Planner's page (`SettingsShell`, `core/settings.css`; [[settings-and-onboarding]]), with a heading
over each section.

**Backlog folder**

- **Default for this workspace:** one field holding `backlogPathPattern`. Enter or leaving the
  field saves it (`patternOf`: trimmed, normalized, with a trailing slash; `./` for the project's
  root) through `saveSyncedSettings`, which keeps every other key of the file. Emptied, the key is
  removed and the field shows the built-in default again. A value that is absolute or climbs out
  of the project is refused under the field ("A folder inside each project, like private/roadmap/
  — not an absolute path or one that leaves the project.") and nothing is written; the folder it
  already holds, however it is typed, writes nothing either.
- **Folder for a project:** the projects that have `backlogPath`, in sidebar order
  (`splitByFolder`), each row with the project's name and group, its folder (`folderLabel`),
  **Change…** (the folder dialog) and **×**, which removes `backlogPath` (`setBacklogFolder` with
  `null`) so the project is back on the default. With no such project the list says "Every project
  uses the default." **Add a project…** opens the project picker (`ProjectPicker`: a `PickList`
  of the projects without a folder of their own, in sidebar order with their group, filtered by
  typing a name or a group; ↑ ↓ and Enter, or a click; Escape or **Cancel** closes it, focus back
  on the button), then the folder dialog for the picked project.

**New tickets**

- **Reporter:** the handle written on created tickets ([[editing-drag-create]] "Reporter
  setting").

Each change saves at once and says so beside the footer ("Default folder saved.", "Folder for Beta
saved.", "Beta uses the default folder again."). A settings file that isn't a JSON object is shown
at the top of the page and is never written over: a save says why under its field.

## Every board follows

The synced settings file is read live (`useSyncedSettings` on `core/live-settings`): its folder is
a live folder, and a frame that writes it bumps the state key `board.settingsWritten`, so the
Board's other frames — tabs of other projects, the "Needs you" panel, the chooser — re-read at
once, as they do after a hand edit or a pull. A project's own settings are followed through
`project.updated` (`useProjectSettingsChanges`, `useCandidates`). A changed default, and a
project's folder added, changed or removed, re-point every open board without a reload.

## At Workspace: the project chooser

With no active project the Board tab shows **Choose a project** (`ProjectChooser`): every project
whose backlog resolves, in sidebar order with its group, each with its count of open tickets (not
done, dropped, parked, triaged or dismissed — `isOpen`) and what needs you there ("14 open · 2 in
review · 1 new signal", [[needs-you]]). Counts update live. The project list re-reads on
`project.created` / `renamed` / `updated` / `removed` and when the workspace's default folder
changes (`useCandidates`), so a project removed from the workspace leaves the list at once. A
click opens that project's Board tab (`tabs.openApp` at `board`). A Board tab whose project is
removed shows the chooser. With no project holding a backlog, the chooser says how to choose one.
The gear beside the title opens the settings page.
