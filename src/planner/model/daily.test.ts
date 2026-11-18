import { describe, expect, it } from "vitest";

import { at } from "./fixtures";
import { builtInDailyNote, dailyNotePath, dailyNoteText, longDayName, shouldCreateDailyNote } from "./daily";
import { plannerDay } from "./today";

const B3 = { hour: 3, minute: 0 };

describe("when a daily note is made", () => {
  it("on the first run of a planner day — after the boundary, by the injected clock", () => {
    // Pomade last ran on Nov 9; at 01:30 on Nov 10 it is still Nov 9's planner day: nothing.
    expect(shouldCreateDailyNote(plannerDay(at("2026-11-10 01:30"), B3), "2026-11-09")).toBe(false);
    expect(shouldCreateDailyNote(plannerDay(at("2026-11-10 02:59"), B3), "2026-11-09")).toBe(false);
    // 03:00: the new day's first run makes its note.
    expect(plannerDay(at("2026-11-10 03:00"), B3)).toBe("2026-11-10");
    expect(shouldCreateDailyNote(plannerDay(at("2026-11-10 03:00"), B3), "2026-11-09")).toBe(true);
    // Recorded: a later run the same day — another frame, a relaunch — makes nothing.
    expect(shouldCreateDailyNote(plannerDay(at("2026-11-10 22:00"), B3), "2026-11-10")).toBe(false);
  });

  it("never back-fills: after days Pomade wasn't opened only the day it runs on gets a note", () => {
    const day = plannerDay(at("2026-11-14 09:00"), B3);
    expect(shouldCreateDailyNote(day, "2026-11-10")).toBe(true);
    expect(dailyNotePath("To-dos", day)).toBe("To-dos/Daily/2026-11-14.md");
  });

  it("a day boundary moved later takes the planner back to yesterday: nothing is made for it", () => {
    expect(shouldCreateDailyNote("2026-11-09", "2026-11-10")).toBe(false);
  });

  it("the first run ever makes the day's note", () => {
    expect(shouldCreateDailyNote("2026-11-10", null)).toBe(true);
  });

  it("the path: <root>/Daily/<YYYY-MM-DD>.md; the workspace root as tasks root", () => {
    expect(dailyNotePath("Knowledge/To-dos", "2026-11-10")).toBe("Knowledge/To-dos/Daily/2026-11-10.md");
    expect(dailyNotePath("", "2026-11-10")).toBe("Daily/2026-11-10.md");
  });
});

describe("dailyNoteText", () => {
  const D = "2026-11-10";

  it("without a template: the built-in note — type, date, a date heading, an empty checklist", () => {
    expect(longDayName(D)).toBe("Tuesday, November 10, 2026");
    expect(builtInDailyNote(D)).toBe("---\ntype: daily-note\ndate: 2026-11-10\n---\n# Tuesday, November 10, 2026\n\n- [ ]\n");
    expect(dailyNoteText(D, { kind: "none" })).toEqual({ text: builtInDailyNote(D), problem: null });
  });

  it("merges the template's frontmatter under the app's type and date — app keys win, the rest keeps its bytes and order", () => {
    const template = "---\ntags: [daily]   # kept\ntype: journal\nmood:\ndate: 1999-01-01\nweather: \"sunny\"\n---\n\n## Plan\n- [ ] one\n- [ ] two\n";
    expect(dailyNoteText(D, { kind: "text", text: template })).toEqual({
      text: "---\ntype: daily-note\ndate: 2026-11-10\ntags: [daily]   # kept\nmood:\nweather: \"sunny\"\n---\n\n## Plan\n- [ ] one\n- [ ] two\n",
      problem: null,
    });
  });

  it("a template whose only keys are type and date gets just the app's", () => {
    expect(dailyNoteText(D, { kind: "text", text: "---\ntype: x\ndate: y\n---\nBody\n" }).text).toBe("---\ntype: daily-note\ndate: 2026-11-10\n---\nBody\n");
  });

  it("a template without frontmatter gets the app's block over its text", () => {
    expect(dailyNoteText(D, { kind: "text", text: "# Today\n\n- [ ] a\n" }).text).toBe("---\ntype: daily-note\ndate: 2026-11-10\n---\n# Today\n\n- [ ] a\n");
    expect(dailyNoteText(D, { kind: "text", text: "" }).text).toBe("---\ntype: daily-note\ndate: 2026-11-10\n---\n");
  });

  it("a multi-line value of the template's own date gives way whole; CRLF and a BOM are normalized", () => {
    expect(dailyNoteText(D, { kind: "text", text: "﻿---\r\ndate:\r\n  - a\r\n  - b\r\nkeep: 1\r\n---\r\nx\r\n" }).text).toBe("---\ntype: daily-note\ndate: 2026-11-10\nkeep: 1\n---\nx\n");
  });

  it("an unreadable or missing template gives the built-in note and says why — never a failed day", () => {
    expect(dailyNoteText(D, { kind: "text", text: "---\nx: [\n---\n" })).toEqual({ text: builtInDailyNote(D), problem: "its frontmatter can't be read" });
    expect(dailyNoteText(D, { kind: "text", text: "---\nx: 1\nnever closed\n" })).toEqual({ text: builtInDailyNote(D), problem: "its frontmatter can't be read" });
    expect(dailyNoteText(D, { kind: "error", reason: "it isn't there" })).toEqual({ text: builtInDailyNote(D), problem: "it isn't there" });
  });
});
