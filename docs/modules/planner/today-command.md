---
doc: docs/modules/planner/today-command.md
audience: engineers, product
holds: `pomade-planner today`: the same Today from disk without Pomade, its arguments, text and JSON output, exit codes and bundling
kind: reference
---

# `pomade-planner today` — the Planner's Today on the command line

**Module:** `planner` · **UI:** a command on `PATH` · **Code:** `cli/main.ts`,
`src/planner/model/command.ts`, `vite.cli.config.ts`, the manifest's `commands` entry · **e2e:**
`command.spec.ts`, `pomade-planner.spec.ts`, `pomade-planner-projects.spec.ts`,
`pomade-planner-recurring.spec.ts`, `pomade-planner-daily.spec.ts` · **Unit:**
`src/planner/model/command.test.ts` · **Contract:** `../Pomade/docs/HOST-API.md` §2 "Commands"
(`pomade:E-028`)

## What it does

Agents and scripts read the day's to-dos without Pomade: the command is the Planner's own code
reading its own files directly, so it works whether Pomade runs or not, and it answers with the same
items the Workspace Today shows. Consumer: `pomade-runner`'s morning-summary agent job.

```
pomade-planner today [--project <name>] [--json] [--date YYYY-MM-DD]
```

Pomade links it into its command folder on install, so it is on `PATH` in Pomade's terminals and —
once the PATH line is added (Pomade ▸ Settings ▸ General ▸ Commands) — in any login shell.

## How it reads

`cli/main.ts`: finds the workspace with `pomade-kit/node`'s `resolveWorkspace()`, reads
`Apps/pomade-planner/settings.json` (`parsePlannerSettings`, with the project-id → folder map) and
the tasks root's top-level Markdown files and each project sub-folder's straight from disk (Node's
`fs`, frontmatter through `pomade-kit`'s reader), hands them to the same items, Today and projects
modules the views use (`readItems`, `todayRows`, `folderSources`), and checks whether
`Daily/<day>.md` exists. It knows projects from the map and the sub-folders ([[projects]]), so it
needs no running Pomade.

## Arguments

- Default scope: the whole workspace (the Workspace Today).
- `--project <name>` narrows to one project's Today (no mix-ins): its name in any case, its heading
  label (`QuizLab (Archive)`), `<name> (<innermost group>)`, or its folder's name (`matchProject`).
  A name two projects share, or no project has, is a wrong argument that lists the names to use.
- `--date YYYY-MM-DD` sets the planner day; otherwise it is now's, by the settings' day boundary.

## Output

- **Text** (`todayText`): the same grouping as the Workspace Today — headings only once an item has a
  project; with `--project`, the project's label in the title line and no headings. The daily note
  as a "Daily note: <path>" line under the heading. A recurring item's line carries its Today label
  and its rule ("missed 2×, since Oct 5, monthly on the 5th"). Unreadable tasks are listed.
- **`--json`** (`todayReport`): one object — `day`, `daily-note` (the day's note's path when its file
  exists, else `null`; always `null` with `--project`), `items`, `unreadable` (`path`, `reason`).
  Each item: `title`, `type`, `project` (the project's heading label, `null` for a workspace-level
  item), `do-on`, `deadline`, `importance`, `reason` (`overdue` · `due-today` · `planned` ·
  `rolled-over` · `recurring-due` · `lead-time`), `path`, `status`, `created`, `done-on`,
  `planned-days-ago`, and `missed` — a recurring item's missed occurrences, 1 when only its `do-on`
  has passed, else 0.
- Same rules as the UI (day boundary, rollover, lead time) — one shared Today module
  ([[days-and-today]]).

## Exit codes

0; 1 with a readable message when no workspace is recorded, no tasks root is set, or the root is
missing (or a file); 2 for a wrong argument (with the usage).

## Build

The entry is `cli/main.mjs` in the Planner's build: `cli/main.ts` bundled with everything it imports
(`pomade-kit`, js-yaml) by `vite.cli.config.ts`, because an installed app folder has no
`node_modules` ([[app-shell-and-two-apps]] "One codebase, two builds").
