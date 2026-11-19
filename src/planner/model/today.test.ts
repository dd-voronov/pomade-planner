import { describe, expect, it } from "vitest";

import { at, recurring, task } from "./fixtures";
import type { Task } from "./items";
import { projectRows } from "./scope";
import { allTasks, compareDailyNotes, compareTasks, isVisibleOn, nextDayStart, plannerDay, reasonOn, recurringRow, recurringRows, todayRows } from "./today";

const B3 = { hour: 3, minute: 0 };
const D = "2026-11-17";

describe("the test clock", () => {
  it("runs in Europe/Madrid", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Europe/Madrid");
    expect(at("2026-07-01 12:00").toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(at("2026-12-01 12:00").toISOString()).toBe("2026-12-01T11:00:00.000Z");
  });
});

describe("plannerDay", () => {
  it.each([
    // The default 3:00 boundary around one night.
    ["2026-11-17 23:59", B3, "2026-11-17"],
    ["2026-11-18 00:00", B3, "2026-11-17"],
    ["2026-11-18 01:30", B3, "2026-11-17"],
    ["2026-11-18 02:59", B3, "2026-11-17"],
    ["2026-11-18 02:59:59.999", B3, "2026-11-17"],
    ["2026-11-18 03:00", B3, "2026-11-18"],
    ["2026-11-18 03:01", B3, "2026-11-18"],
    // Custom boundaries.
    ["2026-11-18 05:29", { hour: 5, minute: 30 }, "2026-11-17"],
    ["2026-11-18 05:30", { hour: 5, minute: 30 }, "2026-11-18"],
    ["2026-11-18 00:14", { hour: 0, minute: 15 }, "2026-11-17"],
    ["2026-11-18 00:15", { hour: 0, minute: 15 }, "2026-11-18"],
    // Midnight: the calendar date.
    ["2026-11-17 23:59:59.999", { hour: 0, minute: 0 }, "2026-11-17"],
    ["2026-11-18 00:00", { hour: 0, minute: 0 }, "2026-11-18"],
    // Across a month and a year.
    ["2026-12-01 02:00", B3, "2026-11-30"],
    ["2027-01-01 02:59", B3, "2026-12-31"],
    ["2027-01-01 03:00", B3, "2027-01-01"],
    // Spring forward (Sun 2026-03-29, 02:00 → 03:00): 01:59 is still Saturday's day, 03:00 is Sunday's.
    ["2026-03-29 01:59", B3, "2026-03-28"],
    ["2026-03-29 03:00", B3, "2026-03-29"],
    // Fall back (Sun 2026-10-25, 03:00 → 02:00): both passes of 02:30 are Saturday's day.
    ["2026-10-25 02:30", B3, "2026-10-24"],
  ] as const)("%s with a %j boundary is %s", (local, boundary, day) => {
    expect(plannerDay(at(local), boundary)).toBe(day);
  });

  it("the second pass of a repeated hour is the previous day too", () => {
    const firstPass = at("2026-10-25 02:30");
    const secondPass = new Date(firstPass.getTime() + 3_600_000);
    expect(secondPass.getHours()).toBe(2);
    expect(plannerDay(secondPass, B3)).toBe("2026-10-24");
    expect(plannerDay(new Date(secondPass.getTime() + 30 * 60_000), B3)).toBe("2026-10-25");
  });
});

describe("nextDayStart", () => {
  it.each([
    ["2026-11-17 10:00", B3, "2026-11-18 03:00"],
    ["2026-11-18 01:30", B3, "2026-11-18 03:00"],
    ["2026-11-18 02:59:59.999", B3, "2026-11-18 03:00"],
    ["2026-11-18 03:00", B3, "2026-11-19 03:00"],
    ["2026-11-17 23:00", { hour: 0, minute: 0 }, "2026-11-18 00:00"],
    ["2026-11-17 23:00", { hour: 23, minute: 30 }, "2026-11-17 23:30"],
    ["2026-12-31 12:00", B3, "2027-01-01 03:00"],
  ] as const)("from %s with a %j boundary: %s", (from, boundary, next) => {
    expect(nextDayStart(at(from), boundary)).toEqual(at(next));
  });

  it("is the first instant of another planner day", () => {
    for (const from of ["2026-11-17 10:00", "2026-11-18 02:00", "2026-03-28 22:00", "2026-10-24 22:00"]) {
      const next = nextDayStart(at(from), B3);
      expect(plannerDay(next, B3)).not.toBe(plannerDay(at(from), B3));
      expect(plannerDay(new Date(next.getTime() - 1), B3)).toBe(plannerDay(at(from), B3));
    }
  });

  it("spring forward with a 3:00 boundary: Sunday starts at 03:00 CEST, 23 hours after Saturday's", () => {
    const next = nextDayStart(at("2026-03-28 22:00"), B3);
    expect(next.toISOString()).toBe("2026-03-29T01:00:00.000Z");
    expect(next.getTime() - at("2026-03-28 03:00").getTime()).toBe(23 * 3_600_000);
  });

  it("spring forward with a skipped 2:30 boundary: the day starts when the clock jumps to 03:00", () => {
    const boundary = { hour: 2, minute: 30 };
    const next = nextDayStart(at("2026-03-28 22:00"), boundary);
    expect(next.toISOString()).toBe("2026-03-29T01:00:00.000Z");
    expect(next.getHours()).toBe(3);
    expect(plannerDay(next, boundary)).toBe("2026-03-29");
  });

  it("fall back with a 3:00 boundary: Sunday starts at 03:00 CET, 25 hours after Saturday's", () => {
    const next = nextDayStart(at("2026-10-24 22:00"), B3);
    expect(next.toISOString()).toBe("2026-10-25T02:00:00.000Z");
    expect(next.getTime() - at("2026-10-24 03:00").getTime()).toBe(25 * 3_600_000);
  });

  it("fall back with a repeated 2:30 boundary: Sunday starts on the first pass and stays through the second", () => {
    const boundary = { hour: 2, minute: 30 };
    const first = nextDayStart(at("2026-10-24 22:00"), boundary);
    expect(first.toISOString()).toBe("2026-10-25T00:30:00.000Z");
    const secondPass = new Date(first.getTime() + 3_600_000 - 15 * 60_000); // 02:15 CET
    expect(plannerDay(secondPass, boundary)).toBe("2026-10-25");
    expect(nextDayStart(secondPass, boundary).toISOString()).toBe("2026-10-26T01:30:00.000Z");
  });
});

describe("reasonOn", () => {
  it.each([
    [{ deadline: "2026-11-16" }, "overdue"],
    [{ deadline: "2025-01-01" }, "overdue"],
    [{ deadline: D }, "due-today"],
    [{ deadline: "2026-11-18" }, null],
    [{ doOn: D }, "planned"],
    [{ doOn: "2026-11-16" }, "rolled-over"],
    [{ doOn: "2026-11-18" }, null],
    [{}, null],
    // A deadline that makes it overdue or due wins over do-on.
    [{ deadline: "2026-11-16", doOn: D }, "overdue"],
    [{ deadline: "2026-11-16", doOn: "2026-11-10" }, "overdue"],
    [{ deadline: D, doOn: "2026-11-10" }, "due-today"],
    [{ deadline: D, doOn: "2026-11-20" }, "due-today"],
    // A future deadline leaves do-on to decide.
    [{ deadline: "2026-11-20", doOn: D }, "planned"],
    [{ deadline: "2026-11-20", doOn: "2026-11-15" }, "rolled-over"],
    [{ deadline: "2026-11-20", doOn: "2026-11-19" }, null],
  ] as const)("%j → %s", (fields, reason) => {
    expect(reasonOn(task(fields), D)).toBe(reason);
  });
});

describe("isVisibleOn", () => {
  it.each([
    [{ done: false }, true],
    [{ done: true, doneOn: D }, true],
    [{ done: true, doneOn: "2026-11-16" }, false],
    [{ done: true, doneOn: null }, false],
    [{ done: true, doneOn: "2026-11-18" }, false],
    // `done-on` alone doesn't make a task done.
    [{ done: false, doneOn: "2026-11-16" }, true],
  ] as const)("%j → %s", (fields, visible) => {
    expect(isVisibleOn(task(fields), D)).toBe(visible);
  });
});

describe("todayRows", () => {
  it("holds overdue, due today, planned and rolled-over tasks, open or ticked today — nothing else", () => {
    const tasks = [
      task({ title: "Overdue", deadline: "2026-11-14" }),
      task({ title: "Due", deadline: D }),
      task({ title: "Planned", doOn: D }),
      task({ title: "Rolled", doOn: "2026-11-15" }),
      task({ title: "Later", doOn: "2026-11-18" }),
      task({ title: "Someday" }),
      task({ title: "Ticked today", doOn: D, done: true, doneOn: D }),
      task({ title: "Ticked yesterday", doOn: "2026-11-16", done: true, doneOn: "2026-11-16" }),
      task({ title: "Done, no day", deadline: "2026-11-10", done: true }),
    ];
    expect(todayRows(tasks, D).map((r) => [r.task.title, r.reason, r.plannedDaysAgo])).toEqual([
      ["Overdue", "overdue", 0],
      ["Due", "due-today", 0],
      ["Rolled", "rolled-over", 2],
      ["Planned", "planned", 0],
      ["Ticked today", "planned", 0],
    ]);
  });

  it.each([
    ["2026-11-16", 1],
    ["2026-11-15", 2],
    ["2026-10-17", 31],
    ["2025-11-17", 365],
    // Across the fall-back change: still whole days.
    ["2026-10-24", 24],
  ])("rolled over from %s: planned %i days ago", (doOn, days) => {
    expect(todayRows([task({ doOn })], D)[0]).toMatchObject({ reason: "rolled-over", plannedDaysAgo: days });
  });

  it("rolls over across the spring-forward change by whole days", () => {
    expect(todayRows([task({ doOn: "2026-03-28" })], "2026-03-30")[0]?.plannedDaysAgo).toBe(2);
  });

  it("a task ticked at 01:30 stays crossed out until 03:00, then leaves Today", () => {
    const tickedAt = at("2026-11-18 01:30");
    const day = plannerDay(tickedAt, B3);
    expect(day).toBe(D);
    const ticked = task({ title: "Swim class", doOn: D, done: true, doneOn: day });
    expect(todayRows([ticked], plannerDay(at("2026-11-18 02:59"), B3)).map((r) => r.task.done)).toEqual([true]);
    expect(todayRows([ticked], plannerDay(at("2026-11-18 03:00"), B3))).toEqual([]);
    expect(allTasks([ticked], { showDone: true, showArchived: false, showDaily: false })).toEqual([ticked]);
    expect(allTasks([ticked], { showDone: false, showArchived: false, showDaily: false })).toEqual([]);
  });

  it("an overdue task ticked today stays with its reason; untouched by dates it never had", () => {
    expect(todayRows([task({ deadline: "2026-11-01", done: true, doneOn: D })], D).map((r) => r.reason)).toEqual(["overdue"]);
    expect(todayRows([task({ done: true, doneOn: D })], D)).toEqual([]);
  });

  it("a task with invalid dates (read as unset) isn't in Today", () => {
    expect(todayRows([task({ problems: ["do-on isn't a date (YYYY-MM-DD)"] })], D)).toEqual([]);
  });
});

describe("compareTasks — deadline → do-on → importance (highest first) → created", () => {
  const order = (...tasks: ReturnType<typeof task>[]) => [...tasks].reverse().sort(compareTasks).map((t) => t.title);

  it("deadline first, an unset deadline last", () => {
    expect(order(task({ title: "a", deadline: "2026-11-10" }), task({ title: "b", deadline: "2026-11-12" }), task({ title: "c" }))).toEqual(["a", "b", "c"]);
  });

  it("then do-on, an unset one last", () => {
    expect(
      order(
        task({ title: "a", deadline: D, doOn: "2026-11-01" }),
        task({ title: "b", deadline: D, doOn: "2026-11-02" }),
        task({ title: "c", deadline: D }),
        task({ title: "d", doOn: "2026-11-01" }),
        task({ title: "e" }),
      ),
    ).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("then importance, highest first; empty below any number, zero and negatives included", () => {
    expect(
      order(task({ title: "a", importance: 10 }), task({ title: "b", importance: 3 }), task({ title: "c", importance: 0 }), task({ title: "d", importance: -2 }), task({ title: "e" })),
    ).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("then created, oldest first, an unset one last", () => {
    expect(order(task({ title: "a", created: "2026-11-01" }), task({ title: "b", created: "2026-11-09" }), task({ title: "c" }))).toEqual(["a", "b", "c"]);
  });

  it("full ties fall to title, then path — never to the read order", () => {
    const x1 = task({ title: "Same", path: "Tasks/a.md" });
    const x2 = task({ title: "Same", path: "Tasks/b.md" });
    const y = task({ title: "Other" });
    expect([x2, y, x1].sort(compareTasks)).toEqual([y, x1, x2]);
    expect([x1, x2, y].sort(compareTasks)).toEqual([y, x1, x2]);
  });

  it("an earlier field decides before a later one", () => {
    expect(order(task({ title: "a", deadline: "2026-11-10", importance: 1 }), task({ title: "b", deadline: "2026-11-11", importance: 9 }))).toEqual(["a", "b"]);
    expect(order(task({ title: "a", doOn: "2026-11-10", importance: 1 }), task({ title: "b", doOn: "2026-11-11", importance: 9 }))).toEqual(["a", "b"]);
    expect(order(task({ title: "a", importance: 2, created: "2026-11-10" }), task({ title: "b", importance: 1, created: "2026-01-01" }))).toEqual(["a", "b"]);
  });
});

describe("allTasks", () => {
  const open1 = task({ title: "Open 1", deadline: "2026-11-20" });
  const open2 = task({ title: "Open 2" });
  const done1 = task({ title: "Done 1", done: true, doneOn: "2026-11-01", deadline: "2026-11-01" });
  const done2 = task({ title: "Done 2", done: true });

  it("every open task in order; done ones only with Show done, after the open ones", () => {
    expect(allTasks([done2, open2, done1, open1], { showDone: false, showArchived: false, showDaily: false })).toEqual([open1, open2]);
    expect(allTasks([done2, open2, done1, open1], { showDone: true, showArchived: false, showDaily: false })).toEqual([open1, open2, done1, done2]);
  });
});

describe("recurring items in Today", () => {
  const INVOICES = { monthly: { days: [5] }, "lead-days": 3 };
  const invoices = (fields: Partial<Task> = {}) => recurring(INVOICES, { title: "Upload invoices", doOn: "2026-12-05", ...fields });

  it("enters at do-on − lead-days as lead-time, is recurring-due on and after do-on, and sorts by do-on with the tasks", () => {
    const tax = task({ title: "Pay the tax", deadline: "2026-12-01" });
    const ink = task({ title: "Buy ink", doOn: "2026-12-03" });
    expect(todayRows([invoices(), tax, ink], "2026-12-01").map((r) => [r.task.title, r.reason])).toEqual([
      ["Pay the tax", "due-today"],
    ]);
    const rows = todayRows([invoices(), tax, ink], "2026-12-03");
    expect(rows.map((r) => [r.task.title, r.reason])).toEqual([
      ["Pay the tax", "overdue"],
      ["Buy ink", "planned"],
      ["Upload invoices", "lead-time"],
    ]);
    expect(rows[2]?.recurring).toEqual({ phase: "lead", next: "2026-12-05", dueInDays: 2, missed: 0 });
    expect(rows[0]?.recurring).toBeNull();
    expect(todayRows([invoices()], "2026-12-05")[0]).toMatchObject({ reason: "recurring-due", plannedDaysAgo: 0, recurring: { phase: "due" } });
    expect(todayRows([invoices({ doOn: "2026-10-05" })], "2026-11-18")[0]).toMatchObject({ reason: "recurring-due", recurring: { phase: "missed", missed: 2 } });
  });

  it("never by its deadline or as ticked; not when ended or waiting; a status: done one is left out", () => {
    expect(todayRows([invoices({ deadline: "2026-11-01" })], "2026-11-18")).toEqual([]);
    expect(todayRows([invoices({ done: true, doneOn: "2026-12-05" })], "2026-12-05")).toEqual([]);
    expect(todayRows([recurring({ monthly: { days: [5] }, end: "2026-11-30" }, { doOn: "2026-11-05" })], "2026-12-05")).toEqual([]);
    expect(recurringRow(invoices(), "2026-11-18")).toBeNull();
    expect(recurringRow(task({ doOn: "2026-11-18" }), "2026-11-18")).toBeNull();
  });

  it("the Recurring view: every recurring item by next occurrence, ended and dateless last", () => {
    const rows = recurringRows(
      [
        invoices(),
        recurring({ "after-completion": { months: 3 } }, { title: "Change toothbrush", doOn: "2026-11-09" }),
        recurring({ monthly: { days: [1] }, end: "2026-10-31" }, { title: "Old rent", doOn: "2026-11-01" }),
        recurring({ weekly: { days: ["fry"] } }, { title: "Broken" }),
        recurring({ weekly: { days: ["mon"] } }, { title: "Stopped by hand", doOn: "2026-11-23", done: true }),
        task({ title: "Not recurring", doOn: "2026-11-01" }),
      ],
      "2026-11-18",
    );
    expect(rows.map((r) => [r.task.title, r.state.phase])).toEqual([
      ["Change toothbrush", "missed"],
      ["Upload invoices", "waiting"],
      ["Old rent", "ended"],
      ["Broken", "waiting"],
    ]);
  });

  it("the Project view holds a recurring item only while it is in Today", () => {
    expect(projectRows([invoices()], "2026-11-18")).toEqual([]);
    expect(projectRows([invoices()], "2026-12-02").map((t) => t.title)).toEqual(["Upload invoices"]);
  });
});

describe("notes, thoughts, daily notes and archived items", () => {
  const D = "2026-11-17";
  const note = task({ title: "Idea", type: "note", doOn: D, deadline: D });
  const thought = task({ title: "Why", type: "thought", deadline: "2026-11-01" });
  const resolved = task({ title: "Solved", type: "thought", done: true, doneOn: D });
  const daily1 = task({ title: "2026-11-16", type: "daily-note", date: "2026-11-16", titled: false });
  const daily2 = task({ title: "2026-11-17", type: "daily-note", date: "2026-11-17", titled: false });
  const archivedTask = task({ title: "Old", doOn: D, archived: true });
  const archivedNote = task({ title: "Old idea", type: "note", archived: true });
  const open = task({ title: "Do it", doOn: D });

  it("never in Today or Project — even with dates set by hand; nothing archived is", () => {
    const all = [note, thought, resolved, daily2, archivedTask, open];
    expect(todayRows(all, D).map((r) => r.task.title)).toEqual(["Do it"]);
    expect(projectRows(all, D).map((t) => t.title)).toEqual(["Do it"]);
    expect(recurringRows([recurring({ daily: true }, { title: "R", doOn: D, archived: true })], D)).toEqual([]);
  });

  it("All: open items of every type; daily notes newest first only when asked; done and resolved with Show done; archived with Show archived", () => {
    const all = [daily1, archivedNote, resolved, note, daily2, thought, open, archivedTask];
    const o = { showDone: false, showArchived: false, showDaily: false };
    expect(allTasks(all, o).map((t) => t.title)).toEqual(["Why", "Idea", "Do it"]);
    expect(allTasks(all, { ...o, showDaily: true }).map((t) => t.title)).toEqual(["Why", "Idea", "Do it", "2026-11-17", "2026-11-16"]);
    expect(allTasks(all, { ...o, showDone: true }).map((t) => t.title)).toEqual(["Why", "Idea", "Do it", "Solved"]);
    expect(allTasks(all, { ...o, showArchived: true }).map((t) => t.title)).toEqual(["Why", "Idea", "Do it", "Old", "Old idea"]);
  });

  it("daily notes order by date, newest first, then by path", () => {
    expect([daily1, daily2].sort(compareDailyNotes)).toEqual([daily2, daily1]);
  });
});
