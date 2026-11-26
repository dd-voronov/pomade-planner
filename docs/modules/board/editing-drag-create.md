---
doc: docs/modules/board/editing-drag-create.md
audience: engineers, product
holds: drag as a status write (never over a newer file), `done/` moves, signal triage, the card popover, the parent list, and creating a ticket: ID, file name, text
kind: reference
---

# Editing — drag, the card popover, triage, create

**Module:** `board` · **UI:** the Board tab: dragging cards, the card popover, the triage picker,
the **+** create form; the settings page's reporter field · **Code:** `src/board/Board.tsx`, `src/board/dnd.ts`, `src/board/Card.tsx`, `src/core/hints.ts`,
`src/board/Column.tsx`, `src/board/CardPopover.tsx`, `src/board/TriagePicker.tsx`,
`src/board/CreateForm.tsx`, `src/board/ParentList.tsx`, `src/board/PickList.tsx`, `src/board/PrioritySelect.tsx`,
`src/board/write.ts`, `src/board/model/drop.ts`, `src/board/model/create.ts`,
`src/board/model/parents.ts`, `src/board/BoardMenu.tsx`, `src/board/BoardSettingsPage.tsx`, `src/core/settings-file.ts`, `src/core/Popover.tsx` · **e2e:** `board-fake.spec.ts`,
`board-manage-fake.spec.ts`, `board-settings-fake.spec.ts`, `pomade-board.spec.ts`, `pomade-board-manage.spec.ts` · **Unit:**
`src/board/model/drop.test.ts`, `src/board/model/create.test.ts`, `src/board/model/parents.test.ts`,
`src/board/write.test.ts` · **Contract:** `../Pomade/docs/HOST-API.md` §4 `files.setField` /
`removeField` / `move` / `create` ("Conditional writes")

## What it does

The Board edits only what a kanban is for — status, priority, parent — and creates tickets with the
next free ID; everything else, including the title, is edited in the file. Every edit is a
field-only write, never over a file that changed since the board read it. The Board never edits an
index or plan file (`BACKLOG.md`, `PLAN.md`).

## Drag = status edit

`planDrop`: two field-only writes, `status` and `updated: <today>` (the local day, `localDay`).

- While a card is dragged (`@dnd-kit/core`, pointer and keyboard sensors), the columns its kind can't
  take are dimmed and the dragged card names why ("Epics can't be in Backlog", `refusalText`); a drop
  there is refused. A drop where the card already is does nothing.
- Keyboard (`dnd.ts`): Space lifts a card, ← → move it a column, Space or Enter drops, Esc cancels;
  Enter on a resting card opens it. The card's slow tip names the pointer drag and Space then ← →
  ([[convention-areas-columns]] "Cards"); no card shows it while one is lifted.

## Never over a newer file

The drop's first write is conditional on the mtime the board showed when the card was grabbed
(`writeFields`, `ifMtime`); Pomade refuses it (`changed-on-disk`) with nothing written when the file
changed since ([[file-model]] "Never over a newer file"). Then, and on any refused write
(permission, a missing file, a taken `done/` name), the card shows an inline error
(`describeFailure`: "Changed on disk since the board read it — not saved…", "Status saved, but not
moved: … already exists.") and is reloaded from disk; nothing is retried. A failed move after a
saved status opens the target column to show it.

## Done moves the file

An epic or task dropped on `done` moves into `done/` (created if missing); dropped anywhere else from
`done/`, it moves back to the backlog folder (`files.move` after the field writes). Per-backlog
setting "Move done epics and tasks to `done/`" (the tab's ⋯ "Board settings" menu,
`moveDoneToDoneFolder`), on by default. Problems and signals never move.

## Signal triage

A signal dropped on `triaged` without a `problem:` first asks "Which problem is it evidence for?"
(`TriagePicker`, the parent list under the Triaged header). A pick writes `status`, `problem` and
`updated`; **Skip — triage without one** writes `status` and `updated` only; **Cancel**, Escape, a
click outside or the frame losing the focus (a click in another frame, the editor or another app)
cancels the drop and writes nothing. A signal that has a problem is triaged without
asking.

## Card popover

Right-click (also the context-menu key or Shift+F10 on a focused card; the card's slow tip says
"Right-click or Shift+F10: priority and parent") opens a popover
(`CardPopover`) at that point: priority (P0–P3) and parent (`problem:` for an epic, `epic:` for a
task, `problem:` for a signal; a problem has none). Each pick is written at once (`planEdit`) — a
field-only write of that key and `updated`, under the same "never over a newer file" check as a
drop; "No epic" / "No problem" removes the key. The popover stays open for the next change; Escape
or a click outside closes it and focus returns to the card; the frame losing the focus closes it
too, and focus stays where the user sent it.

## Parent list

`ParentList` (on `PickList`, the Board's filterable list), `parents.ts`: a search field over a short list — "No …" first, then open candidates,
then closed ones (done, dropped, parked), each newest ID first. Typing filters by ID and title
(every word must match). ↑ ↓ move, Page Up / Page Down jump to the first / last row. In the create
form the highlighted row is the parent (typing picks the first match); in the popover and the triage
picker ↑ ↓ highlight and Enter or a click picks.

## Create

**+** on each open column's header (and the empty area's "+ New …" button) opens the create form
(`CreateForm`), hanging under the **+** and showing the ID it will take: kind (epic / task where the
column takes both; fixed elsewhere), title (required), parent (optional), priority (P0–P3, default
P2), and on Signals `source` (optional; empty, no `source:` is written). **Cancel** and **Create
<kind>** ("Creating…" while it writes). Enter submits from any field; Tab stays inside the form;
Escape or a click outside closes it and returns focus to the **+**; the frame losing the focus
closes it, focus left where the user sent it.

- **ID** (`nextId`): the highest `<prefix>-NNN` among the folder's and `done/`'s files — by file name,
  any extension, and by the frontmatter `id:` — plus one, zero-padded to 3 (`T-999` → `T-1000`);
  never reused, gaps never filled. `createTicket` re-reads the folder when it writes; a path taken by
  then bumps the number until one is free (up to 50).
- **File:** `<ID>-<slug>.md` in the backlog folder (an epic or task created on `done` goes into
  `done/` while "Move done … to `done/`" is on). The slug (`slugify`) is the title lowercased, words
  joined by `-`, Latin accents folded, other scripts kept, at most 60 characters cut at a word
  boundary; a title with nothing to slug gives `<ID>.md`. Created with the Host API's file create —
  the whole text at once.
- **Text** (`newTicketContent`): the convention's keys in order — `id`, `kind`, `title`, `status`
  (the column), `type: feature` (not on a signal), `priority`, the parent key when one is picked,
  `created` / `updated` (today), `reporter`, then `source` when the form names one. A value YAML would read as anything but the same
  string (`true`, `123`, `a: b`, a date) is double-quoted (`yamlString`). The body is `# <ID> —
  <title>` and the convention's empty sections: problem Problem · Outcome; epic Goal · Scope ·
  Acceptance; task Goal · Acceptance; a signal's description goes under its heading.
- **Reporter**: the Board's `reporter` setting as the settings file holds it at the create
  (`readSyncedSettings`, so a change made in another tab or by hand counts), default `d.voronov`.
- The new file opens in an editor tab; its card appears with the next read.

## Reporter setting

The settings page ([[backlog-location]] "Settings page"), section **New tickets** → **Reporter**:
one field, the handle, showing what the settings file holds now (`normalizeReporter`: trimmed, no
spaces — "A handle without spaces, like d.voronov." otherwise, nothing written). Enter or leaving
the field writes `reporter` into `Apps/pomade-board/settings.json` (`saveSyncedSettings`, every
other key kept; the file is created when missing, a broken one is never overwritten and the field
says why); an emptied field removes the key, so the default applies and the field shows it. It is
workspace-wide, like `backlogPathPattern` ([[settings-and-state]]).

## Placement

Popovers and forms are placed inside the frame ([[tooltips-and-popovers]] "Popovers"): below their
anchor when they fit, else above, shifted left at the right edge, narrower than a narrow tab.
