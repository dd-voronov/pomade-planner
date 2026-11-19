# Planner and Board — user guide

Two Pomade apps, each installed and removed on its own; neither needs the other.

- **Planner** — to-dos, recurring tasks, daily notes, notes and thoughts. Every item is one Markdown
  file with frontmatter in a tasks folder you choose. It lives in Pomade's side panel (Planner icon)
  and in a full tab, with four views — Today, Project, Recurring, All — following the active Pomade
  project. ⌘⇧A adds an item from anywhere in Pomade. The Planner icon carries a badge of what is
  overdue or due today, a notification sums up the day at Pomade's start, and a daily note is made
  for each day Pomade runs. `pomade-planner today` prints Today in a terminal.
- **Board** — a kanban over a project's backlog folder (`docs/roadmap/` by default): one ticket per
  Markdown file, in three areas — Signals, Problems, Solutions. Dragging a card changes its
  `status:`; **+** on a column creates a ticket with the next free ID; right-click sets priority
  and parent. The Board icon also opens "Needs you": tickets in review and new signals.

Both apps treat the file on disk as the truth: edits made anywhere (Pomade's editor, Obsidian, git,
an agent) show within about a second, and the apps write only the frontmatter keys they change.

## Pages

- [Getting started](getting-started.md) — how the apps get into Pomade (bundled with a Pomade
  release, or `npm run install-app` for a dev build), removing them, and the first run: choosing the
  tasks folder and a project's backlog folder.
- [Planner](planner.md) — item types, the four views, panel vs tab, adding (quick add and in place),
  the item's compact view, recurring rules, daily notes and the template, pins, projects and
  mix-ins, select mode, the badge and morning summary, and the `pomade-planner today` command.
- [Board](board.md) — where the backlog is, areas and columns, dragging, the card popover, creating
  tickets and how IDs are picked, triaging signals, the "Needs you" panel and the Workspace project
  list.
- [Keyboard and mouse](shortcuts.md) — every shortcut and mouse modifier of both apps, grouped by
  where it works.
- [Settings and data](settings.md) — every setting, where it is changed and stored, and where each
  app keeps its data and machine-local state.
- [Files and format](files-and-format.md) — what to write by hand: frontmatter per item type, the
  `repeat:` rule syntax, the `## Log`, ticket frontmatter; what the apps write and never touch; what
  happens when a file changed on disk.
- [Troubleshooting and limits](troubleshooting.md) — messages you may see, what they mean and what
  to do, and what the apps deliberately don't do.
