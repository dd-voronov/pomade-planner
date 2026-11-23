---
doc: docs/modules/core/tooltips-and-popovers.md
audience: engineers, product
holds: the one tooltip layer per frame (`data-tip`, 350 ms, kept inside the frame) and the anchored popover both apps use
kind: reference
---

# Tooltips and popovers — placed inside the frame

**Module:** `core` · **UI:** every icon-only control of both apps; the Board's create form, card
popover and triage picker; the Planner's mix-in picker and All's filter menus · **Code:** `src/core/Tips.tsx`, `src/core/tips.css`,
`src/core/Popover.tsx`, `src/core/place.ts` · **e2e:** `tips-fake.spec.ts`, `pomade-tips.spec.ts`,
`board-manage-fake.spec.ts` · **Unit:** `src/core/place.test.ts`

## What it does

An app frame is often narrow (the side panel goes down to 160px) and a tooltip or popover cannot
leave its iframe, so both apps draw their own, always inside the frame and styled as Pomade's.

## Tooltips

Every icon-only button of either app (the Planner's and the Board's headers, rows, cards, columns,
toasts), a row's actions, and a view shown as its glyph carry a tip: the name, with the shortcut
where there is one ("New task (⌘⇧A)").

- **One layer per frame.** `Tips` is mounted once beside the app (`mountApp`) and reads a
  control's `data-tip`. A control whose name is on screen (`data-tip-label` inside it, wider than
  1px — a view tab still showing its word) shows no tip.
- **Timing.** The tip shows after the pointer rests on the control for 350 ms (`TIP_DELAY_MS`) — at
  once when a tip is already showing — and at once on keyboard focus. A press, Escape, the pointer
  or the focus leaving, and the control going away or scrolling out of the frame hide it.
- **Placement** (`placeTip`): centred under the control, slid off the frame's left and right edges
  (8px margin), above the control when there is no room below — on neither side, the side with more
  room — in whole pixels; it wraps inside the frame's width and follows its control through a
  scroll.
- **Accessibility.** A tip that says more than the control's accessible name is its description
  while it shows.

## Popovers

`Popover` is a small dialog anchored to an element's rect or a point (a right-click): a transparent
scrim that closes it on a click outside, Tab kept inside, Escape closing it from anywhere in the
frame, and focus returned where it came from (`restoreFocus`). `placePopover(anchor, size, frame)`
puts it below its anchor when it fits, else above, else on the side with more room with its height
capped (it scrolls inside); aligned to the anchor's start or end, shifted left at the right edge,
narrower than a narrow frame. `role` is "dialog" or "menu". The Board's create form, card popover and triage picker and the
Planner's row menu use it
([[editing-drag-create]]), and so do the Planner's "+ Project" mix-in picker and All's filter
menus (`ViewBars.tsx`, [[views]]).
