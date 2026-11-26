---
doc: docs/user-guide/settings.md
audience: users
holds: every setting — where it is changed and stored — and where each app keeps its data and machine-local state
kind: reference
---

# Settings and data

[← User guide](index.md)

Each app keeps its own data and reads no other's. Three places:

| Where | What | Synced |
|---|---|---|
| `<workspace>/Apps/<app id>/settings.json` | the app's settings | with the workspace (git) |
| Pomade's per-project app settings (in the workspace config) | the Board's per-project choices | with the workspace |
| `<Pomade user data>/app-state/<app id>/` | view state: selected views, filters, pins, collapsed columns, the last summary day | no — this Mac only |

Item and ticket files never hold view state.

## Planner

**Settings page:** the Planner tab's **⚙ Settings**, or the panel's **⋯ → Settings…** (opens the
tab on it). **← Planner** goes back. Saved in `Apps/pomade-planner/settings.json`.

| Setting | Key | Default | Does |
|---|---|---|---|
| **Tasks folder** — **Change…** | `tasksRoot` | none — asked on first run | the folder every item lives in, workspace-relative. Choosing another folder moves no files |
| **Day starts at** | `dayBoundary` (`H:MM`) | `3:00` | when a planner day starts: ticked tasks leave Today, unfinished ones roll over, recurring items fall due, the daily note is made. Saved on Enter or leaving the field |
| **Daily note template** — path, **Choose…**, **Clear** | `dailyNoteTemplate` | none — the built-in note | a Markdown file anywhere in the workspace that each day's note starts from. Type a path (`Templates/Daily.md`) and press Enter or leave the field, or **Choose…** a `.md` file from anywhere in the workspace (the dialog opens at the workspace root). It must be readable when saved. **Clear** goes back to the built-in note |
| *(kept by the app)* | `projectFolders` | `{}` | project id → `{ folder, name, groupPath }`: which sub-folder belongs to which Pomade project. Written when a project's folder is made or renamed; read by the `today` command. Don't edit it by hand |

If the template can't be used later (deleted, unreadable frontmatter), the settings page says why:
"Can't use Templates/Daily.md: … New daily notes use the built-in template until it can be read."

**Machine-local state** (`app-state/pomade-planner/`):

| Key | Holds |
|---|---|
| `planner.view.<project id>` (`__workspace__` for Workspace) | selected view, Show done, Show archived, Today's **Only *project***, Project's **Due today**, Project's and Recurring's mix-ins, All's filters |
| `planner.pins.<project id>` | pinned paths per view, in pin order (Today's: Workspace's alone, one list for every project) |
| `planner.folds.<project id>` | the folded groups of each view |
| `planner.dailyNoteDay` | the last day the Planner ran on (and made that day's note) |
| `planner.dailyNoteUnpinned` | the day the daily note's card was unpinned |
| `planner.summaryDay` | the last day a morning summary was settled |

## Board

**Settings page:** the Board tab's **⚙ Settings** — in the board's header, right of **⋯**, and
beside the title of "Choose a project" at Workspace. **← Board** goes back. The page is the same
whichever project is open: it holds the workspace's settings and the folder of any project.

| Section | Setting | Stored | Default | Does |
|---|---|---|---|---|
| **Backlog folder** | **Default for this workspace** | `backlogPathPattern` in `Apps/pomade-board/settings.json` | `private/roadmap/` | the folder of tickets in every project, relative to the project's own folder. Saved on Enter or leaving the field. Emptied, it goes back to the default. An absolute path, or one that leaves the project (`../`), is refused |
| **Backlog folder** | **Folder for a project** — a row per project with **Change…** and **×**; **Add a project…** | per-project app setting `backlogPath`, relative to the project's root | none — the project uses the default | a project whose tickets are somewhere else. **Add a project…** lists the projects that have no folder of their own (type to filter, Enter or a click picks), then opens the folder dialog limited to that project. **Change…** picks another folder; **×** puts the project back on the default |
| **New tickets** | **Reporter** | `reporter` in `Apps/pomade-board/settings.json` | `d.voronov` | the handle written as `reporter:` on every ticket the Board creates; no spaces. Saved on Enter or leaving the field. Emptied, it goes back to the default |

Each change saves at once, the page says so ("Default folder saved."), and every open board
follows it without a reload.

Two settings belong to the open project and stay in its board's **⋯** menu:

| Setting | Where it is changed | Stored | Default |
|---|---|---|---|
| Backlog folder of this project | **⋯ → Change backlog folder…** — the same value as the project's row on the settings page; also **Choose backlog folder** when no backlog is found | per-project app setting `backlogPath` | none |
| Move done epics and tasks to `done/` | **⋯** menu, a checkmark item | per-project app setting `moveDoneToDoneFolder` | on |

Example `Apps/pomade-board/settings.json`:

```json
{
  "backlogPathPattern": "private/roadmap/",
  "reporter": "d.voronov"
}
```

**Machine-local state** (`app-state/pomade-board/`): `board.view.<project id>` — the selected area
and the columns you expanded or collapsed.

## Rules for both settings files

- A missing file means every default; the app creates it on its first settings write.
- A write changes only the keys it names and keeps every other key.
- A file that isn't a JSON object is never overwritten: the write is refused and the app says why.
- A key with a wrong value falls back to its default, and the app says so: "… — using the
  defaults." (`reporter must be a handle without spaces, like "d.voronov" — using the defaults.`)
