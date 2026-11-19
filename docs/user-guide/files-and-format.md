# Files and format

[← User guide](user-guide.md)

Every Planner item and every Board ticket is one Markdown file with YAML frontmatter. The file is
the truth: edit it anywhere — Pomade's editor, Obsidian, a script, an agent — and the apps show the
change within about a second.

- [Planner items](#planner-items)
- [The repeat rule](#the-repeat-rule)
- [The log](#the-log)
- [Tickets](#tickets)
- [What the apps write](#what-the-apps-write)
- [Changed on disk](#changed-on-disk)

## Planner items

### The tasks folder

```
<tasks folder>/
  2026-11-09-buy-printer-ink.md     ← workspace-level items (no project)
  Daily/
    2026-11-09.md                   ← daily notes (workspace-level only)
  _archive/                         ← archived items, sub-folders mirrored
    QuizLab/2026-10-02-idea.md
  Pomade/                           ← items of project "Pomade"
  QuizLab/
  QuizLab (Archive)/                ← a second project named QuizLab, in group "Archive"
```

- The Planner reads the folder's own Markdown files, `Daily/`'s, each project sub-folder's (not
  deeper), and everything under `_archive/` one level of sub-folders deep.
- A file is an item only when its frontmatter has a `type:` the Planner knows. Other files are
  ignored.
- **File names:** `<created>-<slug>.md` (`2026-11-09-buy-printer-ink.md`); a taken name gets `-2`,
  `-3`; a title with nothing to slug gives `<created>-task.md`. The title lives in the frontmatter,
  so renaming an item never renames its file. Files you name by hand work the same.
- **Project folder names** come from the project's name: `/`, `\` and `:` become `-`, leading dots
  and spaces go, at most 80 characters.

### Frontmatter keys

| Key | Types | Value |
|---|---|---|
| `type` | all | `task` · `recurring` · `note` · `thought` · `daily-note` |
| `title` | all | text. Missing: the file name (a daily note: its date, "Tue, Nov 10") |
| `status` | task, recurring | `open` · `done` (anything else reads as open) |
| | thought | `open` · `resolved` |
| | note | `open` (archiving moves the file instead) |
| `do-on` | task, recurring | `YYYY-MM-DD` — the day you plan to do it; a recurring item's next date, kept by the app |
| `deadline` | task, recurring | `YYYY-MM-DD` — the day it is due |
| `importance` | task, recurring | a number, higher = more important |
| `repeat` | recurring | the rule, [below](#the-repeat-rule) |
| `created` | all | `YYYY-MM-DD`, the planner day it was added |
| `done-on` | task, thought | `YYYY-MM-DD`, set when ticked or resolved |
| `date` | daily-note | `YYYY-MM-DD` |

A date or importance that isn't a value of its kind (`do-on: next week`) counts as unset, and the
row names the problem ("do-on isn't a date (YYYY-MM-DD)"). Any other keys are kept and ignored.
The body is free markdown; checkboxes in it are plain markdown with no planner logic (a daily note's
count toward its progress).

### Examples

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
Call the pool first.
```

```yaml
---
type: recurring
title: Upload invoices
status: open
do-on: 2026-12-05
repeat:
  monthly: { days: [5] }
  lead-days: 3
  start: 2026-01-01
created: 2026-01-01
---
Upload all invoices to the accountant's portal.

## Log
- 2026-11-05 done
- 2026-10-05 skipped
```

```yaml
---
type: thought
title: Should the Board show card age?
status: open
created: 2026-11-12
---
```

A recurring item set to `status: done` by hand is done like a task: out of Today, Project and
Recurring; in All with **Show done**.

**Daily notes** are `Daily/YYYY-MM-DD.md` with `type: daily-note` and `date:` first in the
frontmatter, then your template's other keys and its body as they are.

## The repeat rule

`repeat:` is a YAML mapping: **one shape key**, plus optional modifiers. Whole days only — no times.

| Shape | Means |
|---|---|
| `daily: {}` | every day |
| `daily: { every: 10 }` | every 10 days, counted from `start` (required) |
| `weekly: { days: [mon, thu] }` | every Monday and Thursday |
| `weekly: { every: 2, days: [mon] }` | every other Monday, counted from the week of `start` (required) |
| `monthly: { days: [5] }` | the 5th of every month |
| `monthly: { days: [1, 15, last, first mon] }` | days `1`–`31`, `last`, or `first`…`fifth`/`last` + weekday |
| `monthly: { days: [5], months: [jan, apr, jul, oct] }` | only in those months (quarterly; one month = yearly) |
| `after-completion: { months: 3 }` | 3 months after the last done (or `days:`, `weeks:`) |
| `once: 2026-11-20` | a single date |

| Modifier | Means |
|---|---|
| `start: YYYY-MM-DD` | first date with occurrences (inclusive); the anchor of `every` above 1 |
| `end: YYYY-MM-DD` | last date with occurrences (inclusive) |
| `lead-days: N` | shows in Today N days early. `0` = only on the day; ≥ the period = always |
| `only: weekdays` / `weekends` | with `daily`: only those days |

- Weekdays: `mon` … `sun` (full names accepted); months: `jan` … `dec` or `1`–`12`.
- Day 29–31 in a shorter month falls on its last day.
- `do-on` is the next occurrence. Missing or unreadable, it is worked out from the newest log entry,
  else `start`, `created` or today.
- Editing `repeat:` by hand re-computes the item on the next read. A rule that can't be read shows
  its error on the row (`repeat.weekly.days[1]: "fry" is not a weekday …`); done and skip stay off
  until it is fixed.

## The log

A recurring item's `## Log` section holds one line per done or skip, **newest first**:

```markdown
## Log
- 2026-11-05 done
- 2026-10-05 skipped
```

- The app writes the new line right under the heading. A body without the section gets it at its
  end, after one blank line. Every other byte of the body stays.
- Lines are `- YYYY-MM-DD <words>`; lines you add by hand count too (the newest date wins).
- When `## Log` is the body's last section, the compact view shows it under Details, read-only, and
  never writes it from Details.

## Tickets

A ticket is a Markdown file directly in the backlog folder or its `done/` sub-folder, with a known
`kind:`.

| Key | Value |
|---|---|
| `id` | `P-012`, `E-017`, `T-104`, `S-001`; else the ID in the file name |
| `kind` | `problem` · `epic` · `task` · `signal` |
| `title` | text; missing: the file name |
| `status` | the column — see below |
| `priority` | `P0` · `P1` · `P2` · `P3` |
| `problem` | an epic's or a signal's problem ID |
| `epic` | a task's epic ID |
| `reporter` | who raised it: a person's handle (`d.voronov`), or `claude` when an agent filed it on its own; shown on the card |
| `source` | where it came from: a testing round, `session-YYYY-MM-DD`, `review`, intake… — never a person; shown on a signal's card |
| `type` | `feature` (written on create, not read) |
| `created`, `updated` | `YYYY-MM-DD` |

| Kind | Statuses with a column |
|---|---|
| signal | `new` · `triaged` · `dismissed` |
| problem | `backlog` · `grooming` · `planned` · `delivering` · `review` · `done` · `dropped` · `parked` |
| epic | `planned` · `in-progress` · `review` · `done` · `dropped` · `parked` |
| task | `backlog` · `planned` · `in-progress` · `review` · `done` · `dropped` |

Done epics and tasks live in `done/` (while the move setting is on). File names are
`<ID>-<slug>.md`.

**A created ticket** — keys in this order, a value that YAML would read as anything else (`true`,
`123`, a date) double-quoted:

```yaml
---
id: T-014
kind: task
title: Show card age
status: planned
type: feature
priority: P2
epic: E-003
created: 2026-11-19
updated: 2026-11-19
reporter: d.voronov
---

# T-014 — Show card age

## Goal

## Acceptance
```

`reporter` is the Board's reporter setting ([settings](settings.md#board)); `source` is written
only when the create form names one (Signals). Body sections: problem — Problem, Outcome; epic —
Goal, Scope, Acceptance; task — Goal, Acceptance; signal — none. A signal's keys are the same, in
the same order, without `type`.

## What the apps write

Both apps change only the frontmatter keys an action names: key order, comments, other keys and the
body stay byte for byte.

| Action | Writes |
|---|---|
| **Planner** — quick add / add in place | a new file (or today's daily note) |
| tick / untick a task | `status: done` + `done-on` / `status: open`, `done-on` removed |
| Resolve / Reopen a thought | `status: resolved` + `done-on` / `status: open`, `done-on` removed |
| done / skip a recurring item | the log line in the body, then `do-on` (removed when there is no next date) |
| a field in the compact view | that key; an emptied date or importance removes it |
| a rule in the compact view | the `repeat:` key's lines, and `do-on` |
| Details in the compact view | the body only (the trailing `## Log` kept) |
| Archive / Restore | moves the file into / out of `_archive/` |
| Delete (select mode) | moves files to the macOS Trash |
| project renamed in Pomade | renames its sub-folder |
| **Board** — drag | `status`, `updated` (+ `problem` on triage); moves into / out of `done/` |
| popover | `priority` or the parent key, and `updated` |
| **+** | a new ticket file |
| ⋯ → Reporter for new tickets… | `reporter` in `Apps/pomade-board/settings.json` |

**Never:** a file without a known `type:`/`kind:`, a ticket's title or body, a `BACKLOG.md` index,
anything else in the tasks folder or backlog. Files whose frontmatter can't be parsed are shown
greyed ("can't read — open to fix") and never edited.

## Changed on disk

- **The app never writes over a newer file.** Each action's first write is conditional on the file
  version the view read. If the file changed since — you saved it elsewhere, git checked out another
  version — Pomade refuses it and nothing is written. The view then shows the file as it is now:
  - Planner rows: the tick doesn't stick; the row shows the file.
  - Planner compact view: "The file changed on disk — nothing was written over it. This is the file
    as it is now."
  - Board card: "Changed on disk since the board read it — not saved. The card shows the file as it
    is now."

  Repeat the action on the fresh version.
- **A file open in Pomade's editor with unsaved edits** that an app writes: Pomade's own
  changed-on-disk banner handles it ("File changed since your edits · Compare"); your typed text
  stays.
- A deleted file open in an editor keeps its buffer; Pomade says it no longer exists on disk.
