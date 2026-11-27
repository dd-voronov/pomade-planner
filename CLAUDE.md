# pomade-planner — instructions for agents

`pomade-planner` builds two Pomade apps, each installed and removed on its own: **Planner** (to-dos, recurring tasks, daily notes, notes and thoughts) and **Board** (kanban over each project's backlog). The platform is the sibling repo `../Pomade`. Personal working rules come from the workspace `CLAUDE.md`, loaded automatically.

**Every session, before anything else, read:**

1. `../Pomade/private/WORKING-AGREEMENT.md` — how the Pomade family works, and which doc to read for
   which task. Read nothing else up front; it tells you what the task at hand needs.
2. `private/WORKING-AGREEMENT.md` — this repo's own part of it: what to read here for which task, and
   its local rules.
3. `private/SESSION-HANDOFF.md` — work left hanging by this repo's last session (often empty).

**A worker** — a sub-agent briefed by an orchestrating session — skips all three: read only what your
brief names.
