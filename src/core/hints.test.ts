import { describe, expect, it } from "vitest";

import { KEYBOARD_CODES } from "../board/dnd";
import { resolveDateField } from "../planner/model/create";
import { CARD_HINT, DATE_FIELD_HINT, HINTS, MENU_KEYS, OPEN_HINT_PANEL, OPEN_HINT_TAB, SELECT_ROW_HINT } from "./hints";

describe("the hints of the mechanics no control shows", () => {
  it("say what they say, word for word", () => {
    expect(OPEN_HINT_PANEL).toBe("Click: open in the Planner tab · ⌘-click: open the file in the editor · Right-click or Shift+F10: more actions");
    expect(OPEN_HINT_TAB).toBe("Click: open here · ⌘-click: open the file in the editor · Right-click or Shift+F10: more actions");
    expect(CARD_HINT).toBe("Click: open the file · Drag, or Space then ← →: change the status · Right-click or Shift+F10: priority and parent");
    expect(SELECT_ROW_HINT).toBe("⇧-click or ⇧Space: select the range from the last one · ↑ ↓: the next row");
    expect(DATE_FIELD_HINT).toBe("A date or a phrase: today, fri, +3d, nov 20");
  });

  it("name the menu's keys the same way in both apps, in the panel and in the tab", () => {
    for (const hint of [OPEN_HINT_PANEL, OPEN_HINT_TAB, CARD_HINT]) expect(hint).toContain(` · ${MENU_KEYS}: `);
  });

  it("write keys as the user guide does: ⌘ ⇧ ⌥ as glyphs, Shift+F10 in words", () => {
    for (const hint of HINTS) {
      expect(hint).not.toMatch(/\b(Cmd|Command|Ctrl|Control|Alt|Option)\b/);
      expect(hint).not.toMatch(/Shift(?!\+F10)/);
      expect(hint).not.toMatch(/⇧F10/);
    }
  });

  it("offer only date phrases the date fields take", () => {
    const now = new Date("2026-11-17T10:00:00");
    const phrases = DATE_FIELD_HINT.slice(DATE_FIELD_HINT.indexOf(":") + 1).split(",").map((p) => p.trim());
    expect(phrases).toEqual(["today", "fri", "+3d", "nov 20"]);
    for (const phrase of phrases) expect(resolveDateField(phrase, now, { hour: 3, minute: 0 }).kind, phrase).toBe("date");
  });

  it("name the key that lifts a card, the one the Board's drag listens to", () => {
    expect(CARD_HINT).toContain("Space then ← →");
    expect(KEYBOARD_CODES.start).toEqual(["Space"]);
  });
});
