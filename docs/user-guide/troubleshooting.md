---
doc: docs/user-guide/troubleshooting.md
audience: users
holds: messages the apps show, what they mean and what to do, and what the apps deliberately don't do
kind: reference
---

# Troubleshooting and limits

[← User guide](index.md)

## Planner

| You see | Means | Do |
|---|---|---|
| "Where should your tasks live?" | no tasks folder is set | **Choose folder…** |
| "Tasks folder not found" — "To-dos/ isn't there any more." | the folder was moved or deleted | **Choose folder…**, or put the folder back |
| "Can't read the Planner's settings" / "… — using the defaults." | `Apps/pomade-planner/settings.json` isn't valid, or a key has a wrong value | fix the file; [Settings](settings.md#planner) lists the keys |
| quick add: "Choose a tasks folder first" | no tasks folder yet | **Open the Planner** |
| a greyed row "can't read — open to fix" | a file with a known `type:` whose frontmatter doesn't parse | click it, fix the YAML in the editor |
| a row hint "do-on isn't a date (YYYY-MM-DD)" | a field holds something that isn't a value of its kind | fix the value; until then it counts as unset |
| checkbox off: "Fix the repeat rule first — open the file" | `repeat:` can't be read; the row shows the error | fix the rule ([syntax](files-and-format.md#the-repeat-rule)) |
| checkbox off: "Ended — change end or do-on in the file to bring it back" | `end` has passed, or the rule has no next date | change `end`, `do-on` or the rule |
| compact view: "The file changed on disk — nothing was written over it. …" | the file changed elsewhere while you typed | retype on the version shown |
| "Not saved: …" | Pomade refused the write (permissions, file gone, frontmatter unreadable) | act on the reason given |
| "“QuizLab” can't take To-dos/QuizLab/ — a folder with that name is already there. …" | a renamed project's new folder name is taken | rename or move one of the two folders; the rename then catches up by itself |
| settings: "Can't use Templates/Daily.md: …" | the daily-note template is missing or its frontmatter can't be read | fix or re-choose it; new notes use the built-in one meanwhile |
| "Couldn't make today's daily note: …" | the note couldn't be written | act on the reason; quick add → **Daily** makes it on demand |
| a note added from Today shows in Project, not Today | its Do on was emptied: a note or thought without one stands in Project and All, not in Today | give it a Do on to see it in Today |
| Today shows other projects' items inside a project | Today is the whole day everywhere | **Only *project*** under the date narrows it |
| a heading shows a count but no rows | the group is folded | click the heading, or → on it |
| no daily notes in All | All shows daily notes only when ticked | **Types → Daily notes** |
| no **+ Add from…** chip | No project and every other project are mixed in already | — |
| Project inside a project shows only a few rows, no headings | **Due today** is on | click **Due today** (×) |

**No daily note today.** It is made at Pomade's first start of a day (or when the boundary passes
while Pomade runs) by the Planner, which Pomade loads hidden at start. None is made when the Planner
isn't installed, for a day Pomade didn't run, again after you deleted it that day, or for a day
before the last one the Planner ran on (a boundary moved later). Quick add → **Daily** → Enter makes
and opens it any time.

**No morning summary.** Posted once per planner day at Pomade's start, only when something is due or
inside its lead time. Not posted later that day, nor when the boundary passes while Pomade stays
open; a start before the boundary counts as yesterday. Installing or updating the Planner counts as
a start, so the day's summary can post right after an install.

**Moving an item to another project:** move its file into that project's sub-folder (Finder,
Pomade's file tree, `git mv`). The type is changed in the file's `type:`.

## The `pomade-planner` command

| You see | Do |
|---|---|
| `command not found` | in Pomade's terminals it is on `PATH` once Pomade ran after the install; elsewhere add the line from **Pomade ▸ Settings ▸ General ▸ Commands** |
| "No Pomade workspace found. Open Pomade once, so it records its workspace." | start Pomade once |
| "No tasks folder is set …" | open the Planner in Pomade and choose the folder |
| "The tasks folder … doesn't exist. …" | choose another folder in the Planner's settings |
| `More than one project is named "QuizLab" — name one of them: …` | use one of the names listed |
| `No project named "…". Projects with tasks: …` | use a listed name; a project shows only once it has a folder |

## Board

| You see | Means | Do |
|---|---|---|
| "No backlog found" | no backlog folder at the pattern (`docs/roadmap/`) or the chosen folder is gone | **Choose backlog folder** |
| "… is outside <Project>. Choose a folder inside the project." | the picked folder isn't in the project | pick one inside it |
| "… — using the defaults." above the board | `Apps/pomade-board/settings.json` isn't valid JSON, or has a bad `backlogPathPattern` or `reporter` | fix the file |
| "A handle without spaces, like d.voronov." in **Reporter for new tickets** | the handle has a space | type it without |
| Unreadable strip: "can't read — open to fix" | a ticket-named file whose frontmatter doesn't parse | click it, fix the YAML |
| Unreadable strip: "status “wip” has no column — open to fix" | a status this area has no column for, or none | fix `status:` |
| "Epics can't be in Backlog" while dragging | that column doesn't take this kind | drop elsewhere |
| "Changed on disk since the board read it — not saved. …" | the file changed after you grabbed the card | drag again |
| "Couldn't save: permission denied." | the file or folder is read-only | fix permissions, drag again |
| "Status saved, but not moved: … already exists." | `done/` (or the backlog folder) already has a file of that name | rename one file, then move it |
| "The file is gone — not saved." | deleted or renamed meanwhile | — |
| "Its frontmatter can't be read — not saved. Open it to fix." | broken YAML | fix it in the editor |
| "Give it a title." | create form with an empty title | type one |
| "No project has a backlog yet. …" (Workspace) | no project's backlog folder resolves | open a project, click the Board icon, choose its folder |
| Needs you: "No backlog found … Choose one on its Board." | the project has no backlog folder | choose it on the Board tab |

## Both

- **"No Pomade host"** — the app's page was opened outside Pomade (a browser). It runs only inside
  Pomade.
- **A change doesn't show** — the apps follow file watches and show changes within about a second.
  Files outside the read folders (deeper sub-folders of a project folder or backlog) are never read.

## Limits

- **Dates only.** No times, alarms or reminders; nothing happens while Pomade is closed. The badge
  and the morning summary need Pomade running.
- **The notification opens the Planner tab**, not the panel.
- **The panel is for reading and ticking.** A click on a row opens the Planner tab to edit.
- **An item's type and project** are changed in its file (`type:`, or moving the file), not in the
  compact view.
- **The repeat editor** holds every N days, every N weeks on weekdays, every 1/2/3/4/6/12 months on
  days, and N days/weeks/months after done. Other rules (`once`, `only: weekdays`, uneven months)
  are written in the file.
- **Board cards** are ordered by priority then ID; there is no manual order inside a column.
- **Board areas and columns** are fixed (Signals, Problems, Solutions as listed in
  [Board](board.md#areas-and-columns)). The Board's settings file is edited by hand.
- **A ticket's title and body**, and every key besides status, priority and parent, are edited in
  the file.
- **The Board's `updated:`** is the calendar day; the Planner's day boundary doesn't apply to it.
- **Theme:** both apps follow Pomade's theme; Pomade ships a light theme only.
- **Delete** sends files to the macOS Trash; Finder can put them back.
