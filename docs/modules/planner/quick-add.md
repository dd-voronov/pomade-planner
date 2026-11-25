---
doc: docs/modules/planner/quick-add.md
audience: engineers, product
holds: one add form in place in the tab and in Pomade's overlay elsewhere: entry points, pre-fills, fields and Details, the keys, the repeat editor, the project picker, after an add
kind: reference
---

# Quick add — one add form, in place and in the overlay

**Module:** `planner` · **UI:** the form in place at the foot of the Planner tab's list; the
floating form over the current tab (⌘⇧A, the panel's **+** and Add button) · **Code:**
`src/planner/AddForm.tsx`, `src/planner/AddInPlace.tsx`, `src/planner/QuickAdd.tsx`,
`src/planner/ItemFields.tsx`, `src/planner/RepeatEditor.tsx`, `src/planner/ProjectPicker.tsx`,
`src/planner/overlay-fit.ts`, `src/planner/add-form.css`, `src/planner/model/item-draft.ts`,
`src/planner/model/create.ts`, `src/planner/model/repeat-draft.ts`, `src/planner/model/picker.ts`,
`src/planner/model/scope.ts` (`viewListing`, `revealInAll`), `src/core/views.ts`
(`quickAddRoute`, `QUICK_ADD_HEIGHT`) · **e2e:** `planner-add-fake.spec.ts`,
`planner-fake.spec.ts`, `planner-notes-fake.spec.ts`, `pomade-planner-add.spec.ts`,
`pomade-planner-trim.spec.ts`, `pomade-planner-recurring.spec.ts` · **Unit:**
`src/planner/model/item-draft.test.ts`, `src/planner/model/create.test.ts`,
`src/planner/model/repeat-draft.test.ts`, `src/planner/model/picker.test.ts` · **Contract:**
`../Pomade/docs/HOST-API.md` §1 `shortcuts` (`action: "overlay"`), §4 `overlay.open` /
`overlay.resize`

## What it does

Capturing a task must take seconds from anywhere in Pomade. One form adds any of the five types:
in the Planner tab it opens **in place**, at the foot of the list; everywhere else it floats over the
current tab in Pomade's overlay. Title first, everything else pre-filled from where it was opened,
and the keyboard never leaves the form.

## Entry points

- A Pomade-wide shortcut, **⌘⇧A** (free in Pomade's own chord map), that works from any tab, even
  when the Planner was never opened.
- The **+** in the Planner's header.
- An **Add** button at the foot of every list — under an empty view's text when the list is empty —
  named for what the view adds ("Add task"; "Add recurring task" in Recurring).

## One form, two placements

- **In the Planner tab** (`AddInPlace`) the **+** and the Add button open the form in place: a card
  at the foot of the list (in the Add button's place; under the empty view's text), scrolled into
  view and kept there as it grows, title focused, one form at a time. Esc closes it and returns
  focus to what opened it.
- **Everywhere else** (`QuickAdd`) the form is a small floating form over the current tab — the Host
  API overlay. The shortcut opens it in the middle of the pane area; the **+** and the Add button
  of the **side panel**, which is too narrow to hold the form, open it beside the panel
  (`overlay.open`, `anchor: "panel"`, `quickAddOverlay`); where the user dragged it last wins over
  both (Pomade's). Esc closes the overlay and focus returns where it was — to the button that opened
  it, also when the Planner tab had the focus before. Without a tasks root the overlay says so and
  offers "Open the Planner".
- **The fields are one component** (`ItemFields`: values in, changes out, no knowledge of files),
  under the add form's head and foot (`AddForm`) in both placements, and — editing, without the
  project and the type switch — in the item's compact view ([[item-in-place]]).

## The overlay

As tall as its form, 420 wide (`overlay-fit.ts`, `useOverlayFit`). It opens at the form's height for
the type it starts on (`QUICK_ADD_HEIGHT`: a task's is 220 px, the frame the shortcut opens at, so
neither path resizes it on opening), and the form keeps the frame that tall from then on
(`overlay.resize`): another type, a line of Details, a line of error grow or shrink it, and nothing
scrolls inside it. Pomade clamps the frame to 120 px – 60% of the pane area; a form taller than that
fills the frame, and Details gives way and scrolls inside. While the project picker stands in the
fields' place the frame keeps its height.

## Pre-fills

The same on both paths: project = the context's (the active project; none at Workspace), from Today
too, whatever it shows; `do-on` = today from Today — a note or thought switched to there keeps it, so
it lands in Today; type = Recurring from the Recurring view, Task elsewhere. The overlay is a
fresh frame each time, so the panel puts them in its route: `quick-add?do-on=today`,
`quick-add?type=recurring`, and the bare `quick-add` — the shortcut's route — for a task with no
date (`quickAddRoute`, `parseQuickAddRoute`).

## Fields

- **Title** (focused). Then, pre-filled and optional: **project** (changed with the two-step picker,
  below); **type** — a switch of all five types after the project (Task · Recurring · Note ·
  Thought · Daily, each a glyph, the chosen one with its name; ← → walk it), so "title, Tab, `qui`"
  still picks a project; `do-on`; `deadline`, `importance` empty.
- The form's head shows the folder the item goes into. A narrow form (a tab in a small window) puts
  one field on a line and the type switch under the project.
- **Date fields accept phrases** (`pomade-kit` `date-phrases`): `fri`, `tomorrow`, `+3d`, `nov 20`,
  resolved against the planner's day; each field shows the date it resolves to on its label's line
  ("Fri, Nov 20"), or — in the label's place — why it isn't one. An empty title or a field that
  isn't valid refuses the save and says so (`checkDraft`).
- **Details:** a field under the others for every type but Daily — one line tall when empty,
  growing with its text up to a cap, then scrolling inside; Enter is a new line. In place the cap is
  40% of the surface's height, never under five lines; in the overlay it is the frame's cap (it
  grows the frame first). What is typed is the file's body, byte for byte — markdown as typed —
  closed with a line break when it has none, so a recurring item's `## Log` follows it; only white
  space is no body, and the file is then frontmatter alone (`detailsBody`). Everything else goes to
  the frontmatter.
- **Note and thought:** **Do on** alone, in the first of the date fields' places (date phrases, as a
  task's); the frontmatter is `type`, `title`, `status: open`, the `do-on` when set, `created`. With
  a `do-on` the item stands in Today on that day ([[days-and-today]] "What Today contains").
- **Daily:** Enter opens today's daily note in an editor tab, making it from the template first when
  it isn't there ([[daily-notes]]), and closes the form; the title and project fields are off, there
  is no Details, the head shows the note's path.
- The file written: [[storage-and-item-types]] "Writing an item".

## Keys

- **⌥Tab** / **⌥⇧Tab** walk the type from any field (Task → Recurring → Note → Thought → Daily and
  round), focus and the title's caret staying where they are — on the title when the focused field
  belonged to the type that left.
- **Tab** and **Shift+Tab** go round the form's fields and never leave the form: in a frame the next
  stop would be one of Pomade's own panes.
- **Enter** adds from any field but Details; **⌘↵** adds from every field, Details included;
  **⇧⌘↵** adds and opens the item: from the form in place its compact view ([[item-in-place]]),
  from the overlay the file in an editor tab of the active project. The form's foot names them.

## Recurring — the repeat editor

`RepeatEditor`, `repeat-draft.ts`: the date fields give way to a compact repeat editor — "Repeat
[every] [1] [month] on [5]" or "Repeat [after done] [3] [months]", then "Early [3] days", Start and
End as date phrases. It is two rows in the place of the date fields; a narrow form stacks them under
a label column.

- It writes only what the kit's format holds: every N days, every N weeks on some weekdays (N above
  1 counts from Start, a calendar cycle that never drifts with the completion date:
  `daily: { every: 10 }`, `weekly: { every: 2, days: [mon] }`; Start left empty counts from today,
  written as `start`), every 1, 2, 3, 4, 6 or 12 months on some days of the month (more than one
  month apart: a `months:` list from the start month, else this month), or N days, weeks or months
  after completion. "On" left empty takes the start's (else today's) weekday or day.
- The foot shows the kit's description and the first date ("monthly on the 5th, shows 3 days early
  · first Sat, Dec 5"), or the kit's error, which refuses the save — in the overlay's one line in
  the place of the keys, in place above them.
- The first `do-on`: [[recurring]] "`do-on` and where an item stands".

## Project picker

`ProjectPicker`, `picker.ts`: opens in the form's place on ↓, Space, a click, or typing in the
project field (the typed letters become its query).

- Step one: "No project" first, then every group path that holds projects ("Building tools › Tools")
  in sidebar order, Ungrouped last; typing lists the matching projects straight away (with their
  group path), then the matching groups.
- Step two: that group's projects; typing filters them.
- Every typed word must match, ignoring case and accents. ↑ ↓ highlight, Enter picks a project or
  opens a group (→ too), Backspace in the empty field or ← goes back, Esc closes the picker and keeps
  the project. So "Fix login bug", Tab, `qui`, Enter, Enter files it into QuizLab.
- Adding into a project whose folder isn't there yet makes it and writes the map entry
  ([[projects]] "The map").
- The same picker is **+ Add from…** in Project and Recurring inside a project ([[views]]
  "Context"): "No project" first, then the groups, every project not mixed in yet and the
  project itself left out; nothing is checked, and a pick mixes that source in.

## After an add

- **In place** the form closes and the new row is scrolled to, focused and marked for a moment —
  its group unfolded when it was folded ([[views]] "Groups"); a note or thought added from Project
  lands under "Notes and thoughts". When the view doesn't list the item on its own terms (a note
  or a task with no date added from Today, another project's item in Project), the list's foot
  says where it is — "Added — “Lamp for the desk” is in Project." — with **Show**, which takes
  there: Project or Recurring when they list it, else All, its
  filters widened by just the item's project and type when they hide it (`viewListing`,
  `revealInAll`).
- **From the overlay** the item shows in the lists through the file watch.
