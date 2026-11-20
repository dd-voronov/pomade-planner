---
doc: docs/modules/core/test-harness.md
audience: engineers, product
holds: vitest in Europe/Madrid, the fake-host harness and its query parameters and fixtures, the real-Pomade launcher, and the Playwright projects
kind: reference
---

# Test harness — unit tests, the fake host, and a real Pomade

**Module:** `core` · **UI:** the fake-host harness page (`npm run dev:fake`) · **Code:**
`fake-host/` (`harness.ts`, `index.html`, `vite.config.ts`), `test/fixtures/workspace.ts`,
`test/fixtures/backlog.ts`, `e2e/fixtures/` (`pomade.ts`, `frames.ts`, `planner.ts`, `board.ts`,
`screens.ts`), `playwright.config.ts`, `vitest.config.ts`, `scripts/pomade-dir.mjs` · **e2e:** every
spec in `e2e/` · **Contract:** `../Pomade/docs/HOST-API.md` §2 "Testing hook", §5 "Hosting
behavior"

## What it does

Three layers, each closer to the real thing: pure logic under vitest, each app in Chromium inside
`pomade-kit`'s fake host, and each app in a real Pomade (Electron) on real files. Every layer runs
against synthetic workspaces; nothing of the developer's own Pomade or workspace is read or written.

## Unit

`npm run test:unit` — vitest (`vitest.config.ts`), `src/**/*.test.ts` and `test/**/*.test.ts`, in
the Europe/Madrid time zone, set before the workers start, so the Today matrix crosses real DST
changes. Pure logic sits next to its code (`src/*/model/*.test.ts`); the apps' Host API writes
(`src/planner/write.test.ts`, `src/board/write.test.ts`) run on the kit's in-process fake host;
`test/manifest.test.ts` checks both manifests and `test/colors.test.ts` the colour rule
([[theme]]).

## Fake host

`fake-host/harness.ts` is the parent window of one app's frame, with that app's manifest — what
`npm run dev:fake` and the `fake-host` e2e project open instead of Pomade. Query parameters:

| Parameter | Meaning |
|---|---|
| `app` | the app page's URL (required; the Planner's or the Board's) |
| `surface` | `tab` (default) · `panel` · `overlay`; a panel is 240px wide, `panelWidth` changes it |
| `icon`, `route`, `shortcut` | the strip icon, route and overlay shortcut the frame opens at |
| `project` | the active project's id, or `workspace` |
| `hostApi` | the Host API version the fake host speaks (to see the app refuse a mismatch) |
| `tasks`, `template` | the Planner's tasks root and daily-note template, written into its synced settings |
| `fixture=planner`, `extra=notes` | the Planner's projects workspace; its notes, thoughts, daily notes and template |
| `now` | a local time the Planner's clock starts at (the `test.clock` state, [[settings-and-state]] "Test hook") |
| `state` | a JSON object of further app state keys |
| `mount=manual` | the frame mounts only on `window.mountNow()`, after a spec changed the fake workspace |
| `theme` | `light` · `dark`, Pomade's theme at the handshake; `window.fakeHost.setTheme` changes it |

An overlay — `surface=overlay`, or one the app opens itself with `overlay.open` — is mounted as
Pomade shows it: an `iframe[data-surface="overlay"]` over a scrim, 420 wide and as high as the app
asks; Escape, `overlay.close` or a click on the scrim removes it and gives focus back. The nav bar
holds presets for every surface. `window.fakeHost` and `window.mounted` are there for specs and the
console.

Fixtures (`test/fixtures/workspace.ts`): Alpha (the sample backlog: every kind and status, `done/`,
an unreadable ticket, an unknown status, a signal), Beta (no `docs/roadmap/`), Gamma (a chosen
backlog folder), Scale (300 tickets), Delta; the Planner's `Tasks/` dated around Tue 2026-11-17;
`PLANNER_WORKSPACE` with nested groups, two projects named QuizLab and project folders; `Chores/`,
a tasks root of recurring items around Wed 2026-12-02; `NOTES_FILES`. `test/fixtures/backlog.ts`
generates backlogs in Pomade's convention.

## Real Pomade

`e2e/fixtures/pomade.ts` launches the built Electron app of the Pomade checkout
(`scripts/pomade-dir.mjs`: `$POMADE_DIR`, default the `Pomade` folder beside the main repository)
with `NODE_ENV=test`, `POMADE_WORKSPACE`, `POMADE_USER_DATA` and `POMADE_HOME` in temp folders,
the apps dev-linked (`POMADE_DEV_APPS`) or installed. The checkout is only read: it must hold a
build (`out/main/index.js`) and its Electron; otherwise the specs fail and say so. The Planner's
clock is seeded into `<userData>/app-state/pomade-planner/state.json` before the first launch.

`frameShown(page)` (`e2e/fixtures/frames.ts`) waits 5 animation frames of Pomade's window after a
frame is shown: an out-of-process iframe takes input only after the window has drawn it, and a
click sent earlier is dropped.

## Playwright

`playwright.config.ts`: two projects — `fake-host` (every spec but `pomade-*.spec.ts`, Chromium,
parallel) and `pomade` (`pomade-*.spec.ts`, serial, 90 s timeout). Three web servers: the
Planner's build preview (it runs `scripts/build.mjs` first), the Board's, and the harness, each on
its own origin (`E2E_APP_PORT` 4417, `E2E_BOARD_PORT` 4419, `E2E_HARNESS_PORT` 4418). `retries: 0`,
`forbidOnly`. Screenshots land in `$SCREENSHOT_DIR` (default `test-results/screens/`).
e2e helpers spell out the exact bytes a tick, a quick add, a done or skip, a drop or a create must
leave (`e2e/fixtures/planner.ts`, `e2e/fixtures/board.ts`) — never computed by the app's code.
