# pomade-planner — Design

The `pomade-planner` repository builds two Pomade apps, for personal planning and for project
backlogs: **Planner** (app `pomade-planner`) — to-dos, recurring tasks, daily notes, notes and
thoughts — and **Board** (app `pomade-board`) — a kanban view over each project's frontmatter
backlog, in three areas: Signals · Problems · Solutions. Each is installed, opened and removed on
its own and works without the other. Both rest on one architecture: every item is one md file with
frontmatter, the file on disk is the truth, the app writes single frontmatter fields and leaves
every other byte alone, and an item's detail opens in Pomade's own editor. This doc states the
current design; the reasoning and Daniil's scenarios are in the G2 grill outcome
(`../Pomade/docs/auxiliary/grills/2026-11-09-g2-planner.md`), the platform frame in
`../Pomade/docs/PLATFORM.md`.

## 1. Shape

| | Planner | Board |
|---|---|---|
| **App id, name** | `pomade-planner`, "Planner" | `pomade-board`, "Board" |
| **UI** | a web app (iframe on `pomade-app://pomade-planner/`): the Planner panel, the Planner tab, the quick-add form | a web app (iframe on `pomade-app://pomade-board/`): the Board tab, the "Needs you" panel |
| **Strip icon** | **Planner** — fills the side panel with the Planner; badge = overdue + due today (red when anything is overdue). Its panel starts hidden at Pomade's launch (`startOnLaunch`, the app's launch panel) — the one frame that sets the badge, posts the morning summary and makes the day's daily note (§3.5, §3.8) | **Board** — opens or focuses the active project's Board tab **and** fills the side panel with "Needs you" |
| **New-tab menu** (the default view, route `""`) | the Planner tab | the Board tab |
| **Shortcut** | ⌘⇧A, quick add (§3.7) | none |
| **Backend** | none | none |
| **Commands** | `pomade-planner today` (§7) | none |
| **Capabilities** | `project.read`, `files.read`, `files.write`, `tabs.open` | those and `project.write` (its per-project settings) |
| **Data** (§5) | `Apps/pomade-planner/`, the tasks folder | `Apps/pomade-board/`, each project's backlog folder |

**One codebase, two builds.** Each app is a folder under `apps/` — its page, its entry and its
manifest with its icon — over the code in `src/`: `src/planner/` goes into the Planner only,
`src/board/` into the Board only, and `src/core/` (the shell, the Host API helpers, the tokens and
base styles) is compiled into both. `npm run build` makes two self-contained app folders,
`dist/planner/` and `dist/board/`, each installable as it is. A frame renders only its own app's
views: at a route of the other app it says it has no view there. Neither app calls the other, reads
the other's settings or state, or needs it installed.

Each app uses only the Host API (`pomade-kit` SDK) and `pomade-kit`'s pure logic:
`frontmatter-write` (through the Host API), `schedule-format`, `date-phrases`. Each manifest asks
for the capabilities and events its own code uses, no more.

**Item detail:** a Planner item opens in place in the Planner tab — a compact view of its fields
and its text (§3.6), with **Open in tab** for the full editor; a Board ticket opens its md file in
a normal Pomade editor tab (frontmatter as editable properties, the body as description).

## 2. Shared file model

- **Live from disk.** The app subscribes to its folders through the Host API watcher. A create,
  edit, delete or rename by anyone — Pomade's editor, Obsidian, Finder, git, an agent — shows in
  the open views within ~1 s. A view showing a changed item refreshes; the app never writes over
  a newer file version: an action's first write is conditional on the mtime the app read (the
  Host API's `ifMtime`), and Pomade refuses it (`changed-on-disk`) with nothing written when the
  file changed since.
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
- **Folder names** (`src/planner/model/projects.ts`): the project name made safe on disk — `/`,
  `\` and `:` become `-`, control characters go, leading dots and spaces and trailing dots and
  spaces are trimmed, at most 80 characters, nothing left is `Project`. Candidates in order: the
  name, `<name> (<innermost group>)`, `<name> (<whole › group › path>)` when nested, then
  `<name> (<group> 2)`, `(… 3)` (`<name> (2)` ungrouped). A candidate is free unless another
  project's map entry holds it or it is `Daily` / `_archive`; names compare case-insensitively.
  "The later one" is whoever isn't mapped yet: a mapped project keeps its folder while that folder
  is still one of its free candidates.
- **The project-id → folder map** (`projectFolders` in the synced settings, keyed by Pomade's
  stable project id; each entry `{ folder, name, groupPath }`, the name and group path as last
  seen, for the `today` command) is the source of truth once written. An entry is written when
  quick add makes a project's folder, and when a folder already carrying a project's first free
  candidate is taken over (the first such project in sidebar order). Entries of projects Pomade no
  longer lists stay and keep their folder's name reserved.
- **Renames and regroups follow** (`project renamed`, `project updated` with `group`): the Planner
  panel or tab re-plans every project's folder from the map and the folders read fresh from disk,
  renames what changed through the Host API's move, and writes the map. The same plan runs on every
  open, so a rename made while Pomade or the Planner was closed is caught up through the map and the
  stable id. A folder changes only when its project's free candidates no longer include it — a
  regroup moves a suffixed folder (`QuizLab (Archive)` → `QuizLab (Life)`), never a plain one; a
  case-only rename keeps the folder. The target folder already there (and not the project's) is a
  collision: nothing moves or merges, the tasks stay in the old folder, and the panel says so until
  one of the folders is renamed or moved — then the rename catches up by itself. A mapped folder
  that is gone points the entry at the new name.
- **Changing the tasks root** re-points the app; no files move.
- **Filename:** `<created-date>-<slug>.md` (`created` is the planner day it was added on; a taken
  name gets `-2`, `-3`, …; a title with nothing to slug gives `<created-date>-task.md`); the title
  lives in frontmatter, so retitling never renames the file. Daily notes: `Daily/<YYYY-MM-DD>.md`.
- **Items read:** the root's top-level Markdown files and `Daily/`'s (workspace-level items), each
  project sub-folder's top-level files (that project's items; not deeper), and `_archive/`'s and
  its sub-folders' (archived items of the same place). `Daily/`, `_archive/` and hidden folders are
  no project's. A sub-folder no project owns shows under its own name ("folder only"
  where that tells it apart). A file whose frontmatter can't be parsed counts as an item when a
  top-level `type:` line in its block names a known type.

### 3.2 Item types

| `type` | What | Fields beyond the common ones | States |
|---|---|---|---|
| `task` | something to do | `do-on`, `deadline`, `importance` | `open` · `done` |
| `recurring` | a task that comes back | `do-on`, `deadline`, `importance`, `repeat` | `open` (always; done/skip advance it) |
| `daily-note` | the structured note of one day | `date` | — |
| `note` | a quick drop; not a task | — | `open`; archived = moved to `_archive/` (same sub-folder; a taken name gets `-2`) |
| `thought` | something to think about later | — | `open` · `resolved` (`done-on` set) |

Common fields: `type`, `title`, `status`, `created`; `done-on` once done/resolved. A task's
`status` other than `done` reads as open; a missing `title` is the file name. Dates are
`YYYY-MM-DD`; a date or `importance` that isn't a value of its kind (`do-on: next week`) reads as
unset, and the row names the field.
`importance` is a plain number, **higher = more important**; empty sorts below any number.
Changing `type` is a one-field edit: the file, description and history stay; the new type's
fields appear in the editor, and the views show the item as its new type with the next read (the
watch, within ~1 s). Notes, thoughts and daily notes have no checkbox (a glyph of their type in its
place) and are never in Today, Project or Recurring; dates set on them by hand are ignored there.
A daily note without a `title:` reads as its date ("Tue, Nov 10"). Checkboxes inside an item's body are plain markdown with no planner
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
owned by `pomade-kit:E-003`; the Planner reads it with the kit's day resolution (no times), and a
rule the kit refuses shows the kit's own message on the row. A recurring item's `## Log` holds
`- <date> <word>` lines, newest first; its newest entry is the latest date. A recurring item set to
`status: done` by hand is done like a task: out of Today, Project and Recurring, in All with "Show
done".

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
  - missed recurring occurrences don't stack: one item, labelled "missed 2×" (`do-on` and every
    occurrence after it up to today); a single missed one reads "Overdue" with its date
- **Ticking** sets `status: done` and `done-on`; the file stays where it is. The item stays
  crossed out until the next day boundary (undo by unticking), then leaves Today and Project.
- **Reason:** each Today item carries the first that applies — `overdue`, `due-today`, `planned`
  (`do-on` today), `rolled-over` (`do-on` earlier); a ticked item keeps its reason while it stays
  crossed out. A recurring item's reason comes from its schedule alone (never its `deadline`):
  `lead-time` before `do-on`, `recurring-due` on and after it. One pure Today module (`src/planner/model/today.ts`, "now" and the boundary as
  inputs) holds these rules; the views and the `today` command (§7) both call it.
- **Overnight:** while Pomade stays open, a timer set for the next boundary moves the views to the
  new day, backed by a check every minute and whenever the frame is shown again (a Mac that slept
  runs timers late). Around a DST change the day starts at the first instant whose planner day is
  the next one.
- **Order inside every list:** deadline → `do-on` → `importance` (highest first) → `created`; an
  unset value sorts after every set one; then title and path.

### 3.4 Recurring behavior

The rules live in one pure module (`src/planner/model/recurring.ts`, the planner day as input),
which the Today module, the views and the `today` command share.

- **`do-on` is the next occurrence.** Quick add sets it to the first one: a fixed rule's first date
  on or after today (and `start`); after completion, `start` (today when it has passed), else today
  plus the period. A missing or unreadable `do-on` is derived: the occurrence after the newest log
  entry, else the first on or after `start`, `created` or today (after completion: the newest log
  entry plus the period, else `start`, `created` or today).
- **Done** appends `- <date> done` to the `## Log` section of the body and moves `do-on` to the
  next occurrence: from the schedule (fixed dates: the first date after the later of `do-on` and
  today — a missed run jumps to the next future occurrence, logged once) or from the completion
  date ("after completion": toothbrush done Nov 20 → next Feb 20). The date is the planner day.
- **Skip** ("Skip this time", a row action on hover or keyboard focus) does the same with
  `- <date> skipped`.
- **The log line:** newest first — right under the `## Log` heading (and any blank lines under it
  when a list follows); a body without the section gets it at its end, after one blank line. Every
  other byte stays; the body's line endings are kept.
- **One action, two writes, log first:** the body (`setBody`), then `do-on` (field-only `setField`;
  removed when the rule has no further date, a `once`). Both run only when the file is still the
  version the view read. When the `do-on` write fails, the file's text from before is written back;
  only when that fails too does the row say the log line is in and which `do-on` to set — so an
  item is never advanced without its log line, and never silently logged without advancing.
- **The row** has a round checkbox and is never crossed out: ticking it shows "Done…", then where
  the item went ("Done · next Jan 5, 2027", "Done · ended") for 1.6 s, in its place — then the
  views show the file as it is (out of Today, or still there with its next lead time).
- **Visibility between occurrences:** only in the Recurring view, until `do-on − lead-days`.
  `lead-days: 0` = only on the day; `lead-days` ≥ the period = always visible.
- **Ended:** `end` has passed, or there is no next occurrence (`do-on` past `end`, a `once` done).
  Done and skip still write the date past `end`; the item then reads as ended — out of Today, in
  Recurring with "Ended", its checkbox and Skip off.
- **`repeat:` edited by hand** re-computes the item on the next read (the watch, within ~1 s). A
  rule the kit refuses keeps `do-on` (due on and after it, no lead time) and shows the kit's error
  on the row; done and skip are off until it is fixed.

### 3.5 Daily notes

- **When:** the first time the Planner runs on a new planner day (after the boundary) — at Pomade's
  start, or when the boundary passes while Pomade is open — **only if** that day's file doesn't
  exist. Only the Planner's launch panel frame makes it: Pomade loads that frame hidden at launch
  (`startOnLaunch`) and it is the very frame the Planner icon later shows, so the note is there
  before the Planner is ever opened; the Planner tab and the quick-add overlay never make one by
  themselves. The day it last ran on is machine-local app state (`planner.dailyNoteDay`): a later
  start that day or a relaunch makes nothing, a note deleted that day stays deleted, and a day
  before the recorded one (a boundary moved later) gets none. No file for days Pomade didn't run;
  never back-filled. The Host API's file create is still the guard (a taken path is the note
  already there).
- **Template:** the md file set in settings ("Daily note template", a workspace-relative path;
  checked to be a readable `.md` file when saved). The note is the template with `type:
  daily-note` and `date:` first in its frontmatter, then the template's other keys with their
  bytes and order (its own `type`/`date` give way), then its body as it is; a template without
  frontmatter gets the app's block over its text. Until one is set, and whenever it is missing or
  its frontmatter can't be read, the built-in note — `# Tuesday, November 10, 2026`, a blank line,
  `- [ ]` — and the settings page says why; a day never fails. Nothing else is written into the
  tasks root.
- **Progress** ("5/8"): the GFM task items of the body — list items (nested, in block quotes too)
  starting `[ ]`, `[x]` or `[X]` and some text; lines in fenced code don't count
  (`src/planner/model/body.ts`).
- **Pinned on the Workspace Today** as a card above the list: title, "Daily note" and its date
  when it has a title of its own, the progress as text and a bar; a click opens it as a row's
  does (§3.6 "The item's compact view"); its pin unpins it for that planner day only
  (`planner.dailyNoteUnpinned`).
- Workspace-level only; All lists every daily note, newest first, when its type filter has
  "Daily notes". Yesterday's note never rolls over; its unticked lines stay as they were. A daily
  note is one item, not many tasks.

### 3.6 Views

The Planner renders in the **side panel** (compact) and, via **Open in tab**, as a tab
(same views, more room).

- **Header.** The panel's first level: the views, **+**, **Open in tab**, **⋯** (on All "Select
  items…" — "Stop selecting" while on — then "Settings…"). The tab's: the views, **+**, on All the
  **Select** button, and **Settings** — the gear of Pomade's own Settings row (the same character
  at the same size).
- **Tooltips.** Every icon-only button of the app (the Planner's and the Board's headers, rows,
  cards, columns, toasts), a row's actions, and a view shown as its glyph carry a tip: the name,
  with the shortcut where there is one ("New task (⌘⇧A)"). One layer per frame
  (`src/core/Tips.tsx`) reads a control's `data-tip`: the tip shows after the pointer rests on the
  control for 350 ms — at once when a tip is already showing — and at once on keyboard focus,
  styled as Pomade's tooltips are. It sits centred under the control, slides off the frame's left
  and right edges, goes above when there is no room below, wraps inside the frame's width (the
  160px panel included) and follows its control through a scroll. A press, Escape, the pointer or
  the focus leaving, and the control going away hide it. A tip that says more than the control's
  accessible name is its description while it shows.

- **Switcher at the top:** Today · Project · Recurring · All, each with its open count. When the
  panel is too narrow it gives way step by step, never dropping a view: the counts go (the default
  240px panel shows none, and Recurring as its glyph), the tabs tighten, Recurring shows as its
  glyph, then every view does, then the glyphs join into one strip (the 160px minimum). The selected view is
  remembered **per project** (and for Workspace).
- **Context = the active Pomade project, or Workspace** (the Workspace item in Pomade's sidebar),
  followed through every `active project changed` — a tab restored at launch included. The
  sub-header names the context's folder (`To-dos/QuizLab/`).

| View | At Workspace | Inside project A |
|---|---|---|
| **Today** | the whole day: pinned items (daily note auto-pinned), no-project items, every project's Today items grouped by project | A's Today items + mixed-in sources |
| **Project** | every project's open tasks, grouped by project | all of A's open tasks (and the ones ticked today) + mixed-in sources |
| **Recurring** | every recurring item, grouped by project | A's recurring items + mixed-in sources |
| **All** | every item of every type and project; filters: project, type, status ("Show done", "Show archived") | same — All always spans everything |

- **Adding:** the **+** in the header and an **Add** button at the foot of every list, under the
  empty view's text when there are no rows (§3.7): in the tab they open the add form in place, in
  the panel the overlay.
- **Grouping:** "No project" first, then each project by name (ungrouped before grouped), a
  heading with its open count; two projects with one name carry their group path ("QuizLab
  (Archive)", "QuizLab (Ungrouped)"). The `today` command prints the same headings.
- **Mix-in chips** in a project, remembered per project: "+ No-project items" toggles the
  workspace-level items in; "+ Project" picks another project with the two-step picker (§3.7); each
  mixed-in project is a chip × removes. Mixed-in rows join the list in its order and carry their
  source's label; in All every row that isn't the context's own carries it.
- **All's filters:** projects (a searchable checklist: No project, every project in sidebar order,
  folders no project owns) and types; nothing ticked passes everything. Remembered per context.
- **Pins:** a pin button on every row (on hover or keyboard focus, beside the row's other actions);
  pins are per view and per context (`planner.pins.<projectId>`, each view's paths in pin order),
  several allowed. A pinned row stands above the list, in pin order, with a pin by its title, while
  the view lists it; on the grouped Workspace Today it stands above the headings with its project's
  label. The daily note is auto-pinned on the Workspace Today (§3.5).
- **Today** names the planner day in its header ("Tue, Nov 17"); each row shows its reason
  (Overdue, Due today, "planned N days ago", "Due in 3 days", "Missed 2×"), its deadline when that
  isn't the reason, its importance (`!3`), and a recurring item's rule in the kit's words.
- **Project** holds a recurring item only while it is in Today.
- **Recurring** lists the context's recurring items by next occurrence (ended ones, and rules
  without a date, last): where each stands (its Today label, or "Ended"), the rule in words, the
  next date, the newest log entry ("done Nov 2"). Its count leaves the ended ones out. **All** lists the open items (tasks, recurring items, notes, thoughts), then the daily notes newest
  first when "Daily notes" is ticked in its type filter, then — with "Show done" — the done tasks and
  resolved thoughts, then — with "Show archived" — the archived items, dashed. Its count is the open
  items, daily notes and archived ones aside. Files
  that can't be read show as greyed rows ("can't read — open to fix") at the end of both.
- **Ticking** a row's checkbox is the field-only write of §3.3, made only when the file is still the
  version the view read; otherwise nothing is written and the row shows the file as it is.
- **Row actions** on hover or keyboard focus: a note's **Archive** (a move into `_archive/`, its
  sub-folder kept, a taken name `-2`), an archived item's **Restore** (the move back), a thought's
  **Resolve** (`status: resolved`, `done-on`; field-only, only over the version the view read) and,
  once resolved, **Reopen**.
- **The item's compact view.** A click on a row's title, Enter on a focused row, or a click on
  the daily note's card opens the item **in place in the Planner tab**: a pane beside the lists,
  as tall as the tab (44% of its width, 340–520px). The lists stay, the row is marked as open;
  one item is open at a time and another row's click takes the pane over. Esc (with the focus in
  the pane) or its close button closes it and returns the focus to the row. In a tab narrower
  than 720px the pane takes the lists' place, its close button a **Back** arrow at its start.
  **⌘-click** on a row opens the file in an editor tab and no pane; a file that can't be read
  always opens the editor tab.
  - **From the panel**, too narrow to edit in, a click opens or focuses the Planner tab of the
    same context at the item's route (`tabs.openApp` at `item?path=<the file's path>`); the tab
    shows the panel's view (view state is per context), so the row is listed and marked. The tab
    opens the pane and returns to route `planner` at once, so the same row asked again is a
    route change again.
  - **What it shows:** a head — the type (with "done", "resolved" or "archived"), the row's own
    actions (a task's tick before its title; a recurring item's done as its round tick, and
    **Skip**; a thought's **Resolve** / **Reopen**; a note's **Archive**; an archived item's
    **Restore**; the pin of the view that lists it — the daily note's card: unpin for the day),
    **Open in tab** (the editor tab) and close. Then the add form's fields (`ItemFields`,
    editing): the title (a file without one shows its row's title as the placeholder), a task's
    `do-on`, `deadline` and `importance` — dates read `YYYY-MM-DD` and take phrases — a recurring
    item's rule in the repeat editor, and **Details**: the file's body as raw markdown, as tall as
    its text (the pane scrolls). The type and the project stand: they are changed in the file.
    A recurring item's `## Log`, when it is the body's last section, is not part of Details: it
    shows under it, read-only, and stays in the file byte for byte. A foot names the rule in
    words with the next date (or why the rule isn't one), fields the file holds that aren't
    values, the file's path, and "Saving…" / "Saved" / "Done · next Jan 5, 2027".
  - **Saving, no button:** a field is written when it is committed — Enter, the focus leaving
    it, a select's choice; Details 600 ms after typing stops and when the focus leaves it; and
    everything typed when the pane closes or an action of the row runs. A field's write is
    field-only (an emptied date or importance removes its key; an emptied title is the file's
    again; text that isn't a value is not written and the field says why); Details is a
    body-only write — its text with the file's line endings, then the white space and the log
    that followed it. A changed rule replaces the `repeat:` key's lines (§6) and moves `do-on`:
    for fixed dates the new rule's first date on or after the earlier of `do-on` and today, after
    completion the newest log entry plus the period. After a write the field reads what the file
    holds (`fri` → `2026-11-20`).
  - **Only over the version the view read.** The pane holds one version of the file — the
    folder read's fields and the file's text of one mtime (`useItemFile`) — writes one thing at
    a time, each conditional on that mtime (`ifMtime`): Pomade refuses it (`changed-on-disk`)
    when the file's mtime is another. A file that changed
    elsewhere shows in the pane as it is with the next read (the watch, within ~1 s); when
    something typed was not yet written, or a write was refused, nothing is written over the
    file and the pane says so: "The file changed on disk — nothing was written over it. This is
    the file as it is now."
  - **It follows its file:** a move the app makes (Archive, Restore) and a rename the watcher
    reports — of the file or a folder above it — keep the pane open on the new path; a file
    that is gone closes it, and so does a change of context.
  - A rule the repeat editor can't hold (a single date, a weekday filter, months not evenly
    apart) and one the kit refuses show in words, to be changed in the file; every N months
    keeps the months the file counts from.
- **The full tab** shows each row's description excerpt under its hints: the first one or two prose
  lines of the body (headings, rules, code and a recurring item's `## Log` skipped), markdown
  stripped, list items joined with " · ", cut near 160 characters. Texts are read through the Host
  API once per file version (cached by mtime), so a watch event reads only the files it changed.
- **Trimming:** All's **select mode**, started from the header on All only: the panel's ⋯ →
  "Select items…", the tab's Select button (pressed while on). A bar under the filters holds a select-all box, the count, **Archive** (only when
  every selected row is a readable note not yet archived: each moves into `_archive/` as the row
  action does, no question asked — Restore undoes it), **Delete N…** and **Done**. The rows trade
  their tick, pin and actions for a selection box; a click selects, Shift-click selects the range
  from the last row toggled. Keyboard: Space and Shift+Space on a row's box, ↑ ↓ between rows, ⌘A
  selects every row shown, Delete or Backspace asks to delete, Esc leaves. Select all and ⌘A take
  only what the filters show (the unreadable files too), and a row the filters hide drops out of
  the selection, so a delete never touches a file out of sight. **Delete N…** asks first in the
  Planner's own modal: "Delete 3 files?" (one file: by its title), "They go to the macOS Trash —
  Finder can put them back.", every file's title and path, Cancel (focused) and **Move to Trash**,
  which sends the paths in `files.delete` calls of at most 1000 each. A file already gone counts as
  deleted; one Pomade refuses stays, selected, with its reason under it ("Couldn't move it to the
  Trash."), the host's own words in its tooltip; the others leave through the watch. Select mode
  ends when everything went, and when the view or the context changes. A file open in an editor
  keeps its buffer, and Pomade says it no longer exists on disk.
- View state (selected view, mix-ins, filters, "Show done", "Show archived", pins, the daily
  note's unpinned day) is machine-local app state, never written into item files.

### 3.7 Quick add

- **Entry points:** a Pomade-wide shortcut, **⌘⇧A** (free in Pomade's own chord map), that works
  from any tab, even when the Planner was never opened; the **+** in the Planner's header; and an
  **Add** button at the foot of every list — under an empty view's text when the list is empty —
  named for what the view adds ("Add task"; "Add recurring task" in Recurring).
- **One form, two placements.** In the **Planner tab** the **+** and the Add button open the form
  **in place**: a card at the foot of the list (in the Add button's place; under the empty view's
  text), scrolled into view and kept there as it grows, title focused, one form at a time. Esc
  closes it and returns focus to what opened it. Everywhere else the form is a **small floating
  form over the current tab** (the Host API overlay): the shortcut opens it, and so do the **+**
  and the Add button of the **side panel**, which is too narrow to hold the form (`overlay.open`).
  Esc closes the overlay and focus returns where it was — to the button that opened it. Without a
  tasks root the overlay says so and offers "Open the Planner".
- **Pre-fills, the same on both paths:** project = the context's (the active project; none at
  Workspace); `do-on` = today from a Today view; type = Recurring from the Recurring view, Task
  elsewhere. The overlay is a fresh frame each time, so the panel puts them in its route:
  `quick-add?do-on=today`, `quick-add?type=recurring`, and the bare `quick-add` — the shortcut's
  route — for a task with no date.
- **After an add in place** the form closes and the new row is scrolled to, focused and marked for
  a moment. When the view doesn't list the item on its own terms (a note added from Today, a task
  with no date, another project's item), the list's foot says where it is — "Added — “Lamp for the
  desk” is in All." — with **Show**, which takes there: Project or Recurring when they list it,
  else All, its filters widened by just the item's project and type when they hide it. An add from
  the overlay shows in the lists through the file watch.
- **Fields:** title (focused). Then, pre-filled and optional: project = active project (none at
  Workspace), changed with a two-step group → project picker; type = `task` (a switch of all five
  types after the project — Task · Recurring · Note · Thought · Daily, each a glyph, the chosen one
  with its name; ← → walk it — so "title, Tab, `qui`" still picks a project); `do-on` = today when
  added from a Today view; `deadline`, `importance` empty. The form's head shows the folder the
  task goes into. A narrow form (a tab in a small window) puts one field on a line and the type
  switch under the project.
- **Details:** a field under the others for every type but Daily — one line tall when empty,
  growing with its text up to a cap, then scrolling inside; Enter is a new line. In place the cap
  is 40% of the surface's height, never under five lines; in the overlay it is what the 420×220
  frame leaves (a task, note or thought fits with Details at its one line; a recurring item's
  fields scroll inside the frame). What is typed is the file's body, byte for byte — markdown as
  typed — closed with a line break when it has none, so a recurring item's `## Log` follows it;
  only white space is no body, and the file is then frontmatter alone. Everything else goes to the
  frontmatter.
- **Keys:** **⌥Tab** / **⌥⇧Tab** walk the type from any field (Task → Recurring → Note → Thought
  → Daily and round), focus and the title's caret staying where they are — on the title when the
  focused field belonged to the type that left. **Tab** and **Shift+Tab** go round the form's
  fields and never leave the form: in a frame the next stop would be one of Pomade's own panes.
  **Enter** adds from any field but Details; **⌘↵** adds from every field, Details included;
  **⇧⌘↵** adds and opens the item: from the form in place its compact view (§3.6), from the
  overlay the file in an editor tab. The form's foot names them.
- **Recurring:** the date fields give way to a compact repeat editor — "Repeat [every] [1]
  [month] on [5]" or "Repeat [after done] [3] [months]", then "Early [3] days", Start and End as
  date phrases. It writes only what the kit's format holds: every day, every week on some
  weekdays, every 1, 2, 3, 4, 6 or 12 months on some days of the month (more than one month
  apart: a `months:` list from the start month, else this month), or N days, weeks or months
  after completion; "on" left empty takes the start's (else today's) weekday or day. The foot shows
  the kit's description and the first date ("monthly on the 5th, shows 3 days early · first Sat,
  Dec 5"), or the kit's error, which refuses the save — in the overlay's one line in the place of
  the keys, in place above them. It is two rows in the place of the date fields; a narrow form
  stacks them under a label column.
- **Project picker:** opens in the form's place on ↓, Space, a click, or typing in the project
  field (the typed letters become its query). Step one: "No project" first, then every group path
  that holds projects ("Building tools › Tools") in sidebar order, Ungrouped last; typing lists
  the matching projects straight away (with their group path), then the matching groups. Step two:
  that group's projects, typing filters them. Every typed word must match, ignoring case and
  accents. ↑ ↓ highlight, Enter picks a project or opens a group (→ too), Backspace in the empty
  field or ← goes back, Esc closes the picker and keeps the project. So "Fix login bug", Tab,
  `qui`, Enter, Enter files it into QuizLab.
- **Date fields accept phrases** (`pomade-kit` `date-phrases`): `fri`, `tomorrow`, `+3d`,
  `nov 20`, resolved against the planner's day; each field shows the date it resolves to on its
  label's line ("Fri, Nov 20"), or — in the label's place — why it isn't one. An empty title or a
  field that isn't valid refuses the save and says so.
- **Note and thought:** no dates — a line in the place of the date fields says so; the
  frontmatter is `type`, `title`, `status: open`, `created`.
- **Daily:** Enter opens today's daily note in an editor tab, making it from the template first
  when it isn't there (§3.5), and closes the form; the title and project fields are off, there is
  no Details, the head shows the note's path.
- **The fields are one component** (`ItemFields`: values in, changes out, no knowledge of files),
  under the add form's head and foot in both placements, and — editing, without the project and
  the type switch — in the item's compact view (§3.6).

### 3.8 Attention

The Planner's launch panel frame — loaded hidden at Pomade's launch, the same frame the Planner
icon shows — runs both, from the workspace-wide Today module (`src/planner/model/attention.ts`,
`src/planner/useAttention.ts`); no other frame sets the badge or posts.

- Dates only — no times, no alarms.
- **What is due:** the open Today rows of the whole workspace, whatever the active context, in
  three kinds: **overdue** (a task's deadline before today; a recurring item's missed run — one
  item however many runs it missed), **due today** (a task's deadline today; a recurring item due
  today) and **soon** (a recurring item inside its lead time). A task only planned for today
  (`do-on`, no deadline) or rolled over is not due; a ticked one is out.
- **Badge** on the Planner icon: overdue + due today (soon items don't count); red when anything is
  overdue; cleared at zero. It follows the files within ~1 s (the watch, a tick in any frame) and
  the day boundary (the same timer as the views), from Pomade's launch on.
- **Morning summary:** on `pomade.ready` (Pomade's start; sticky, so the frame hears it however
  late it subscribes), when the planner day is after the last summary day (`planner.summaryDay`)
  and anything is due — soon included — one notification. Title: the counts, then the soon items
  by name, up to 3 then "+N more" — "2 due today, 1 overdue, Tax report due in 3 days" ("due
  tomorrow" at one day). Body: the overdue then the due-today items by name, in Today's order, up
  to 3 then "+N more" — "Overdue: Pay the tax · Due today: Buy printer ink, Upload invoices"; a
  recurring item that missed several runs reads "Bins (missed 3×)". A name is cut at 40
  characters, the title at 200.
- The day is recorded once the notification is posted, and at once when nothing is due — a task
  added later that day never makes a late "morning" summary; a failed post is tried again at the
  next start. A start before the boundary (01:30) is still yesterday. The boundary passing while
  Pomade stays open posts nothing; the next start does.
- **Click** → the Planner tab (route `today`) in the Workspace, Today selected. A notification's
  action can open only the app's tab, not its panel (Host API `notices`: `openApp`), so the click
  lands on the tab. The tab selects Today once the Workspace is active, and picking another view
  there takes the tab back to route `planner`, so the next click selects Today again.
- Nothing while Pomade is closed.

## 4. Board

### 4.1 Where it looks

- **The Board tab shows the active project.** Every Board tab follows `project.changed`, so
  switching projects in Pomade switches the board; the area and column state are remembered per
  project.
- **Default backlog path pattern** for the whole workspace, in the Board's synced settings
  (`Apps/pomade-board/settings.json`, §5): `backlogPathPattern`, a folder relative to each project's root (default `docs/roadmap/`). A
  missing settings file means the defaults; an invalid one falls back to them and the Board says so.
- If a project has no backlog there, the Board offers "Choose backlog folder" (a folder picker
  bounded by the project); the folder, relative to the project root, is stored as the
  **per-project app setting** `backlogPath` and overrides the pattern. The tab's ⋯ menu offers
  "Change backlog folder…" later. While the folder is missing, the Board watches its nearest
  existing parent, so a backlog folder made, moved in or checked out later loads the board by
  itself.
- Reads the folder and its `done/` sub-folder (not deeper), and re-reads them after each burst of
  watch changes. Files without a known `kind:` (`BACKLOG.md`, `PLAN.md`, hand-made lists) are
  ignored.
- **At Workspace** (no active project) the Board tab shows a **project chooser**: every project
  whose backlog resolves, in sidebar order with its group, each with its count of open tickets
  (not done, dropped, parked, triaged or dismissed) and what needs you there
  ("14 open · 2 in review · 1 new signal", §4.5); counts update live. A click opens that project's
  Board tab.

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
| **Signals** | `signal` | new · triaged · *dismissed* |
| **Problems** | `problem` | backlog · grooming · planned · delivering · review · done · *dropped · parked* |
| **Solutions** | `epic`, `task` | backlog · planned · in-progress · review · done · *dropped · parked* |

- A board opens on **Problems** until another area is picked. `done` is collapsed by default;
  *dropped*, *parked* and *dismissed* are narrow collapsed columns after the others. Every column,
  collapsed or not, sits the same 8px from the next. A collapsed column shows its label and count and expands on click; an expanded one
  collapses again from its header. A column appears only where the convention lets a kind be in it
  (`backlog` on Solutions holds standalone tasks; `review` and `parked` hold epics). A ticket sits
  in the column of its status even when its kind could not be dropped there (the file is the
  truth).
- **Unreadable strip** above the columns: ticket-named files (`<P|E|T|S>-NNN-*.md`) whose
  frontmatter can't be parsed ("can't read — open to fix"), and tickets of the area with no
  status or a status the area has no column for. Each is a greyed card that opens the file.
- An area with no tickets shows "No signals yet" and its create button in place of the columns:
  "+ New signal" (creates in New), "+ New problem" (Backlog), "+ New epic" (Planned).
- **Cards:** ID, title, kind badge, priority. On Solutions, epic cards are wider and tinted (task
  cards are inset); task cards carry a chip with their parent epic (`E-017`). Signal cards carry
  their linked problem as a chip (`P-012`) and their source ("from daniil"). Click or Enter opens
  the file in an editor tab.
- **Order inside a column:** priority (P0 first, none last), then ID (by kind letter, then
  number).

### 4.4 Editing

- **Drag = status edit:** two field-only writes, `status` and `updated: <today>` (local day).
  While a card is dragged, the columns its kind can't take are dimmed and the dragged card names
  why ("Tasks can't be in Review"); a drop there is refused. Keyboard: Space lifts a card, ← → move
  it a column, Space or Enter drops, Esc cancels.
- **Never over a newer file:** the drop's first write is conditional on the mtime the board
  showed when the card was grabbed (`ifMtime`); Pomade refuses it (`changed-on-disk`) with nothing
  written when the file changed since. Then, and on any refused write (permission,
  a missing file, a taken `done/` name), the card shows an inline error and is reloaded from disk;
  nothing is retried. A failed move after a saved status opens the target column to show it.
- **Done moves the file:** an epic or task dropped on `done` moves into `done/` (created if
  missing); dropped anywhere else from `done/`, it moves back to the backlog folder. Per-backlog
  setting "Move done epics and tasks to `done/`" (the tab's ⋯ menu), on by default. Problems and
  signals never move.
- **Signal triage:** a signal dropped on `triaged` without a `problem:` first asks "Which problem
  is it evidence for?" (the parent picker, under the Triaged header). A pick writes `status`,
  `problem` and `updated`; **Skip** writes `status` and `updated` only; Escape or a click outside
  cancels the drop and writes nothing. A signal that has a problem is triaged without asking.
- **Right-click popover** (also the context-menu key or Shift+F10 on a focused card): priority
  (P0–P3) and parent (`problem:` for an epic, `epic:` for a task, `problem:` for a signal; a
  problem has none). Each pick is written at once — a field-only write of that key and `updated`,
  under the same "never over a newer file" check as a drop; "No epic" / "No problem" removes the
  key. The popover stays open for the next change; Escape or a click outside closes it and focus
  returns to the card.
- **Create:** **+** on each open column's header (the empty-area button too). The form hangs
  under the **+** and shows the ID it will take: kind (epic / task where the column takes both;
  fixed elsewhere), title (required), parent picker (optional), priority (P0–P3, default P2), and
  on Signals `source` (default `daniil`; emptied, it is `daniil`). Enter submits from any field;
  Tab stays inside the form; Escape closes it and returns focus to the **+**.
  - **ID:** the highest `<prefix>-NNN` among the folder's and `done/`'s files — by file name, any
    extension, and by the frontmatter `id:` — plus one, zero-padded to 3 (`T-999` → `T-1000`);
    never reused, gaps never filled. Re-checked from a fresh read when the file is written; a path
    taken by then bumps the number until one is free.
  - **File:** `<ID>-<slug>.md` in the backlog folder (an epic or task created on `done` goes into
    `done/` while "Move done … to `done/`" is on). The slug is the title lowercased, words joined by
    `-`, Latin accents folded, other scripts kept, at most 60 characters cut at a word boundary;
    a title with nothing to slug gives `<ID>.md`. Created with the Host API's file create — the
    whole text at once.
  - **Text:** the convention's keys in order — `id`, `kind`, `title`, `status` (the column),
    `type: feature`, `priority`, the parent key when one is picked, `created` / `updated` (today),
    `source`; a signal after §4.2: `id`, `kind`, `title`, `status`, `priority`, `source`,
    `problem`, `created`, `updated`, no `type`. A value YAML would read as anything but the same
    string (`true`, `123`, `a: b`, a date) is double-quoted. The body is `# <ID> — <title>` and the
    convention's empty sections: problem Problem · Outcome; epic Goal · Scope · Acceptance; task
    Goal · Acceptance; a signal's description goes under its heading.
  - The new file opens in an editor tab; its card appears with the next read.
- **Parent picker:** a search field over a short list — "No …" first, then open candidates, then
  closed ones (done, dropped, parked), each newest ID first. Typing filters by ID and title (every
  word must match). In the create form the highlighted row is the parent (typing picks the first
  match, ↑ ↓ move); in the popover and the triage picker ↑ ↓ highlight and Enter or a click picks.
- Popovers and forms are placed inside the frame: below their anchor when they fit, else above,
  shifted left at the right edge, narrower than a narrow tab.
- Everything else, including the title, is edited in the file. The Board never edits a
  `BACKLOG.md` index.

### 4.5 "Needs you"

The Board icon's side panel: for the active project, tickets in `review` (any kind) and signals
in `new`, as two groups ("In review", "New signals"), each ordered by priority then ID; a group
with nothing is left out, and with nothing at all the panel says "Nothing needs you". A row shows
kind badge, ID, priority and title; a click opens the ticket in an editor tab of its project. The
panel follows the active project and updates within ~1 s of any file change.

**At Workspace** the panel has three levels:

- **The list** — where it opens. **All projects** first, with the total, then every project with
  something waiting, in sidebar order with its group; each row carries its counts in the chooser's
  words ("2 in review · 1 new signal", §4.1). Projects with nothing waiting or without a backlog
  are left out; with nothing anywhere the panel says "Nothing needs you" and shows no row.
- **A project** — a click on its row: that project's two groups, as the panel shows them inside
  the project. A project that empties while open says "Nothing needs you".
- **All projects** — every project's groups as one list, one section per project in list order.

An opened level starts with a **back row** naming it (the project, or "All projects"); it stays in
view while the level scrolls, and a click returns to the list, with the keyboard on the row that
was open. Every level is live like the panel inside a project. A ticket opened from here opens in
its project, so Pomade switches to that project and the panel becomes that project's.

The opened level is not stored: the panel is on the list each time Pomade comes to Workspace, and
it falls back to the list when the opened project leaves the workspace.

## 5. Settings and state

Each app owns its data; neither reads or writes the other's.

| What | Planner | Board |
|---|---|---|
| Synced settings, `<workspace>/Apps/<app id>/settings.json` | `Apps/pomade-planner/settings.json`: tasks root (`tasksRoot`, workspace-relative), daily-note template path (`dailyNoteTemplate`, workspace-relative), day boundary (`dayBoundary`, `H:MM`), project-id → folder map (`projectFolders`, §3.1) | `Apps/pomade-board/settings.json`: backlog path pattern (`backlogPathPattern`, §4.1), area/column mapping |
| Per-project settings (Host API per-project app settings, kept per app id in the workspace config) | none | `backlogPath` (backlog folder override, relative to the project root), `moveDoneToDoneFolder` |
| Machine-local state (Host API `state`), `<userData>/app-state/<app id>/` | `app-state/pomade-planner/`: view per context (`planner.view.<projectId>` — view, "Show done", "Show archived", mix-ins and All's filters; `__workspace__` for Workspace), pins per context (`planner.pins.<projectId>`), the day the Planner last ran on (`planner.dailyNoteDay`), the day the daily note was unpinned (`planner.dailyNoteUnpinned`), the last morning-summary day (`planner.summaryDay`) | `app-state/pomade-board/`: view per context (`board.view.<projectId>` — area and toggled columns) |

The Planner's **settings page** (in the Planner tab, the route `settings`; the panel's ⋯ opens it; closing it
takes the tab back to route `planner`, so ⋯ → Settings… reaches it again) edits its synced settings. The Board's
settings file is edited by hand; its per-project settings are set from the Board tab (§4.1, §4.4). A
settings write changes only the keys it names and keeps every other key of the file; a
file that isn't a JSON object is refused, never overwritten. A missing file means every default.
Settings with a wrong value fall back to the defaults, and the views say so.

**Test hook:** the state key `test.clock` (`{ "offsetMs": n }`) shifts the Planner's "now" in
every frame, so specs reach 01:30 or the boundary without waiting; nothing in the app sets it. It is
the Planner's own state (`app-state/pomade-planner/`).

## 6. Host API and kit usage

| Need | Provided by |
|---|---|
| App tab, manifest, install, dev link, app shortcut | `pomade:E-027` |
| Strip icons, panel / tab / both actions, badge | `pomade:E-029` |
| Folder read + watch, frontmatter, field-only write, create/move/rename, open file in a tab, active project, groups → projects, stable project ids, per-project settings | `pomade:E-030` |
| `project renamed`, `active project changed`, `Pomade ready` events | `pomade:E-031` |
| Notice with click action, icon badge | `pomade:E-032` |
| `pomade-planner today` on `PATH` | `pomade:E-028` |
| Rule-8 banner when the app writes an open dirty file | `pomade:E-035` |
| SDK, fake host | `pomade-kit:E-001` |
| Field-only frontmatter write | `pomade-kit:E-002` |
| Recurrence engine | `pomade-kit:E-003` |
| Date phrases | `pomade-kit:E-004` |

Each of the two apps is an ordinary app to Pomade — its own manifest, install, dev link, new-tab
menu row and frames — and the table's needs are met per app. The quick-add form is the Host API's overlay surface (a shortcut with action `overlay`, and
`overlay.open` from the Planner panel); the
badge, the morning summary and the daily note before the Planner is first opened come from
`startOnLaunch` (the Planner panel is the launch panel) and the `pomade.ready` event; the
summary's click is a notice action `openApp` at route `today` in the Workspace; view state lives in the Host
API's `state` store; an app opens its own tab at a route with `tabs.openApp`, never the other app's — the Planner panel's rows at
an item's route, which an open tab receives as `route.changed`; the compact view's edits are
`files.setField` / `removeField` / `setBody`, and a recurring item's rule — a mapping, which
`files.setField` doesn't take — is `files.setKeyLines` with the `repeat:` key's own lines
(`formatSchedule`); an action's first write to an item or a ticket is conditional on the mtime read (`ifMtime`,
refused as `changed-on-disk`); the `today`
command finds the workspace with `pomade-kit/node`'s `resolveWorkspace()`. Protocol reference:
`../Pomade/docs/HOST-API.md`; usage reference: the `pomade-kit` README. A new need goes to
`../Pomade/docs/PLATFORM-INTAKE.md`.

## 7. `pomade-planner today`

A command on `PATH` (manifest-declared, linked by `pomade:E-028`). It is the planner's own code
reading its own files directly — it works whether Pomade runs or not.

```
pomade-planner today [--project <name>] [--json] [--date YYYY-MM-DD]
```

- Default scope: the whole workspace (the Workspace Today). `--project <name>` narrows to one
  project's Today (no mix-ins): its name in any case, its heading label (`QuizLab (Archive)`),
  `<name> (<innermost group>)`, or its folder's name. A name two projects share, or no project
  has, is a wrong argument that lists the names to use. The command knows projects from the map
  (§3.1) and the sub-folders, so it needs no running Pomade.
- Text output: the same grouping as the Workspace Today — headings only once an item has a project;
  with `--project`, the project's label in the title line and no headings. `--json`: one object per item —
  `title`, `type`, `project`, `do-on`, `deadline`, `importance`, `reason` (`overdue` ·
  `due-today` · `planned` · `rolled-over` · `recurring-due` · `lead-time`), `path`; plus the daily
  note's path when it exists — in text, a "Daily note: <path>" line under the heading. A recurring item's text line carries its Today label and its rule
  ("missed 2×, since Oct 5, monthly on the 5th").
- Same rules as the UI (day boundary, rollover, lead time) — one shared Today module.
- `--json` prints one object: `day`, `daily-note` (the day's note's path when its file exists,
  else `null`; always `null` with `--project`), `items` (each also with `status`, `created`, `done-on`,
  `planned-days-ago` and `missed` — a recurring item's missed occurrences, 1 when only its `do-on`
  has passed, else 0; `project` is the project's heading label, `null` for a workspace-level item) and `unreadable` (`path`,
  `reason`). `--date YYYY-MM-DD` sets the planner day.
- Exit codes: 0; 1 with a readable message when no workspace is recorded, no tasks root is set, or
  the root is missing; 2 for a wrong argument.
- The entry is `cli/main.mjs` in the build: `cli/main.ts` bundled with everything it imports
  (`pomade-kit`, js-yaml), because an installed app folder has no `node_modules`.
- Consumer: `pomade-runner`'s morning-summary agent job.

## 8. Placement

| Capability | Where |
|---|---|
| Planner views, its file model, quick-add form, settings, `today` command | the Planner app (`pomade-planner`), this repo |
| Board and "Needs you" views, the backlog's file model, its settings | the Board app (`pomade-board`), this repo |
| Editing an item | Pomade's editor |
| Strip, panels, tabs, overlay, notifications, watcher, events | the platform (Host API) |
| Frontmatter write, schedules, date phrases | `pomade-kit` |
| `@today` date autocomplete in the editor | the platform (`pomade:P-015`) |
