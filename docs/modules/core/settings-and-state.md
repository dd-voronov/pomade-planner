---
doc: docs/modules/core/settings-and-state.md
audience: engineers, product
holds: what each app keeps where: synced settings in `Apps/<app id>/settings.json`, the Board's per-project settings, machine-local state with every key and its shape, and the Planner's `test.clock` hook
kind: reference
---

# Settings and state — what each app keeps, and where

**Module:** `core` · **UI:** the Planner's settings page ([[settings-and-onboarding]]), the Board
tab's ⋯ menu ([[backlog-location]]) · **Code:** `src/core/settings-file.ts`,
`src/planner/model/settings.ts`, `src/planner/model/view-state.ts`, `src/planner/model/pins.ts`,
`src/planner/model/folds.ts`, `src/planner/model/daily.ts`, `src/planner/model/attention.ts`,
`src/planner/usePlannerState.ts`, `src/planner/clock.ts`, `src/planner/write.ts` (`saveSettings`,
`saveProjectFolders`), `src/board/model/settings.ts`, `src/board/model/view-state.ts`,
`src/board/useBoardData.ts`, `src/board/ReporterForm.tsx` · **e2e:** `pomade-two-apps.spec.ts`, `planner-fake.spec.ts`,
`planner-today-fake.spec.ts`, `planner-project-fake.spec.ts`, `planner-projects-fake.spec.ts`,
`pomade-planner-template.spec.ts` · **Unit:** `src/core/settings-file.test.ts`,
`src/planner/model/settings.test.ts`, `src/planner/model/view-state.test.ts`,
`src/planner/model/pins.test.ts`, `src/planner/model/folds.test.ts`, `src/board/model/settings.test.ts`,
`src/board/model/view-state.test.ts` · **Contract:** `../Pomade/docs/HOST-API.md` §4 `state`,
`project.getSettings` / `setSettings`

## What it does

Each app owns its data; neither reads or writes the other's. Three stores, by how far a value
should travel: synced settings travel with the workspace (git), per-project settings live in the
workspace config under the app's id, and view state stays on the machine. Nothing of either kind is
ever written into an item file.

| What | Planner | Board |
|---|---|---|
| Synced settings, `<workspace>/Apps/<app id>/settings.json` | `Apps/pomade-planner/settings.json`: `tasksRoot` (workspace-relative; no default), `dailyNoteTemplate` (workspace-relative `.md`), `dayBoundary` (`H:MM`, default `3:00`), `projectFolders` (the project-id → folder map, [[projects]]) | `Apps/pomade-board/settings.json`: `backlogPathPattern` (default `docs/roadmap/`, [[backlog-location]]), `reporter` (the handle written as `reporter:` on created tickets, default `d.voronov`, [[editing-drag-create]] "Reporter setting") |
| Per-project settings (Host API per-project app settings, kept per app id in the workspace config) | none | `backlogPath` (backlog folder override, relative to the project root), `moveDoneToDoneFolder` (default on) |
| Machine-local state (Host API `state`), `<userData>/app-state/<app id>/` | the keys below | `board.view.<projectId>` |

## Synced settings file

`settings-file.ts`, used by both apps:

- `settingsPathOf(appId)` → `Apps/<appId>/settings.json`.
- `parseSettingsText(text)`: a missing file (`null`) is `{}` — every default; invalid JSON or a
  non-object is a problem, not an exception.
- `mergeSettingsText(text, patch)`: sets each key of the patch (removes it for `undefined`), keeps
  every other key in its order; a file that isn't a JSON object is refused, never overwritten. An
  app creates its file on its first settings write, never on a read.
- `saveSettingsFile(host, path, patch)`: reads the file fresh, merges, then creates or overwrites
  it; a failure is a `SettingsWriteError` in words ("Not saved: … Fix the file first.").

Each app parses its own keys (`parsePlannerSettings`, `parseSyncedSettings`): a key with a wrong
value falls back to its default on its own and the problems are returned together, so the views
say what is wrong ("dayBoundary must be a time like "3:00" — using the defaults.") while working on
the defaults.

The Planner's writes (`saveSettings`, `saveProjectFolders` in `src/planner/write.ts`) go through
`saveSettingsFile` and bump the state key `planner.settingsWritten` (`SETTINGS_CHANGED_KEY`) so the
app's other frames re-read. The settings folder itself is a live folder ([[file-model]] "Live from
disk"), so a hand edit shows too. The Board writes `reporter` from its ⋯ menu through
`saveSettingsFile` and reads it fresh at each create; `backlogPathPattern` is edited by hand and
read when a board loads. Its per-project settings are set from the Board tab and followed through
`project.updated` (`useProjectSettingsChanges`).

## Machine-local state

`<contextId>` is a project's id, or `__workspace__` (`WORKSPACE_PROJECT_ID`) for Workspace.

| Key | Value |
|---|---|
| `planner.view.<contextId>` | `{ view: "today" \| "project" \| "recurring" \| "all", showDone, showArchived, onlyProject, dueToday, mixins: string[], projects: string[], types: string[] }`. The selected view; All's "Show done", "Show archived" and its project and type filters (`projects` by source key, `none` = no project; empty = everything); Today's project filter `onlyProject` and Project's "Due today" `dueToday` (project contexts); `mixins`, the sources mixed into Project and Recurring in the order added (source keys: a project id, or `none`). A value saved as `mixNoProject: true` with `mixProjects: [ids]` reads as `mixins` — `none` first, then the ids. Default: Today, everything off or empty. |
| `planner.pins.<contextId>` | `{ today, project, recurring, all: string[] }`, each view's pinned paths in pin order. Today's list is read and written in `__workspace__`'s key from every context: one for the whole workspace; a project's key holds the other three. |
| `planner.folds.<contextId>` | `{ today, project, recurring, all: string[] }`, each view's folded group keys: a source key, or `<source key>/<group>` for a group inside one. |
| `planner.dailyNoteDay` | the planner day (`YYYY-MM-DD`) the Planner last ran on; the launch panel frame moves it forward |
| `planner.dailyNoteUnpinned` | the planner day the daily note was unpinned on, in every context |
| `planner.summaryDay` | the day the morning summary was last posted |
| `planner.settingsWritten` | a timestamp, bumped by a settings write so the app's other frames re-read |
| `board.view.<projectId>` | `{ area, toggled: { <areaId>: string[] } }`: the open area and, per area, the statuses of the columns toggled against their default |
| `test.clock` | `{ offsetMs }`, the test hook below |

Select mode is held in the frame's memory per view; it is not stored.

- Planner view state (`view-state.ts`): `parsePlannerView` / `serializePlannerView`, a bad value
  falling back to `DEFAULT_VIEW` (Today), a bad field to its own default; lists capped at 500 keys
  against a hand-edited state file. Pins (`pins.ts`): each view's paths in pin order, capped at 200 per view ([[views]] "Pins").
  Folds (`folds.ts`): each view's folded group keys, capped at 500 per view ([[views]] "Groups").
- `usePlannerState.ts`: a key read once and followed through the other frames' changes, with a
  setter that stores it; and the day's daily note, made by the launch panel frame
  ([[daily-notes]] "When").
- Board view state (`src/board/model/view-state.ts`): the open area and the columns toggled away
  from their default, per project.

## Test hook

The state key `test.clock` (`{ "offsetMs": n }`) shifts the Planner's "now" in every frame — tab,
panel and quick-add overlay — so specs reach 01:30 or the boundary without waiting
(`src/planner/clock.ts`); `window.__plannerTest.setClock(instantMs | null)` sets it from a spec.
Nothing in the app sets it. It is the Planner's own state (`app-state/pomade-planner/`).
