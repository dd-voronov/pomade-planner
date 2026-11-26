---
doc: docs/user-guide/shortcuts.md
audience: users
holds: every shortcut and mouse modifier of both apps, grouped by where it works
kind: reference
---

# Keyboard and mouse

[← User guide](index.md)

Every shortcut and mouse modifier of the Planner and the Board, grouped by where it works.

## Anywhere in Pomade

| Key | Does |
|---|---|
| ⌘⇧A | Quick add — the Planner's add form over the current tab, even if the Planner was never opened |

## Both apps

| Key / mouse | Does |
|---|---|
| rest the pointer 350 ms on an icon button or a field that explains itself (a date field, the project field), or focus it | shows its tooltip (at once when another tip is already showing) |
| rest the pointer 1 s on a Planner row's title, the daily note's card, a Board card, a row's box in select mode, or a group heading — or focus it | shows what a click, a drag, a key or a right-click there does: the **slow tips** (below) |
| Esc, a press, the pointer or focus leaving | hides the tooltip |
| Tab / ⇧Tab inside a popover or form | stays inside it |
| Esc in a popover or menu | closes it; focus returns to what opened it |
| click outside a popover | closes it |
| another frame, the editor or another app taking the focus | closes an open popover (the row menu, filters, pickers, the Board's card popover); the focus stays where you sent it |

### Slow tips

| On | Says |
|---|---|
| a Planner row's title or the daily note's card, in the panel | Click: open in the Planner tab · ⌘-click: open the file in the editor · Right-click or Shift+F10: more actions |
| the same, in the tab | Click: open here · ⌘-click: open the file in the editor · Right-click or Shift+F10: more actions |
| a row's box in select mode | ⇧-click or ⇧Space: select the range from the last one · ↑ ↓: the next row |
| a Board card | Click: open the file · Drag, or Space then ← →: change the status · Right-click or Shift+F10: priority and parent |
| a group heading | Fold (←) / Unfold (→) |

A row's title shows no slow tip while its menu is open or in select mode; no Board card shows one
while a card is lifted.

## Planner — lists

| Key / mouse | Does |
|---|---|
| click a row's title, or Enter on it | **tab:** opens the item's compact view beside the list. **panel:** opens the Planner tab with it |
| ⌘-click (or Ctrl-click) a row's title | opens the file in Pomade's editor |
| click / ⌘-click / right-click the daily note's card | same as a row |
| hover or focus a row | shows its actions: Pin, Skip, Archive, Resolve/Reopen, Restore |
| click a row's checkbox | tick / untick a task; done for a recurring item |
| click a view tab | switches view |
| click a group heading, or Enter / Space on it | folds or unfolds the group; its count stays |
| ← / → on a focused group heading | folds / unfolds it |
| Esc in the panel's ⋯ menu | closes it, focus back on ⋯ |

### Row menu

| Key / mouse | Does |
|---|---|
| right-click a row or the daily note's card, Shift+F10 (or the context-menu key) on a focused one | opens the row menu |
| ↑ ↓ | move between the items (Home, End jump) |
| Enter | picks the item |
| **Select…** | starts select mode with the row selected |
| Esc | closes the menu; the row keeps the focus |

## Add form

In the floating quick-add form and in place in the Planner tab.

| Key | Does |
|---|---|
| Enter | adds the item — from any field but Details |
| ⌘↵ (or Ctrl+↵) | adds the item — from any field, Details included |
| ⇧⌘↵ | adds and opens it: in the tab its compact view; from the floating form its file in an editor tab |
| Enter with type **Daily** | opens today's daily note in an editor tab (makes it first) |
| ⌥Tab / ⌥⇧Tab | next / previous type: Task → Recurring → Note → Thought → Daily → round; focus and caret stay |
| ← → on the type switch | pick the type |
| Tab / ⇧Tab | next / previous field; never leaves the form |
| Enter in Details | new line |
| ↓, Space, or typing a letter on **Project** | opens the project picker (typed letters become the search) |
| Esc | closes the form; focus returns to what opened it |

### Date and repeat fields

**Do on** and **Deadline** (in the form and in the compact view), and a recurring item's **Start**
and **End**, take a date or a phrase; their tooltip says "A date or a phrase: today, fri, +3d,
nov 20". What the text comes to shows on the label's line, or why it isn't a date.

| Typed | Means |
|---|---|
| `today`, `tomorrow`, `yesterday`, `tonight` | the planner day and its neighbours |
| `fri`, `friday` | the next such weekday (1–7 days ahead) |
| `nov 20`, `20 nov`, `nov 20 2027`, `2026-11-20` | that date; without a year, the next one |
| `+3d`, `+2w`, `+1mo`, `in 3 days` | counted from the planner day |

A recurring item's **on** field takes weekdays (`mon`, `mon, thu`) for weeks, and days of the month
(`5`, `1, 15`, `last`, `first mon`) for months; its tooltip says which.

### Project picker

Also the **+ Add from…** mix-in picker.

| Key | Does |
|---|---|
| typing | filters; every word must match, case and accents ignored |
| ↑ ↓ | highlight |
| Enter | picks the project, or opens the group |
| → (caret at the end, on a group) | opens the group |
| ← (caret at the start, in a group) | back to the groups |
| Backspace in an empty field, or a click on the group chip (**‹ Life**; its tooltip: "Back to groups (⌫)") | back to the groups |
| Esc | closes the picker, keeps the project |

## Compact view (Planner tab)

| Key / mouse | Does |
|---|---|
| Enter in a field | saves that field |
| leaving a field | saves it |
| choosing in a select | saves it |
| typing in Details | saves 600 ms after typing stops, and when you leave it |
| Esc (focus in the view), × or the back arrow | closes it; everything typed is saved; focus returns to the row |
| **Open in tab** | opens the file in Pomade's editor |

## Select mode

| Key / mouse | Does |
|---|---|
| click a row | select / unselect |
| ⇧-click a row (its body or its box) | selects the range from the last row toggled |
| Space on a row's box | select / unselect |
| ⇧Space on a row's box | selects the range |
| ↑ ↓ on a row's box | move between rows' boxes |
| rest the pointer 1 s on a row's box, or focus it | its tooltip: "⇧-click or ⇧Space: select the range from the last one · ↑ ↓: the next row" |
| ⌘A (or Ctrl+A) | selects every row the view shows (All: what the filters show; none of a folded group's) |
| Delete or Backspace | **Delete N…** — asks first (with something selected) |
| Esc | leaves select mode |

### Delete confirmation

| Key | Does |
|---|---|
| Enter | Cancel (it has the focus) |
| Tab / ⇧Tab | cycle inside the dialog |
| Esc, click outside | cancel |

## Planner — settings page

| Key | Does |
|---|---|
| Enter or leaving the field | saves **Day starts at** / **Daily note template** |

## Board — settings page

| Key | Does |
|---|---|
| Enter or leaving the field | saves **Default for this workspace** / **Reporter** |
| typing in **Add a project…** | filters the projects by name or group |
| ↑ / ↓, Enter | highlight a project, pick it (the folder dialog opens next) |
| Esc, **Cancel**, click outside | closes the project list, focus back on **Add a project…** |

## Board — cards

| Key / mouse | Does |
|---|---|
| click a card, or Enter on a focused card | opens its file in an editor tab |
| drag a card | changes its status (and moves epics and tasks into or out of `done/`) |
| Space on a focused card | lifts it |
| ← → while lifted | move it one column |
| Space or Enter while lifted | drops it |
| Esc while lifted | cancels the drag |
| right-click, the context-menu key, or Shift+F10 | opens the card popover (priority, parent) |
| rest the pointer 1 s on a card, or focus it | its slow tip: click, drag, keyboard drag and the popover's keys; none while a card is lifted |
| click a collapsed column | expands it |
| ‹ in a column's header | collapses it (Done, Dropped, Parked, Dismissed) |
| **+** in a column's header | opens the create form |

## Board — popover, create form, triage

| Key | Does |
|---|---|
| ← → on Priority (or Kind) | picks it; in the popover, written at once |
| typing in the parent search | filters by ID and title |
| ↑ ↓ in the parent list | **create form:** moves the choice. **popover, triage:** highlights |
| Enter in the parent list | **popover, triage:** picks the highlighted parent |
| Page Up / Page Down in the parent list | first / last option |
| Enter in the create form | creates the ticket (from any field) |
| Esc, click outside | closes; a triage drop is cancelled, nothing written |
| Esc in the Board tab's ⋯ menu | closes it |

## Board — Needs you

| Key / mouse | Does |
|---|---|
| click a row | opens the ticket in an editor tab (Pomade switches to its project) |
| click a project or **All projects** (at Workspace) | opens that level |
| click the back row | returns to the list; focus lands on the row that was open |
