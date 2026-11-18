import { describe, expect, it } from "vitest";

import { attentionOf, badgeOf, shouldSummarize, summaryOf } from "./attention";
import { recurring, task } from "./fixtures";
import type { Task } from "./items";

const D = "2026-11-10";
const MONTHLY_10 = { monthly: { days: [10] } };

/** The titles of each kind on D. */
function kinds(tasks: Task[]): { overdue: string[]; dueToday: string[]; soon: string[] } {
  const a = attentionOf(tasks, D);
  const t = (rows: { task: Task }[]) => rows.map((r) => r.task.title);
  return { overdue: t(a.overdue), dueToday: t(a.dueToday), soon: t(a.soon) };
}

describe("attentionOf", () => {
  it("sorts Today's open rows into overdue, due today and soon; planned and rolled-over tasks aren't due", () => {
    expect(
      kinds([
        task({ title: "Pay the tax", deadline: "2026-11-09" }),
        task({ title: "Buy ink", deadline: D }),
        task({ title: "Planned", doOn: D }),
        task({ title: "Rolled", doOn: "2026-11-02" }),
        task({ title: "Later", deadline: "2026-11-20" }),
        recurring(MONTHLY_10, { title: "Rent", doOn: D }),
        recurring({ monthly: { days: [13] }, "lead-days": 5 }, { title: "Tax report", doOn: "2026-11-13" }),
        recurring({ monthly: { days: [20] }, "lead-days": 2 }, { title: "Waiting", doOn: "2026-11-20" }),
      ]),
    ).toEqual({ overdue: ["Pay the tax"], dueToday: ["Buy ink", "Rent"], soon: ["Tax report"] });
  });

  it("counts a recurring item that missed several runs once, as overdue", () => {
    const a = attentionOf([recurring({ weekly: { days: ["tue"] } }, { title: "Bins", doOn: "2026-10-27" })], D);
    expect(a.overdue.map((r) => r.recurring?.missed)).toEqual([3]);
    expect(badgeOf(a)).toEqual({ count: 1, urgent: true });
  });

  it("leaves out ticked tasks (crossed out in Today), done recurring items, notes, thoughts, daily notes and archived items", () => {
    expect(
      kinds([
        task({ title: "Ticked", deadline: D, done: true, doneOn: D }),
        task({ title: "Ticked late", deadline: "2026-11-01", done: true, doneOn: D }),
        recurring(MONTHLY_10, { title: "Done by hand", doOn: D, done: true }),
        task({ title: "Note", type: "note", deadline: D }),
        task({ title: "Thought", type: "thought", deadline: "2026-11-01" }),
        task({ title: "Daily", type: "daily-note", deadline: D }),
        task({ title: "Archived", deadline: D, archived: true }),
      ]),
    ).toEqual({ overdue: [], dueToday: [], soon: [] });
  });

  it("follows the planner day: yesterday's due today is overdue tomorrow", () => {
    const tasks = [task({ title: "Buy ink", deadline: D })];
    expect(badgeOf(attentionOf(tasks, D))).toEqual({ count: 1, urgent: false });
    expect(badgeOf(attentionOf(tasks, "2026-11-11"))).toEqual({ count: 1, urgent: true });
    expect(badgeOf(attentionOf(tasks, "2026-11-09"))).toEqual({ count: 0, urgent: false });
  });
});

describe("badgeOf", () => {
  it("is overdue + due today, red only when something is overdue, 0 when nothing is due; soon items don't count", () => {
    const soon = recurring({ monthly: { days: [13] }, "lead-days": 5 }, { title: "Tax report", doOn: "2026-11-13" });
    expect(badgeOf(attentionOf([task({ deadline: "2026-11-09" }), task({ title: "B", deadline: D }), task({ title: "C", deadline: D }), soon], D))).toEqual({ count: 3, urgent: true });
    expect(badgeOf(attentionOf([task({ deadline: D }), soon], D))).toEqual({ count: 1, urgent: false });
    expect(badgeOf(attentionOf([soon], D))).toEqual({ count: 0, urgent: false });
    expect(badgeOf(attentionOf([], D))).toEqual({ count: 0, urgent: false });
  });
});

describe("shouldSummarize", () => {
  it.each([
    [D, null, true],
    [D, "2026-11-09", true],
    [D, "2026-10-31", true],
    [D, D, false],
    // A boundary moved later takes the planner back a day: nothing again.
    ["2026-11-09", D, false],
    ["2027-01-01", "2026-12-31", true],
  ])("on %s after %s → %s", (day, last, expected) => {
    expect(shouldSummarize(day, last)).toBe(expected);
  });
});

describe("summaryOf", () => {
  const due = (title: string) => task({ title, deadline: D });
  const late = (title: string, deadline = "2026-11-09") => task({ title, deadline });
  const soon = (title: string, doOn: string) => recurring({ monthly: { days: [Number(doOn.slice(8))] }, "lead-days": 7 }, { title, doOn });
  const text = (tasks: Task[]) => summaryOf(attentionOf(tasks, D));

  it("reads like the ticket: counts, then the soon items by name; the body names the due ones, overdue first", () => {
    expect(text([due("Buy printer ink"), due("Call the bank"), late("Pay the tax"), soon("Tax report", "2026-11-13")])).toEqual({
      title: "2 due today, 1 overdue, Tax report due in 3 days",
      body: "Overdue: Pay the tax · Due today: Buy printer ink, Call the bank",
    });
  });

  it("is null when nothing is due", () => {
    expect(text([])).toBeNull();
    expect(text([task({ doOn: D }), task({ deadline: "2026-11-30" })])).toBeNull();
  });

  it("leaves a zero count out", () => {
    expect(text([due("A")])).toEqual({ title: "1 due today", body: "Due today: A" });
    expect(text([late("A"), late("B")])).toEqual({ title: "2 overdue", body: "Overdue: A, B" });
  });

  it("only soon items: their names in the title, no body", () => {
    expect(text([soon("Tax report", "2026-11-13"), soon("Water plants", "2026-11-11")])).toEqual({ title: "Water plants due tomorrow, Tax report due in 3 days", body: "" });
  });

  it("names up to 3 soon items in the title, then “+N more”, soonest first", () => {
    const items = [soon("E", "2026-11-16"), soon("A", "2026-11-11"), soon("C", "2026-11-13"), soon("B", "2026-11-12"), soon("D", "2026-11-15")];
    expect(text(items)?.title).toBe("A due tomorrow, B due in 2 days, C due in 3 days, +2 more");
  });

  it("names up to 3 due items in the body — overdue first, in Today's order — then “+N more”", () => {
    const items = [due("D1"), due("D2"), late("L2", "2026-11-08"), late("L1", "2026-11-01")];
    expect(text(items)).toEqual({ title: "2 due today, 2 overdue", body: "Overdue: L1, L2 · Due today: D1 · +1 more" });
    expect(text([late("A"), late("B"), late("C"), late("D"), due("E")])?.body).toBe("Overdue: A, B, C · +2 more");
  });

  it("says how many runs a recurring item missed", () => {
    expect(text([recurring({ weekly: { days: ["tue"] } }, { title: "Bins", doOn: "2026-10-27" }), recurring({ monthly: { days: [9] } }, { title: "Rent", doOn: "2026-11-09" })])).toEqual({
      title: "2 overdue",
      body: "Overdue: Bins (missed 3×), Rent",
    });
  });

  it("cuts a long name to 40 characters and the title to 200", () => {
    const long = "Renew the passport before the trip to Lisbon in December";
    expect(text([due(long)])?.body).toBe("Due today: Renew the passport before the trip to L…");
    const many = ["a", "b", "c"].map((c, i) => soon(c.repeat(60), `2026-11-1${i + 1}`));
    const title = text([...many, due("x")])?.title ?? "";
    expect(title.length).toBeLessThanOrEqual(200);
    expect(title.startsWith(`1 due today, ${"a".repeat(39)}… due tomorrow`)).toBe(true);
  });
});
