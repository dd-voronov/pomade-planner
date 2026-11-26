// The words of the hints that tell a mechanic no control shows ([[tooltips-and-popovers]]), shared
// so that both apps, the panel and the tab say the same thing the same way. Keys are written as the
// user guide writes them: ⌘, ⇧, ⌥ as glyphs, Shift+F10 in words.

/** What opens an item's menu: a Planner row's, a Board card's popover. */
export const MENU_KEYS = "Right-click or Shift+F10";

/** A Planner row's title in the panel, where a click opens the Planner tab. */
export const OPEN_HINT_PANEL = `Click: open in the Planner tab · ⌘-click: open the file in the editor · ${MENU_KEYS}: more actions`;

/** A Planner row's title in the tab, where a click opens the compact view beside the list. */
export const OPEN_HINT_TAB = `Click: open here · ⌘-click: open the file in the editor · ${MENU_KEYS}: more actions`;

/** A Board card: open, move by pointer or keyboard, and its popover. */
export const CARD_HINT = `Click: open the file · Drag, or Space then ← →: change the status · ${MENU_KEYS}: priority and parent`;

/** A row's box in select mode: the range, and walking the boxes. */
export const SELECT_ROW_HINT = "⇧-click or ⇧Space: select the range from the last one · ↑ ↓: the next row";

/** A date field of the Planner: what it takes besides a date. */
export const DATE_FIELD_HINT = "A date or a phrase: today, fri, +3d, nov 20";

/** Every hint above, for the check that they write keys one way. */
export const HINTS: readonly string[] = [OPEN_HINT_PANEL, OPEN_HINT_TAB, CARD_HINT, SELECT_ROW_HINT, DATE_FIELD_HINT];
