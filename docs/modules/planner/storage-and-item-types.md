# Storage and item types — the tasks root and the five types

**Module:** `planner` · **UI:** every Planner view · **Code:** `src/planner/model/items.ts`,
`src/planner/model/create.ts`, `src/planner/model/archive.ts`, `src/planner/model/tick.ts`,
`src/planner/usePlannerData.ts`, `src/planner/write.ts` · **e2e:** `planner-fake.spec.ts`,
`planner-notes-fake.spec.ts`, `pomade-planner.spec.ts`, `pomade-planner-daily.spec.ts` · **Unit:**
`src/planner/model/items.test.ts`, `src/planner/model/create.test.ts`,
`src/planner/model/archive.test.ts`

## What it does

Every Planner item is one md file with frontmatter in one **tasks root** folder the user chose.
The root can be anywhere in the workspace, including inside the Knowledge vault, so the items are
ordinary notes other tools read and write. The frontmatter's `type:` says what an item is; the
Planner shows every type it knows and ignores every other file ([[file-model]] "Recognised files
only").

## Storage

One tasks root, chosen on first run — onboarding asks; there is no silent default
([[settings-and-onboarding]]).

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

- **Project membership = the sub-folder**, named after the project ([[projects]]).
- **Changing the tasks root** re-points the app; no files move.
- **Filename:** `<created-date>-<slug>.md` (`taskFileName`): `created` is the planner day it was
  added on; a taken name gets `-2`, `-3`, … (the Host API's create refuses a taken path, the next
  number is tried, up to 100); a title with nothing to slug gives `<created-date>-task.md`. The
  title lives in frontmatter, so retitling never renames the file. Daily notes:
  `Daily/<YYYY-MM-DD>.md` ([[daily-notes]]).
- **Items read** (`usePlannerData.ts`, `readItems`): the root's top-level Markdown files and
  `Daily/`'s (workspace-level items), each project sub-folder's top-level files (that project's
  items; not deeper), and `_archive/`'s and its sub-folders' (archived items of the same place).
  `Daily/`, `_archive/` and hidden folders are no project's (`isProjectFolder`). A sub-folder no
  project owns shows under its own name ("folder only" where that tells it apart). The read is
  live ([[file-model]] "Live from disk"; `isItemChange` keeps the watch to the root, its
  sub-folders and `_archive/`'s sub-folders).
- **Texts.** A recurring item's text is read for its `## Log`, a daily note's for its progress;
  the full tab reads every item's text for its excerpt. Texts are cached by mtime, so a watch event
  reads only the files it changed.
- **Archive** (`archive.ts`): a note moves into `_archive/`, into the same sub-folder it was in
  (`QuizLab/idea.md` → `_archive/QuizLab/idea.md`); a taken name becomes `idea-2.md`, …. Restore
  moves it back the same way. Both are `files.move`.

## Item types

| `type` | What | Fields beyond the common ones | States |
|---|---|---|---|
| `task` | something to do | `do-on`, `deadline`, `importance` | `open` · `done` |
| `recurring` | a task that comes back | `do-on`, `deadline`, `importance`, `repeat` | `open` (always; done/skip advance it) |
| `daily-note` | the structured note of one day | `date` | — |
| `note` | a quick drop; not a task | — | `open`; archived = moved to `_archive/` |
| `thought` | something to think about later | — | `open` · `resolved` (`done-on` set) |

- **Common fields:** `type`, `title`, `status`, `created`; `done-on` once done/resolved
  (`FIELD`). A task's `status` other than `done` reads as open; a missing `title` is the file
  name; a daily note without one reads as its date ("Tue, Nov 10").
- **Values.** Dates are `YYYY-MM-DD`; a date or `importance` that isn't a value of its kind
  (`do-on: next week`) reads as unset, and the row names the field (`Task.problems`).
  `importance` is a plain number, **higher = more important**; empty sorts below any number.
- **Changing `type`** is a one-field edit: the file, description and history stay; the new type's
  fields appear in the editor, and the views show the item as its new type with the next read.
- **Notes, thoughts and daily notes** have no checkbox (a glyph of their type in its place) and are
  never in Today, Project or Recurring (`isTaskType`, `isScheduled`); dates set on them by hand are
  ignored there.
- **Checkboxes inside a body** are plain markdown with no planner logic (a daily note's count as
  its progress, [[daily-notes]] "Progress").
- `recurring` adds `repeat:` and a `## Log` in the body ([[recurring]]).
- More types can be added; the app shows every type it knows (`PLANNER_TYPES`).

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

## Writing an item

- **New file** (`newTaskContent`, `create.ts`): the frontmatter is `type`, `title` (a YAML string
  that reads back as itself, `yamlString`), `status: open`, then — a task or recurring item —
  the `do-on`, `deadline` and `importance` that are set and a recurring item's `repeat:` block as
  `pomade-kit` formats it (`formatSchedule`), then `created`; a note or a thought has no dates. Details typed in the form are the body ([[quick-add]] "Fields").
- **Ticking** (`tick.ts`, `tickTask`): field-only writes of `status: done` and `done-on: <planner
  day>`, or back to `open` with `done-on` removed; the file stays where it is. **Resolving** a
  thought is the same with `status: resolved` (`resolveThought`). Both only over the version the
  view read ([[file-model]] "Never over a newer file").
