---
doc: docs/modules/core/tooltips-and-popovers.md
audience: engineers, product
holds: the one tooltip layer per frame (`data-tip`, 350 ms, `data-tip-slow` 1 s, kept inside the frame) and the anchored popover both apps use, with what closes it
kind: reference
---

# Tooltips and popovers — placed inside the frame

**Module:** `core` · **UI:** every icon-only control of both apps; the Board's create form, card
popover, triage picker and reporter form; the Planner's row menu, mix-in picker and All's filter
menus · **Code:** `src/core/Tips.tsx`, `src/core/tips.css`,
`src/core/Popover.tsx`, `src/core/place.ts` · **e2e:** `tips-fake.spec.ts`, `pomade-tips.spec.ts`,
`board-manage-fake.spec.ts` · **Unit:** `src/core/place.test.ts`

## What it does

An app frame is often narrow (the side panel goes down to 160px) and a tooltip or popover cannot
leave its iframe, so both apps draw their own, always inside the frame and styled as Pomade's.

## Tooltips

Every icon-only button of either app (the Planner's and the Board's headers, rows, cards, columns,
toasts), a row's actions, and a view shown as its glyph carry a tip: the name, with the shortcut
where there is one ("New task (⌘⇧A)"). So does every other Planner control that explains itself
— the add form's and the compact view's Details, the project field, the type switch's options, a
locked tick's reason, the repeat editor's fields, Project's chips ("Due today", "+ Add from…", a mixed-in source) and the select bar — and the
Planner's controls keep no `title` attribute: the system's grey tooltip stays only on text that
is cut short (a long title, a path, a rule in words). A row's title says what a click and a
⌘-click do ([[views]] "Rows").

- **One layer per frame.** `Tips` is mounted once beside the app (`mountApp`) and reads a
  control's `data-tip`. A control whose name is on screen (`data-tip-label` inside it, wider than
  1px — a view tab still showing its word) shows no tip.
- **Timing.** The tip shows after the pointer rests on the control for 350 ms (`TIP_DELAY_MS`) — at
  once when a tip is already showing — and at once on keyboard focus. A press, Escape, the pointer
  or the focus leaving, the window losing the focus, and the control going away or scrolling out of
  the frame hide it. A press
  puts the tip of the control pressed away until the pointer comes to another control. A focus
  that follows a press (a click into a text field) shows nothing, so a tip never covers the text
  being typed; Tab or any key makes focus show tips again. A control marked `data-tip-slow` (a
  row's title, the daily-note card's) always waits `SLOW_TIP_DELAY_MS`, 1 s, on hover and on focus
  alike, whether or not another tip is showing; a row's title carries no tip while its menu is open.
- **Labels.** A tip may sit on a `label` (a radio option, a tick): hover anywhere on it shows it,
  keyboard focus on the input inside it shows it, and the description attaches to that input.
- **Placement** (`placeTip`): centred under the control, slid off the frame's left and right edges
  (8px margin), above the control when there is no room below — on neither side, the side with more
  room — in whole pixels; it wraps inside the frame's width and follows its control through a
  scroll.
- **Accessibility.** A tip that says more than the control's accessible name is its description
  while it shows (the input's, when the tip is on its label).

## Popovers

`Popover` is a small dialog anchored to an element's rect or a point (a right-click). It closes on
a click or right-click on its transparent scrim, on Escape from anywhere in the frame, and when the
frame loses the focus (the window's `blur`: a click in another frame, the editor or another app
never reaches the scrim). Tab stays inside it. Focus returns where it came from (`restoreFocus`)
on every close but the `blur` one, which leaves the focus where the user sent it. It focuses the
element marked `data-autofocus`, else the first focusable one.

`placePopover(anchor, size, frame)` puts it below its anchor when it fits, else above, else on the
side with more room with its height capped (it scrolls inside); aligned to the anchor's start or
end, shifted left at the right edge, narrower than a narrow frame. `role` is "dialog" or "menu".

Users: the Board's create form, card popover, triage picker and reporter form
([[editing-drag-create]]); the Planner's row menu, "+ Add from…" mix-in picker and All's filter
menus (`ViewBars.tsx`, [[views]]). The Board tab's ⋯ menu is not one: it has its own scrim and Escape
handling and does not close with the window's `blur`.
