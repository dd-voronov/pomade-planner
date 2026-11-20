---
doc: docs/modules/planner/attention.md
audience: engineers, product
holds: the Planner icon's badge (overdue + due today) and the once-a-day morning summary, both run by the hidden launch frame; the summary's click to the Workspace Today
kind: reference
---

# Attention — the Planner icon's badge and the morning summary

**Module:** `planner` · **UI:** the badge on the Planner strip icon; one macOS notification per
morning · **Code:** `src/planner/model/attention.ts`, `src/planner/useAttention.ts`,
`src/planner/Planner.tsx` (the launch frame), `src/planner/PlannerTab.tsx` (route `today`) ·
**e2e:** `planner-attention-fake.spec.ts`, `pomade-planner-attention.spec.ts` · **Unit:**
`src/planner/model/attention.test.ts` · **Contract:** `../Pomade/docs/HOST-API.md` §1
`startOnLaunch`, §4 `strip.setBadge`, `notices` (`openApp`), `pomade.ready`

## What it does

The Planner reaches the user without being opened: a count on its strip icon of what is due, and one
summary notification when Pomade starts on a new planner day. Dates only — no times, no alarms;
nothing while Pomade is closed.

## Who runs it

The Planner's launch panel frame — loaded hidden at Pomade's launch (`startOnLaunch`), the same frame
the Planner icon shows — runs both (`useAttention`, enabled on the panel surface), from the
workspace-wide Today module, whatever the active context. No other frame sets the badge or posts.

## What is due

`attentionOf(tasks, day)`: the open Today rows of the whole workspace ([[days-and-today]]), in three
kinds:

- **overdue** — a task's deadline before today; a recurring item's missed run (one item however many
  runs it missed);
- **due today** — a task's deadline today; a recurring item due today;
- **soon** — a recurring item inside its lead time.

A task only planned for today (`do-on`, no deadline) or rolled over is not due; a ticked one is out.

## Badge

`badgeOf`: overdue + due today (soon items don't count); red (`urgent`) when anything is overdue;
cleared at zero. It follows the files within ~1 s (the watch, a tick in any frame) and the day
boundary (the same timer as the views), from Pomade's launch on. The frame sets it only when the
count or colour changes, and clears it when it goes away.

## Morning summary

On `pomade.ready` (Pomade's start; sticky, so the frame hears it however late it subscribes), when the
planner day is after the last summary day (`planner.summaryDay`, `shouldSummarize`) and anything is
due — soon included — one notification (`summaryOf`):

- **Title:** the counts, then the soon items by name, up to 3 then "+N more" — "2 due today, 1
  overdue, Tax report due in 3 days" ("due tomorrow" at one day). Cut at 200 characters.
- **Body:** the overdue then the due-today items by name, in Today's order, 3 in all then "+N more" —
  "Overdue: Pay the tax · Due today: Buy printer ink, Upload invoices"; a recurring item that missed
  several runs reads "Bins (missed 3×)". A name is cut at 40 characters.
- The day is recorded once the notification is posted, and at once when nothing is due — a task added
  later that day never makes a late "morning" summary; a failed post is tried again at the next
  start. A start before the boundary (01:30) is still yesterday. The boundary passing while Pomade
  stays open posts nothing; the next start does.

## Click

The notice's action is `openApp` at route `today` in the Workspace: the Planner tab, Today selected.
A notification's action can open only the app's tab, not its panel, so the click lands on the tab.
The tab selects Today once the Workspace is active, and picking another view there takes the tab
back to route `planner`, so the next click selects Today again (`PlannerTab`).
