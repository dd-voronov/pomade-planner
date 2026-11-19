# Convention, areas and columns — what a board shows

**Module:** `board` · **UI:** the Board tab: the area switcher, the columns, the cards, the
Unreadable strip · **Code:** `src/board/Board.tsx`, `src/board/Column.tsx`, `src/board/Card.tsx`,
`src/board/UnreadableStrip.tsx`, `src/board/model/ticket.ts`, `src/board/model/areas.ts`,
`src/board/model/order.ts`, `src/board/model/view-state.ts`, `src/board/board.css` · **e2e:**
`board-fake.spec.ts`, `board-manage-fake.spec.ts`, `pomade-board.spec.ts` · **Unit:**
`src/board/model/ticket.test.ts`, `src/board/model/areas.test.ts`, `src/board/model/order.test.ts`,
`src/board/model/view-state.test.ts` · **Contract:** `../Pomade/docs/BACKLOG.md` "One item = one
file", "Statuses"

## What it does

A board is a kanban view over a backlog folder in the Pomade family's Problem → Epic → Task
convention, plus signals. It splits the tickets into three areas that never mix — Signals ·
Problems · Solutions — each with the columns its kinds can be in. The file is the truth: a ticket
sits where its `status:` says, and one the Board can't place is shown, never dropped.

## Convention

The Problem → Epic → Task backlog convention of `../Pomade/docs/BACKLOG.md` ("One item = one file",
statuses per kind), plus the minimal `signal` kind:

```yaml
---
id: S-001
kind: signal
title: Cmd+click in a terminal opened random files
status: new                # new | triaged | dismissed
source: daniil             # who or what produced the evidence
problem: P-012             # set once triaged
created: 2026-11-09
updated: 2026-11-09
---
<description: the evidence as observed>
```

**Tickets** (`readBacklog`, `classifyEntry`): a Markdown file directly in the backlog folder or its
`done/` whose frontmatter carries a known `kind:` (`problem`, `epic`, `task`, `signal`). Its ID is
`id:`, else the one in its file name (`<P|E|T|S>-NNN-<slug>.md`); its title `title:`, else the file
name; its parent the kind's key (`PARENT_KEY`: `problem:` for an epic or a signal, `epic:` for a
task; a problem has none).

## Areas and columns

The areas are fixed data in code (`DEFAULT_AREAS`, `areas.ts`: area → kinds → columns); the Board
renders whatever mapping it is given, and the Board tab gives it this one. No setting changes them.

| Area | Kinds | Columns |
|---|---|---|
| **Signals** | `signal` | new · triaged · *dismissed* |
| **Problems** | `problem` | backlog · grooming · planned · delivering · review · done · *dropped · parked* |
| **Solutions** | `epic`, `task` | backlog · planned · in-progress · review · done · *dropped · parked* |

- The switcher at the top of the Board tab picks the area, with each area's count. A board opens on
  **Problems** until another area is picked (`defaultAreaId`).
- `done` is collapsed by default; *dropped*, *parked* and *dismissed* are narrow collapsed columns
  after the others (`placement: "side"`). Every column, collapsed or not, sits the same 8px from the
  next. A collapsed column shows its label and count and expands on click; an expanded one collapses
  again from its header. The open area and the columns toggled from their default are per-project
  view state ([[settings-and-state]]).
- A column appears only where the convention lets a kind be in it: `backlog` on Solutions holds
  standalone tasks; `review` and `parked` hold epics (`ColumnDef.kinds`, `canTake`).
- A ticket sits in the column of its status even when its kind could not be dropped there
  (`buildArea`).

## Unreadable strip

Above the columns: ticket-named files (`<P|E|T|S>-NNN-*.md`) whose frontmatter can't be parsed
("can't read — open to fix"), and tickets of the area with no status or a status the area has no
column for (misfits: "no status", "status “x” has no column"). Each is a greyed card that opens the
file.

## Empty area

An area with no tickets shows "No <area> yet" ("No signals yet", "No solutions yet") and its create button in place of
the columns (`createTarget`): "+ New signal" (creates in New), "+ New problem" (Backlog), "+ New
epic" (Planned).

## Cards

- ID, title, kind badge, priority. On Solutions, epic cards are wider and tinted (task cards are
  inset); task cards carry a chip with their parent epic (`E-017`). Signal cards carry their linked
  problem as a chip (`P-012`) and their source ("from daniil").
- Click or Enter opens the file in an editor tab of the board's project ([[host-api-usage]] "Editor
  tabs in their project").
- **Order inside a column** (`compareTickets`): priority (P0 first; none or unknown after P3), then
  ID (by kind letter, then number: `E-9` before `E-10`), then path.
- **Open tickets** (the chooser's counts): status not done, dropped, parked, triaged or dismissed
  (`isOpen`).
