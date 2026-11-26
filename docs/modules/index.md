---
doc: docs/modules/index.md
audience: engineers, product
holds: the module map — each module's scope, where it lives in code, and a summary of its feature docs
kind: reference
---

# pomade-planner — modules

A module is a real area of the apps with a home in the code. Tickets name one in `module:`. Each module folder here holds one doc per feature area: what it
does and why, and how it is built — code paths, data flow, key functions, state, edge cases,
invariants, tests — each opening with a header line of its module, UI, code, e2e specs, unit tests
and Host API contract. The cross-cutting shape is in [ARCHITECTURE](../ARCHITECTURE.md); how to *use* each
feature is in the [user guide](../user-guide/index.md).

| Module | Covers | Where in code |
|---|---|---|
| `core` | app shell: manifest, install, surfaces/routing, settings and app state, the shared file model (read, watch, field-only writes, unreadable items), test harness | `src/core/`, `apps/*/public/manifest.json`, `fake-host/`, `scripts/`, `test/`, `e2e/` |
| `board` | the Board: backlog location, areas and columns, cards, drag, ticket creation and IDs, "Needs you" | `src/board/` |
| `planner` | the Planner: item types, projects and their folders, Today module, views, select mode, quick add, recurring, daily notes, pins, attention, the `pomade-planner today` command | `src/planner/`, `cli/` |

A new area gets its row here first; when one grows its own code folder, the row follows.

## core — the shell and what both apps share

Both apps are the same kind of page over the same file model: one handshake with Pomade, a view per
surface and route, live folder reads, field-only writes that never land on a newer file, Pomade's
theme, and a test harness from pure logic up to a real Pomade.

- [[app-shell-and-two-apps]] — how one codebase builds two separately installable apps: the
  `apps/<app>/` folders and manifests, the build, dev servers and install script, the handshake, and
  the route table that picks each frame's view (including the panel's `added?path=…`).
- [[file-model]] — the architecture both apps rest on: items are md files with frontmatter read live
  through the Host API watcher, only recognised files count, unreadable ones stay visible, every
  edit is field-only, and an action's first write is conditional on the mtime read.
- [[settings-and-state]] — what each app keeps where: synced settings in
  `Apps/<app id>/settings.json` read live, the settings page both apps build theirs from, the
  Board's per-project settings, every machine-local state key
  with its shape (view state, pins, folds, the daily-note and summary days), and the Planner's
  `test.clock` hook.
- [[host-api-usage]] — which Pomade and `pomade-kit` features the apps need (Pomade 0.3.3 and later,
  `pomade-kit` v0.19.0) and how each is used: each manifest's capabilities and events, overlay,
  launch panel, `panel.show` and the Planner's `item.added` event, badge, notices, tabs,
  conditional writes, pickers, bulk delete, scope folders, project events; which project an editor
  tab opens in.
- [[theme]] — Pomade's tokens and theme on every frame, the surface background, and the rule that
  every colour is a token.
- [[tooltips-and-popovers]] — the one tooltip layer per frame (`data-tip`, 350 ms, 1 s for the slow
  tips — rows, cards, select boxes — and the shared hint wording, none right after a press, kept inside the frame) and the anchored popover both apps use,
  which closes on a click outside, Escape and the frame losing the focus.
- [[test-harness]] — vitest in Europe/Madrid, the fake-host harness with its query parameters,
  `window.*` helpers (`mountNow`, `pressShortcut`, `hostCalls`, `scopeFolders`) and fixtures, the
  real-Pomade launcher with its picker hook, and the Playwright projects.

## planner — the Planner app

Personal planning over one tasks folder: five item types, a planner day with its boundary, Today (one
list for the whole workspace) and three other views per context, recurring items with a log, a
daily note per day, adding and editing without leaving the Planner, and attention that works before
it is opened.

- [[storage-and-item-types]] — the tasks root's layout (root, `Daily/`, `_archive/`, project
  sub-folders), which files are read, file names, the five types and their fields, and how a new
  item and a tick are written.
- [[projects]] — project membership as a sub-folder, safe folder names and their candidates, the
  project-id → folder map that makes renames and regroups follow, collisions, each project's folder
  kept in its Pomade scope, headings and labels, a project removed.
- [[days-and-today]] — the planner day and its 03:00 boundary across sleep and DST, the pure Today
  module (what is in Today and why — tasks, recurring items and the notes and thoughts planned for
  the day), ticking, and the order of every list.
- [[recurring]] — the `repeat:` rule in the kit's format, `do-on` as the next occurrence, lead time,
  missed and ended, done and skip as a log line then `do-on`, and the row's acknowledgement.
- [[daily-notes]] — one note per planner day made by the launch frame from the template (or the
  built-in one), never back-filled, its checkbox progress and its card pinned on Today.
- [[views]] — the panel and the tab, the header and the narrowing switcher, the context and its
  name, what Today, Project, Recurring and All show, Today's "Only <project>" filter, Project's
  two groups and "Due today", the mix-ins of Project and Recurring, All's filters, two-level folding
  groups, rows, the row menu and the open hint, and pins.
- [[trimming]] — select mode in every view, started from the header or a row's menu: selecting
  among the rows shown, bulk Archive, and Delete to the macOS Trash after a confirmation, with
  per-file results.
- [[item-in-place]] — the compact view beside the lists in the tab: opening from the tab or the
  panel, the fields and Details, saving without a button over the version read, following the file.
- [[quick-add]] — one add form in place in the tab and in Pomade's overlay elsewhere: entry points,
  pre-fills, fields and Details, the keys, the repeat editor, the project picker, and after an add
  (the view follows the item; the overlay tells the tabs and brings the panel forward).
- [[attention]] — the Planner icon's badge (overdue + due today) and the once-a-day morning
  summary, both run by the hidden launch frame; the summary's click to Today at Workspace.
- [[settings-and-onboarding]] — the first-run choice of the tasks root and the settings page: tasks
  folder, day boundary, daily-note template (picked from any `.md` file of the workspace).
- [[today-command]] — `pomade-planner today`: the same Today from disk without Pomade (notes and
  thoughts planned for the day included), its arguments, text and JSON output, exit codes and
  bundling.

## board — the Board app

A kanban over each project's frontmatter backlog in the Pomade convention: where the backlog is
and the settings page that says so, three fixed areas with their columns, edits that are field-only writes, ticket creation with the
next free ID, and "Needs you" in the side panel.

- [[backlog-location]] — the backlog folder from the workspace's default or a per-project choice,
  the settings page that edits both (and the reporter), every board following a change, live even
  while missing, and the Workspace project chooser with its counts.
- [[convention-areas-columns]] — the ticket convention and the `signal` kind, the fixed areas and
  columns, the Unreadable strip, empty areas, cards and their order.
- [[editing-drag-create]] — drag as a status write (never over a newer file), `done/` moves, signal
  triage, the card popover, the parent list, and creating a ticket: ID, file name, text.
- [[needs-you]] — tickets in review and new signals for the active project, and the three-level
  panel at Workspace.
