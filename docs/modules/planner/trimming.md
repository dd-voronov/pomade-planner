---
doc: docs/modules/planner/trimming.md
audience: engineers, product
holds: select mode in every view: selecting among the rows shown, bulk Archive, and Delete to the macOS Trash after a confirmation, with per-file results
kind: reference
---

# Trimming — select mode, bulk Archive and Delete

**Module:** `planner` · **UI:** every view in select mode · **Code:** `src/planner/Planner.tsx`
(select mode, `useTrimming`, `layOut`, `confirmDelete`), `src/planner/DeleteConfirm.tsx`,
`src/planner/model/selection.ts`, `src/planner/model/folds.ts` (`unfoldedRows`),
`src/planner/write.ts` (`archiveItem`) · **e2e:** `planner-trim-fake.spec.ts`,
`planner-select-views-fake.spec.ts`, `pomade-planner-trim.spec.ts` · **Unit:**
`src/planner/model/selection.test.ts`, `folds.test.ts` · **Contract:**
`../Pomade/docs/HOST-API.md` §4 `files.delete`

## What it does

A tasks folder fills up: done tasks, old notes, stray files. Select mode lets the user clear many
at once where they are seen — Today, Project, Recurring or All — archive notes, or move files to
the macOS Trash, from where Finder puts them back. A delete only ever touches files the user can see.

## Entering and leaving

Started in any view from the header — the panel's ⋯ → "Select items…", the tab's **Select** button
(pressed while on; both off while the view shows no row) — or from a row's menu ▸ **Select…**
([[views]] "Row menu"), which starts it with that row selected, as the anchor of a Shift-click, and
the focus on its box. It ends with **Done** or Esc, when everything selected went, and when the view
or the context changes (`useTrimming` keeps the view it started on).

## The bar and the rows

A bar under the view's bars (All's filters, Today's project chip, Project's and Recurring's source
chips) holds a select-all box, the count, **Archive**, **Delete N…** and **Done**; in the narrowest
panel (≤ 220px) it takes two lines — the count and Done, then Archive and Delete N… at the right.
The rows trade their tick, pin and actions for a selection box; so does the daily note's card on
Today, which loses its unpin button ([[daily-notes]] "Pinned on Today"). A click on a row's body
toggles it and puts the focus on its box.

- A click selects; Shift-click selects the range from the last row toggled on its own.
- Keyboard: Space and Shift+Space on a row's box, ↑ ↓ between rows, ⌘A selects every row shown,
  Delete or Backspace asks to delete, Esc leaves.
- **The selection is a subset of what the view shows** (`selection.ts`): select all, ⌘A and a
  Shift-range take the rows on screen top to bottom — the daily note's card, the pinned rows, the
  list's rows outside a folded group (`unfoldedRows` over the list's entries, `layOut`), the
  unreadable files. A row All's filters hide, or a group folded over it, drops out of the selection;
  unfolded again, its rows come back unselected.

## Archive

Offered only when every selected row is a readable note not yet archived (`isArchivable`): each
moves into `_archive/` as the row action does ([[storage-and-item-types]] "Storage"), no question
asked — Restore undoes it.

## Delete

The row menu's **Delete…** ([[views]] "Rows") asks the same question for its one row and trashes
the file through the same `trashFiles` (`src/planner/write.ts`); a failed delete puts its reason on
the row.

**Delete N…** asks first in the Planner's own modal (`DeleteConfirm`): "Delete 3 files?" (one file:
by its title), "They go to the macOS Trash — Finder can put them back.", every file's title and
path, Cancel (focused, so Enter cancels) and **Move to Trash**.

- Move to Trash sends the paths in `files.delete` calls of at most `FILES_DELETE_MAX_PATHS` (1000)
  each (`deleteBatches`); a call that fails as a whole fails each of its paths.
- `deleteOutcome` reads the per-file answers: a file already gone counts as deleted; one Pomade
  refuses stays, selected, with its reason under it by error code (`deleteFailure`: "Couldn't move
  it to the Trash.", "Couldn't delete it: Pomade keeps that file.", "…it's outside the workspace.",
  "…it's a folder."), the host's own words in its tooltip; a path the answer leaves out fails too.
  The others leave through the watch.
- A file open in an editor keeps its buffer, and Pomade says it no longer exists on disk.
