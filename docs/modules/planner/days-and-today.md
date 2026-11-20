---
doc: docs/modules/planner/days-and-today.md
audience: engineers, product
holds: the planner day and its 03:00 boundary across sleep and DST, the pure Today module (what is in Today and why), ticking, and the order of every list
kind: reference
---

# Days and Today — the planner day, the Today module, list order

**Module:** `planner` · **UI:** the Today view; every list's order · **Code:**
`src/planner/model/today.ts`, `src/planner/clock.ts`, `src/planner/model/labels.ts`,
`src/planner/model/tick.ts` · **e2e:** `planner-fake.spec.ts`, `pomade-planner.spec.ts` ·
**Unit:** `src/planner/model/today.test.ts` (Europe/Madrid, across DST),
`src/planner/model/labels.test.ts`

## What it does

The Planner's day is not the calendar's: it runs from a boundary (03:00 by default) to the next, so
late work still lands on the evening it belongs to. One pure **Today module** decides, from "now"
and the boundary, which items are in Today and why, and in what order every list runs. The views
([[views]]), the badge and morning summary ([[attention]]) and the [[today-command]] all call it, so
they always agree.

## The planner day

- **Day boundary: 03:00**, configurable (`dayBoundary`, [[settings-and-state]]). A day runs from
  boundary to boundary (`plannerDay`, `pomade-kit`'s `currentDay` — the day date phrases count
  from). At 01:30 the planner still shows the previous day.
- It governs when ticked items disappear, rollover, when a recurring item is due, and when a daily
  note is created ([[daily-notes]]).
- **Overnight** (`usePlannerDay`, `clock.ts`): while Pomade stays open, a timer set for the next
  boundary (`nextDayStart`) moves the views to the new day, backed by a check every minute, on the
  frame becoming visible and on focus (a Mac that slept runs timers late). Around a DST change the
  day starts at the first instant whose planner day is the next one: a boundary a spring-forward
  skips starts the day when the clock jumps past it; one a fall-back repeats starts it on the first
  pass only.
- "Now" is the Mac's clock, shifted by the `test.clock` hook in specs ([[settings-and-state]]
  "Test hook").

## Two optional dates

`do-on` = the day I plan to do it ("add to Today" sets it). `deadline` = the day it is due.

## What Today contains

Tasks and recurring items only — never notes, thoughts, daily notes, nor anything archived
(`isScheduled`). `todayRows(tasks, day)`:

- overdue items (deadline before today);
- items with deadline today;
- open items with `do-on` today or earlier — unfinished ones **roll over**, labelled "planned N days
  ago";
- recurring items that are due, or inside their lead time ("Due in 5 days") ([[recurring]]);
- missed recurring occurrences don't stack: one item, labelled "Missed 2×" (`do-on` and every
  occurrence after it up to today); a single missed one reads "Overdue" with its date.

**Reason** — each Today row carries the first that applies (`reasonOn`): `overdue`, `due-today`,
`planned` (`do-on` today), `rolled-over` (`do-on` earlier, with `plannedDaysAgo`). A recurring
item's reason comes from its schedule alone, never its `deadline`: `lead-time` before `do-on`,
`recurring-due` on and after it.

## Ticking

Ticking sets `status: done` and `done-on` (field-only, [[storage-and-item-types]] "Writing an
item"); the file stays where it is. The item stays crossed out, with the reason it had, until the
next day boundary (`isVisibleOn`: open, or `done-on` = the planner day) — undo by unticking — then
leaves Today and Project. A recurring item is never crossed out: done advances it
([[recurring]] "The row").

## Order inside every list

`compareTasks`: deadline → `do-on` → `importance` (highest first) → `created`; an unset value sorts
after every set one; then title and path, so the order never depends on the read.

## Row hints

`labels.ts` turns a row into its hints, relative to the planner day: Today's reason ("Overdue",
"Due today", "planned N days ago", "Due in 3 days", "Missed 2×"), the deadline when it isn't the
reason, a recurring item's rule; dates as "today", "tomorrow", a weekday within six days, "Nov 20",
"Nov 20, 2027"; Today's header as "Tue, Nov 17" (`dayHeading`); importance as `!3`.
