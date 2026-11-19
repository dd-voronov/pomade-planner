# Daily notes — one note per planner day, from a template

**Module:** `planner` · **UI:** the daily note's card on the Workspace Today, All with "Daily
notes", the Daily type of quick add, the template setting · **Code:** `src/planner/model/daily.ts`,
`src/planner/model/body.ts`, `src/planner/usePlannerState.ts` (`useDailyNoteCreation`),
`src/planner/write.ts` (`createDailyNote`, `readTemplate`), `src/planner/DailyCard.tsx`,
`src/planner/SettingsPage.tsx` · **e2e:** `planner-notes-fake.spec.ts`,
`pomade-planner-daily.spec.ts`, `pomade-planner-template.spec.ts` · **Unit:**
`src/planner/model/daily.test.ts`, `src/planner/model/body.test.ts` · **Contract:**
`../Pomade/docs/HOST-API.md` §1 `startOnLaunch`, §4 `files.pickFile`

## What it does

Each planner day gets one structured note, `Daily/<YYYY-MM-DD>.md` in the tasks root, made from the
user's template the first time the Planner runs that day — before the Planner is ever opened — and
pinned on the Workspace Today with its checklist progress. A daily note is one item, not many tasks.

## When

The first time the Planner runs on a new planner day (after the boundary, [[days-and-today]]) — at
Pomade's start, or when the boundary passes while Pomade is open — **only if** that day's file
doesn't exist.

- **Only the launch panel frame makes it** (`useDailyNoteCreation`, enabled on the panel surface):
  Pomade loads that frame hidden at launch (`startOnLaunch`) and it is the very frame the Planner
  icon later shows, so the note is there before the Planner is ever opened. The Planner tab and the
  quick-add overlay never make one by themselves.
- **Once a day** (`shouldCreateDailyNote`): the day it last ran on is machine-local app state
  (`planner.dailyNoteDay`, `DAILY_DAY_KEY`). A later start that day or a relaunch makes nothing, a
  note deleted that day stays deleted, and a day before the recorded one (a boundary moved later)
  gets none. A slower frame never moves the record back; without a readable record nothing is
  made.
- No file for days Pomade didn't run; never back-filled.
- The Host API's file create is still the guard: a taken path is the note already there
  (`createDailyNote` → `exists`). A made note is read at once, without waiting for the watch.

## Template

The md file set in settings ("Daily note template", `dailyNoteTemplate`, a workspace-relative path;
[[settings-and-onboarding]] "The settings page").

`dailyNoteText(day, template)`:

- The note is the template with `type: daily-note` and `date:` first in its frontmatter, then the
  template's other keys with their bytes and order (its own `type` / `date` give way), then its
  body as it is. A template without frontmatter gets the app's block over its text.
- Until one is set, and whenever it is missing or its frontmatter can't be read, the built-in note
  (`builtInDailyNote`) — `# Tuesday, November 10, 2026`, a blank line, `- [ ]` — and the settings
  page says why; a day never fails.
- Nothing else is written into the tasks root.

## Progress

"5/8" (`checkboxProgress`, `body.ts`): the GFM task items of the body — list items (`-`, `+`, `*`,
`1.`, `1)`; nested, in block quotes too) starting `[ ]`, `[x]` or `[X]` and some text; lines in
fenced code don't count. Shown in the accent once every line is ticked.

## Pinned on the Workspace Today

A card above the list (`DailyCard`): title, "Daily note" and its date when it has a title of its
own, the progress as text and a bar. A click opens it as a row's does ([[item-in-place]]; with ⌘ or
Ctrl, the editor tab); its pin unpins it for that planner day only (`planner.dailyNoteUnpinned`,
`dailyNotePinned`).

## Elsewhere

- Workspace-level only (`Daily/` is no project's).
- All lists every daily note, newest first (by `date:`, else the file name; `compareDailyNotes`),
  when its type filter has "Daily notes" ([[views]] "The views").
- A daily note without a `title:` reads as its date ("Tue, Nov 10").
- Yesterday's note never rolls over; its unticked lines stay as they were.
- Quick add's **Daily** type opens today's note in an editor tab, making it first when it isn't
  there ([[quick-add]] "Fields"). The [[today-command]] names the day's note when its file exists.
