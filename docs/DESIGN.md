---
doc: docs/DESIGN.md
audience: engineers, product
holds: the cross-cutting overview — the two apps' shape and placement, what lives where, and the map of the module docs and the user guide
kind: reference
---

# pomade-planner — Design

The `pomade-planner` repository builds two Pomade apps, for personal planning and for project
backlogs: **Planner** (app `pomade-planner`) — to-dos, recurring tasks, daily notes, notes and
thoughts — and **Board** (app `pomade-board`) — a kanban view over each project's frontmatter
backlog, in three areas: Signals · Problems · Solutions. Each is installed, opened and removed on
its own and works without the other. Both rest on one architecture: every item is one md file with
frontmatter, the file on disk is the truth, the app writes single frontmatter fields and leaves
every other byte alone, and an item's full detail opens in Pomade's own editor.

This doc is the cross-cutting overview: the shape of the two apps and what lives where. Each feature
area's design and implementation is in [modules](modules/index.md) (`docs/modules/`); the user's view is the [user
guide](user-guide/index.md). The reasoning and the Owner's scenarios are in the G2 grill
outcome (`../Pomade/docs/auxiliary/grills/2026-11-09-g2-planner.md`), the platform frame in
`../Pomade/docs/PLATFORM.md`.

## 1. Shape

| | Planner | Board |
|---|---|---|
| **App id, name** | `pomade-planner`, "Planner" | `pomade-board`, "Board" |
| **UI** | a web app (iframe on `pomade-app://pomade-planner/`): the Planner panel, the Planner tab, the quick-add form | a web app (iframe on `pomade-app://pomade-board/`): the Board tab, the "Needs you" panel |
| **Strip icon** | **Planner** — fills the side panel with the Planner; badge = overdue + due today (red when anything is overdue). Its panel starts hidden at Pomade's launch (`startOnLaunch`, the app's launch panel) — the one frame that sets the badge, posts the morning summary and makes the day's daily note ([[attention]], [[daily-notes]]) | **Board** — opens or focuses the active project's Board tab **and** fills the side panel with "Needs you" ([[needs-you]]) |
| **New-tab menu** (the default view, route `""`) | the Planner tab | the Board tab |
| **Shortcut** | ⌘⇧A, quick add ([[quick-add]]) | none |
| **Backend** | none | none |
| **Commands** | `pomade-planner today` ([[today-command]]) | none |
| **Capabilities** | `project.read`, `project.write` (each project's scope folder, [[projects]]), `files.read`, `files.write`, `tabs.open` | the same; `project.write` for its per-project settings |
| **Data** ([[settings-and-state]]) | `Apps/pomade-planner/`, the tasks folder | `Apps/pomade-board/`, each project's backlog folder |

**One codebase, two builds.** Each app is a folder under `apps/` — its page, its entry and its
manifest with its icon — over the code in `src/`: `src/planner/` goes into the Planner, `src/board/`
into the Board, and `src/core/` (the shell, the Host API helpers, the base styles) into both.
`npm run build` makes two self-contained app folders, `dist/planner/` and `dist/board/`, each
installable as it is. A frame renders only its own app's views. Neither app calls the other, reads
the other's settings or state, or needs it installed ([[app-shell-and-two-apps]]).

**On the platform only.** Each app uses only the Host API (`pomade-kit` SDK) and `pomade-kit`'s pure
logic, and each manifest asks for the capabilities and events its own code uses, no more
([[host-api-usage]]). Both wear Pomade's theme and draw every colour from its tokens ([[theme]]).

**Item detail:** a Planner item opens in place in the Planner tab — a compact view of its fields and
its text, with **Open in tab** for the full editor ([[item-in-place]]); a Board ticket opens its md
file in a normal Pomade editor tab (frontmatter as editable properties, the body as description).
An editor tab the Planner opens is in the project the Planner is shown in; a Board ticket's is in
its board's project ([[host-api-usage]] "Editor tabs in their project").

## 2. Placement

| Capability | Where |
|---|---|
| Planner views, its file model, quick-add form, settings, `today` command | the Planner app (`pomade-planner`), this repo |
| Board and "Needs you" views, the backlog's file model, its settings | the Board app (`pomade-board`), this repo |
| Editing an item | Pomade's editor |
| Strip, panels, tabs, overlay, notifications, watcher, events | the platform (Host API) |
| Frontmatter write, schedules, date phrases | `pomade-kit` |
| `@today` date autocomplete in the editor | the platform (`pomade:P-015`) |

## 3. Where the detail lives

- **`docs/modules/`** ([index](modules/index.md)) — engineering and product docs per module:
  - `core/` — the shell and the two builds, the shared file model (live folders, field-only and
    conditional writes, unreadable items), settings and state, Host API usage, theme, tooltips and
    popovers, the test harness.
  - `planner/` — storage and item types, projects, days and Today, recurring, daily notes, views,
    trimming, the item in place, quick add, attention, settings and onboarding, the `today` command.
  - `board/` — the backlog location and Workspace chooser, the convention with its areas and
    columns, editing (drag, popover, triage, create), "Needs you".
- **`docs/user-guide/`** ([index](user-guide/index.md)) — how to use both apps, from the user's
  side: getting started, the Planner, the Board, files and their format, settings, shortcuts,
  troubleshooting.
- **App data:** the user-chosen tasks folder (asked on first run); each app's settings in its own
  folder, `<workspace>/Apps/pomade-planner/` and `<workspace>/Apps/pomade-board/`.
- **The repo's own facts** — its plan, names, stack, commands and the docs outside it — are in
  [REPO](REPO.md).
