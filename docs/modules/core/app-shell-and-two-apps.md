---
doc: docs/modules/core/app-shell-and-two-apps.md
audience: engineers, product
holds: how one codebase builds two separately installable apps: the `apps/<app>/` folders and manifests, the build, dev servers and install script, the handshake, and the route table that picks each frame's view
kind: reference
---

# App shell and two apps — one codebase, two installable apps

**Module:** `core` · **UI:** every frame of both apps · **Code:** `apps/planner/`, `apps/board/`
(`index.html`, `main.tsx`, `public/manifest.json`, the icon), `src/core/mount.tsx`,
`src/core/App.tsx`, `src/core/connection.ts`, `src/core/views.ts`, `src/core/EmptyState.tsx`,
`vite.config.ts`, `vite.cli.config.ts`, `scripts/build.mjs`, `scripts/dev.mjs`,
`scripts/install-app.mjs`, `scripts/pomade-dir.mjs` · **e2e:** `fake-host.spec.ts`,
`pomade-smoke.spec.ts`, `pomade-two-apps.spec.ts` · **Unit:** `test/manifest.test.ts`,
`src/core/views.test.ts` · **Contract:** `../Pomade/docs/HOST-API.md` §1 (manifest), §2
(install, dev link), §3 (`welcome`, routes)

## What it does

The repository builds two Pomade apps, **Planner** (`pomade-planner`) and **Board**
(`pomade-board`), each installed, opened and removed on its own ([[DESIGN]] §1 "Shape"). Both are
the same kind of page: a React app in an iframe that does one handshake with Pomade, then renders
the view its surface and route ask for. The shell that does this is shared; each app hands it its
name and its views.

## One codebase, two builds

Each app is a folder under `apps/` — `index.html`, the entry `main.tsx`, `public/` with
`manifest.json` and the icon — over the code in `src/`: `src/planner/` goes into the Planner,
`src/board/` into the Board, `src/core/` into both. `src/core/views.ts` is the one route table of
both apps and takes the Planner's item kinds (`ITEM_KINDS`) for quick add's routes; nothing else in
`src/core/` or `src/board/` imports Planner code, and nothing in `src/planner/` imports Board code.
Neither app calls the other, reads the other's settings or state, or needs it installed.

- **Build.** `npm run build` type-checks, then `scripts/build.mjs` makes `dist/` anew: one Vite
  config (`vite.config.ts`, `--mode planner` / `--mode board`, root `apps/<name>/`, `base: "./"`)
  builds `dist/planner/` and `dist/board/`, each self-contained (its own `index.html`, manifest,
  icon, assets). `vite.cli.config.ts` then bundles the [[today-command]] into
  `dist/planner/cli/main.mjs` with `pomade-kit` and js-yaml inlined.
- **Dev.** `scripts/dev.mjs` serves both apps on their own ports (`PLANNER_DEV_PORT` 5317,
  `BOARD_DEV_PORT` 5319) for Pomade's dev links; `--fake` adds the fake-host harness
  ([[test-harness]]).
- **Install.** `scripts/install-app.mjs` builds and runs `pomade apps install dist/<app>` for both
  apps or the one named. The `pomade` it runs: `$POMADE_BIN`, else `pomade` on `PATH`, else
  `bin/pomade` of the Pomade checkout (`scripts/pomade-dir.mjs`: `$POMADE_DIR`, default the
  `Pomade` folder beside the main repository, also from a git worktree). It targets the dev
  Pomade's user data unless `POMADE_USER_DATA` says otherwise.

## Manifests

`apps/<app>/public/manifest.json`, copied into the build as it is. The rows of [[DESIGN]] §1 come
from here: id and name, the strip icon (Planner: `action: "panel"`; Board: `action: "both"`,
`route: "board"`, `panelRoute: "needs-you"`), the Planner's `startOnLaunch`, its ⌘⇧A shortcut
(`action: "overlay"`, `route: "quick-add"`) and its `commands` entry, the capabilities and the
subscribed events. `test/manifest.test.ts` checks each manifest with the kit's `parseManifest` and
holds that its capabilities and events are exactly what the app's own source (`apps/<app>`,
`src/<app>`, `src/core`) uses, and that every strip and shortcut route has a view.

## Handshake and views

`mountApp(shell)` (`mount.tsx`) starts the one `connect()` of the page load before the first
render, applies Pomade's theme ([[theme]]), and renders `App` with the [[tooltips-and-popovers]]
layer beside it. `useConnection` follows that handshake: `connecting`, `connected`, `no-host`
(after 1500 ms without a host) or `rejected`; the last two are empty states ("No Pomade host",
"Can't connect to Pomade" with the reason: a newer Pomade needed, a newer app needed, refused).
`useSurface` sets `data-surface` on `<html>` so the background matches the surface (`app.css`).
`useRoute` starts at `welcome.route` and follows every `route.changed`.

The view is picked from `welcome.surface` and the route (`plannerView`, `boardView`):

| App | Surface | Route | View |
|---|---|---|---|
| Planner | panel | `planner`, `""` | the Planner panel ([[views]]) |
| Planner | tab | `planner`, `""` | the Planner tab |
| Planner | tab | `settings` | the tab on its settings page ([[settings-and-onboarding]]) |
| Planner | tab | `today` | the tab on the Workspace Today ([[attention]] "Click") |
| Planner | tab | `item?path=<file>` | the tab with that item's compact view ([[item-in-place]]) |
| Planner | overlay | `quick-add`, `quick-add?do-on=today`, `quick-add?type=recurring` | quick add ([[quick-add]]) |
| Board | tab | `board`, `""` | the Board ([[backlog-location]], [[convention-areas-columns]]) |
| Board | panel | `needs-you` | "Needs you" ([[needs-you]]) |

Anything else — a route of the other app, a backend or command surface — renders "Nothing here"
naming the route. `quickAddRoute` / `parseQuickAddRoute` and `itemRoute` / `parseItemRoute` build
and read the parameterised routes.

## Invariants

- One handshake per page load; a frame never says `hello` twice.
- A frame renders only its own app's views.
- Each manifest asks for the capabilities and events its own code uses, no more.
