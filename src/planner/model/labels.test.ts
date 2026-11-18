import { describe, expect, it } from "vitest";

import { recurring, task } from "./fixtures";
import { allHints, displayTitle, progressHint, dayHeading, longDate, importanceText, recurringHints, relativeDate, rolledOverText, shortDate, todayHints } from "./labels";
import { recurringState } from "./recurring";
import { todayRows } from "./today";

const D = "2026-11-17"; // a Tuesday

describe("relativeDate", () => {
  it.each([
    ["2026-11-17", "today"],
    ["2026-11-18", "tomorrow"],
    ["2026-11-16", "yesterday"],
    ["2026-11-19", "Thu"],
    ["2026-11-23", "Mon"],
    ["2026-11-24", "Nov 24"],
    ["2026-11-14", "Nov 14"],
    ["2027-01-05", "Jan 5, 2027"],
    ["2025-12-31", "Dec 31, 2025"],
  ])("%s → %s", (date, text) => {
    expect(relativeDate(date, D)).toBe(text);
  });

  it("shortDate and dayHeading", () => {
    expect(shortDate("2026-02-01", D)).toBe("Feb 1");
    expect(dayHeading(D)).toBe("Tue, Nov 17");
    expect(longDate("2026-11-20", D)).toBe("Fri, Nov 20");
    expect(longDate("2027-11-20", D)).toBe("Sat, Nov 20, 2027");
  });
});

describe("todayHints", () => {
  const hints = (fields: Parameters<typeof task>[0]) => {
    const row = todayRows([task(fields)], D)[0];
    if (!row) throw new Error("not in Today");
    return todayHints(row, D).map((h) => [h.kind, h.text, h.tone]);
  };

  it.each([
    [{ deadline: "2026-11-14" }, [["reason", "Overdue", "danger"], ["deadline", "due Nov 14", "danger"]]],
    [{ deadline: "2026-11-16" }, [["reason", "Overdue", "danger"], ["deadline", "due yesterday", "danger"]]],
    [{ deadline: D }, [["reason", "Due today", "warning"]]],
    [{ doOn: D }, []],
    [{ doOn: D, deadline: "2026-11-20" }, [["deadline", "due Fri", "muted"]]],
    [{ doOn: "2026-11-16" }, [["rolled", "planned 1 day ago", "muted"]]],
    [{ doOn: "2026-11-10", deadline: "2026-12-01" }, [["rolled", "planned 7 days ago", "muted"], ["deadline", "due Dec 1", "muted"]]],
  ] as const)("%j → %j", (fields, expected) => {
    expect(hints(fields)).toEqual(expected);
  });

  it("names invalid fields", () => {
    expect(hints({ doOn: D, problems: ["deadline isn't a date (YYYY-MM-DD)"] })).toEqual([["problem", "deadline isn't a date (YYYY-MM-DD)", "warning"]]);
  });

  it("rolledOverText", () => {
    expect(rolledOverText(1)).toBe("planned 1 day ago");
    expect(rolledOverText(2)).toBe("planned 2 days ago");
  });
});

describe("allHints", () => {
  it.each([
    [{}, []],
    [{ doOn: "2026-11-19" }, [["do-on", "do Thu", "muted"]]],
    [{ deadline: "2026-11-10" }, [["deadline", "due Nov 10", "danger"]]],
    [{ deadline: D }, [["deadline", "due today", "warning"]]],
    [{ doOn: D, deadline: "2026-11-30" }, [["do-on", "do today", "muted"], ["deadline", "due Nov 30", "muted"]]],
    [{ done: true, doneOn: D, deadline: "2026-11-10" }, [["done", "done today", "muted"]]],
    [{ done: true }, [["done", "done", "muted"]]],
  ] as const)("%j → %j", (fields, expected) => {
    expect(allHints(task(fields), D).map((h) => [h.kind, h.text, h.tone])).toEqual(expected);
  });
});

describe("importanceText", () => {
  it.each([
    [null, null],
    [3, "!3"],
    [0, "!0"],
    [-1, "!-1"],
  ])("%s → %s", (n, text) => {
    expect(importanceText(n)).toBe(text);
  });
});

describe("recurring hints", () => {
  const INVOICES = { monthly: { days: [5] }, "lead-days": 3 };
  const hints = (doOn: string | null, day: string, repeat: unknown = INVOICES, lastLog: { date: string; text: string } | null = null) => {
    const t = recurring(repeat, { doOn, lastLog });
    const today = todayRows([t], day)[0];
    return { today: today ? todayHints(today, day).map((h) => [h.kind, h.text, h.tone]) : null, view: recurringHints(t, recurringState(t, day), day).map((h) => [h.kind, h.text, h.tone]) };
  };

  it("inside the lead time: “Due in 3 days” and the rule; the Recurring view adds the date", () => {
    expect(hints("2026-12-05", "2026-12-02")).toEqual({
      today: [
        ["reason", "Due in 3 days", "accent"],
        ["repeat", "monthly on the 5th, shows 3 days early", "muted"],
      ],
      view: [
        ["reason", "Due in 3 days", "accent"],
        ["repeat", "monthly on the 5th, shows 3 days early", "muted"],
        ["next", "next Dec 5", "muted"],
      ],
    });
    expect(hints("2026-12-05", "2026-12-04").today?.[0]).toEqual(["reason", "Due in 1 day", "accent"]);
  });

  it("due today; overdue once with its date; missed N× since the first missed date", () => {
    expect(hints("2026-12-05", "2026-12-05").today?.[0]).toEqual(["reason", "Due today", "warning"]);
    expect(hints("2026-11-05", "2026-11-18").today?.slice(0, 2)).toEqual([
      ["reason", "Overdue", "danger"],
      ["next", "due Nov 5", "danger"],
    ]);
    expect(hints("2026-10-05", "2026-11-18").today?.slice(0, 2)).toEqual([
      ["reason", "Missed 2×", "danger"],
      ["next", "since Oct 5", "muted"],
    ]);
  });

  it("between occurrences (the Recurring view only): the rule, the next date and the newest log entry", () => {
    expect(hints("2026-12-05", "2026-11-18", INVOICES, { date: "2026-11-02", text: "done" })).toEqual({
      today: null,
      view: [
        ["next", "next Dec 5", "muted"],
        ["repeat", "monthly on the 5th, shows 3 days early", "muted"],
        ["log", "done Nov 2", "muted"],
      ],
    });
  });

  it("ended: the chip, no next date", () => {
    expect(hints("2026-11-05", "2026-11-18", { monthly: { days: [5] }, end: "2026-11-10" }).view).toEqual([
      ["reason", "Ended", "muted"],
      ["repeat", "monthly on the 5th, until Nov 10, 2026", "muted"],
    ]);
  });

  it("a rule that can't be read: the kit's error in place of the rule, on Today's row too", () => {
    const h = hints("2026-11-18", "2026-11-18", { weekly: { days: ["fry"] } });
    expect(h.today).toEqual([
      ["reason", "Due today", "warning"],
      ["problem", 'repeat.weekly.days[0]: "fry" is not a weekday — use mon, tue, wed, thu, fri, sat or sun', "warning"],
    ]);
  });
});

describe("notes, thoughts and daily notes on a row", () => {
  const D = "2026-11-17";
  it("a daily note without a title reads as its date; with one, its title", () => {
    expect(displayTitle(task({ type: "daily-note", title: "2026-11-17", titled: false, date: D }), D)).toBe("Tue, Nov 17");
    expect(displayTitle(task({ type: "daily-note", title: "Trip day", titled: true, date: D }), D)).toBe("Trip day");
    expect(displayTitle(task({ title: "A task" }), D)).toBe("A task");
  });

  it("hints: today's note and its progress; when a note or thought was added, resolved, archived", () => {
    const hints = (t: Parameters<typeof allHints>[0]) => allHints(t, D).map((h) => [h.kind, h.text]);
    expect(hints(task({ type: "daily-note", date: D, titled: false, progress: { done: 2, total: 8 } }))).toEqual([
      ["reason", "Today"],
      ["progress", "2/8"],
    ]);
    expect(hints(task({ type: "daily-note", date: "2026-11-10", titled: true, progress: { done: 0, total: 0 } }))).toEqual([["created", "Nov 10"]]);
    expect(hints(task({ type: "note", created: "2026-11-16" }))).toEqual([["created", "added yesterday"]]);
    expect(hints(task({ type: "note", created: "2026-11-16", archived: true }))).toEqual([
      ["created", "added yesterday"],
      ["archived", "archived"],
    ]);
    expect(hints(task({ type: "thought", done: true, doneOn: D }))).toEqual([["done", "resolved today"]]);
    expect(hints(task({ archived: true, doOn: "2026-11-18" }))).toEqual([
      ["do-on", "do tomorrow"],
      ["archived", "archived"],
    ]);
  });

  it("progress all ticked reads in the accent", () => {
    expect(progressHint(task({ type: "daily-note", progress: { done: 3, total: 3 } }))).toEqual([{ kind: "progress", text: "3/3", tone: "accent" }]);
    expect(progressHint(task({ type: "daily-note", progress: null }))).toEqual([]);
  });
});
