---
doc: docs/user-guide/getting-started.md
audience: users
holds: how the apps get into Pomade, removing them, and the first run — the tasks folder and a project's backlog folder
kind: reference
---

# Getting started

[← User guide](index.md)

## Install

**From a Pomade release.** The stable Pomade carries both apps. At start it installs them when
absent and updates them when its build is newer, then posts one notice ("An app installed with
Pomade", "Installed: Planner 0.2.1"). An app you removed is not put back by the same Pomade build;
a later release with a newer app build installs it again.

**A dev build** (from this repository, into the dev Pomade):

```sh
npm install
npm run install-app              # build, then install both apps
npm run install-app -- planner   # the Planner only
npm run install-app -- board     # the Board only
```

The script uses `$POMADE_BIN` when set, else `pomade` on `PATH`, else `bin/pomade` of the Pomade
checkout beside this repository (`$POMADE_DIR` overrides where that is). It installs into the dev
Pomade, never the stable one (`POMADE_USER_DATA` overrides the target). Running it again updates the
apps in a running Pomade; no restart. Needs Node 22.18 or later.

**Remove** an app on its own: `pomade apps remove pomade-planner`, `pomade apps remove pomade-board`.

After an install the left icon strip shows **Planner** (a checklist) and **Board** (three columns),
and Pomade's new-tab menu lists both.

## The `pomade-planner` command on PATH

The Planner's install links `pomade-planner` into Pomade's command folder (`~/.pomade/bin`, or
`~/.pomade-dev/bin` for the dev Pomade) the next time Pomade runs. Pomade's own terminals have it
on `PATH`. For any other shell, add the PATH line from **Pomade ▸ Settings ▸ General ▸ Commands**.
See [Planner › The `pomade-planner today` command](planner.md#the-pomade-planner-today-command).

## First run — Planner

Click the Planner icon (or open a Planner tab from the new-tab menu). It asks **"Where should your
tasks live?"** — click **Choose folder…** and pick any folder in the workspace (the Knowledge vault
works too). Nothing is written there until you add something, apart from each day's daily note
in its `Daily/` folder. There is no default folder; until one is chosen, ⌘⇧A shows "Choose a tasks folder first"
with **Open the Planner**.

The choice is stored in the workspace (`Apps/pomade-planner/settings.json`), so it syncs with the
workspace. Change it later in the Planner's [settings](settings.md#planner); no files move.

## First run — Board

Open a project and click the Board icon: a Board tab opens on the project's backlog, and the side
panel shows "Needs you". The Board looks in `docs/roadmap/` under the project's root. When that
folder isn't there it says **"No backlog found"** with **Choose backlog folder** — pick the folder
inside the project that holds the tickets. The choice is kept per project, relative to its root.

At Workspace (no active project) the Board tab lists every project that has a backlog; click one to
open its board.

## Next

- [Planner](planner.md)
- [Board](board.md)
- [Keyboard and mouse](shortcuts.md)
