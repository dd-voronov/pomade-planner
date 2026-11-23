---
doc: docs/modules/core/host-api-usage.md
audience: engineers, product
holds: which Pomade and `pomade-kit` features the apps need and how each is used: overlay, launch panel, badge, notices, tabs, conditional writes, pickers, bulk delete, project events; which project an editor tab opens in
kind: reference
---

# Host API and kit usage — what the apps take from Pomade and pomade-kit

**Module:** `core` · **UI:** — · **Code:** `src/core/host.ts`,
`src/core/views.ts`, the Host API calls across `src/planner/` and `src/board/` · **e2e:**
`pomade-smoke.spec.ts`, `pomade-two-apps.spec.ts`, `pomade-project-removed.spec.ts` · **Unit:**
`test/manifest.test.ts` · **Contract:**
`../Pomade/docs/HOST-API.md` (protocol); usage reference: the `pomade-kit` README
(`../pomade-kit/README.md`)

## What it does

Each app uses only the Host API (`pomade-kit` SDK) and `pomade-kit`'s pure logic:
`frontmatter-write` (through the Host API), `schedule`, `dates` / `date-phrases`, `frontmatter`
reads, `tokens.css`, and `pomade-kit/node` for the command. Each of the two apps is an ordinary app
to Pomade — its own manifest, install, dev link, new-tab menu row and frames — and the needs below
are met per app. A new need goes to `../Pomade/docs/PLATFORM-INTAKE.md`.

## Needs and where they are met

| Need | Provided by |
|---|---|
| App tab, manifest, install, dev link, app shortcut | `pomade:E-027` |
| Strip icons, panel / tab / both actions, badge | `pomade:E-029` |
| Folder read + watch, frontmatter, field-only write, create/move/rename, open file in a tab, active project, groups → projects, stable project ids, per-project settings | `pomade:E-030` |
| `project renamed`, `active project changed`, `Pomade ready` events | `pomade:E-031` |
| `project removed` event | `pomade:T-247` |
| Notice with click action, icon badge | `pomade:E-032` |
| `pomade-planner today` on `PATH` | `pomade:E-028` |
| Rule-8 banner when the app writes an open dirty file | `pomade:E-035` |
| File picker for the daily-note template (`files.pickFile`) | `pomade:T-245` |
| SDK, fake host | `pomade-kit:E-001` |
| Field-only frontmatter write | `pomade-kit:E-002` |
| Recurrence engine | `pomade-kit:E-003` |
| Date phrases | `pomade-kit:E-004` |

The apps require Pomade `main`: the platform with `pomade:T-237`–`T-248`. A manifest naming
`project.removed` does not install on a Pomade without it.

## How each need is used

- **Quick add** is the Host API's overlay surface: a shortcut with action `overlay`, and
  `overlay.open` (`anchor: "panel"`) from the Planner panel; the form sizes its frame with
  `overlay.resize` ([[quick-add]] "The overlay").
- **Badge, morning summary, the daily note before the Planner is first opened** come from
  `startOnLaunch` (the Planner panel is the launch panel), `strip.setBadge`, `notices.post` and the
  `pomade.ready` event ([[attention]], [[daily-notes]]). The summary's click is a notice action
  `openApp` at route `today` in the Workspace.
- **View state** lives in the Host API's `state` store ([[settings-and-state]]).
- **Tabs.** An app opens its own tab at a route with `tabs.openApp`, never the other app's — the
  Planner panel's rows at an item's route, which an open tab receives as `route.changed`
  ([[item-in-place]] "From the panel"); the Board's Workspace chooser at `board` in a project.
- **Edits.** The compact view's edits are `files.setField` / `removeField` / `setBody`; a recurring
  item's rule — a mapping, which `files.setField` does not take — is `files.setKeyLines` with the
  `repeat:` key's own lines (`formatSchedule`). An action's first write to an item or a ticket is
  conditional on the mtime read (`ifMtime`, refused as `changed-on-disk`) ([[file-model]] "Never
  over a newer file").
- **Pickers.** `files.pickFolder` (the tasks root, a project's backlog folder) and
  `files.pickFile` (the daily-note template).
- **Bulk delete.** `files.delete`, at most `FILES_DELETE_MAX_PATHS` (1000) paths a call
  ([[trimming]]).
- **Projects.** `project.list`, `project.getActive` / `onChange` (`useActiveProject`: followed
  through every `project.changed`, since a tab Pomade restores at launch receives the project active
  at launch in its `welcome`), and the `project.created` / `renamed` / `updated` / `removed`
  events ([[projects]], [[backlog-location]]).
- **The command** finds the workspace with `pomade-kit/node`'s `resolveWorkspace()`
  ([[today-command]]).

## Editor tabs in their project

- Planner: an editor tab opens in the project the Planner is shown in — the active project, the
  Workspace at Workspace — and Pomade stays there. Every way in calls `tabs.openFile({ path })`
  with no `projectId`, which Pomade reads as the active project: ⌘-click, **Open in tab**, ⇧⌘↵ in
  quick add, the **Daily** type, an unreadable file's row. A task of another project shown here
  opens here too. The tasks folder usually lies outside the project, so the tab carries Pomade's
  orange "Outside this project" mark.
- Board: a ticket opens in its board's project (`tabs.openFile` with that `projectId`), from the
  board and from "Needs you".

## Host errors

`src/core/host.ts`: `isNotFound`, `errorText`, and `diskReason` — a host disk error in a few words
(`EACCES` → "permission denied", `ENOSPC` → "the disk is full", else the message's first clause).
