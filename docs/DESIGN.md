# pomade-planner — Design

`pomade-planner` is the Pomade app for personal planning and project backlogs. It has two
surfaces: **Planner** — to-dos, recurring tasks, daily notes, notes and thoughts — and
**Board** — a kanban view over each project's frontmatter backlog, in three areas: Signals ·
Problems · Solutions. Both rest on one architecture: every item is one md file with
frontmatter, the file on disk is the truth, the app writes single frontmatter fields and leaves
every other byte alone, and an item's detail opens in Pomade's own editor. This doc states the
current design; the reasoning and Daniil's scenarios are in the G2 grill outcome
(`../Pomade/docs/auxiliary/grills/2026-11-09-g2-planner.md`), the platform frame in
`../Pomade/docs/PLATFORM.md`.

## 1. Shape

| Part | What |
|---|---|
| **UI** | one web app (iframe on `pomade-app://pomade-planner/`) rendering four surfaces: the Planner panel, the Planner tab, the Board tab, the "Needs you" panel; plus the quick-add form |
| **Backend** | none |
| **Commands** | `pomade-planner today` (§7) |

The app uses only the Host API (`pomade-kit` SDK) and `pomade-kit`'s pure logic:
`frontmatter-write` (through the Host API), `schedule-format`, `date-phrases`. It depends on no
other app.

**Icons in Pomade's left strip** (two, from the manifest):

| Icon | Action |
|---|---|
| **Planner** | fills the side panel with the Planner; badge = overdue + due today (red when anything is overdue) |
| **Board** | opens or focuses the active project's Board tab **and** fills the side panel with "Needs you" |

**Item detail** is never the app's own UI: clicking a task, note or ticket opens its md file in
a normal Pomade editor tab (frontmatter as editable properties, the body as description).

## 2. Shared file model

- **Live from disk.** The app subscribes to its folders through the Host API watcher. A create,
  edit, delete or rename by anyone — Pomade's editor, Obsidian, Finder, git, an agent — shows in
  the open views within ~1 s. A view showing a changed item refreshes; the app never writes over
  a newer file version.
- **Recognised files only.** A file is an item when its frontmatter carries a known `type:`
  (Planner) or `kind:` (Board). Other files in the folder are ignored.
- **Unreadable is visible.** A file with a known type/kind whose frontmatter can't be parsed shows
  greyed out — "can't read — open to fix" — never silently dropped.
- **Field-only writes.** Every app edit rewrites only the frontmatter keys it changes, through
  the Host API (`pomade-kit` `frontmatter-write`): key order, comments, other keys and the body
  stay byte-identical. File moves (Board `done/`, Planner `_archive/`, project sub-folder
  renames) go through the Host API's move/rename.
- **Rule 8.** When the app writes a file that is open with unsaved edits, Pomade's
  changed-on-disk banner handles it (`pomade:E-035`); the app does nothing special.

## 3. Planner

### 3.1 Storage

One **tasks root** folder, chosen by the user on first run (onboarding asks; there is no silent
default). The root can be anywhere, including inside the Knowledge vault.

```
<tasks root>/
  2026-11-09-buy-printer-ink.md     ← workspace-level items (no project)
  Daily/                            ← daily notes (workspace-level only)
    2026-11-09.md
  _archive/                         ← archived notes
  Pomade/                           ← items of project "Pomade"
  QuizLab/
  QuizLab (Archive)/                ← a second project named QuizLab, in group "Archive"
```

- **Project membership = the sub-folder**, named after the project. Two projects with the same
  name: the later one's folder gets its group appended in parentheses.
- **Project renamed in Pomade** (`project renamed` event) → the app renames the sub-folder. The
  app keeps a project-id → folder map in its synced settings so the link survives renames.
- **Changing the tasks root** re-points the app; no files move.
- **Filename:** `<created-date>-<slug>.md`; the title lives in frontmatter, so retitling never
  renames the file. Daily notes: `Daily/<YYYY-MM-DD>.md`.

### 3.2 Item types

| `type` | What | Fields beyond the common ones | States |
|---|---|---|---|
| `task` | something to do | `do-on`, `deadline`, `importance` | `open` · `done` |
| `recurring` | a task that comes back | `do-on`, `deadline`, `importance`, `repeat` | `open` (always; done/skip advance it) |
| `daily-note` | the structured note of one day | `date` | — |
| `note` | a quick drop; not a task | — | `open`; archived = moved to `_archive/` |
| `thought` | something to think about later | — | `open` · `resolved` |

Common fields: `type`, `title`, `status`, `created`; `done-on` once done/resolved.
`importance` is a plain number, **higher = more important**; empty sorts below any number.
Changing `type` is a one-field edit: the file, description and history stay; the new type's
fields appear in the editor. Checkboxes inside an item's body are plain markdown with no planner
logic. More types can be added; the app shows every type it knows.

```yaml
---
type: task
title: Renew Nora's swimming class
status: open
do-on: 2026-11-09
deadline: 2026-11-14
importance: 3
created: 2026-11-09
---
```

```yaml
---
type: recurring
title: Upload invoices
status: open
do-on: 2026-12-05          # the next occurrence, maintained by the app
repeat:                    # pomade-kit schedule format (pomade-kit:E-003)
  monthly: { days: [5] }
  lead-days: 3
  start: 2026-01-01
created: 2026-01-01
---
Upload all invoices to the accountant's portal.

## Log
- 2026-11-02 done
- 2026-10-05 skipped
```

`repeat` uses `pomade-kit`'s schedule format: fixed dates ("on the 5th of every month") or
"N days/weeks/months after completion", plus `lead-days`, `start`, `end`. The exact YAML is
owned by `pomade-kit:E-003`.

### 3.3 Days, dates and Today

- **Day boundary: 03:00**, configurable. A "day" runs from boundary to boundary. It governs:
  when ticked items disappear, rollover, when a recurring item is due, when a daily note is
  created. At 01:30 the planner still shows the previous day.
- **Two optional dates.** `do-on` = the day I plan to do it ("add to Today" sets it).
  `deadline` = the day it is due.
- **Today contains** (never notes or thoughts):
  - overdue items (deadline before today)
  - items with deadline today
  - open items with `do-on` today or earlier — unfinished ones **roll over**, labelled "planned N
    days ago"
  - recurring items that are due, or inside their lead time ("due in 5 days")
  - missed recurring occurrences don't stack: one item, labelled "missed 2×"
- **Ticking** sets `status: done` and `done-on`; the file stays where it is. The item stays
  crossed out until the next day boundary (undo by unticking), then leaves Today and Project.
- **Order inside every list:** deadline → `do-on` → `importance` (highest first) → `created`.

### 3.4 Recurring behavior

- **Done** appends `- <date> done` to the `## Log` section of the body and moves `do-on` to the
  next occurrence: from the schedule (fixed dates) or from the completion date ("after
  completion": toothbrush done Nov 20 → next Feb 20).
- **Skip** ("not this time") does the same with `- <date> skipped`.
- **Visibility between occurrences:** only in the Recurring view, until `do-on − lead-days`.
  `lead-days: 0` = only on the due day; `lead-days` ≥ the period = always visible.

### 3.5 Daily notes

- Created the first time the planner runs on a new day (after the boundary), **only if** that
  day's file doesn't exist. No file for days Pomade wasn't opened.
- Template: the md file set in settings; until one is set, a built-in minimal template (a date
  heading and an empty checklist). Nothing is written into the tasks root until a note is
  created.
- Workspace-level only; a browsable list of all daily notes. Yesterday's note never rolls over;
  its unticked lines stay as they were. A daily note is one item, not many tasks.

### 3.6 Views

The Planner renders in the **side panel** (compact) and, via **"Open in full tab"**, as a tab
(same views, more room).

- **Switcher at the top:** Today · Project · Recurring · All. The selected view is remembered
  **per project** (and for Workspace).
- **Context = the active Pomade project, or Workspace** (the Workspace item in Pomade's sidebar).

| View | At Workspace | Inside project A |
|---|---|---|
| **Today** | the whole day: pinned items (daily note auto-pinned), no-project items, every project's Today items grouped by project | A's Today items + mixed-in sources |
| **Project** | — (shows the project list) | all of A's open items + mixed-in sources |
| **Recurring** | every recurring item | A's recurring items + mixed-in sources |
| **All** | every item of every type and project; filters: project, type, status ("Show done"), has deadline | same — All always spans everything |

- **Mix-in chips** ("+ no-project items", "+ QuizLab") per project, remembered per project.
- **Pins:** per view and per context, several allowed. The daily note is auto-pinned on the
  Workspace Today and can be unpinned.
- **Trimming:** from All with "Show done", bulk archive (notes → `_archive/`) or delete.
- View state (selected view, mix-ins, pins, collapsed groups) is machine-local app state, never
  written into item files.

### 3.7 Quick add

- **Entry points:** the **+** in the Planner panel, and a Pomade-wide shortcut that works from
  any tab, even when the Planner was never opened.
- **A small floating form over the current tab;** Esc closes it and returns focus.
- **Fields:** title (focused). Then, pre-filled and optional: type = `task`; project = active
  project (none at Workspace), changed with a two-step group → project picker (all nested
  group paths; typing filters both steps); `do-on` = today when added from a Today view;
  `deadline`, `importance` empty.
- **Date fields accept phrases** (`pomade-kit` `date-phrases`): `fri`, `tomorrow`, `+3d`,
  `nov 20`, resolved against the planner's day.
- **Enter** saves and closes. **Cmd+Enter** saves and opens the file in an editor tab. No
  description field.

### 3.8 Attention

- Dates only — no times, no alarms.
- **Badge** on the Planner icon: overdue + due today; red when anything is overdue.
- **Morning summary:** one Pomade notification per day, on the first Pomade start after the day
  boundary — "2 due today, 1 overdue, tax report due in 3 days"; clicking opens the Workspace
  Today.
- Nothing while Pomade is closed.

## 4. Board

### 4.1 Where it looks

- **Default backlog path pattern** for the whole workspace, in settings: `docs/roadmap/`.
- If a project has no backlog there, the Board offers "Choose backlog folder"; the path is stored
  as a **per-project app setting** (Host API).
- Reads the folder and its `done/` sub-folder. Files without a known `kind:` (`BACKLOG.md`,
  `PLAN.md`, hand-made lists) are ignored.
- **At Workspace** (no active project) the Board tab shows a **project chooser**: every project
  with a backlog, each with its "Needs you" counts ("Pomade · 3 in review · 1 new signal").

### 4.2 Convention

The Problem → Epic → Task backlog convention of `../Pomade/docs/BACKLOG.md` ("One item = one
file", statuses per kind), plus the minimal `signal` kind:

```yaml
---
id: S-001
kind: signal
title: Cmd+click in a terminal opened random files
status: new                # new | triaged | dismissed
source: daniil             # who or what produced the evidence
problem: P-012             # set once triaged
created: 2026-11-09
updated: 2026-11-09
---
<description: the evidence as observed>
```

### 4.3 Areas and columns

Switcher at the top of the Board tab; areas never mix. Areas are a configurable mapping
(area → kinds → columns); the defaults:

| Area | Kinds | Columns |
|---|---|---|
| **Signals** | `signal` | new · triaged · dismissed |
| **Problems** | `problem` | backlog · grooming · planned · delivering · review · done · *dropped · parked* |
| **Solutions** | `epic`, `task` | backlog · planned · in-progress · review · done · *dropped · parked* |

- `done` is collapsed by default; *dropped* and *parked* are narrow collapsed columns on the
  right. A column appears only where the convention lets a kind be in it (`backlog` on Solutions
  holds standalone tasks; `review` holds epics).
- An empty area shows its create button ("+ New signal").
- **Cards:** ID, title, kind, priority. On Solutions, epic cards are wider and tinted; task cards
  carry a chip with their parent epic (`E-017`).
- **Order inside a column:** priority (P0 first), then ID.

### 4.4 Editing

- **Drag = status edit:** writes `status` and `updated: <today>`. A drop on a column the kind
  can't take is refused.
- **Done moves the file:** an epic or task dragged to `done` moves into `done/`; dragged out of
  `done`, it moves back. Per-backlog setting, on by default. Problems and signals never move.
- **Right-click popover:** priority and parent (`problem:` for an epic, `epic:` for a task,
  `problem:` for a signal).
- **Create:** **+** on each column header. Form: kind (epic / task on Solutions; fixed
  elsewhere), title, parent picker, priority. Automatic: next free ID per kind — the highest ID
  in the folder and `done/` plus one, never reused; `created` / `updated` = today;
  `source: daniil`. Filename `<ID>-<slug>.md`. The body gets the convention's empty sections
  (problem: Problem · Outcome; epic: Goal · Scope · Acceptance; task: Goal · Acceptance;
  signal: description). The new file opens in an editor tab.
- Everything else, including the title, is edited in the file. The Board never edits a
  `BACKLOG.md` index.

### 4.5 "Needs you"

The Board icon's side panel: for the active project, tickets in `review` (any kind) and signals
in `new`; at Workspace, the same across every project, grouped by project. Click opens the
ticket in the editor. Counts update live.

## 5. Settings and state

| What | Where | Holds |
|---|---|---|
| Synced settings | `<workspace>/Apps/pomade-planner/settings.json` | tasks root, daily-note template path, day boundary, backlog path pattern, project-id → folder map, area/column mapping |
| Per-project setting | Host API per-project app settings | backlog path override, "move done to `done/`" |
| Machine-local state | `<userData>/app-state/pomade-planner/` (Host API) | view per context, mix-ins, pins, last morning-summary day |

A **settings page** (in the Planner tab) edits the synced settings.

## 6. Host API and kit usage

| Need | Provided by |
|---|---|
| App tab, manifest, install, dev link, app shortcut | `pomade:E-027` |
| Two strip icons, panel / tab / both actions, badge | `pomade:E-029` |
| Folder read + watch, frontmatter, field-only write, create/move/rename, open file in a tab, active project, groups → projects, stable project ids, per-project settings | `pomade:E-030` |
| `project renamed`, `active project changed`, `Pomade ready` events | `pomade:E-031` |
| Notice with click action, icon badge | `pomade:E-032` |
| `pomade-planner today` on `PATH` | `pomade:E-028` |
| Rule-8 banner when the app writes an open dirty file | `pomade:E-035` |
| SDK, fake host | `pomade-kit:E-001` |
| Field-only frontmatter write | `pomade-kit:E-002` |
| Recurrence engine | `pomade-kit:E-003` |
| Date phrases | `pomade-kit:E-004` |

Gaps sent to `../Pomade/docs/PLATFORM-INTAKE.md`: the quick-add overlay surface,
starting the app at Pomade launch without opening it, machine-local app state through the Host
API, the app opening its own tab at a route, the workspace root for commands run without
Pomade, and "Workspace" as an active context with nested group paths.

## 7. `pomade-planner today`

A command on `PATH` (manifest-declared, linked by `pomade:E-028`). It is the planner's own code
reading its own files directly — it works whether Pomade runs or not.

```
pomade-planner today [--project <name>] [--json] [--date YYYY-MM-DD]
```

- Default scope: the whole workspace (the Workspace Today). `--project` narrows to one project's
  Today (no mix-ins).
- Text output: the same grouping as the Workspace Today. `--json`: one object per item —
  `title`, `type`, `project`, `do-on`, `deadline`, `importance`, `reason` (`overdue` ·
  `due-today` · `planned` · `rolled-over` · `recurring-due` · `lead-time`), `path`; plus the daily
  note's path when it exists.
- Same rules as the UI (day boundary, rollover, lead time) — one shared Today module.
- Consumer: `pomade-runner`'s morning-summary agent job.

## 8. Placement

| Capability | Where |
|---|---|
| Planner and Board views, file model, quick-add form, settings, `today` command | this app |
| Editing an item | Pomade's editor |
| Strip, panels, tabs, overlay, notifications, watcher, events | the platform (Host API) |
| Frontmatter write, schedules, date phrases | `pomade-kit` |
| `@today` date autocomplete in the editor | the platform (`pomade:P-015`) |
