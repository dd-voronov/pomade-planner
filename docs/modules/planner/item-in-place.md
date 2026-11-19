# Item in place — the compact view in the Planner tab

**Module:** `planner` · **UI:** a pane beside the lists in the Planner tab · **Code:**
`src/planner/ItemPane.tsx`, `src/planner/item-pane.css`, `src/planner/useOpenItem.ts`,
`src/planner/useItemFile.ts`, `src/planner/ItemFields.tsx`, `src/planner/model/item-edit.ts`,
`src/planner/write.ts` (`saveItemEdit`, `saveBody`), `src/planner/PlannerTab.tsx` (the item
route), `src/core/views.ts` (`itemRoute`) · **e2e:** `planner-item-fake.spec.ts`,
`pomade-planner-item.spec.ts` · **Unit:** `src/planner/model/item-edit.test.ts` · **Contract:**
`../Pomade/docs/HOST-API.md` §4 `files.setField` / `setBody` / `setKeyLines`, `tabs.openApp`

## What it does

A click on an item opens it **in place in the Planner tab**: a compact view of its fields and its
text, edited without a save button and written field by field — so a quick change never costs an
editor tab. **Open in tab** gives the full Pomade editor when the item needs it.

## Opening and closing

- A click on a row's title, Enter on a focused row, or a click on the daily note's card opens the
  item: a pane beside the lists, as tall as the tab (44% of its width, 340–520px:
  `clamp(340px, 44%, 520px)`). The lists stay, the row is marked as open; one item is open at a time
  and another row's click takes the pane over (`useOpenItem`).
- Esc (with the focus in the pane) or its close button closes it and returns the focus to the row.
- In a tab narrower than 720px (a container query on the split) the pane takes the lists' place, its
  close button a **Back** arrow at its start ("Back to the list (Esc)").
- **⌘-click** on a row opens the file in an editor tab and no pane; a file that can't be read
  always opens the editor tab.

## From the panel

The panel is too narrow to edit in: a click opens or focuses the Planner tab of the same context at
the item's route (`tabs.openApp` at `item?path=<the file's path>`, `itemRoute`). The tab shows the
panel's view (view state is per context), so the row is listed and marked. The tab opens the pane
and returns to route `planner` at once (`PlannerTab`), so the same row asked again is a route change
again.

## What it shows

- **Head:** the type (with "done", "resolved" or "archived"), the row's own actions — a task's tick
  before its title; a recurring item's done as its round tick, and **Skip**; a thought's
  **Resolve** / **Reopen**; a note's **Archive**; an archived item's **Restore**; the pin of the
  view that lists it (the daily note's card: unpin for the day) — **Open in tab** (the editor tab)
  and close.
- **Fields:** the add form's fields (`ItemFields`, editing — without the project and the type
  switch): the title (a file without one shows its row's title as the placeholder), a task's
  `do-on`, `deadline` and `importance` — dates read `YYYY-MM-DD` and take phrases — a recurring
  item's rule in the repeat editor, and **Details**: the file's body as raw markdown, as tall as its
  text (the pane scrolls). The type and the project stand: they are changed in the file.
- **Log:** a recurring item's `## Log`, when it is the body's last section, is not part of Details
  (`bodyParts`): it shows under it, read-only, and stays in the file byte for byte.
- **Foot:** the rule in words with the next date (or why the rule isn't one), fields the file holds
  that aren't values, the file's path, and "Saving…" / "Saved" / "Done · next Jan 5, 2027".
- A rule the repeat editor can't hold (a single date, a weekday filter, months not evenly apart)
  and one the kit refuses show in words, to be changed in the file; every N months keeps the months
  the file counts from.

## Saving, no button

- **When:** a field is written when it is committed — Enter, the focus leaving it, a select's
  choice; Details 600 ms after typing stops (`DETAILS_SAVE_MS`) and when the focus leaves it; and
  everything typed when the pane closes or an action of the row runs.
- **What** (`item-edit.ts`, `saveItemEdit`, `saveBody`): a field's write is field-only (an emptied
  date or importance removes its key; an emptied title is the file's again; text that isn't a value
  is not written and the field says why). Details is a body-only write — its text with the file's
  line endings, then the white space and the log that followed it. A changed rule replaces the
  `repeat:` key's lines (`files.setKeyLines`, `formatSchedule`) and moves `do-on`
  (`doOnAfterRuleChange`): for fixed dates the new rule's first date on or after the earlier of
  `do-on` and today; after completion the newest log entry plus the period.
- After a write the field reads what the file holds (`fri` → `2026-11-20`).

## Only over the version the view read

The pane holds one version of the file — the folder read's fields and the file's text of one mtime
(`useItemFile`) — and writes one thing at a time: each write runs over the current version once the
earlier one is done and its result read, its first Host API call conditional on that version's
mtime (`ifMtime`); Pomade refuses it (`changed-on-disk`) when the file's mtime is another.

A file that changed elsewhere shows in the pane as it is with the next read (the watch, within
~1 s). When something typed was not yet written, or a write was refused, nothing is written over the
file and the pane says so: "The file changed on disk — nothing was written over it. This is the file
as it is now." A write still waiting when the view closes runs over the file as it is then.

## It follows its file

A move the app makes (Archive, Restore) and a rename the watcher reports — of the file or a folder
above it — keep the pane open on the new path; a file that is gone closes it, and so does a change
of context.
