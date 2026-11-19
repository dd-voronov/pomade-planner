# "Needs you" — what waits on the user, in the side panel

**Module:** `board` · **UI:** the side panel of the Board strip icon · **Code:**
`src/board/NeedsYouPanel.tsx`, `src/board/NeedsYouWorkspace.tsx`, `src/board/NeedsYouGroups.tsx`,
`src/board/model/needs-you.ts`, `src/board/useBoardData.ts` · **e2e:** `board-manage-fake.spec.ts`,
`board-needs-you-fake.spec.ts`, `pomade-board-manage.spec.ts`, `pomade-board-needs-you.spec.ts`,
`pomade-project-removed.spec.ts` · **Unit:** `src/board/model/needs-you.test.ts` · **Contract:**
`../Pomade/docs/HOST-API.md` §1 `strip` (`action: "both"`, `panelRoute`)

## What it does

The Board icon opens the board in a tab **and** fills the side panel with "Needs you": the tickets
waiting on the user's review and the signals not yet triaged — for the active project, or across the
workspace at Workspace. It is live, so it doubles as an inbox.

## Inside a project

`needsYou(tickets)`: tickets in `review` (any kind: a problem, an epic or a task) and signals in `new`, as two groups ("In review",
"New signals"), each ordered by priority then ID (`compareTickets`); a group with nothing is left
out, and with nothing at all the panel says "Nothing needs you". A project without a backlog folder
says so ("No backlog found"). A row shows kind badge, ID, priority and title; a click opens the
ticket in an editor tab of its project. The panel follows the active project and updates within ~1 s
of any file change ([[file-model]] "Live from disk").

## At Workspace

`NeedsYouWorkspace`, three levels (`Level`):

- **The list** — where it opens. **All projects** first, with the total, then every project with
  something waiting, in sidebar order with its group; each row carries its counts in the chooser's
  words ("2 in review · 1 new signal", `needsYouParts`; [[backlog-location]] "At Workspace: the project chooser").
  Projects with nothing waiting or without a backlog are left out (`waitingProjects`); with nothing
  anywhere the panel says "Nothing needs you" and shows no row.
- **A project** — a click on its row: that project's two groups, as the panel shows them inside the
  project. A project that empties while open says "Nothing needs you".
- **All projects** — every project's groups as one list, one section per project in list order.

An opened level starts with a **back row** naming it (the project, or "All projects"); it stays in
view while the level scrolls, and a click returns to the list, with the keyboard on the row that was
open. Every level is live like the panel inside a project. A ticket opened from here opens in its
project, so Pomade switches to that project and the panel becomes that project's.

The opened level is not stored: the panel is on the list each time Pomade comes to Workspace, and it
falls back to the list when the opened project leaves the workspace (`shownLevel`).
