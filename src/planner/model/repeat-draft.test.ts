import { formatSchedule } from "pomade-kit/schedule";
import { describe, expect, it } from "vitest";

import { at, recurring } from "./fixtures";
import { DEFAULT_DRAFT, defaultOn, draftOfSchedule, resolveDraft, type RepeatDraft } from "./repeat-draft";

const B3 = { hour: 3, minute: 0 };
// Wed 2026-11-18 10:00.
const NOW = at("2026-11-18 10:00");

const draft = (fields: Partial<RepeatDraft>): RepeatDraft => ({ ...DEFAULT_DRAFT, ...fields });

/** The draft's `repeat:` block, words and first do-on — or its problem. */
function resolve(fields: Partial<RepeatDraft>, now = NOW) {
  const r = resolveDraft(draft(fields), now, B3);
  return r.kind === "ok" ? { yaml: formatSchedule("repeat", r.schedule), description: r.description, doOn: r.doOn } : r;
}

describe("resolveDraft — the editor's rows as a kit schedule", () => {
  it("“Every 1 month on 5, 3 days early”: the ticket's invoices", () => {
    expect(resolve({ on: "5", lead: "3" })).toEqual({ yaml: "repeat:\n  monthly: { days: [5] }\n  lead-days: 3", description: "monthly on the 5th, shows 3 days early", doOn: "2026-12-05" });
  });

  it("“3 months after done”: the toothbrush", () => {
    expect(resolve({ mode: "after", count: "3" })).toEqual({ yaml: "repeat:\n  after-completion: { months: 3 }", description: "3 months after completion", doOn: "2027-02-18" });
    expect(resolve({ mode: "after", count: "10", unit: "day" })).toMatchObject({ yaml: "repeat:\n  after-completion: { days: 10 }", doOn: "2026-11-28" });
    expect(resolve({ mode: "after", count: "2", unit: "week", start: "dec 1" })).toMatchObject({ yaml: "repeat:\n  after-completion: { weeks: 2 }\n  start: 2026-12-01", doOn: "2026-12-01" });
  });

  it("“On” left empty: today's day of the month or weekday — the start's when there is one", () => {
    expect(defaultOn("month", "2026-11-08")).toBe("8");
    expect(defaultOn("week", "2026-11-18")).toBe("wed");
    expect(defaultOn("day", "2026-11-18")).toBe("");
    expect(resolve({})).toMatchObject({ yaml: "repeat:\n  monthly: { days: [18] }", doOn: "2026-11-18" });
    expect(resolve({ unit: "week" })).toMatchObject({ yaml: "repeat:\n  weekly: { days: [wed] }", doOn: "2026-11-18" });
    expect(resolve({ unit: "week", start: "2026-12-04" })).toMatchObject({ yaml: "repeat:\n  weekly: { days: [fri] }\n  start: 2026-12-04", doOn: "2026-12-04" });
  });

  it("weekdays and days of the month as lists, the kit's spellings", () => {
    expect(resolve({ unit: "week", on: "Mon, thursday" })).toMatchObject({ yaml: "repeat:\n  weekly: { days: [mon, thu] }", description: "every Mon and Thu", doOn: "2026-11-19" });
    expect(resolve({ unit: "week", on: "mon fri" })).toMatchObject({ yaml: "repeat:\n  weekly: { days: [mon, fri] }" });
    expect(resolve({ on: "1, 15, last" })).toMatchObject({ yaml: "repeat:\n  monthly: { days: [1, 15, last] }", doOn: "2026-11-30" });
    expect(resolve({ on: "first mon" })).toMatchObject({ yaml: "repeat:\n  monthly: { days: [first mon] }", doOn: "2026-12-07" });
    expect(resolve({ unit: "day" })).toMatchObject({ yaml: "repeat:\n  daily: {}", description: "every day", doOn: "2026-11-18" });
  });

  it("every N months: a months list from the start month, else this month", () => {
    expect(resolve({ count: "3", on: "5" })).toMatchObject({ yaml: "repeat:\n  monthly: { days: [5], months: [feb, may, aug, nov] }", doOn: "2027-02-05" });
    expect(resolve({ count: "12", on: "20" })).toMatchObject({ yaml: "repeat:\n  monthly: { days: [20], months: [nov] }", doOn: "2026-11-20" });
    expect(resolve({ count: "6", on: "1", start: "jan 1" })).toMatchObject({ yaml: "repeat:\n  monthly: { days: [1], months: [jan, jul] }\n  start: 2027-01-01", doOn: "2027-01-01" });
  });

  it("every N days or weeks: fixed dates counted from start — the ticket's “every 2 weeks on Mon from Nov 2” and “every 10 days from Jan 3”", () => {
    expect(resolve({ count: "2", unit: "week", on: "mon", start: "2026-11-02" })).toEqual({
      yaml: "repeat:\n  weekly: { every: 2, days: [mon] }\n  start: 2026-11-02",
      description: "every other Mon, from Nov 2, 2026",
      doOn: "2026-11-30",
    });
    expect(resolve({ count: "10", unit: "day", start: "2026-01-03" })).toEqual({
      yaml: "repeat:\n  daily: { every: 10 }\n  start: 2026-01-03",
      description: "every 10 days, from Jan 3, 2026",
      doOn: "2026-11-19",
    });
    expect(resolve({ count: "3", unit: "week", on: "mon, thu", lead: "2", start: "2026-11-02" })).toMatchObject({
      yaml: "repeat:\n  weekly: { every: 3, days: [mon, thu] }\n  start: 2026-11-02\n  lead-days: 2",
      doOn: "2026-11-23",
    });
  });

  it("every N days or weeks with no start: counted from today, which is written as start", () => {
    expect(resolve({ count: "2", unit: "week" })).toMatchObject({ yaml: "repeat:\n  weekly: { every: 2, days: [wed] }\n  start: 2026-11-18", doOn: "2026-11-18" });
    expect(resolve({ count: "3", unit: "day" })).toMatchObject({ yaml: "repeat:\n  daily: { every: 3 }\n  start: 2026-11-18", doOn: "2026-11-18" });
    // Every 1 needs no start, and after done never counts from one.
    expect(resolve({ count: "1", unit: "day" })).toMatchObject({ yaml: "repeat:\n  daily: {}" });
    expect(resolve({ mode: "after", count: "2", unit: "week" })).toMatchObject({ yaml: "repeat:\n  after-completion: { weeks: 2 }" });
  });

  it("start and end as date phrases; end shows in the words", () => {
    expect(resolve({ on: "5", end: "2027-03-31" })).toMatchObject({ yaml: "repeat:\n  monthly: { days: [5] }\n  end: 2027-03-31", description: "monthly on the 5th, until Mar 31, 2027" });
  });

  it("dates against the planner day: at 01:30 “today” is still yesterday", () => {
    expect(resolve({ unit: "day", start: "today" }, at("2026-11-19 01:30"))).toMatchObject({ doOn: "2026-11-18" });
  });

  it.each([
    [{ count: "0" }, "count", "How often: a whole number, 1 or more"],
    [{ count: "x" }, "count", "How often: a whole number, 1 or more"],
    [{ count: "5" }, "count", "Every 1, 2, 3, 4, 6 or 12 months"],
    [{ unit: "week" as const, on: "fry" }, "on", '"fry" is not a weekday — use mon, tue, wed, thu, fri, sat or sun'],
    [{ on: "32" }, "on", expect.stringContaining("32")],
    [{ lead: "soon" }, "lead", '"soon" is not allowed — use a whole number of days, 0 or more (0 = only on the day)'],
    [{ start: "nov 31" }, "start", "Nov has no day 31"],
    [{ end: "whenever" }, "end", "Not a date — try fri, tomorrow, +3d, nov 20"],
    [{ on: "5", end: "nov 30" }, "end", "No date from today on — check start and end"],
    [{ start: "jan 10", end: "jan 5" }, "end", "2027-01-05 is before start (2027-01-10)"],
  ])("%j → the problem on %s", (fields, field, message) => {
    expect(resolve(fields)).toEqual({ kind: "error", field, message });
  });
});

describe("draftOfSchedule — a file's rule as the editor's rows", () => {
  const of = (repeat: unknown, now = NOW) => {
    const read = recurring(repeat).repeat;
    if (read?.kind !== "ok") throw new Error("the fixture's rule can't be read");
    return draftOfSchedule(read.schedule, now, B3);
  };

  it.each([
    [{ monthly: { days: [5] }, "lead-days": 3 }, { mode: "every", count: "1", unit: "month", on: "5", lead: "3", start: "", end: "" }],
    [{ monthly: { days: [1, 15, "last"] } }, { mode: "every", count: "1", unit: "month", on: "1, 15, last", lead: "", start: "", end: "" }],
    [{ monthly: { days: ["first mon"] } }, { mode: "every", count: "1", unit: "month", on: "first mon", lead: "", start: "", end: "" }],
    [{ weekly: { days: ["mon", "thu"] }, start: "2026-12-01", end: "2027-03-31" }, { mode: "every", count: "1", unit: "week", on: "mon, thu", lead: "", start: "2026-12-01", end: "2027-03-31" }],
    [{ daily: {} }, { mode: "every", count: "1", unit: "day", on: "", lead: "", start: "", end: "" }],
    [{ daily: { every: 10 }, start: "2026-01-03" }, { mode: "every", count: "10", unit: "day", on: "", lead: "", start: "2026-01-03", end: "" }],
    [{ weekly: { every: 2, days: ["mon"] }, start: "2026-11-02", "lead-days": 1 }, { mode: "every", count: "2", unit: "week", on: "mon", lead: "1", start: "2026-11-02", end: "" }],
    [{ "after-completion": { months: 3 } }, { mode: "after", count: "3", unit: "month", on: "", lead: "", start: "", end: "" }],
    [{ "after-completion": { days: 10 }, "lead-days": 2 }, { mode: "after", count: "10", unit: "day", on: "", lead: "2", start: "", end: "" }],
  ])("%j", (repeat, draft) => {
    expect(of(repeat)).toEqual(draft);
  });

  it("every N months keeps the months the file counts from, whatever month it is now", () => {
    const quarterly = { monthly: { days: [5], months: ["feb", "may", "aug", "nov"] } };
    expect(of(quarterly)).toMatchObject({ count: "3", on: "5", phase: 2 });
    const draft = of(quarterly, at("2026-12-20 10:00"));
    expect(draft).toMatchObject({ count: "3", phase: 2 });
    // A field of the rule changed in December: the months stay Feb, May, Aug, Nov.
    const again = resolveDraft({ ...draft!, lead: "4" }, at("2026-12-20 10:00"), B3);
    expect(again).toMatchObject({ kind: "ok", schedule: { rule: { months: [2, 5, 8, 11] }, leadDays: 4 } });
    expect(of({ monthly: { days: [20], months: ["nov"] } })).toMatchObject({ count: "12", phase: 11 });
  });

  it("a rule whose end has passed is still the editor's", () => {
    expect(of({ monthly: { days: [10] }, end: "2026-10-31" })).toMatchObject({ on: "10", end: "2026-10-31" });
  });

  it.each([[{ once: "2026-12-24" }], [{ daily: {}, only: "weekdays" }], [{ daily: { every: 2 }, only: "weekdays", start: "2026-11-02" }], [{ monthly: { days: [5], months: ["jan", "feb"] } }], [{ monthly: { days: [5], months: ["jan", "feb", "mar", "apr", "may"] } }]])(
    "a rule the rows can't say is none: %j",
    (repeat) => {
      expect(of(repeat)).toBeNull();
    },
  );
});
