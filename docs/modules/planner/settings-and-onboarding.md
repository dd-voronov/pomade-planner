---
doc: docs/modules/planner/settings-and-onboarding.md
audience: engineers, product
holds: the first-run choice of the tasks root and the settings page: tasks folder, day boundary, daily-note template
kind: reference
---

# Settings and onboarding — the tasks root, the day boundary, the template

**Module:** `planner` · **UI:** the onboarding card (panel and tab, until a tasks root is set); the
Planner tab's settings page (route `settings`) · **Code:** `src/planner/Planner.tsx`
(`chooseTasksRoot`, onboarding), `src/planner/SettingsPage.tsx`, `src/planner/PlannerTab.tsx`,
`src/planner/model/settings.ts`, `src/planner/write.ts` (`saveSettings`, `readTemplate`) · **e2e:**
`planner-fake.spec.ts`, `planner-notes-fake.spec.ts`, `pomade-planner.spec.ts`,
`pomade-planner-template.spec.ts` · **Unit:** `src/planner/model/settings.test.ts` · **Contract:**
`../Pomade/docs/HOST-API.md` §4 `files.pickFolder`, `files.pickFile`

## What it does

The Planner asks one thing before it works — where the tasks live — and keeps three settings in its
synced settings file ([[settings-and-state]]): the tasks root, the day boundary and the daily-note
template. Each is edited on one page in the Planner tab.

## Onboarding

Until `tasksRoot` is set, the panel and the tab show "Where should your tasks live?" with **Choose
folder…**: Pomade's folder dialog over the whole workspace (`files.pickFolder`), the Knowledge vault
included. A pick is saved at once and the views load; Cancel changes nothing. There is no silent
default. A problem with the settings file shows under the button.

## The settings page

In the Planner tab at route `settings`: the tab's gear, or the panel's ⋯ → "Settings…" (which opens
the tab there). Closing it (its back button) takes the tab back to route `planner`, so ⋯ → Settings…
reaches it again.

- **Tasks folder:** the current root and **Change…** (the same folder dialog). Changing the root
  re-points the app; no files move.
- **Day starts at:** the boundary, `H:MM` ([[days-and-today]]); a value that isn't a time is refused
  under the field.
- **Daily note template:** a workspace-relative path to a `.md` file (`normalizeTemplatePath`),
  checked to be a readable file when saved (`readTemplate`); typed, or picked with **Choose…** —
  Pomade's file dialog (`files.pickFile`) over the whole workspace, `.md` files only, opening at the
  workspace root: a template beside other templates outside the tasks folder is one click. A pick
  fills the field and saves, Cancel changes nothing, a picker that fails says so under the field. **Clear**
  (and an emptied field) returns to the built-in note. When the saved template can't be used, the
  page says why ([[daily-notes]] "Template").
- Each change saves at once and says so ("Daily note template saved."); a settings write changes only
  the keys it names ([[settings-and-state]] "Synced settings file").
