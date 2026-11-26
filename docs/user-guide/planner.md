---
doc: docs/user-guide/planner.md
audience: users
holds: using the Planner — item types, the four views, adding, the compact view, recurring, daily notes, pins, projects, select mode, attention, the today command
kind: reference
---

# Planner

[← User guide](index.md)

The Planner keeps every item as one Markdown file in your tasks folder. It shows them in four views
for the active Pomade project (or Workspace), in the side panel and in a tab. Every change on disk —
from Pomade's editor, Obsidian, Finder, git or an agent — shows within about a second.

- [Item types](#item-types)
- [Where it shows: panel and tab](#where-it-shows-panel-and-tab)
- [The views](#the-views)
- [Adding items](#adding-items)
- [Opening an item: the compact view](#opening-an-item-the-compact-view)
- [Recurring tasks](#recurring-tasks)
- [Daily notes](#daily-notes)
- [Pins](#pins)
- [Projects and mix-ins](#projects-and-mix-ins)
- [Select mode: delete and archive](#select-mode-delete-and-archive)
- [Attention: badge and morning summary](#attention-badge-and-morning-summary)
- [The `pomade-planner today` command](#the-pomade-planner-today-command)

## Item types

| Type | What | Has | Done means |
|---|---|---|---|
| **Task** | something to do | checkbox, Do on, Deadline, Importance | ticked: `status: done`, `done-on` |
| **Recurring** | a task that comes back | round checkbox, a repeat rule, a `## Log` | never done: done and skip move it to its next date |
| **Note** | a quick drop, not a task | a page glyph, an optional Do on | **Archive** moves it into `_archive/` |
| **Thought** | something to think about later | a cloud glyph, an optional Do on | **Resolve**: `status: resolved`, `done-on` |
| **Daily note** | the note of one day | a calendar glyph, checklist progress ("5/8") | — |

Open notes and thoughts stand in Project, under **Notes and thoughts**, and in All; one with a
**Do on** also stands in Today on that day — and only that day: it never rolls over. They are never
in Recurring, and a Deadline or Importance set on them by hand is ignored. Daily notes live in All,
and today's also as a card on top of Today. Changing an item's `type:` in its file keeps the file and its text; the views show it as the new
type with the next read.

**Dates.** *Do on* is the day you plan to do it; *Deadline* is the day it is due. Both optional.
**Importance** is a plain number, higher = more important; a row shows it as `!3`.

**The day** runs from the day boundary (default 03:00, see [settings](settings.md#planner)) to the
next. At 01:30 the Planner still shows the previous day. Ticked items stay crossed out until the
boundary; unfinished planned items roll over.

## Where it shows: panel and tab

| | Panel (Planner icon) | Tab (**Open in tab**, or the new-tab menu) |
|---|---|---|
| Views | Today · Project · Recurring · All | the same, with more room |
| Header | the views, **+** ("New task (⌘⇧A)"), **Open in tab**, **⋯** | the views, **+**, **Select**, **Settings** (⚙) |
| **⋯** menu | **Select items…** / **Stop selecting**, **Settings…** (opens the tab on its settings page) | — |
| **+** and **Add task** | open quick add as a floating form beside the panel | open the form in place, at the list's foot |
| Click a row | opens the Planner tab with the item's compact view | opens the compact view beside the list |
| Row excerpts | — | the first one or two lines of each item's text |

When the panel is narrow the view switcher gives way step by step — counts first, then labels to
glyphs, then one joined strip — and never drops a view. Every icon button has a tooltip: rest the
pointer on it, or focus it with the keyboard.

**Context.** The views follow the active Pomade project; clicking **Workspace** in Pomade's sidebar
shows the Workspace. The line under the header shows the day ("Tue, Nov 17"; in All, **Show done**
and **Show archived** instead) and, at its end, the context: the project ("QuizLab"; "QuizLab
(Archive)" when two projects share the name) in Project, Recurring and All inside a project, and in
Today while **Only QuizLab** is on; "All projects" in Today and in every view at Workspace. Rest
the pointer on it for the folder's path (`To-dos/QuizLab/`). The selected view is remembered per
project.

## The views

| View | At Workspace | Inside a project |
|---|---|---|
| **Today** | the whole day: pinned items, today's daily note as a card, workspace-level items, then every project's Today items under project headings | the same whole day; **Only *project*** narrows it to the project's items |
| **Project** | every project's open items, under project headings, each with its **Tasks** and **Notes and thoughts** | the project's open items in **Tasks** and **Notes and thoughts** + mixed-in sources; **Due today** narrows it to their Today items |
| **Recurring** | every recurring item, under project headings | the project's recurring items + mixed-in sources |
| **All** | every item of every type and project, with filters | the same — All always spans everything |

Each view's tab shows its open count (Project: open tasks and recurring items due, notes and
thoughts aside; Recurring: ended items left out; All: open items only, daily notes and archived
items aside).

**Order** inside every list: deadline, then Do on, then importance (highest first), then created; an
unset value sorts after every set one; then title.

**Headings.** "No project" first, then each project by name, each with its open count. Two projects
with the same name carry their group: "QuizLab (Archive)".

**Folding.** Click a heading — or press Enter or Space on it — to fold it: its rows go, its count
stays. In Project at Workspace headings nest two deep: a folded project hides both its groups, and
inside an open one **Tasks** and **Notes and thoughts** fold on their own. ← folds and → unfolds a focused heading. What is folded is remembered per view and per
project on this Mac. A folded group opens by itself for the item you ask for — a click on a panel
row, an item you just added.

### Today

Today is one list for the whole workspace and reads the same in every project and at Workspace:
pinned items, today's daily note as a card, the workspace-level items, then every project's items
under its heading. Its count is the same everywhere.

**Only *project*.** Inside a project a chip under the date, "Only QuizLab", narrows Today to that
project's items: no card, no headings. Click it again (×) for the whole day. It is off by default and
remembered per project; at Workspace there is none.

Today holds, for open tasks and recurring items:

| Row label | When |
|---|---|
| **Overdue** · due *date* | the deadline is before today |
| **Due today** | the deadline is today |
| *(no chip)* | Do on is today |
| planned N days ago | Do on is earlier — unfinished planned tasks roll over |
| **Due in N days** | a recurring item inside its lead time |
| **Due today** | a recurring item due today |
| **Overdue** · due *date* | a recurring item that missed one run |
| **Missed N×** · since *date* | a recurring item that missed several runs — one row, not N |

A row also shows its deadline when that isn't its reason, its importance, and a recurring item's
rule in words. Ticking a task crosses it out; it leaves Today at the next day boundary. Untick to
undo.

A note or thought whose Do on is today stands among its group's tasks with its glyph and its own
actions (Archive, Resolve). The next day it is gone from Today — it doesn't roll over. A thought
resolved there stays crossed out until the boundary.

### Project

The project's whole planner, in two groups, each with its count:

- **Tasks** — the open tasks (ticked ones stay, crossed out, until the boundary) and every recurring
  item, each with where it stands ("Due today", "next Dec 1", "Ended"). Its count is the open tasks
  and the recurring items due.
- **Notes and thoughts** — the open notes and thoughts. Its count is its rows.

A group with nothing in it has no heading. Files that can't be read stand after both groups. Done
tasks, resolved thoughts, archived items and daily notes are in All. At Workspace every project has
its heading, with the two groups indented inside it.

**Due today.** Inside a project the first chip, **Due today**, narrows Project to what is in Today —
the same rows and labels as Today shows, of the project and its mix-ins. Click it again (×) for
everything. It is off by default and remembered per project.

Adding from Project starts on **Task**; a note or thought added there stands under **Notes and
thoughts**.

### Recurring

Every recurring item of the context, by next date (ended ones and rules without a date last), each
with where it stands (its Today label, "next Nov 20", or "Ended"), the rule in words, and the newest
log entry ("done Nov 2").

### All

Open tasks, recurring items, notes and thoughts. Above the list:

- **Show done** — adds done tasks and resolved thoughts.
- **Show archived** — adds archived items (dashed).
- **Projects** filter — a searchable checklist: No project, every project in sidebar order, folders
  no project owns ("folder only"). Nothing ticked = all projects.
- **Types** filter — Tasks, Recurring, Notes, Thoughts, Daily notes. Nothing ticked = every type
  except daily notes. Daily notes show only when **Daily notes** is ticked, newest first.

Filters, Show done and Show archived are remembered per context.

### Row actions

On hover or keyboard focus a row shows its actions at its right end:

| Item | Actions |
|---|---|
| any row | **Pin** / **Unpin** |
| recurring | **Skip** ("Skip this time") |
| note | **Archive** — moves it into `_archive/` (same sub-folder) |
| thought | **Resolve**, once resolved **Reopen** |
| archived item | **Restore** — moves it back |

Files whose frontmatter can't be read show as greyed rows "can't read — open to fix" at the end of
the list; a click opens the file in Pomade's editor.

**The row menu.** Right-click any row — or press Shift+F10 on a focused one — for a menu with
**Open in tab**, **Pin** / **Unpin**, the row's own action, **Select…** and **Delete…**. Select…
starts select mode in that view with the row selected. Delete asks first, then moves the file to
the macOS Trash (Finder ▸ Put Back restores it). It works in every view, in the
panel and the tab, and on the daily note's card; select mode has no menu.

## Adding items

### Quick add (⌘⇧A)

⌘⇧A works from any Pomade tab, even if the Planner was never opened. A small form floats over the
current tab; the panel's **+** and Add button open the same form beside the panel, every time. Esc
closes it and focus returns where it was. ⌘⇧A opens the form where you last dragged it.

After an add the Planner shows the new item: the side panel comes forward on the Planner — also when
it showed the file tree or another panel, or was collapsed — and an open Planner tab on the project
the item was added in follows too, each on a view that lists the item, its row briefly marked
(below). The keyboard stays where it was.

### Add in place (Planner tab)

In the Planner tab, **+** and the **Add task** button at the foot of the list (**Add recurring task**
in Recurring) open the form at the list's foot. After an add the new row is scrolled to, focused and
briefly marked; with ⇧⌘↵ its compact view opens beside it.

### Where the new item shows

The Planner stays on the view when it lists the new item. Otherwise it goes to **Project** when
Project lists it (a note with no day, a task with no date added from Today), else to **All**, its
filters widened by just the item's project and type. A folded group holding the item unfolds.

### The form

| Field | Notes |
|---|---|
| **Title** | focused; required |
| **Project** | starts as the active project ("No project" at Workspace). ↓, Space, a click or typing opens the two-step picker. The form's head shows the folder the item goes into |
| **Type** | Task · Recurring · Note · Thought · Daily. ⌥Tab / ⌥⇧Tab walk it from any field |
| **Do on**, **Deadline** | date phrases: `today`, `tomorrow`, `fri`, `+3d`, `+2w`, `+1mo`, `nov 20`, `2026-11-20`. The resolved date shows on the label's line ("Fri, Nov 20"), or why it isn't one. A note and a thought take Do on alone |
| **Importance** | a number; a task's only |
| **Details** | the file's text under its frontmatter, markdown as typed; Enter is a new line. Not for Daily |

Pre-fills: the project is the context's; from Today Do on = `today` — a note or thought added there
stands in Today too; from Recurring the type is Recurring; elsewhere a task with no date. **Daily**
opens today's daily note in an editor tab (making it first from the template when it isn't there).

**Keys:** Enter adds (from any field but Details); ⌘↵ adds from Details too; ⇧⌘↵ adds and opens —
in the tab its compact view, from the floating form its file in an editor tab. Tab and ⇧Tab cycle
the form's fields and never leave it. Full list: [Keyboard and mouse](shortcuts.md#add-form).

**Project picker.** Step one: "No project", then each group path ("Building tools › Tools") in
sidebar order, Ungrouped last; typing lists matching projects at once. Step two: the group's
projects. Every typed word must match (case and accents ignored). So `Fix login bug`, Tab, `qui`,
Enter, Enter files it into QuizLab.

## Opening an item: the compact view

In the Planner tab, click a row's title (or press Enter on it): the item opens in a pane beside the
list. One item at a time; another row's click takes the pane over. In a tab narrower than 720 px the
pane replaces the list, with a back arrow. From the panel a click opens the Planner tab with the
pane. **⌘-click** a row opens the file in Pomade's editor instead; rest the pointer on a row's
title for a second and its tooltip says so ("Click: open here · ⌘-click: open the file in the
editor · Right-click or Shift+F10: more actions"). Unreadable files always open in the editor. An editor tab opens in the project you are in — Workspace when you use the Planner
there — and Pomade stays in it. A project's folder in the tasks folder counts as part of that
project, so its own items open without a mark; a no-project item, or another project's item opened
here, carries Pomade's orange "Outside this project" mark.

The pane shows:

- **Head** — the type (with "done", "resolved" or "archived"), the row's own actions (Skip,
  Resolve/Reopen, Archive, Restore), its pin, **Open in tab** (the file in Pomade's editor) and ×.
- **Fields** — the checkbox and title, a task's Do on, Deadline and Importance, a note's or thought's
  Do on, a recurring item's repeat editor, and **Details** (the file's text). Type and project are
  changed in the file.
- **Log** — a recurring item's `## Log`, read-only, under Details.
- **Foot** — the rule in words and the next date, fields in the file that aren't valid values, the
  file's path, and "Saving…" / "Saved".

**No save button.** A field is written when committed — Enter, leaving the field, a select's choice.
Details is written 600 ms after typing stops and when you leave it; everything pending is written
when the pane closes. Each write changes only that frontmatter key (or only the text). Emptying a
date or importance removes its key; `fri` reads back as `2026-11-20`.

If the file changed on disk while you were typing, nothing is written over it and the pane says:
"The file changed on disk — nothing was written over it. This is the file as it is now."

The pane follows its file through Archive, Restore and renames; it closes when the file is gone or
the context changes. Esc (focus in the pane) or × closes it and returns focus to the row.

## Recurring tasks

### The repeat editor

```
Repeat [every ▾] [1] [month ▾] on [5]
Early [3] days   Start [today]   End [never]
```

| Rule | Set as | Example |
|---|---|---|
| every N days | every · N · days | every 10 days (counted from Start) |
| every N weeks on weekdays | every · N · weeks · on `mon, thu` | every other Monday |
| every 1, 2, 3, 4, 6 or 12 months on days | every · N · months · on `5` / `1, 15` / `last` / `first mon` | the 5th of every month; quarterly (counted from Start's month, else this month) |
| N days/weeks/months after done | after done · N · unit | 3 months after it was last done |

- **on** left empty takes Start's (else today's) weekday or day of the month.
- **Every N days or weeks** with N above 1 counts from **Start** — a fixed calendar cycle that
  never drifts with when you tick it. Left empty, Start is today, written into the rule.
- **Early N days** (lead time): the item appears in Today N days before its date, labelled "Due in
  N days". 0 or empty: only on the day.
- **Start**, **End**: date phrases; no occurrence before Start or after End.

The form's foot shows the rule in words and the first date ("monthly on the 5th, shows 3 days early
· first Sat, Dec 5"), or what is wrong — which blocks the add.

Rules the editor can't hold (a single date, `only: weekdays`, months not evenly apart) show in
words in the compact view: "Change this rule in the file — Open in tab." See
[Files and format › repeat](files-and-format.md#the-repeat-rule).

### Done, skip, missed, ended

- **Done** — tick the round checkbox. The Planner adds `- <date> done` to the item's `## Log` and
  moves Do on to the next date. The row says "Done…", then "Done · next Jan 5, 2027" for a moment.
  An "after done" rule counts from the day you tick it.
- **Skip** — the row's **Skip** action: the same with `- <date> skipped`.
- **Missed** runs don't stack: one row, "Missed 2×". Done or Skip after a miss jumps to the next
  future date and logs once.
- Between runs an item is only in Recurring, until its lead time starts.
- **Ended** — End has passed, or there is no next date: out of Today, "Ended" in Recurring, its
  checkbox and Skip off ("Ended — change end or do-on in the file to bring it back").
- A rule that can't be read shows its error on the row; done and skip stay off until it is fixed
  ("Fix the repeat rule first — open the file").

## Daily notes

- **Made for you** the first time the Planner runs on a new day — at Pomade's start, or when the day
  boundary passes while Pomade is open — before you ever open the Planner. Only if that day's file
  doesn't exist; once per day (a note you delete stays deleted that day); never for days Pomade
  didn't run.
- **Where:** `<tasks folder>/Daily/YYYY-MM-DD.md`. Daily notes are always workspace-level.
- **Template:** set **Daily note template** in [settings](settings.md#planner). The note is the
  template's text with `type: daily-note` and `date:` first in its frontmatter. Without a template
  (or when it can't be read) the note is a date heading and an empty checklist:

  ```markdown
  ---
  type: daily-note
  date: 2026-11-10
  ---
  # Tuesday, November 10, 2026

  - [ ]
  ```

- **On Today** — at Workspace and in every project — it is pinned as a card above the list: title,
  date, checklist progress ("5/8") as text and a bar. Click opens it like a row. Its pin button
  unpins it for today only, everywhere ("Unpin for today — it is pinned again tomorrow"). With
  **Only *project*** on there is no card.
- **Progress** counts markdown checklist lines (`- [ ]`, `- [x]`), nested and in quotes too; lines
  in code blocks don't count.
- Yesterday's note never rolls over; its unticked lines stay where they are.
- **Open today's note** any time: quick add → **Daily** → Enter.

## Pins

Every row has a pin action (hover or focus). A pinned row stands above the list with a pin by its
title; several are allowed, kept in pin order. Today has one pin list for the whole workspace — a
row pinned there is pinned in Today in every project too; the other views' pins are per view and per
context. On Today pinned rows stand above the headings, labelled with their project.

## Projects and mix-ins

**A project's items live in a sub-folder of the tasks folder named after the project**
(`To-dos/QuizLab/`). The folder is made when you first add an item to that project. Two projects
with one name: the later one's folder gets its group, `QuizLab (Archive)`.

- **The folder is part of its project in Pomade**: its files carry no "Outside this project" mark
  there and show their short path in the editor header. It follows a rename, a regroup and a new
  tasks folder. Pomade never shows it in the project's file tree.
- **Renaming or regrouping a project** in Pomade renames its folder — also when the rename happened
  while Pomade was closed. A case-only rename keeps the folder.
- **A folder already taken** by something else: nothing moves; the Planner says so — "“QuizLab”
  can't take To-dos/QuizLab/ — a folder with that name is already there. …" — until one of the two
  is renamed.
- **A project removed** from the workspace leaves the pickers and All's filter at once. Its folder
  stays; its items show under its last name. If it was the active project, the Planner shows
  Workspace.
- **Sub-folders no project owns** show under their own name ("folder only" in All's filter).
- `Daily/`, `_archive/` and hidden folders are never a project's.

**Mix-ins** (inside a project, in Project and Recurring): **+ Add from…** opens the project picker
— **No project** first for the workspace-level items, then the groups and every project not mixed in
yet. Each source added is a chip; click it (×) to remove. **+ Add from…** goes while nothing is
left to add. Mixed-in rows join the list and carry their source's label. Mix-ins are remembered
per project.

## Select mode: delete and archive

In every view — Today, Project, Recurring and All: the tab's **Select** button, the panel's **⋯ →
Select items…**, or a row's menu ▸ **Select…**, which starts with that row selected. Rows — and on
Today the daily note's card — trade their checkbox, pin and actions for a selection box. A bar holds
select-all, the count, **Archive** (only when every selected row is a note not yet archived),
**Delete N…** and **Done**; in the narrowest panel it takes two lines.

- Click selects; Shift-click selects the range from the last row toggled.
- Select-all and ⌘A take only the rows the view shows: what All's filters show, and none of a folded
  group's. A row the filters hide, or a group folded over it, drops out of the selection.
- **Delete N…** asks first: "Delete 3 files?" (one file: by its title), "They go to the macOS Trash
  — Finder can put them back.", every file's title and path, **Cancel** (focused) and **Move to
  Trash**. A file Pomade refuses stays selected with its reason.
- **Archive** moves the notes into `_archive/` without asking; **Restore** undoes it.
- Select mode ends with **Done** or Esc, when everything selected is gone, or when the view or
  context changes.

Keys: [Keyboard and mouse › Select mode](shortcuts.md#select-mode).

## Attention: badge and morning summary

Dates only — no times, no alarms, nothing while Pomade is closed.

**What is due** (whole workspace, whatever project is active):

| Kind | Task | Recurring item |
|---|---|---|
| overdue | deadline before today | a missed run |
| due today | deadline today | due today |
| soon | — | inside its lead time |

A task only planned for today (Do on, no deadline) is not "due", nor is a note or thought planned
for today. Ticked items are out.

**Badge** on the Planner icon: overdue + due today; red when anything is overdue; gone at zero. It
follows file changes within about a second and the day boundary.

**Morning summary**: one Pomade notification at Pomade's first start of a planner day, when anything
is due (soon included).

- Title: counts, then soon items by name — "2 due today, 1 overdue, Tax report due in 3 days".
- Body: overdue, then due-today items — "Overdue: Pay the tax · Due today: Buy printer ink, Upload
  invoices"; a recurring item that missed several runs reads "Bins (missed 3×)". Up to 3 names, then
  "+N more".
- Click: the Planner tab opens at Workspace with Today selected.
- At most one per day. Nothing is posted later that day, and nothing when the boundary passes while
  Pomade stays open — the next start posts. A start before the boundary (01:30) still counts as
  yesterday.

## The `pomade-planner today` command

```
pomade-planner today [--project <name>] [--json] [--date YYYY-MM-DD]
```

Prints Today as the Planner shows it — the same items, notes and thoughts planned for the day
included, in the same order and under the same project headings — and the day's daily note path.
It reads the files directly, so it works with Pomade closed.

| Option | Effect |
|---|---|
| *(none)* | the whole workspace |
| `--project <name>` | one project's items, as **Only *project*** shows Today. Name in any case, its heading label (`QuizLab (Archive)`), `<name> (<group>)`, or its folder name |
| `--json` | one JSON object: `day`, `daily-note`, `items` (each with `title`, `type`, `project`, `status`, `do-on`, `deadline`, `importance`, `created`, `done-on`, `reason`, `planned-days-ago`, `missed`, `path`), `unreadable` |
| `--date YYYY-MM-DD` | Today as of that planner day |
| `-h`, `--help` | usage |

`reason` is one of `overdue`, `due-today`, `planned`, `rolled-over`, `recurring-due`, `lead-time`
(a note's or thought's is `planned`); `status` is `open`, `done` (a task ticked that day) or
`resolved` (a thought resolved that day).

Text output:

```
Today — Tue, Nov 17, 2026
  Daily note: To-dos/Daily/2026-11-17.md

No project
  [ ] Buy printer ink — due today
  (note) Gift ideas — planned today

QuizLab
  [ ] Upload invoices — missed 2×, since Oct 5, monthly on the 5th
```

Exit codes: 0 ok; 1 no workspace recorded, no tasks folder set, or the folder is missing; 2 a wrong
argument (an unknown or ambiguous project lists the names to use).
