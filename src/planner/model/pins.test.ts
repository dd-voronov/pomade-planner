import { describe, expect, it } from "vitest";

import { dailyNotePinned, isPinned, NO_PINS, parsePins, pinsKey, serializePins, splitPinned, togglePin } from "./pins";

describe("pins", () => {
  it("one state key per context; per view, in pin order", () => {
    expect(pinsKey("quiz")).toBe("planner.pins.quiz");
    expect(pinsKey("__workspace__")).toBe("planner.pins.__workspace__");
    let pins = togglePin(NO_PINS, "project", "T/QuizLab/a.md");
    pins = togglePin(pins, "project", "T/QuizLab/b.md");
    expect(pins.project).toEqual(["T/QuizLab/a.md", "T/QuizLab/b.md"]);
    expect(isPinned(pins, "project", "T/QuizLab/a.md")).toBe(true);
    expect(isPinned(pins, "today", "T/QuizLab/a.md")).toBe(false);
    expect(togglePin(pins, "project", "T/QuizLab/a.md").project).toEqual(["T/QuizLab/b.md"]);
    expect(NO_PINS.project).toEqual([]);
  });

  it("round-trips through the state store; anything malformed reads as no pins", () => {
    const pins = togglePin(togglePin(NO_PINS, "all", "a"), "today", "b");
    expect(parsePins(serializePins(pins))).toEqual(pins);
    expect(parsePins(null)).toEqual(NO_PINS);
    expect(parsePins([1])).toEqual(NO_PINS);
    expect(parsePins({ today: ["a", "a", 3, ""], all: "x" })).toEqual({ ...NO_PINS, today: ["a"] });
  });

  it("splits a list into the pinned rows in pin order and the rest in list order; pins of rows not listed don't show", () => {
    const rows = ["a", "b", "c", "d"];
    expect(splitPinned(rows, ["c", "gone", "a"], (r) => r)).toEqual({ pinned: ["c", "a"], rest: ["b", "d"] });
    expect(splitPinned(rows, [], (r) => r)).toEqual({ pinned: [], rest: rows });
  });

  it("the daily note is pinned every day; unpinned, it stays unpinned for that planner day only", () => {
    expect(dailyNotePinned("2026-11-10", null)).toBe(true);
    expect(dailyNotePinned("2026-11-10", "2026-11-10")).toBe(false);
    expect(dailyNotePinned("2026-11-11", "2026-11-10")).toBe(true);
  });
});
