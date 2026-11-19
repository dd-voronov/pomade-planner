# File model — live folders, field-only and conditional writes, unreadable items

**Module:** `core` · **UI:** every list of both apps · **Code:** `src/core/live-folder.ts`,
`src/core/host.ts`, `src/core/text.ts`, `src/planner/usePlannerData.ts`, `src/planner/write.ts`,
`src/planner/model/items.ts`, `src/board/useBoardData.ts`, `src/board/write.ts`,
`src/board/model/ticket.ts` · **e2e:** `board-fake.spec.ts`, `pomade-board.spec.ts`,
`planner-fake.spec.ts`, `planner-item-fake.spec.ts`, `pomade-planner-item.spec.ts` · **Unit:**
`src/core/live-folder.test.ts`, `src/core/text.test.ts`, `src/planner/write.test.ts`,
`src/board/write.test.ts`, `src/planner/model/items.test.ts`, `src/board/model/ticket.test.ts` ·
**Contract:** `../Pomade/docs/HOST-API.md` §4 `files` ("Conditional writes")

## What it does

Both apps rest on one architecture: every item is one md file with frontmatter, the file on disk is
the truth, the app writes single frontmatter fields and leaves every other byte alone, and an
item's full detail opens in Pomade's own editor. Nobody owns the files: Pomade's editor, Obsidian,
Finder, git and agents change them too, so the apps read live and never write over a version they
did not see.

## Live from disk

The app subscribes to its folders through the Host API watcher. A create, edit, delete or rename by
anyone shows in the open views within ~1 s; a view showing a changed item refreshes.

`useLiveFolder(host, path, read, isChange)` is the one live read both apps use (the Planner's
tasks root and its settings folder, the Board's backlog). It reads the folder, reads it once more
as soon as its watch holds (a change made in between reaches no watch), then re-reads after each
burst of relevant watch changes (gathered for 60 ms; `isChange` filters them — `isItemChange` for
the tasks root, `isBacklogChange` for a backlog). Reads can finish out of order; an older result is
never shown over a newer one. While the folder is missing, its nearest existing ancestor is watched
(`ancestorsOf`; with `watchWorkspaceTop`, the workspace root itself, not recursively), so a folder
made, moved in or checked out later loads by itself (`isFolderAppearance`). States: `loading`,
`missing`, `error`, `ready`.

## Recognised files only

A file is an item when its frontmatter carries a known `type:` (Planner: `task`, `recurring`,
`daily-note`, `note`, `thought` — `PLANNER_TYPES`) or `kind:` (Board: `problem`, `epic`, `task`,
`signal` — `KINDS`). Other files in the folder are ignored. Which folders are read:
[[storage-and-item-types]] "Storage", [[backlog-location]].

## Unreadable is visible

A file that would be an item but whose frontmatter can't be parsed shows greyed out — "can't read —
open to fix" — never silently dropped; a click opens it in the editor.

- Planner: a Markdown file with a frontmatter error is read as text (`needsTypeCheck`), and counts
  when a top-level `type:` line inside its leading `---` block names a known type
  (`brokenItemType`). Unreadable items sit at the end of the lists, by path.
- Board: a file named like a ticket (`<P|E|T|S>-NNN-*.md`) with a frontmatter error goes into the
  Unreadable strip ([[convention-areas-columns]] "Unreadable strip").

## Field-only writes

Every app edit rewrites only the frontmatter keys it changes, through the Host API
(`files.setField` / `files.removeField`, `pomade-kit`'s `frontmatter-write` in Pomade): key order,
comments, other keys and the body stay byte-identical. A mapping value — a recurring item's
`repeat:` — is `files.setKeyLines` with that key's own lines; a body edit is `files.setBody`, which
keeps the frontmatter block byte for byte. File moves (the Board's `done/`, the Planner's
`_archive/`, project sub-folder renames) go through `files.move`; new files through `files.create`,
whose refusal of a taken path is the guard against two writers.

## Never over a newer file

An action's first write to an item is conditional on the mtime the app read (`ifMtime`, the mtime
of the folder read the view shows). Pomade refuses it with `changed-on-disk`, nothing written, when
the file changed since; the view then shows the file as it is. The writes after the first in the
same action follow the app's own. Both apps have the same shape:

- Planner `writeOver(task, writes)` (`write.ts`): the first write gets `{ ifMtime: task.mtimeMs }`;
  a `changed-on-disk` becomes `StaleError`, any other refusal `WriteError` ("Not saved: …", the
  host's errno in a few words, `diskReason`).
- Board `writeFields(host, ticket, fields)` (`write.ts`): the same, failing as
  `{ kind: "changed" }`; every Host call is a named `step` (`read`, `field`, `move`, `create`) so the
  card's message says which one failed ([[editing-drag-create]] "Never over a newer file").

## Open files with unsaved edits

When the app writes a file that is open with unsaved edits, Pomade's changed-on-disk banner handles
it (PLATFORM rule 8, `pomade:E-035`); the app does nothing special.

## Text helpers

`src/core/text.ts`: `normalizeTitle` (one line, whitespace collapsed), `slugify` (lowercase words
joined by `-`, Latin accents folded, other scripts kept, at most 60 characters cut at a word
boundary — the Board's ticket names; the Planner's file names use it too), `yamlString` (a string as
a YAML scalar that reads back as the same string: double-quoted when a reader would take it for a
boolean, number, date or null).
