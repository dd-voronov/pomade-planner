# Views — Today, Project, Recurring and All, per context

**Module:** `planner` · **UI:** the Planner panel (the Planner strip icon) and the Planner tab ·
**Code:** `src/planner/Planner.tsx`, `src/planner/PlannerPanel.tsx`, `src/planner/PlannerTab.tsx`,
`src/planner/TaskRow.tsx`, `src/planner/ViewBars.tsx`, `src/planner/DailyCard.tsx`,
`src/planner/model/scope.ts`, `src/planner/model/today.ts`, `src/planner/model/labels.ts`,
`src/planner/model/pins.ts`, `src/planner/model/view-state.ts`, `src/planner/model/body.ts`
(excerpt), `src/core/switcher.css`, `src/planner/planner.css` · **e2e:** `planner-fake.spec.ts`,
`planner-projects-fake.spec.ts`, `planner-notes-fake.spec.ts`, `tips-fake.spec.ts`,
`pomade-planner.spec.ts`, `pomade-planner-projects.spec.ts`, `pomade-tips.spec.ts` · **Unit:**
`src/planner/model/scope.test.ts`, `src/planner/model/pins.test.ts`,
`src/planner/model/view-state.test.ts`, `src/planner/model/labels.test.ts`

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
[[host-api-usage]]). The sub-header names the context's folder (`To-dos/QuizLab/`).

| View | At Workspace | Inside project A |
|---|---|---|
| **Today** | the whole day: pinned items (daily note auto-pinned), no-project items, every project's Today items grouped by project | A's Today items + mixed-in sources |
| **Project** | every project's open tasks, grouped by project | all of A's open tasks (and the ones ticked today) + mixed-in sources |
| **Recurring** | every recurring item, grouped by project | A's recurring items + mixed-in sources |
| **All** | every item of every type and project; filters: project, type, status ("Show done", "Show archived") | same — All always spans everything |

`scope.ts` holds these rules: `isOwn`, `inScope` (Today and Project), `inAllFilter` (All),
`projectRows`, and `liveMixins` (mix-ins of sources no longer there dropped).

- **Grouping:** headings per project, in the order and with the labels of [[projects]] "Sources
  and labels", each with its open count.
- **Mix-in chips** in a project, remembered per project: "+ No-project items" toggles the
  workspace-level items in — on, the chip reads "No project ×"; "+ Project" picks another project with the two-step picker
  ([[quick-add]] "Project picker"); each mixed-in project is a chip × removes. Mixed-in rows join
  the list in its order and carry their source's label; in All every row that isn't the context's
  own carries it.
- **All's filters:** projects (a searchable checklist: No project, every project in sidebar order,
  folders no project owns) and types. A filter with nothing ticked passes every project or type —
  except daily notes, which All lists only when "Daily notes" is ticked in the type filter, so years
  of them never bury the rest (`AllOptions.showDaily`). Remembered per context.

## The views

- **Today** names the planner day in its header ("Tue, Nov 17"); its rows and their reasons come
  from the Today module ([[days-and-today]]): each row shows its reason (Overdue, Due today,
  "planned N days ago", "Due in 3 days", "Missed 2×"), its deadline when that isn't the reason, its
  importance (`!3`), and a recurring item's rule in the kit's words. The daily note's card stands
  above the list on the Workspace Today ([[daily-notes]]).
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
  unreadable tasks and recurring items (not archived), in Recurring its recurring ones, in All every
  one its filters, "Show archived" and "Daily notes" pass. A click opens the file in an editor tab.
- Every list runs in the Today module's order ([[days-and-today]] "Order inside every list").

## Rows

- **Ticking** a row's checkbox is the field-only write of [[days-and-today]] "Ticking", made only
  when the file is still the version the view read; otherwise nothing is written and the row shows
  the file as it is. A recurring row's checkbox is done ([[recurring]] "The row").
- **Row actions** on hover or keyboard focus: a recurring item's **Skip**, a note's **Archive** (a
  move into `_archive/`, its sub-folder kept, a taken name `-2`), an archived item's **Restore**
  (the move back), a thought's **Resolve** (`status: resolved`, `done-on`; field-only, only over the
  version the view read) and, once resolved, **Reopen**.
- **Opening:** a click on a row's title or Enter on a focused row opens the item in place
  ([[item-in-place]]).
- **Adding:** the **+** in the header and an **Add** button at the foot of every list, under the
  empty view's text when there are no rows ([[quick-add]]).
- **Description excerpt** (the full tab only): the first one or two prose lines of the body
  (headings, rules, code and a recurring item's `## Log` skipped), markdown stripped, list items
  joined with " · ", cut near 160 characters (`excerptOf`, `EXCERPT_MAX`). Texts are read through
  the Host API once per file version (cached by mtime), so a watch event reads only the files it
  changed.

## Pins

A pin button on every row (on hover or keyboard focus, beside the row's other actions); pins are per
view and per context (`planner.pins.<contextId>`, each view's paths in pin order), several allowed.
A pinned row stands above the list, in pin order, with a pin by its title, while the view lists it
(`splitPinned`); on the grouped Workspace Today it stands above the headings with its project's
label. A pin whose item is gone or out of the view simply isn't shown. The daily note is auto-pinned
on the Workspace Today ([[daily-notes]] "Pinned on the Workspace Today").

## Trimming

All's select mode — bulk Archive and Delete — is [[trimming]].

## View state

The selected view, mix-ins, filters, "Show done", "Show archived" (`planner.view.<contextId>`),
pins, and the daily note's unpinned day are machine-local app state ([[settings-and-state]]). The
tab's routes `today` and `settings` are released back to `planner` when the user leaves them, so
the next ask reaches the tab again as a route change (`PlannerTab`).
