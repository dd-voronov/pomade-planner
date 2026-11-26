---
doc: docs/modules/board/convention-areas-columns.md
audience: engineers, product
holds: the ticket convention and the `signal` kind, the fixed areas and columns, the Unreadable strip, empty areas, cards and their order
kind: reference
---

# Convention, areas and columns — what a board shows

**Module:** `board` · **UI:** the Board tab: the area switcher, the columns, the cards, the
Unreadable strip · **Code:** `src/board/Board.tsx`, `src/board/Column.tsx`, `src/board/Card.tsx`, `src/board/Reporter.tsx`,
`src/board/UnreadableStrip.tsx`, `src/board/model/ticket.ts`, `src/board/model/areas.ts`,
`src/board/model/order.ts`, `src/board/model/view-state.ts`, `src/board/board.css` · **e2e:**
`board-fake.spec.ts`, `board-manage-fake.spec.ts`, `pomade-board.spec.ts` · **Unit:**
`src/board/model/ticket.test.ts`, `src/board/model/areas.test.ts`, `src/board/model/order.test.ts`,
`src/board/model/view-state.test.ts`

## What it does

A board is a kanban view over a backlog folder kept in one convention — signals, and problems
that lead to epics and tasks ("Convention" below). It splits the tickets into three areas that never mix — Signals ·
Problems · Solutions — each with the columns its kinds can be in. The file is the truth: a ticket
sits where its `status:` says, and one the Board can't place is shown, never dropped.

## Convention

The Board reads a backlog kept as plain files: one ticket per Markdown file, its facts in the
frontmatter. It knows four kinds of ticket. Together they describe one way of working — from what
was noticed, to what hurts, to what is built:

- **Signal** (`S-NNN`) — a raw observation: something seen, not yet analysed, with no solution
  attached. It commits nobody to any work. A signal is `new` until someone triages it: links it to
  the problem it is evidence for (`triaged`), or sets it aside (`dismissed`).
- **Problem** (`P-NNN`) — a pain, an idea or an open question, stated from the user's side. It is
  examined until a solution is designed, then the solution is built, and it is done when the
  problem is confirmed solved.
- **Epic** (`E-NNN`) — a piece of the solution that can be shipped and tried by itself. A problem
  leads to one or more epics; an epic names its problem in `problem:`.
- **Task** (`T-NNN`) — one unit of implementation. A task belongs to an epic (`epic:`) or stands
  alone: a small fix needs neither an epic nor a problem.

No level is obligatory: a problem can be solved without an epic, and a signal can stay without a
problem.

**Statuses.** A ticket's `status:` says where it is in its life:

| Kind | Flow | Set aside |
|---|---|---|
| signal | `new` → `triaged` | `dismissed` |
| problem | `backlog` → `grooming` → `planned` → `delivering` → `review` → `reviewed` → `done` | `dropped`, `parked` |
| epic | `planned` → `in-progress` → `review` → `reviewed` → `done` | `dropped`, `parked` |
| task | (`backlog` →) `planned` → `in-progress` → `review` → `reviewed` → `done` | `dropped` |

- **`grooming`**, **`planned`**, **`delivering`** (a problem): being examined; its solution is
  designed and its epics exist; they are being built.
- **`backlog`** (a task): a task that stands alone and waits to be picked up. A task under an epic
  starts at `planned`.
- **`review`**: the work is delivered and waits for the person who reviews it. These tickets, and
  the signals in `new`, are what [[needs-you]] lists.
- **`reviewed`**: the reviewer is finished and hands the ticket back to whoever does the work — to
  close it, or to go on with it.
- **`dropped`**: will not be done. **`parked`**: understood and deliberately put off.
- Epics and tasks that reach `done` move into the backlog folder's `done/` sub-folder
  ([[editing-drag-create]] "Done moves the file"); problems and signals stay where they are.

**The file.** Every key the Board reads and writes is in the user guide's
[files-and-format](../../user-guide/files-and-format.md#tickets). A signal has the same keys in the
same order as the other kinds, without `type`:

```yaml
---
id: S-001
kind: signal
title: Cmd+click in a terminal opened random files
status: new                # new | triaged | dismissed
priority: P2
problem: P-012             # set once triaged
created: 2026-11-09
updated: 2026-11-09
reporter: d.voronov        # who raised it: a person's handle, or claude when an agent filed it on its own
source: session-2026-11-09 # where the evidence came from: a testing round, a session, a review…
---
<description: the evidence as observed>
```

`reporter` is who raised a ticket and `source` where it came from — never a person; either is
omitted when unknown.

**Tickets** (`readBacklog`, `classifyEntry`): a Markdown file directly in the backlog folder or its
`done/` whose frontmatter carries a known `kind:` (`problem`, `epic`, `task`, `signal`). Its ID is
`id:`, else the one in its file name (`<P|E|T|S>-NNN-<slug>.md`); its title `title:`, else the file
name; its parent the kind's key (`PARENT_KEY`: `problem:` for an epic or a signal, `epic:` for a
task; a problem has none); its reporter `reporter:` and its source `source:`, each `null` when
missing or empty.

## Areas and columns

The areas are fixed data in code (`DEFAULT_AREAS`, `areas.ts`: area → kinds → columns); the Board
renders whatever mapping it is given, and the Board tab gives it this one. No setting changes them.

| Area | Kinds | Columns |
|---|---|---|
| **Signals** | `signal` | new · triaged · *dismissed* |
| **Problems** | `problem` | backlog · grooming · planned · delivering · review · reviewed · done · *dropped · parked* |
| **Solutions** | `epic`, `task` | backlog · planned · in-progress · review · reviewed · done · *dropped · parked* |

- The switcher at the top of the Board tab picks the area, with each area's count. A board opens on
  **Problems** until another area is picked (`defaultAreaId`).
- `done` is collapsed by default; *dropped*, *parked* and *dismissed* are narrow collapsed columns
  after the others (`placement: "side"`). Every column, collapsed or not, sits the same 8px from the
  next. A collapsed column shows its label and count and expands on click; an expanded one collapses
  again from its header. The open area and the columns toggled from their default are per-project
  view state ([[settings-and-state]]).
- A column appears only where the convention lets a kind be in it: `backlog` on Solutions holds
  standalone tasks; `parked` holds epics; `review` and `reviewed` hold epics and tasks — a task runs
  `(backlog →) planned → in-progress → review → reviewed → done` / `dropped` (`ColumnDef.kinds`,
  `canTake`).
- **Reviewed** (`reviewed`) sits right after Review in Problems and in Solutions, open by default:
  the Owner's hand-back. A ticket in `review` waits for the Owner; moved to `reviewed`, the Owner is
  finished with it and it is the orchestrating session's turn. It is a column like any other — a
  card is dragged in and out of it, and created in it, the same way ([[editing-drag-create]] "Drag =
  status edit").
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

- ID, title, kind badge, reporter, priority. On Solutions, epic cards are wider and tinted (task
  cards are inset); task cards carry a chip with their parent epic (`E-017`). Signal cards carry
  their linked problem as a chip (`P-012`) and their source ("from session-2026-11-09").
- **Reporter** (`Reporter.tsx`): on the meta line, right-aligned before the priority, in the meta's
  quiet type (`--fs-xs`, `--text-faint`), cut with an ellipsis before it pushes the ID. `claude`
  (`AGENT_REPORTER`) carries a small spark in `--syntax-type` before it; a ticket without
  `reporter:` shows nothing there. The card popover shows it the same way at the right of its head.
- Click or Enter opens the file in an editor tab of the board's project ([[host-api-usage]] "Editor
  tabs in their project").
- **Order inside a column** (`compareTickets`): priority (P0 first; none or unknown after P3), then
  ID (by kind letter, then number: `E-9` before `E-10`), then path.
- **Open tickets** (the chooser's counts): status not done, dropped, parked, triaged or dismissed
  (`isOpen`) — a ticket in `reviewed` is open.
