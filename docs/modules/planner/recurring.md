# Recurring — the rule, the log, done and skip

**Module:** `planner` · **UI:** recurring rows in Today, Project, Recurring and All; the repeat
editor ([[quick-add]] "Recurring — the repeat editor") · **Code:** `src/planner/model/recurring.ts`,
`src/planner/model/today.ts`, `src/planner/model/labels.ts`, `src/planner/write.ts`
(`completeRecurring`), `src/planner/Planner.tsx` (the acknowledgement) · **e2e:**
`planner-recurring-fake.spec.ts`, `pomade-planner-recurring.spec.ts` · **Unit:**
`src/planner/model/recurring.test.ts`, `src/planner/write.test.ts` · **Contract:** `pomade-kit`'s
schedule format (`pomade-kit:E-003`)

## What it does

A recurring item is one file that comes back: its `repeat:` rule says when, its `do-on` holds the
next occurrence, and a `## Log` section in its body records each done and skip. Done and skip write
the log line and move `do-on` — the item is never crossed out, and missed runs collapse into one
row. The rules live in one pure module (`recurring.ts`, the planner day as input) that the Today
module, the views and the [[today-command]] share.

```yaml
---
type: recurring
title: Upload invoices
status: open
do-on: 2026-12-05          # the next occurrence, maintained by the app
repeat:                    # pomade-kit schedule format (pomade-kit:E-003)
  monthly: { days: [5] }
  lead-days: 3
  start: 2026-01-01
created: 2026-01-01
---
Upload all invoices to the accountant's portal.

## Log
- 2026-11-02 done
- 2026-10-05 skipped
```

## The rule

`repeat` uses `pomade-kit`'s schedule format: fixed dates ("on the 5th of every month", "every
other Monday", "every 10 days from Jan 3" — every N days or weeks counted from `start`) or "N
days/weeks/months after completion", plus `lead-days`, `start`, `end`. The exact YAML is owned by
`pomade-kit:E-003`; the Planner reads it with the kit's day resolution, no times (`readRepeat`:
`parseSchedule(…, { resolution: "day" })`, `describeSchedule` for the words). A rule the kit
refuses shows the kit's own message on the row.

## The log

`## Log` holds `- <date> <word>` lines, newest first (`readLog`); the newest entry is the latest
date, the first written of a day's entries (`newestLog`). Words the app writes: `done`, `skipped`;
other words written by hand are kept and shown.

## `do-on` and where an item stands

- **`do-on` is the next occurrence.** Quick add sets it to the first one (`firstDoOn`): a fixed
  rule's first date on or after today (and `start`); after completion, `start` (today when it has
  passed), else today plus the period.
- **Derived when missing** (`nextOccurrenceOf`): a missing or unreadable `do-on` is the occurrence
  after the newest log entry, else the first on or after `start`, `created` or today (after
  completion: the newest log entry plus the period, else `start`, `created` or today).
- **Phase** (`recurringState`): `waiting` (before `do-on − lead-days`: only in the Recurring view),
  `lead` (inside the lead time: in Today, "Due in N days"), `due` (today), `missed` (`do-on` has
  passed: one row, `missed` = `do-on` plus every occurrence after it up to today), `ended`.
  `lead-days: 0` = only on the day; `lead-days` ≥ the period = always visible.
- **Ended:** `end` has passed, or there is no next occurrence (`do-on` past `end`, a `once` done).
  An ended item is out of Today, in Recurring with "Ended", its checkbox and Skip off.
- **Done by hand.** A recurring item set to `status: done` by hand is done like a task: out of
  Today, Project and Recurring, in All with "Show done".

## Done and skip

- **Done** appends `- <date> done` to the `## Log` and moves `do-on` to the next occurrence
  (`advancedDoOn`): a fixed rule to its first date after the later of `do-on` and today — a missed
  run jumps to the next future occurrence, logged once; an after-completion rule to the completion
  date plus the period (toothbrush done Nov 20 → next Feb 20). The date is the planner day.
- **Skip** ("Skip this time", a row action on hover or keyboard focus) does the same with
  `- <date> skipped`.
- `end` doesn't stop the advance: a next date past `end` is written and the item then reads as
  ended.
- **The log line** (`appendLog`): newest first — right under the `## Log` heading (and any blank
  lines under it when a list follows); a body without the section gets it at its end, after one
  blank line. Every other byte stays; the body's line endings are kept.

## One action, two writes, log first

`completeRecurring(host, task, word, day)`:

1. reads the file's text, then writes the body with the new log line (`setBody`), conditional on the
   mtime the view read — refused, nothing written, when the file changed since;
2. writes `do-on` (field-only `setField`; `removeField` when the rule has no further date, a
   `once`).

When the `do-on` write fails, the file's text from before is written back (`files.write`) and the
view says "Not saved"; only when that fails too does it say the log line is in and which `do-on` to
set by hand. So an item is never advanced
without its log line, and never silently logged without advancing. A rule the kit refuses turns
done and skip off ("fix the repeat rule first").

## The row

A round checkbox, never crossed out: ticking it shows "Done…", then where the item went ("Done ·
next Jan 5, 2027", "Done · ended"; "Skipped…", "Skipped · next …" for a skip) for 1.6 s (`ACK_MS`),
in its place — then the views show the
file as it is (out of Today, or still there with its next lead time). Outside Today the row shows
where it stands, its rule in words, its next date and its newest log entry ("done Nov 2")
(`recurringHints`).

## Edited by hand

`repeat:` edited by hand re-computes the item on the next read (the watch, within ~1 s). A rule the
kit refuses keeps `do-on` (due on and after it, never in a lead time) and shows the kit's error on
the row; done and skip are off until it is fixed. A rule changed in the compact view moves `do-on`
too ([[item-in-place]] "Saving, no button").
