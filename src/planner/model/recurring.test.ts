import { describe, expect, it } from "vitest";

import { at, recurring } from "./fixtures";
import { advancedDoOn, appendLog, firstDoOn, inToday, newestLog, nextOccurrenceOf, readLog, readRepeat, recurringState, type RecurringFields, doOnAfterRuleChange, trailingLogStart } from "./recurring";
import { plannerDay } from "./today";

const INVOICES = { monthly: { days: [5] }, "lead-days": 3 };
const TOOTHBRUSH = { "after-completion": { months: 3 } };

/** The schedule of a rule that reads. */
function schedule(repeat: unknown) {
  const r = readRepeat(repeat);
  if (r.kind !== "ok") throw new Error(r.message);
  return r.schedule;
}

const item = (repeat: unknown, fields: Partial<RecurringFields> = {}): RecurringFields => ({ doOn: null, created: null, lastLog: null, repeat: readRepeat(repeat), ...fields });

describe("readRepeat", () => {
  it("a rule in the kit's format: its schedule and the kit's words", () => {
    const r = readRepeat(INVOICES);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.description).toBe("monthly on the 5th, shows 3 days early");
    expect(readRepeat(TOOTHBRUSH)).toMatchObject({ kind: "ok", description: "3 months after completion" });
  });

  it.each([
    [undefined, "repeat: expected a mapping with one of once, every, daily, weekly, monthly, after-completion, always — like daily: { at: 7:00 }"],
    [{ weekly: { days: ["fry"] } }, 'repeat.weekly.days[0]: "fry" is not a weekday — use mon, tue, wed, thu, fri, sat or sun'],
    [{ monthly: { days: [5], at: "9:00" } }, "repeat.monthly.at: times are not used here — these schedules are whole days; remove at"],
    [{ every: { hours: 2 } }, expect.stringContaining("repeat")],
    [
      { monthly: { days: [5] }, weekly: { days: ["mon"] }, "lead-days": -1 },
      expect.stringMatching(/^repeat: one shape per schedule — found weekly and monthly; keep one; repeat\.lead-days: -1 is not allowed/),
    ],
  ])("%j → the kit's readable error", (value, message) => {
    expect(readRepeat(value)).toEqual({ kind: "error", message });
  });
});

describe("the log", () => {
  it("reads `- <date> <words>` lines of the ## Log section only, in file order", () => {
    const body = "Upload them.\n\n- 2026-01-01 not the log\n\n## Log\n- 2026-11-02 done\n* 2026-10-05 skipped\n- not a date\n- 2026-09-31 done\n-  2026-09-05   done late  \n\n## Next\n- 2026-12-01 done\n";
    expect(readLog(body)).toEqual([
      { date: "2026-11-02", text: "done" },
      { date: "2026-10-05", text: "skipped" },
      { date: "2026-09-05", text: "done late" },
    ]);
    expect(readLog("no log\n")).toEqual([]);
    expect(readLog("## log\r\n- 2026-11-02 done\r\n")).toEqual([{ date: "2026-11-02", text: "done" }]);
  });

  it("the newest entry is the latest date — the first written of that day", () => {
    expect(newestLog([])).toBeNull();
    expect(
      newestLog([
        { date: "2026-10-05", text: "skipped" },
        { date: "2026-11-02", text: "done" },
        { date: "2026-11-02", text: "skipped" },
      ]),
    ).toEqual({ date: "2026-11-02", text: "done" });
  });

  it.each([
    ["an empty body: the section after one blank line", "", "\n## Log\n- 2026-11-18 done\n"],
    ["a body ending in a line break: one blank line, then the section", "Upload them.\n", "Upload them.\n\n## Log\n- 2026-11-18 done\n"],
    ["a body without a final line break", "Upload them.", "Upload them.\n\n## Log\n- 2026-11-18 done\n"],
    ["a body ending in a blank line: no second one", "Upload them.\n\n", "Upload them.\n\n## Log\n- 2026-11-18 done\n"],
    ["a body ending in two blank lines: kept", "Upload them.\n\n\n", "Upload them.\n\n\n## Log\n- 2026-11-18 done\n"],
    ["an existing log: the newest first, right under the heading", "Text\n\n## Log\n- 2026-11-02 done\n- 2026-10-05 skipped\n", "Text\n\n## Log\n- 2026-11-18 done\n- 2026-11-02 done\n- 2026-10-05 skipped\n"],
    ["a blank line under the heading stays", "## Log\n\n- 2026-11-02 done\n", "## Log\n\n- 2026-11-18 done\n- 2026-11-02 done\n"],
    ["an empty section followed by another", "## Log\n\n## Notes\nx\n", "## Log\n- 2026-11-18 done\n\n## Notes\nx\n"],
    ["a heading without a line break at the end", "Text\n\n## Log", "Text\n\n## Log\n- 2026-11-18 done\n"],
    ["a heading with text under it", "## Log\nkept by hand\n", "## Log\n- 2026-11-18 done\nkept by hand\n"],
    ["CRLF line endings are kept", "Text\r\n\r\n## Log\r\n- 2026-11-02 done\r\n", "Text\r\n\r\n## Log\r\n- 2026-11-18 done\r\n- 2026-11-02 done\r\n"],
    ["CRLF without a log", "Text\r\n", "Text\r\n\r\n## Log\r\n- 2026-11-18 done\r\n"],
  ])("appendLog: %s", (_, body, expected) => {
    expect(appendLog(body, "2026-11-18", "done")).toBe(expected);
  });

  it("appendLog writes the word given", () => {
    expect(appendLog("", "2026-11-18", "skipped")).toBe("\n## Log\n- 2026-11-18 skipped\n");
  });
});

describe("recurringState — Today's rules", () => {
  // Upload invoices: monthly on the 5th, lead 3 days, next on Dec 5.
  const invoices = item(INVOICES, { doOn: "2026-12-05" });

  it.each([
    ["2026-11-18", "waiting", 17, 0],
    ["2026-12-01", "waiting", 4, 0],
    ["2026-12-02", "lead", 3, 0],
    ["2026-12-04", "lead", 1, 0],
    ["2026-12-05", "due", 0, 0],
    ["2026-12-06", "missed", 0, 1],
    ["2027-01-04", "missed", 0, 1],
    ["2027-01-05", "missed", 0, 2],
    ["2027-03-05", "missed", 0, 4],
  ])("invoices on %s: %s (due in %i, missed %i×)", (day, phase, dueInDays, missed) => {
    expect(recurringState(invoices, day)).toEqual({ phase, next: "2026-12-05", dueInDays, missed });
  });

  it("untouched since October 5: one row, missed 2× on Nov 18", () => {
    expect(recurringState(item(INVOICES, { doOn: "2026-10-05" }), "2026-11-18")).toEqual({ phase: "missed", next: "2026-10-05", dueInDays: 0, missed: 2 });
  });

  it("lead-days 0: only on the day", () => {
    const s = item({ monthly: { days: [5] } }, { doOn: "2026-12-05" });
    expect(recurringState(s, "2026-12-04").phase).toBe("waiting");
    expect(recurringState(s, "2026-12-05").phase).toBe("due");
  });

  it.each([
    ["weekly, lead 7", { weekly: { days: ["mon"] }, "lead-days": 7 }],
    ["weekly, lead 10", { weekly: { days: ["mon"] }, "lead-days": 10 }],
    ["daily, lead 1", { daily: {}, "lead-days": 1 }],
    ["monthly, lead 31", { monthly: { days: [5] }, "lead-days": 31 }],
    ["2 weeks after completion, lead 14", { "after-completion": { weeks: 2 }, "lead-days": 14 }],
  ])("lead-days ≥ the period (%s): in Today every day while each occurrence is done on its day", (_, repeat) => {
    const s = schedule(repeat);
    let next = firstDoOn(s, "2026-11-18") ?? "";
    for (let i = 0, day = "2026-11-18"; i < 70; i++) {
      expect(inToday(recurringState(item(repeat, { doOn: next }), day)), `${day} (next ${next})`).toBe(true);
      if (next === day) next = advancedDoOn(item(repeat, { doOn: next }), s, day) ?? "";
      day = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + 1)).toISOString().slice(0, 10);
    }
  });

  it("lead-days below the period: gone after done until the next lead time", () => {
    const repeat = { weekly: { days: ["mon"] }, "lead-days": 6 };
    expect(recurringState(item(repeat, { doOn: "2026-11-30" }), "2026-11-23").phase).toBe("waiting");
    expect(recurringState(item(repeat, { doOn: "2026-11-30" }), "2026-11-24").phase).toBe("lead");
  });

  it("end passed → ended; on the end day it still counts", () => {
    const s = { monthly: { days: [5] }, end: "2026-12-05" };
    expect(recurringState(item(s, { doOn: "2026-12-05" }), "2026-12-05").phase).toBe("due");
    expect(recurringState(item(s, { doOn: "2026-12-05" }), "2026-12-06")).toEqual({ phase: "ended", next: "2026-12-05", dueInDays: 0, missed: 0 });
    // Advanced past its end.
    expect(recurringState(item(s, { doOn: "2027-01-05" }), "2026-12-06").phase).toBe("ended");
    expect(recurringState(item(s, { doOn: "2027-01-05" }), "2026-11-18").phase).toBe("ended");
  });

  it("missed occurrences stop counting at end", () => {
    expect(recurringState(item({ monthly: { days: [5] }, end: "2026-12-31" }, { doOn: "2026-10-05" }), "2026-12-20")).toMatchObject({ phase: "missed", missed: 3 });
  });

  it("a rule that can't be read keeps its do-on: due on it, missed once after, waiting before (no lead time)", () => {
    const bad = { weekly: { days: ["fry"] }, "lead-days": 3 };
    expect(recurringState(item(bad, { doOn: "2026-11-18" }), "2026-11-18").phase).toBe("due");
    expect(recurringState(item(bad, { doOn: "2026-11-10" }), "2026-11-18")).toMatchObject({ phase: "missed", missed: 1 });
    expect(recurringState(item(bad, { doOn: "2026-11-19" }), "2026-11-18").phase).toBe("waiting");
    expect(recurringState(item(bad), "2026-11-18")).toEqual({ phase: "waiting", next: null, dueInDays: 0, missed: 0 });
  });

  it("after completion: due on its do-on, missed once however long ago", () => {
    expect(recurringState(item(TOOTHBRUSH, { doOn: "2026-11-09" }), "2026-11-20")).toEqual({ phase: "missed", next: "2026-11-09", dueInDays: 0, missed: 1 });
  });

  it("the 01:30 boundary: still yesterday's planner day — due, not yet missed", () => {
    const s = item(INVOICES, { doOn: "2026-12-05" });
    expect(recurringState(s, plannerDay(at("2026-12-06 01:30"), { hour: 3, minute: 0 })).phase).toBe("due");
    expect(recurringState(s, plannerDay(at("2026-12-06 03:00"), { hour: 3, minute: 0 }))).toMatchObject({ phase: "missed", missed: 1 });
    expect(recurringState(s, plannerDay(at("2026-12-02 02:59"), { hour: 3, minute: 0 })).phase).toBe("waiting");
    expect(recurringState(s, plannerDay(at("2026-12-02 03:00"), { hour: 3, minute: 0 })).phase).toBe("lead");
  });

  it("across DST: spring forward and fall back move the planner day at the boundary, not at midnight", () => {
    const sundays = item({ weekly: { days: ["sun"] } }, { doOn: "2026-03-29" });
    const b = { hour: 3, minute: 0 };
    // 2026-03-29 (Madrid): 02:00 → 03:00.
    expect(recurringState(sundays, plannerDay(at("2026-03-29 01:59"), b)).phase).toBe("waiting");
    expect(recurringState(sundays, plannerDay(at("2026-03-29 03:00"), b)).phase).toBe("due");
    // 2026-10-25 (Madrid): 03:00 → 02:00, the boundary passes twice; the day is Sunday from the first.
    const fall = item({ weekly: { days: ["sun"] } }, { doOn: "2026-10-25" });
    expect(recurringState(fall, plannerDay(new Date("2026-10-25T00:30:00Z"), b)).phase).toBe("waiting");
    expect(recurringState(fall, plannerDay(new Date("2026-10-25T02:00:00Z"), b)).phase).toBe("due");
    expect(recurringState(fall, plannerDay(at("2026-10-26 02:59"), b)).phase).toBe("due");
    expect(recurringState(fall, plannerDay(at("2026-10-26 03:00"), b)).phase).toBe("missed");
  });
});

describe("nextOccurrenceOf — a missing do-on", () => {
  it("do-on as written wins, occurrence or not", () => {
    expect(nextOccurrenceOf(item(INVOICES, { doOn: "2026-12-07" }), "2026-11-18")).toBe("2026-12-07");
  });

  it("fixed: the first occurrence on or after start, else created, else today; after a log entry, the one after it", () => {
    expect(nextOccurrenceOf(item({ monthly: { days: [5] }, start: "2026-09-01" }, { created: "2026-01-01" }), "2026-11-18")).toBe("2026-09-05");
    expect(nextOccurrenceOf(item({ monthly: { days: [5] } }, { created: "2026-10-05" }), "2026-11-18")).toBe("2026-10-05");
    expect(nextOccurrenceOf(item({ monthly: { days: [5] } }), "2026-11-18")).toBe("2026-12-05");
    expect(nextOccurrenceOf(item({ monthly: { days: [5] } }, { created: "2026-01-01", lastLog: { date: "2026-11-05", text: "done" } }), "2026-11-18")).toBe("2026-12-05");
  });

  it("after completion: the newest log entry plus the period, else start, created or today", () => {
    expect(nextOccurrenceOf(item(TOOTHBRUSH, { lastLog: { date: "2026-08-20", text: "done" } }), "2026-11-18")).toBe("2026-11-20");
    expect(nextOccurrenceOf(item({ ...TOOTHBRUSH, start: "2026-12-01" }, { created: "2026-11-01" }), "2026-11-18")).toBe("2026-12-01");
    expect(nextOccurrenceOf(item(TOOTHBRUSH, { created: "2026-11-01" }), "2026-11-18")).toBe("2026-11-01");
    expect(nextOccurrenceOf(item(TOOTHBRUSH), "2026-11-18")).toBe("2026-11-18");
  });

  it("a once done: no next occurrence → ended", () => {
    const once = item({ once: "2026-11-10" }, { lastLog: { date: "2026-11-10", text: "done" } });
    expect(nextOccurrenceOf(once, "2026-11-18")).toBeNull();
    expect(recurringState(once, "2026-11-18").phase).toBe("ended");
    expect(recurringState(item({ once: "2026-11-10" }), "2026-11-18").phase).toBe("ended");
    expect(recurringState(item({ once: "2026-11-20" }), "2026-11-18").phase).toBe("waiting");
  });
});

describe("advancedDoOn — done and skip", () => {
  it("fixed, ticked inside the lead time: from the scheduled date (Dec 2 → Jan 5)", () => {
    expect(advancedDoOn(item(INVOICES, { doOn: "2026-12-05" }), schedule(INVOICES), "2026-12-02")).toBe("2027-01-05");
  });

  it("fixed, on the day and after it", () => {
    expect(advancedDoOn(item(INVOICES, { doOn: "2026-12-05" }), schedule(INVOICES), "2026-12-05")).toBe("2027-01-05");
    expect(advancedDoOn(item(INVOICES, { doOn: "2026-12-05" }), schedule(INVOICES), "2026-12-20")).toBe("2027-01-05");
  });

  it("missed: jumps to the next future occurrence — past every missed one, today's included", () => {
    expect(advancedDoOn(item(INVOICES, { doOn: "2026-10-05" }), schedule(INVOICES), "2026-11-18")).toBe("2026-12-05");
    expect(advancedDoOn(item(INVOICES, { doOn: "2026-10-05" }), schedule(INVOICES), "2026-12-05")).toBe("2027-01-05");
  });

  it("after completion: from the completion date (toothbrush due Nov 9, done Nov 20 → Feb 20), early or late", () => {
    expect(advancedDoOn(item(TOOTHBRUSH, { doOn: "2026-11-09" }), schedule(TOOTHBRUSH), "2026-11-20")).toBe("2027-02-20");
    expect(advancedDoOn(item(TOOTHBRUSH, { doOn: "2026-12-09" }), schedule(TOOTHBRUSH), "2026-11-20")).toBe("2027-02-20");
    expect(advancedDoOn(item({ "after-completion": { days: 10 } }, { doOn: "2026-11-09" }), schedule({ "after-completion": { days: 10 } }), "2026-11-20")).toBe("2026-11-30");
    expect(advancedDoOn(item({ "after-completion": { weeks: 2 } }), schedule({ "after-completion": { weeks: 2 } }), "2026-11-20")).toBe("2026-12-04");
  });

  it("month ends: the 31st lands on the last day of shorter months, then back on the 31st", () => {
    const r = { monthly: { days: [31] } };
    const s = schedule(r);
    expect(advancedDoOn(item(r, { doOn: "2027-01-31" }), s, "2027-01-31")).toBe("2027-02-28");
    expect(advancedDoOn(item(r, { doOn: "2027-02-28" }), s, "2027-02-28")).toBe("2027-03-31");
    expect(advancedDoOn(item(r, { doOn: "2027-03-31" }), s, "2027-04-01")).toBe("2027-04-30");
    expect(advancedDoOn(item(r, { doOn: "2028-01-31" }), s, "2028-01-31")).toBe("2028-02-29");
    // After completion by months keeps the day, clamped.
    expect(advancedDoOn(item({ "after-completion": { months: 1 } }), schedule({ "after-completion": { months: 1 } }), "2027-01-31")).toBe("2027-02-28");
  });

  it("end doesn't stop the advance: the date past it is written and reads as ended", () => {
    const r = { monthly: { days: [5] }, end: "2026-12-31" };
    const next = advancedDoOn(item(r, { doOn: "2026-12-05" }), schedule(r), "2026-12-05");
    expect(next).toBe("2027-01-05");
    expect(recurringState(item(r, { doOn: next }), "2026-12-05").phase).toBe("ended");
  });

  it("a once: no next date", () => {
    expect(advancedDoOn(item({ once: "2026-11-18" }, { doOn: "2026-11-18" }), schedule({ once: "2026-11-18" }), "2026-11-18")).toBeNull();
  });
});

describe("firstDoOn — a new item", () => {
  it.each([
    ["monthly on the 5th, on Nov 18", { monthly: { days: [5] } }, "2026-12-05"],
    ["monthly on the 18th, on Nov 18: today", { monthly: { days: [18] } }, "2026-11-18"],
    ["from a later start", { monthly: { days: [5] }, start: "2027-03-01" }, "2027-03-05"],
    ["weekly on Mon", { weekly: { days: ["mon"] } }, "2026-11-23"],
    ["every day", { daily: {} }, "2026-11-18"],
    ["after completion: today plus the period", TOOTHBRUSH, "2027-02-18"],
    ["after completion from a later start: the start", { ...TOOTHBRUSH, start: "2026-12-01" }, "2026-12-01"],
    ["after completion from a past start: today", { ...TOOTHBRUSH, start: "2026-01-01" }, "2026-11-18"],
  ])("%s", (_, repeat, expected) => {
    expect(firstDoOn(schedule(repeat), "2026-11-18")).toBe(expected);
  });

  it("nothing left before end: null", () => {
    expect(firstDoOn(schedule({ monthly: { days: [5] }, end: "2026-11-30" }), "2026-11-18")).toBeNull();
    expect(firstDoOn(schedule({ ...TOOTHBRUSH, end: "2026-12-31" }), "2026-11-18")).toBeNull();
  });
});

describe("doOnAfterRuleChange — do-on once the rule is another", () => {
  const rule = (repeat: unknown) => {
    const read = recurring(repeat).repeat;
    if (read?.kind !== "ok") throw new Error("the fixture's rule can't be read");
    return read.schedule;
  };
  const DAY = "2026-11-18";

  it("a future run moves to the new rule's next date from today", () => {
    expect(doOnAfterRuleChange(recurring({ monthly: { days: [5] } }, { doOn: "2026-12-05" }), rule({ monthly: { days: [10] } }), DAY)).toBe("2026-12-10");
    expect(doOnAfterRuleChange(recurring({ monthly: { days: [5] } }, { doOn: "2026-12-05" }), rule({ monthly: { days: [25] } }), DAY)).toBe("2026-11-25");
    expect(doOnAfterRuleChange(recurring({ monthly: { days: [5] } }, { doOn: "2026-12-05" }), rule({ weekly: { days: ["wed"] } }), DAY)).toBe("2026-11-18");
  });

  it("a run still open stays open: the new rule's first date on or after it", () => {
    expect(doOnAfterRuleChange(recurring({ monthly: { days: [5] } }, { doOn: "2026-11-05" }), rule({ monthly: { days: [5] }, "lead-days": 3 }), DAY)).toBe("2026-11-05");
    expect(doOnAfterRuleChange(recurring({ monthly: { days: [5] } }, { doOn: "2026-11-05" }), rule({ monthly: { days: [10] } }), DAY)).toBe("2026-11-10");
  });

  it("no do-on: from today", () => {
    expect(doOnAfterRuleChange(recurring({ monthly: { days: [5] } }), rule({ monthly: { days: [10] } }), DAY)).toBe("2026-12-10");
  });

  it("after completion: the newest log entry plus the new period; no log: as a new item made on its created day", () => {
    const brush = recurring({ "after-completion": { months: 3 } }, { doOn: "2026-11-09", lastLog: { date: "2026-08-09", text: "done" }, created: "2026-01-01" });
    expect(doOnAfterRuleChange(brush, rule({ "after-completion": { months: 4 } }), DAY)).toBe("2026-12-09");
    expect(doOnAfterRuleChange({ ...brush, lastLog: null }, rule({ "after-completion": { months: 4 } }), DAY)).toBe("2026-05-01");
    expect(doOnAfterRuleChange({ ...brush, lastLog: null, created: null }, rule({ "after-completion": { weeks: 1 } }), DAY)).toBe("2026-11-25");
  });

  it("end doesn't stop it: the date past it is written and reads as ended", () => {
    expect(doOnAfterRuleChange(recurring({ monthly: { days: [5] } }, { doOn: "2026-12-05" }), rule({ monthly: { days: [10] }, end: "2026-11-30" }), DAY)).toBe("2026-12-10");
  });
});

describe("trailingLogStart — where the body's last section, the log, begins", () => {
  it.each([
    ["## Log\n- 2026-11-04 done\n", 0],
    ["Text.\n\n## Log\n- 2026-11-04 done\n", 7],
    ["Text.\r\n\r\n## log\r\n", 9],
    ["Text.\n\n## Log\n- x\n\n### Sub\n", 7],
    ["Text.\n", -1],
    ["", -1],
    ["## Log\n- x\n\n## Notes\n", -1],
    ["## Log\n- x\n# Top\n", -1],
    ["### Log\n", -1],
  ])("%j → %d", (body, at) => {
    expect(trailingLogStart(body)).toBe(at);
  });
});

describe("fixtures", () => {
  it("recurring() reads repeat like a file would", () => {
    expect(recurring(INVOICES).repeat).toMatchObject({ kind: "ok" });
  });
});
