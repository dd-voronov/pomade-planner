---
doc: docs/modules/planner/views.md
audience: engineers, product
holds: the panel and the tab, the header and the narrowing switcher, the context and the line naming it, what Today, Project, Recurring and All show, Today's project filter, mix-ins, All's filters, folding groups, row actions, excerpts and pins
kind: reference
---

# Views — Today, Project, Recurring and All, per context

**Module:** `planner` · **UI:** the Planner panel (the Planner strip icon) and the Planner tab ·
**Code:** `src/planner/Planner.tsx`, `src/planner/PlannerPanel.tsx`, `src/planner/PlannerTab.tsx`,
`src/planner/TaskRow.tsx`, `src/planner/ViewBars.tsx`, `src/planner/DailyCard.tsx`,
`src/planner/GroupHeading.tsx`, `src/planner/model/scope.ts`, `src/planner/model/today.ts`,
`src/planner/model/labels.ts`, `src/planner/model/pins.ts`, `src/planner/model/folds.ts`,
`src/planner/model/view-state.ts`, `src/planner/model/body.ts` (excerpt), `src/core/switcher.css`,
`src/planner/planner.css` · **e2e:** `planner-fake.spec.ts`, `planner-today-fake.spec.ts`,
`planner-projects-fake.spec.ts`, `planner-notes-fake.spec.ts`, `tips-fake.spec.ts`,
`pomade-planner.spec.ts`, `pomade-planner-projects.spec.ts`, `pomade-tips.spec.ts` · **Unit:**
`src/planner/model/scope.test.ts`, `src/planner/model/pins.test.ts`,
`src/planner/model/folds.test.ts`, `src/planner/model/view-state.test.ts`,
`src/planner/model/labels.test.ts`

## What it does

The Planner shows four views of the same files — Today, Project, Recurring, All — for one
**context**: the active Pomade project, or Workspace. It renders in the **side panel** (compact)
and, via **Open in tab**, as a tab: the same views with more room, plus the item's compact view
([[item-in-place]]), the add form in place ([[quick-add]]), the description excerpts and the
settings page. Everything a view remembers is machine-local app state, never written into item
files.

## Header

- **Panel:** the views, **+**, **Open in tab**, **⋯** (on All "Select items…" — "Stop selecting"
  while on — then "Settings…", which opens the tab at route `settings`).
- **Tab:** the views, **+**, on All the **Select** button, and **Settings** — the gear of Pomade's
  own Settings row (the same character at the same size).
- Every icon-only control carries a tooltip ([[tooltips-and-popovers]]).

## Switcher

Today · Project · Recurring · All, each with its open count. When the panel is too narrow it gives
way step by step, never dropping a view: the counts go (the default 240px panel shows none, and
Recurring as its glyph), the tabs tighten, Recurring shows as its glyph, then every view does, then
the glyphs join into one strip (the 160px minimum). The selected view is remembered **per context**.

## Context

The active Pomade project, or Workspace (the Workspace item in Pomade's sidebar), followed through
every `project.changed` — a tab restored at launch included (`useActiveProject`,
[[host-api-usage]]).

**The line under the header** names the context, not a path: the project's label ("QuizLab", with
its qualifier when two projects share the name — [[projects]] "Sources and labels") in Project,
Recurring and All inside a project, and in Today while its project filter is on; "All projects" in
Today and in every view at Workspace. The folder's path (`To-dos/QuizLab/`, or the tasks root's) is
its tooltip.

| View | At Workspace | Inside project A |
|---|---|---|
| **Today** | the whole day: pinned items, the daily note's card, no-project items, every project's Today items grouped by project | the same whole day; the project filter "Only A" narrows it to A's items |
| **Project** | every project's open tasks, grouped by project | all of A's open tasks (and the ones ticked today) + mixed-in sources |
| **Recurring** | every recurring item, grouped by project | A's recurring items + mixed-in sources |
| **All** | every item of every type and project; filters: project, type, status ("Show done", "Show archived") | same — All always spans everything |

`scope.ts` holds these rules: `isOwn`, `inToday` (Today and its project filter), `inScope` (Project
and Recurring), `inAllFilter` (All), `projectRows`, and `liveMixins` (mix-ins of sources no longer
there dropped).

- **Grouping:** headings per project, in the order and with the labels of [[projects]] "Sources
  and labels", each with its open count — Today's in every context (unless narrowed to the
  project), Project's and Recurring's at Workspace. A list with no row of a project has none.
- **Today's project filter** inside a project: one chip under the date, "Only QuizLab"
  (`OnlyProjectBar`). On (the chip filled, with its ×), Today lists the project's items alone — its
  pinned rows, its rows, its unreadable files — with no daily note's card and no heading. Off by
  default, remembered per project (`PlannerView.onlyProject`); at Workspace there is none. The
  Today count on the switcher is the whole day's in every context, the filter on or off.
- **Mix-in chips** in a project's Project and Recurring, remembered per project: "+ No-project
  items" toggles the workspace-level items in — on, the chip reads "No project ×"; "+ Project"
  picks another project with the two-step picker ([[quick-add]] "Project picker"); each mixed-in
  project is a chip × removes. Mixed-in rows join the list in its order and carry their source's
  label; in All every row that isn't the context's own carries it. Today has no mix-ins.
- **All's filters:** projects (a searchable checklist: No project, every project in sidebar order,
  folders no project owns) and types. A filter with nothing ticked passes every project or type —
  except daily notes, which All lists only when "Daily notes" is ticked in the type filter, so years
  of them never bury the rest (`AllOptions.showDaily`). Remembered per context.

## The views

- **Today** is one list for the whole workspace and reads the same in every context. It names the
  planner day in its header ("Tue, Nov 17"); its rows and their reasons come from the Today module
  ([[days-and-today]]): each row shows its reason (Overdue, Due today, "planned N days ago", "Due
  in 3 days", "Missed 2×"), its deadline when that isn't the reason, its importance (`!3`), and a
  recurring item's rule in the kit's words. A note or thought planned for the day stands among its
  group's tasks in list order, with its type's glyph, its own hints ("added Nov 12") and its row
  actions. The daily note's card stands above the list ([[daily-notes]]), unless the project
  filter is on.
- **Project** lists tasks and recurring items: every open task and the ones ticked today; a
  recurring item only while it is in Today.
- **Recurring** lists the context's recurring items by next occurrence (ended ones, and rules
  without a date, last; `recurringRows`): where each stands (its Today label, or "Ended"), the rule
  in words, the next date, the newest log entry ("done Nov 2"). Its count leaves the ended ones out.
- **All** (`allTasks`) lists the open items (tasks, recurring items, notes, thoughts), then the
  daily notes newest first when "Daily notes" is ticked in its type filter, then — with "Show done"
  — the done tasks and resolved thoughts, then — with "Show archived" — the archived items, dashed.
  Its count is the open items, daily notes and archived ones aside.
- Files that can't be read show as greyed rows ("can't read — open to fix") at the end of every
  view's list ([[file-model]] "Unreadable is visible"): in Today and Project the context's
  unreadable tasks and recurring items (not archived) — Today's of the whole workspace, or with its
  project filter the project's — in Recurring its recurring ones, in All every
  one its filters, "Show archived" and "Daily notes" pass. A click opens the file in an editor tab.
- Every list runs in the Today module's order ([[days-and-today]] "Order inside every list").

## Groups

Every heading of a list folds (`GroupHeading`, `folds.ts`), in the panel and in the tab: Today's
project headings, and Project's and Recurring's at Workspace.

- A chevron stands before the heading's name; a click on the heading, or Enter or Space on it,
  folds and unfolds it; on a focused heading ← folds and → unfolds. Its tooltip, after a second:
  "Fold (←)" / "Unfold (→)". Folded, the group's rows leave the list; the heading keeps its count.
- **Two levels.** A level-2 group (lighter, indented under a level-1 group: `task-section--sub`,
  `task-section--nested`) folds on its own; a folded level-1 group hides its inner groups whole
  (`unfoldedEntries`). A level-2 group's key is its outer group's key, `/`, and its own
  (`groupKey`).
- **Fold state** is machine-local, per view and context (`planner.folds.<contextId>`,
  [[settings-and-state]]), shared by the panel and the tab.
- **Revealed.** A group holding the item asked for — the panel's click and an item route, which
  open it in the tab's compact view — or the item just added unfolds, once per ask
  (`useReveal`): it shows unfolded at once and is stored unfolded; folded again by hand, it
  stays folded.

## Rows

- **Ticking** a row's checkbox is the field-only write of [[days-and-today]] "Ticking", made only
  when the file is still the version the view read; otherwise nothing is written and the row shows
  the file as it is. A recurring row's checkbox is done ([[recurring]] "The row").
- **Row actions** on hover or keyboard focus: a recurring item's **Skip**, a note's **Archive** (a
  move into `_archive/`, its sub-folder kept, a taken name `-2`), an archived item's **Restore**
  (the move back), a thought's **Resolve** (`status: resolved`, `done-on`; field-only, only over the
  version the view read) and, once resolved, **Reopen**.
- **Opening:** a click on a row's title or Enter on a focused row opens the item in place
  ([[item-in-place]]); with ⌘ (or Ctrl) held, in the editor tab. The title says so in a delayed
  tooltip (`data-tip-slow`, 1 s; [[tooltips-and-popovers]] "Tooltips"): "Click: open in the
  Planner tab · ⌘-click: open the file in the editor" in the panel, "Click: open here ·
  ⌘-click: open the file in the editor" in the tab (`OPEN_HINT_PANEL`, `OPEN_HINT_TAB`). The daily
  note's card carries it too. There is none while the row's menu is open or in select mode, and a
  row shows no file path on hover (the path is in the item's pane). An unreadable file's row
  shows its path and the reason in the Planner's tooltip.
- **Adding:** the **+** in the header and an **Add** button at the foot of every list, under the
  empty view's text when there are no rows ([[quick-add]]); from Today the item starts with the
  context's project and `do-on` today.
- **Description excerpt** (the full tab only): the first one or two prose lines of the body
  (headings, rules, code and a recurring item's `## Log` skipped), markdown stripped, list items
  joined with " · ", cut near 160 characters (`excerptOf`, `EXCERPT_MAX`). Texts are read through
  the Host API once per file version (cached by mtime), so a watch event reads only the files it
  changed.

**Row menu.** A right-click on a row — any view, the panel and the tab, the daily note's card and
an unreadable file's row — opens the row menu; Shift+F10 or the ContextMenu key opens it for the
focused row, under the row. It holds **Open in tab**, the pin (**Pin** / **Unpin**; **Unpin for
today** on the card), the row's own actions (Skip, Resolve / Reopen, Archive / Restore), then, after
a separator, **Delete…** in red. `rowActionIds` and `rowMenuEntries` (`src/planner/model/row-menu.ts`,
unit `row-menu.test.ts`) decide what a row offers; the row's buttons and the menu (`RowMenu.tsx`,
the shared `Popover` with `role="menu"`) read the same list. ↑ ↓ move and wrap, Home and End jump,
Enter picks, Esc closes and returns the focus to the row; the row whose menu is open has an accent
border. **Delete…** asks [[trimming]] "Delete"'s question for the one file. Select mode has no row
menu. e2e: `planner-row-menu-fake.spec.ts`, `pomade-planner-trim.spec.ts`.

## Pins

A pin button on every row (on hover or keyboard focus, beside the row's other actions); pins are
kept per context (`planner.pins.<contextId>`, each view's paths in pin order), several allowed.
Today has one pin list for the whole workspace — the Workspace's (`planner.pins.__workspace__`'s
`today`), read and written from every context; Project's, Recurring's and All's are the context's
own. A pinned row stands above the list, in pin order, with a pin by its title, while the view lists
it (`splitPinned`); on the grouped Today it stands above the headings with its project's label. A
pin whose item is gone or out of the view (the project filter's) simply isn't shown. The daily note
is auto-pinned on Today in every context ([[daily-notes]] "Pinned on Today"); its "unpin for
today" holds for the whole workspace.

## Trimming

All's select mode — bulk Archive and Delete — is [[trimming]].

## View state

The selected view, Today's project filter, mix-ins, filters, "Show done", "Show archived"
(`planner.view.<contextId>`), pins, folded groups (`planner.folds.<contextId>`), and the daily
note's unpinned day are machine-local app state ([[settings-and-state]]). The
tab's routes `today` and `settings` are released back to `planner` when the user leaves them, so
the next ask reaches the tab again as a route change (`PlannerTab`).
