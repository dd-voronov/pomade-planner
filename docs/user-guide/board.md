---
doc: docs/user-guide/board.md
audience: users
holds: using the Board — the backlog location, areas and columns, dragging, the card popover, creating tickets, triaging signals, Needs you
kind: reference
---

# Board

[← User guide](user-guide.md)

The Board is a kanban over a project's backlog folder: each ticket is one Markdown file whose
frontmatter carries `kind:` and `status:`. The Board icon opens (or focuses) the active project's
Board tab and fills the side panel with **Needs you**. The board updates within about a second of
any file change.

- [Where the backlog is](#where-the-backlog-is)
- [Areas and columns](#areas-and-columns)
- [Cards](#cards)
- [Dragging: changing a status](#dragging-changing-a-status)
- [The card popover: priority and parent](#the-card-popover-priority-and-parent)
- [Creating tickets](#creating-tickets)
- [Triaging signals](#triaging-signals)
- [Needs you](#needs-you)
- [At Workspace: the project list](#at-workspace-the-project-list)

## Where the backlog is

- The Board tab always shows the **active project**: switch projects in Pomade and the board
  switches too. Area and column state are remembered per project.
- It looks in `docs/roadmap/` under the project's root (the workspace-wide pattern, see
  [settings](settings.md#board)) and reads that folder and its `done/` sub-folder, not deeper.
- No backlog there: **"No backlog found"** with **Choose backlog folder** — a folder picker limited
  to the project. The chosen folder is kept for that project, relative to its root.
- Later: the tab's **⋯** (Board settings) → **Change backlog folder…**.
- While the folder is missing the Board keeps watching, so a backlog folder created, moved in or
  checked out later loads the board by itself.
- Files without a known `kind:` (`BACKLOG.md`, `PLAN.md`, lists) are ignored. The Board never
  edits them.

The header shows the backlog folder (`docs/roadmap`) at the right, then **⋯**.

## Areas and columns

The switcher at the top picks an area; areas never mix. Each tab shows the area's ticket count
(done ones included). A board opens on **Problems** until you pick another area.

| Area | Kinds | Columns | Collapsed at the side |
|---|---|---|---|
| **Signals** | signal | New · Triaged | Dismissed |
| **Problems** | problem | Backlog · Grooming · Planned · Delivering · Review · Done | Dropped · Parked |
| **Solutions** | epic, task | Backlog · Planned · In progress · Review · Done | Dropped · Parked |

- **Done** starts collapsed; Dropped, Parked and Dismissed are narrow collapsed columns at the right.
  A collapsed column shows its label and count — click it to expand; an expanded one collapses again
  from the ‹ in its header.
- A kind can only be dropped where the convention allows it: on Solutions, **Backlog** takes tasks
  only and **Parked** epics only; **Review** takes both.
- A ticket always sits in the column of its `status:`, even one its kind couldn't be dropped into
  (the file is the truth).
- **Order** in a column: priority (P0 first, none last), then ID.
- An area with no tickets shows "No signals yet" (or problems, solutions) and a button:
  **+ New signal** (creates in New), **+ New problem** (Backlog), **+ New epic** (Planned).

**Unreadable strip** above the columns: ticket-named files (`P-`, `E-`, `T-`, `S-NNN-….md`) whose
frontmatter can't be parsed ("can't read — open to fix"), and tickets of this area with no status or
a status with no column ("status “wip” has no column — open to fix"). Click one to open the file.

## Cards

| Card shows | |
|---|---|
| kind badge | P (problem), E (epic), T (task), S (signal) |
| ID, title, priority | priority P0–P3, coloured by level |
| reporter | who raised it (`reporter:`), quiet, before the priority: `d.voronov`; ✦ `claude` when an agent filed it on its own; nothing when the file has none |
| parent chip | a task's epic (`E-017`) on Solutions; a signal's problem (`P-012`) |
| source | a signal's "from session-2026-11-09" |

On Solutions, epic cards are wider and tinted; task cards are inset.

**Click** a card (or Enter on a focused one) to open its file in a Pomade editor tab, in the board's
project. Title, body and every other field are edited there.

## Dragging: changing a status

Drag a card to another column. The Board writes two frontmatter lines — `status:` and
`updated: <today>` — and leaves every other byte alone.

- While dragging, columns the kind can't take are dimmed and the card says why: "Epics can't be in
  Backlog". A drop there is refused.
- **Done moves the file:** an epic or task dropped on Done moves into `done/` (created if missing);
  dragged out of Done it moves back. Problems and signals never move. Turn this off per backlog:
  **⋯ → Move done epics and tasks to `done/`** (on by default).
- **Never over a newer file:** if the file changed since the board read it, nothing is written and
  the card says "Changed on disk since the board read it — not saved. The card shows the file as it
  is now." Drag again.
- Other failures show on the card ("Couldn't save: permission denied.", "Status saved, but not
  moved: … already exists."); nothing is retried. A failed move opens the target column to show the
  card.
- Keyboard: Tab to a card, **Space** lifts it, **← →** move it a column, **Space** or **Enter** drops,
  **Esc** cancels.

## The card popover: priority and parent

Right-click a card (or the context-menu key, or ⇧F10 on a focused card). Its head shows the ID,
the title and the reporter.

- **Priority** — P0 · P1 · P2 · P3.
- **Parent** — an epic's problem (`problem:`), a task's epic (`epic:`), a signal's problem
  (`problem:`). Problems have none. **No epic** / **No problem** removes the key.

Each pick is written at once (that key and `updated:`), with the same "never over a newer file"
check. The popover stays open for the next change; Esc or a click outside closes it.

**Parent list:** a search field over "No …", then open candidates, then closed ones (done, dropped,
parked, marked with their status), newest ID first. Typing filters by ID and title (every word must
match).

## Creating tickets

**+** in an open column's header (tooltip "New task in Planned", "New epic or task in Planned")
opens a form under it. Its head shows the ID it will take and the column: "T-014 · Planned".

| Field | |
|---|---|
| **Kind** | Epic / Task where the column takes both; fixed elsewhere |
| **Title** | required |
| **Problem** / **Epic** | optional parent; typing picks the first match, ↑ ↓ move |
| **Priority** | P0–P3, default P2 |
| **Source** | Signals only; optional — empty, no `source:` is written |

Enter (from any field) or **Create task** creates; Esc or **Cancel** closes and focus returns to
the **+**. The new file opens in an editor tab; its card appears with the next read.

- **ID:** the highest number of that kind's prefix (`P`, `E`, `T`, `S`) among the backlog folder's
  and `done/`'s files — by file name and by `id:` — plus one, zero-padded to 3 (`T-999` → `T-1000`).
  IDs are never reused and gaps never filled. Re-checked when the file is written.
- **File:** `<ID>-<slug>.md` — the title lowercased, words joined by `-`, accents folded, at most 60
  characters. An epic or task created in Done goes into `done/` (while the move setting is on).
- **Reporter:** every new ticket gets `reporter:` from the Board's setting, `d.voronov` out of the
  box. Change it: **⋯ → Reporter for new tickets…**, type the handle (no spaces), **Save** or Enter.
  Left empty, it goes back to `d.voronov`. The setting is workspace-wide
  ([settings](settings.md#board)).
- **Text:** see [Files and format › Tickets](files-and-format.md#tickets).

## Triaging signals

Dropping a signal without a `problem:` on **Triaged** first asks **"Which problem is it evidence
for?"** under the Triaged header:

- pick a problem → writes `status: triaged`, `problem:` and `updated:`;
- **Skip — triage without one** → `status` and `updated` only;
- **Cancel**, Esc or a click outside → the drop is cancelled, nothing written.

A signal that already has a problem is triaged without asking.

## Needs you

The Board icon's side panel. Inside a project: two groups, **In review** (tickets of any kind with
`status: review`) and **New signals** (`status: new`), each by priority then ID. Empty groups are left
out; with nothing at all: "Nothing needs you". A row shows kind badge, ID, priority and title; click
it to open the ticket in an editor tab. It follows the active project and updates within about a
second. A project without a backlog folder: "No backlog found … Choose one on its Board."

**At Workspace** the panel has three levels:

1. **The list** (where it opens) — **All projects** with the total, then every project with
   something waiting, in sidebar order with its group and counts ("2 in review · 1 new signal").
   Projects with nothing waiting or no backlog are left out.
2. **A project** — click its row: that project's two groups.
3. **All projects** — every project's groups, one section per project.

An opened level starts with a back row naming it; click it to return to the list. Opening a ticket
switches Pomade to its project, and the panel becomes that project's. The panel is on the list each
time you come back to Workspace.

## At Workspace: the project list

With no active project the Board tab shows **"Choose a project"**: every project whose backlog
resolves, in sidebar order with its group, each with its open count (not done, dropped, parked,
triaged or dismissed) and what needs you — "14 open · 2 in review · 1 new signal". Counts are live; a
project removed from the workspace leaves the list at once. Click a project to open its board.
