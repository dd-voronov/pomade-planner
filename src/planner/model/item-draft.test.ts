import { describe, expect, it } from "vitest";

import { at } from "./fixtures";
import { checkDraft, draftItem, hasDetails, ITEM_KINDS, newDraft, stepKind, type ItemDraft, type ItemKind } from "./item-draft";

const B3 = { hour: 3, minute: 0 };
// Tue 2026-11-17 10:00.
const NOW = at("2026-11-17 10:00");

const made = (draft: ItemDraft, now = NOW) => draftItem(draft, checkDraft(draft, now, B3), checkDraft(draft, now, B3).day);

describe("stepKind — the type switch walked", () => {
  it("forward: Task → Recurring → Note → Thought → Daily and round", () => {
    const walk: ItemKind[] = [];
    let kind: ItemKind = "task";
    for (let i = 0; i < 6; i++) walk.push((kind = stepKind(kind, 1)));
    expect(walk).toEqual(["recurring", "note", "thought", "daily-note", "task", "recurring"]);
  });

  it("back: Task → Daily → Thought → Note → Recurring → Task", () => {
    const walk: ItemKind[] = [];
    let kind: ItemKind = "task";
    for (let i = 0; i < 5; i++) walk.push((kind = stepKind(kind, -1)));
    expect(walk).toEqual(["daily-note", "thought", "note", "recurring", "task"]);
  });

  it("a step forward and one back is where it started, from every type", () => {
    for (const kind of ITEM_KINDS) expect(stepKind(stepKind(kind, 1), -1)).toBe(kind);
  });
});

describe("hasDetails", () => {
  it.each([
    ["task", true],
    ["recurring", true],
    ["note", true],
    ["thought", true],
    ["daily-note", false],
  ] as const)("%s → %s", (kind, has) => {
    expect(hasDetails(kind)).toBe(has);
  });
});

describe("newDraft", () => {
  it("starts as an empty task with no project", () => {
    expect(newDraft()).toMatchObject({ kind: "task", title: "", project: null, doOn: "", deadline: "", importance: "", details: "" });
  });

  it("takes the view's pre-fills", () => {
    expect(newDraft({ kind: "recurring", project: "quiz", doOn: "today" })).toMatchObject({ kind: "recurring", project: "quiz", doOn: "today" });
  });
});

describe("checkDraft", () => {
  it("resolves the phrases against the planner day", () => {
    const check = checkDraft({ ...newDraft(), doOn: "today", deadline: "fri", importance: "3" }, NOW, B3);
    expect(check).toMatchObject({ day: "2026-11-17", doOn: { kind: "date", date: "2026-11-17" }, deadline: { kind: "date", date: "2026-11-20" }, importance: { kind: "number", value: 3 } });
  });

  it("at 01:30 the day is still yesterday", () => {
    expect(checkDraft({ ...newDraft(), doOn: "today" }, at("2026-11-18 01:30"), B3)).toMatchObject({ day: "2026-11-17", doOn: { kind: "date", date: "2026-11-17" } });
  });

  it("the repeat editor's anchor is its start date, else the day", () => {
    const draft = newDraft({ kind: "recurring" });
    expect(checkDraft(draft, NOW, B3).repeatAnchor).toBe("2026-11-17");
    expect(checkDraft({ ...draft, repeat: { ...draft.repeat, start: "dec 20" } }, NOW, B3).repeatAnchor).toBe("2026-12-20");
    expect(checkDraft({ ...draft, repeat: { ...draft.repeat, start: "nonsense" } }, NOW, B3).repeatAnchor).toBe("2026-11-17");
  });
});

describe("draftItem", () => {
  it("a task: the normalized title, the dates and importance that are set, Details as the body", () => {
    expect(made({ ...newDraft(), title: "  Buy   a lamp ", doOn: "today", deadline: "+3d", importance: "2", details: "**Why:** it flickers" })).toEqual({
      kind: "ok",
      item: { type: "task", title: "Buy a lamp", created: "2026-11-17", doOn: "2026-11-17", deadline: "2026-11-20", importance: 2, body: "**Why:** it flickers\n" },
    });
    expect(made({ ...newDraft(), title: "Bare" })).toEqual({ kind: "ok", item: { type: "task", title: "Bare", created: "2026-11-17", doOn: null, deadline: null, importance: null, body: "" } });
  });

  it.each([
    ["task", "Give the task a title."],
    ["recurring", "Give the task a title."],
    ["note", "Give the note a title."],
    ["thought", "Give the thought a title."],
  ] as const)("a %s without a title is refused", (kind, message) => {
    expect(made({ ...newDraft({ kind }), title: "   " })).toEqual({ kind: "error", field: "title", message });
  });

  it.each([{ doOn: "nov 31" }, { deadline: "someday" }, { importance: "high" }])("a task with %j is refused on its fields", (patch) => {
    expect(made({ ...newDraft(), title: "T", ...patch })).toEqual({ kind: "error", field: "fields", message: "Fix the marked field first." });
  });

  it("a note or a thought carries its do-on alone — no deadline or importance, whatever was typed while it was a task; Details stay", () => {
    for (const kind of ["note", "thought"] as const) {
      expect(made({ ...newDraft({ kind }), title: "Idea", doOn: "today", deadline: "someday", importance: "high", details: "- one\n- two\n" })).toEqual({
        kind: "ok",
        item: { type: kind, title: "Idea", created: "2026-11-17", doOn: "2026-11-17", deadline: null, importance: null, body: "- one\n- two\n" },
      });
      expect(made({ ...newDraft({ kind }), title: "Idea", deadline: "fri" })).toMatchObject({ kind: "ok", item: { doOn: null, deadline: null } });
      expect(made({ ...newDraft({ kind }), title: "Idea", doOn: "nov 31" })).toEqual({ kind: "error", field: "fields", message: "Fix the marked field first." });
    }
  });

  it("a recurring item: the rule, do-on its first date, no deadline or importance; the task's marked fields don't stop it", () => {
    const draft = newDraft({ kind: "recurring" });
    const r = made({ ...draft, title: "Upload invoices", doOn: "nov 31", repeat: { ...draft.repeat, on: "5", lead: "3" }, details: "To the portal." });
    expect(r).toMatchObject({ kind: "ok", item: { type: "recurring", title: "Upload invoices", doOn: "2026-12-05", deadline: null, importance: null, body: "To the portal.\n", created: "2026-11-17" } });
    expect(r.kind === "ok" && r.item.repeat).toMatchObject({ leadDays: 3 });
  });

  it("a recurring item whose rule the kit refuses is refused on its fields", () => {
    const draft = newDraft({ kind: "recurring" });
    expect(made({ ...draft, title: "T", repeat: { ...draft.repeat, lead: "soon" } })).toEqual({ kind: "error", field: "fields", message: "Fix the marked field first." });
  });
});
