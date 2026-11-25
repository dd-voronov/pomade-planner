---
doc: docs/user-guide/shortcuts.md
audience: users
holds: every shortcut and mouse modifier of both apps, grouped by where it works
kind: reference
---

# Keyboard and mouse

[← User guide](user-guide.md)

Every shortcut and mouse modifier of the Planner and the Board, grouped by where it works.

## Anywhere in Pomade

| Key | Does |
|---|---|
| ⌘⇧A | Quick add — the Planner's add form over the current tab, even if the Planner was never opened |

## Both apps

| Key / mouse | Does |
|---|---|
| rest the pointer 350 ms on an icon button, or focus it | shows its tooltip (at once when another tip is already showing) |
| Esc, a press, the pointer or focus leaving | hides the tooltip |
| Tab / ⇧Tab inside a popover or form | stays inside it |
| Esc in a popover or menu | closes it; focus returns to what opened it |
| click outside a popover | closes it |

## Planner — lists

| Key / mouse | Does |
|---|---|
| click a row's title, or Enter on it | **tab:** opens the item's compact view beside the list. **panel:** opens the Planner tab with it |
| ⌘-click a row's title | opens the file in Pomade's editor |
| click / ⌘-click the daily note's card | same as a row |
| hover or focus a row | shows its actions: Pin, Skip, Archive, Resolve/Reopen, Restore |
| click a row's checkbox | tick / untick a task; done for a recurring item |
| click a view tab | switches view |
| click a group heading, or Enter / Space on it | folds or unfolds the group; its count stays |
| ← / → on a focused group heading | folds / unfolds it |
| Esc in the panel's ⋯ menu | closes it, focus back on ⋯ |

### Row menu

| Key / mouse | Does |
|---|---|
| right-click a row, Shift+F10 on a focused row | opens the row menu |
| ↑ ↓ | move between the items (Home, End jump) |
| Enter | picks the item |
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

### Project picker

Also the **+ Add from…** mix-in picker.

| Key | Does |
|---|---|
| typing | filters; every word must match, case and accents ignored |
| ↑ ↓ | highlight |
| Enter | picks the project, or opens the group |
| → (caret at the end, on a group) | opens the group |
| ← (caret at the start, in a group) | back to the groups |
| Backspace in an empty field | back to the groups |
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

## Select mode (All)

| Key / mouse | Does |
|---|---|
| click a row | select / unselect |
| ⇧-click a row | selects the range from the last row toggled |
| Space on a row's box | select / unselect |
| ⇧Space on a row's box | selects the range |
| ↑ ↓ | move between rows' boxes |
| ⌘A | selects every row the filters show |
| Delete or Backspace | **Delete N…** — asks first |
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

## Board — cards

| Key / mouse | Does |
|---|---|
| click a card, or Enter on a focused card | opens its file in an editor tab |
| drag a card | changes its status (and moves epics and tasks into or out of `done/`) |
| Space on a focused card | lifts it |
| ← → while lifted | move it one column |
| Space or Enter while lifted | drops it |
| Esc while lifted | cancels the drag |
| right-click, the context-menu key, or ⇧F10 | opens the card popover (priority, parent) |
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

## Board — Needs you

| Key / mouse | Does |
|---|---|
| click a row | opens the ticket in an editor tab (Pomade switches to its project) |
| click a project or **All projects** (at Workspace) | opens that level |
| click the back row | returns to the list; focus lands on the row that was open |
