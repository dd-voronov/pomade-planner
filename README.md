# pomade-planner

Two Pomade apps from one codebase: **Planner** (`pomade-planner` — to-dos, recurring tasks, daily notes)
and **Board** (`pomade-board` — kanban over project backlogs). Each is installed, opened and removed on
its own and works without the other.

Part of the Pomade family — the platform and its rules live in the sibling repo `Pomade`
(`docs/PLATFORM.md`, protocol in `docs/HOST-API.md`). Design: `docs/DESIGN.md` (overview), `docs/modules/` (per module). Backlog:
`docs/BACKLOG.md`. The apps require Pomade `main` — the platform with `pomade:T-237`–`T-248`
(`docs/modules/core/host-api-usage.md`).

User guide — how to use both apps: [`docs/user-guide/user-guide.md`](docs/user-guide/user-guide.md).

## Shape

Two web UIs (TypeScript, React, Vite) on `pomade-kit`'s SDK (`github:dd-voronov/pomade-kit#v0.13.1`),
sharing `src/core/`; the Board's drag and drop is `@dnd-kit/core` (pointer and keyboard sensors).
Pomade loads an app in an iframe; the surface it is opened on (`host.welcome.surface`, `.icon`,
`.route`, then `host.onRouteChange`) picks the view (`src/core/views.ts`: `plannerView`,
`boardView`). An app has views for its own routes only.

**Planner** (`pomade-planner`):

| Surface | Route | View |
|---|---|---|
| panel (Planner strip icon; loaded hidden at launch, `startOnLaunch`) | `planner` | Planner — and the badge, the morning summary and the day's daily note |
| tab (`tabs.openApp`, new-tab menu) | `planner` or `""` | Planner tab |
| tab (`tabs.openApp`) | `settings` | Planner tab on its settings page |
| tab (the morning summary's click) | `today` | Planner tab on the Workspace Today |
| tab (a click on a row of the Planner panel) | `item?path=<file>` | Planner tab with that item's compact view open |
| overlay (shortcut ⌘⇧A; the Planner panel's **+** and Add button) | `quick-add`, with the view's pre-fills (`?do-on=today`, `?type=recurring`) | Quick add |

**Board** (`pomade-board`):

| Surface | Route | View |
|---|---|---|
| tab (Board strip icon, new-tab menu, the Workspace chooser's `tabs.openApp`) | `board` or `""` | Board |
| panel (Board strip icon) | `needs-you` | Needs you |

The Planner's command, `pomade-planner today [--project <name>] [--json] [--date YYYY-MM-DD]` (`docs/modules/planner/today-command.md`): Pomade links it
into its command folder on install, so it is on `PATH` in Pomade's terminals and — once the PATH
line is added (Pomade ▸ Settings ▸ General ▸ Commands) — in any login shell. It reads
`Apps/pomade-planner/settings.json` (with the project-id → folder map) and the tasks root with its
project sub-folders straight from the workspace, so it works with Pomade closed.

Opened outside Pomade an app shows "No Pomade host". Each app's folder under `apps/` holds its page,
its entry and its manifest; the build makes one installable app folder per app, `dist/planner/` and
`dist/board/` (Build, below). Each app keeps its own data: synced settings in
`<workspace>/Apps/pomade-planner/settings.json` and `<workspace>/Apps/pomade-board/settings.json`,
state and per-project settings under its own id (`docs/modules/core/settings-and-state.md`).

| Folder | Holds |
|---|---|
| `apps/planner/`, `apps/board/` | one folder per app: `index.html`, the entry `main.tsx` (the app's name and its views, handed to the shared shell) and `public/` — `manifest.json` and the app's icon, copied into the build as they are |
| `src/core/` | compiled into both apps — the shell (`mount.tsx`, `App.tsx`): handshake, routing, tokens and base styles, the view switcher's styles; what both apps share — Host API helpers, the live folder read (`live-folder.ts`), reading and merging an app's synced settings file (`settings-file.ts`), slugs, the anchored popover and its placement (`place.ts`), the tooltips of the app's controls (`Tips.tsx`: a control names itself with `data-tip`) |
| `src/board/` | the Board app's code: the Board tab, the Workspace project chooser, the Needs-you panel (`NeedsYouPanel.tsx` inside a project, `NeedsYouWorkspace.tsx` the list and its levels at Workspace, `NeedsYouGroups.tsx` the groups both show), the create form, card popover and triage picker; Host API reads and watches (`useBoardData.ts`) and writes (`write.ts`) |
| `src/board/model/` | the Board's pure logic, each with its vitest matrix: tickets, areas and columns, order, drops and popover edits, ticket creation (IDs, slugs, file text), parent candidates, Needs you (the groups, the counts, the Workspace levels), settings, view state |
| `src/planner/` | the Planner app's code: the Planner panel and tab (onboarding, Today with the daily note's card, Project, Recurring, All with mix-ins, filters and Show archived, pins, row actions, select mode with the delete confirmation, the tab's excerpts, settings page), an item's compact view in the tab (`ItemPane` beside the lists, styled in `item-pane.css`; which item is open and how it follows its file, `useOpenItem.ts`; the file's version and the view's writes over it, `useItemFile.ts`), the add form with its five types and Details (`AddForm` over the fields of `ItemFields`: in the overlay the shortcut and the panel's **+** and Add button open, `QuickAdd`, and in place at the foot of the tab's lists, `AddInPlace`; its placements' styles in `add-form.css`), the project picker and the repeat editor; its clock and day (`clock.ts`), Host API reads with a text cache (`usePlannerData.ts`), app state and the day's daily note (`usePlannerState.ts`), the badge and the morning summary (`useAttention.ts`), Pomade's projects and the folder reconciliation (`useProjects.ts`), writes (`write.ts`) |
| `src/planner/model/` | the Planner's pure logic, each with its vitest matrix: settings, items, the Today module (`today.ts`), attention (`attention.ts`: what is due, the badge, the summary's text and when it posts), recurring items (`recurring.ts`: the rule, the log, lead time / missed / ended, done and skip), daily notes (`daily.ts`: when one is made, the template merge, the built-in note), body reads (`body.ts`: checkbox progress, excerpts), pins (`pins.ts`), archive paths (`archive.ts`), All's select mode and delete results (`selection.ts`), quick add's repeat editor (`repeat-draft.ts`), project folders, the map and rename plans (`projects.ts`), what each view shows per context (`scope.ts`), the picker (`picker.ts`), row labels, the add form's draft and what it comes to (`item-draft.ts`), a file as that draft and what an edited one writes back — the fields, and Details over the body with its log (`item-edit.ts`), its fields' values and the file text with Details as the body (`create.ts`), ticking, view state, the command's arguments and output |
| `cli/` | the `pomade-planner` command (`main.ts`): reads the files and hands them to the Today and projects modules; built into the Planner's folder |
| `scripts/` | `build.mjs` (the build), `dev.mjs` (the dev servers), `install-app.mjs`, `pomade-dir.mjs` (where the Pomade checkout is) |
| `fake-host/` | the fake-host harness page (`dev:fake`, browser e2e): it hosts one app at a time with that app's manifest, the kit's `mountApp` mounts an overlay the app opens (`overlay.open`) as Pomade does, an `iframe[data-surface="overlay"]` over a scrim; `?theme=dark` starts it on Pomade's dark theme |
| `test/` | repo-level unit tests (the two manifests) and the synthetic fixtures: `fixtures/workspace.ts` (the fake host's workspaces — the Board's, and the Planner's with groups, projects and project folders; the notes, thoughts, daily notes and template of `NOTES_FILES`), `fixtures/backlog.ts` (sample and 300-ticket backlogs) |
| `e2e/` | Playwright specs: fake host, standalone, real Pomade |

## Develop

```sh
npm install
npm run dev:fake   # both apps on the kit's fake host with the fixture workspace; open the printed URL
npm run dev        # both dev servers for Pomade's dev-link mode: Planner on http://localhost:5317, Board on http://localhost:5319
```

With `npm run dev` running, link each dev server into the dev Pomade once:
`pomade apps link http://localhost:5317` and `pomade apps link http://localhost:5319`
(`pomade apps unlink pomade-planner`, `pomade apps unlink pomade-board` remove them). Or link the
build folders: `npm run build && pomade apps link "$PWD/dist/planner" && pomade apps link "$PWD/dist/board"`.
`PLANNER_DEV_PORT`, `BOARD_DEV_PORT` and `FAKE_HOST_PORT` (default 5318) move the servers.

## Build

`npm run build` type-checks, then (`scripts/build.mjs`) makes `dist/` anew with one self-contained
app folder per app — `dist/planner/` and `dist/board/`, each its own `index.html`, `manifest.json`,
icon and assets, nothing shared between them — from one Vite config (`vite.config.ts`, the app
picked with `--mode planner` / `--mode board`), and bundles the command into
`dist/planner/cli/main.mjs` (`vite.cli.config.ts`: `pomade-kit` and js-yaml inlined, only Node
built-ins imported) — an installed app folder has no `node_modules`, so the command must be one
file. `pomade apps install <folder>` accepts either folder as it is.

## Install

```sh
npm run install-app              # build, then install both: `pomade apps install dist/planner`, `… dist/board`
npm run install-app -- planner   # build, then install the Planner only (or `-- board`)
```

Each app is removed on its own: `pomade apps remove pomade-planner`, `pomade apps remove pomade-board`.
The script runs `$POMADE_BIN` when set, else `pomade` on `PATH`, else `bin/pomade` of the Pomade
checkout (`$POMADE_DIR`; default the `Pomade` folder beside this repository, also from a git
worktree). The target is the dev Pomade (`POMADE_USER_DATA` overrides it). Running it
again with a changed build updates the apps in a running Pomade; no restart. The Planner's install
links its command into the Pomade's `bin/` (`~/.pomade-dev/bin` for the dev Pomade) the next time
Pomade runs.

## Test

```sh
npm run lint && npm run typecheck && npm run build && npm run test:unit && npm run e2e
```

- `lint` — type-aware typescript-eslint, React hooks, Playwright rules; any warning fails it.
- `test:unit` — vitest, in the Europe/Madrid time zone (its DST changes are in the Today matrix):
  pure logic, the Planner's and the Board's Host API writes on the kit's in-process fake host, and the
  two manifests: each valid by the kit's `parseManifest`, its capabilities and events exactly what the
  app's own source uses.
- `e2e` — Playwright, two projects, on previews of the two builds and the harness (`E2E_APP_PORT` the
  Planner's, `E2E_BOARD_PORT`, `E2E_HARNESS_PORT` move the three servers). `fake-host`: every surface
  of each app in Chromium on the fake host with that app's manifest, an app at the other's routes,
  and standalone (`fake-host.spec.ts`); `board-fake.spec.ts` drives the Board there, `board-manage-fake.spec.ts` creating,
  the card popover, Signals and Needs you inside a project, `board-needs-you-fake.spec.ts` Needs you at Workspace (the list, a project, All projects, the back row, live, a project removed, the 160px panel); `planner-fake.spec.ts` the Planner at Workspace (its clock set
  through the `test.clock` state hook), `planner-projects-fake.spec.ts` its projects, renamed, regrouped and removed (the harness's
  `fixture=planner`, `mount=manual` to change the workspace before the app opens), `planner-notes-fake.spec.ts`
  daily notes, notes and thoughts, pins, the five quick-add types, the tab's excerpts and the template setting (`extra=notes`, `template`);
  `planner-trim-fake.spec.ts` All's select mode, the delete confirmation, a refused delete and bulk Archive;
  `tips-fake.spec.ts` the Planner's header at 160–320px, the gear, and the tooltips (hover, keyboard focus, the frame's edges, the Board);
  `planner-add-fake.spec.ts` adding in place in the tab (the form at the list's foot, the Add button, the added row or where it went), the panel's **+** and Add button opening the overlay with their pre-fills, Details as the body, ⌥Tab over the types, Tab kept in the form, ⌘↵ and ⇧⌘↵;
  `planner-item-fake.spec.ts` an item opened in place (the compact view beside the tab's list, field-only and body-only saves, a file changed on disk, the row's actions, a recurring item's rule and log, Open in tab and ⌘-click, the daily note's card, the view following its file, tabs from 360px, the item route, the panel's rows);
  `planner-attention-fake.spec.ts` the badge, the morning summary on `pomade.ready` and the tab at route `today` (`state` seeds app state); `command.spec.ts` the bundled command, copied alone into
  an empty folder, against throwaway workspaces. `pomade`: a real Pomade from the Pomade checkout (`$POMADE_DIR`, default the `Pomade` folder beside this repository;
  Pomade `main`, built: `out/main/index.js` and `node_modules/electron`) launched with the apps
  dev-linked (`POMADE_DEV_APPS`) or installed, each run with its own temp workspace, user data and
  `POMADE_HOME`; `pomade-smoke.spec.ts` both apps dev-linked, installed, and one reinstalled from a changed build while the other keeps running; `pomade-two-apps.spec.ts` T-004's (both named by `pomade apps list` and listed in the new-tab menu, each opening its own tab; each installed alone and working with the other removed; the Board's pattern read from `Apps/pomade-board/settings.json`, its per-project settings and state under its own id); `pomade-board.spec.ts` checks E-001's acceptance on real files (git diff of a drop,
  the editor's changed-on-disk banner, a restart, 300 tickets), `pomade-board-manage.spec.ts`
  E-002's (a created ticket's bytes, a popover write in `git diff`, triage, Needs you live, the
  counts at Workspace), `pomade-board-needs-you.spec.ts` Needs you at Workspace (the list, a project and
  All projects on real files, Pomade switching to a ticket's project), `pomade-planner.spec.ts` E-003's (onboarding through Pomade's folder-picker hook, files
written outside the app, quick add over a terminal tab and focus back, the boundary timer, the
installed command run from `POMADE_HOME/bin` with Pomade closed, a restart),
  `pomade-planner-trim.spec.ts` the **+** opening quick add over a terminal and an editor with its
  pre-fills and focus back on it, and a bulk delete of two files, one open with unsaved edits (to the
  real Trash, under unique names that teardown removes again),
  `pomade-tips.spec.ts` the tooltips inside Pomade's panel and tab frames and the tab's gear beside Pomade's own,
  `pomade-planner-projects.spec.ts` E-004's (quick add through the picker into a project folder,
  grouped Workspace Today, mix-ins per project, a rename in Pomade's sidebar and project dialog,
  All's filters, a collision, a rename made while Pomade was closed, `--project`),
  `pomade-project-removed.spec.ts` T-013's (projects deleted in Pomade's sidebar leaving Needs you,
  the chooser and the Planner's All filter, the active one taking the Planner to the Workspace),
  `pomade-planner-recurring.spec.ts` E-005's (a recurring item made in the overlay, lead time, done
  and skip with their exact bytes, missed months as one row, `repeat:` edited in Pomade's editor,
  the command's recurring reasons), `pomade-planner-daily.spec.ts` E-006's (the daily note made on the
  first Pomade start of a day, before the Planner is opened, from the template with its exact bytes, ticked in Pomade's editor,
  nothing new on relaunches, none for days not opened; a thought from the overlay resolved, a note
  archived, a pin in QuizLab's Project view, the daily note unpinned for a day, `type:` changed in
  the editor, "Open in tab" on the same view, the command naming the note), `pomade-planner-attention.spec.ts` E-007's (a red "3" on the Planner
  icon and one notification at launch, the Planner never opened; the click to the Workspace Today;
  no second summary the same day or before 03:00, a new one after; the badge following files and
  ticks within ~1 s, gone at zero), `pomade-planner-add.spec.ts` E-008's (the tab's **+** and Add button
  opening the form inside the tab's frame and never the overlay, a task's three lines of Details as
  the file's exact body, ⌥Tab over the types and Tab round the fields with Pomade's focus staying
  on the frame — in place and in the overlay — and the panel's **+** and Add button opening the
  overlay with the view's pre-fills, focus back on the button after Esc), `pomade-planner-item.spec.ts` E-009's (a click on a task
  opening its compact view in the tab's frame with no new Pomade tab, `fri` changing only the `deadline:` line and Details only
  the body of the real file, a disk edit showing in the open view, Details over a stale version not written, the panel's row
  bringing up the Planner tab at the item's route — also for a tab already open and the same row again — Open in tab and
  ⌘-click opening Pomade's editor, ⇧⌘↵ in the overlay). The Planner's
  clock there is seeded into the app state (`<userData>/app-state/pomade-planner/state.json`)
  before the first launch. Without a built checkout the
  `pomade` specs fail and say so.
- Screenshots of every surface land in `$SCREENSHOT_DIR` (default `test-results/screens/`).

## Theme

Both apps load Pomade's design tokens (`pomade-kit/tokens.css`, generated from Pomade's own) and
follow Pomade's theme with `followTheme` (`data-theme` on each frame's root, kept current by
`theme.changed`); a Pomade that names no theme, and a page with no host, are light. The Mac's
appearance is never read. Every colour is a token (`test/colors.test.ts`); Pomade ships its light
theme only, so a dark theme looks the same until Pomade defines its dark tokens.
