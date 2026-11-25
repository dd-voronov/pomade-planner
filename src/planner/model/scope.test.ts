import { describe, expect, it } from "vitest";

import type { ListEntry } from "./folds";
import { recurring, task } from "./fixtures";
import type { Task } from "./items";
import { NONE_SOURCE, type ProjectSource } from "./projects";
import { countsInProject, inAllFilter, inScope, inToday, isOwn, liveMixins, projectEntries, projectGroupOf, projectRows, revealInAll, viewListing, type Context } from "./scope";
import { DEFAULT_VIEW } from "./view-state";

const D = "2026-11-17";
const src = (key: string, id: string | null = key): ProjectSource => ({ kind: "project", key, id, name: key, groupPath: [], folder: key });
const WS: Context = { kind: "workspace" };
const QUIZ: Context = { kind: "project", id: "quiz" };

describe("isOwn", () => {
  it("at Workspace the workspace-level items; in a project the project's", () => {
    expect(isOwn(WS, NONE_SOURCE)).toBe(true);
    expect(isOwn(WS, src("quiz"))).toBe(false);
    expect(isOwn(QUIZ, src("quiz"))).toBe(true);
    expect(isOwn(QUIZ, src("pomade"))).toBe(false);
    expect(isOwn(QUIZ, NONE_SOURCE)).toBe(false);
    expect(isOwn(QUIZ, src("folder:quiz", null))).toBe(false);
  });
});

describe("inToday", () => {
  it("the whole day in every context, mix-ins or not", () => {
    for (const context of [WS, QUIZ]) {
      for (const s of [NONE_SOURCE, src("quiz"), src("pomade"), src("folder:x", null)]) expect(inToday(context, DEFAULT_VIEW, s)).toBe(true);
    }
  });

  it("the project filter leaves a project's own items; at Workspace there is none", () => {
    const only = { onlyProject: true };
    expect(inToday(QUIZ, only, src("quiz"))).toBe(true);
    expect(inToday(QUIZ, only, src("pomade"))).toBe(false);
    expect(inToday(QUIZ, only, NONE_SOURCE)).toBe(false);
    expect(inToday(WS, only, src("pomade"))).toBe(true);
  });
});

describe("inScope — Project and Recurring", () => {
  it("Workspace spans everything", () => {
    for (const s of [NONE_SOURCE, src("quiz"), src("folder:x", null)]) expect(inScope(WS, DEFAULT_VIEW, s)).toBe(true);
  });

  it("a project: its own items only, until something is mixed in", () => {
    expect(inScope(QUIZ, DEFAULT_VIEW, src("quiz"))).toBe(true);
    expect(inScope(QUIZ, DEFAULT_VIEW, src("pomade"))).toBe(false);
    expect(inScope(QUIZ, DEFAULT_VIEW, NONE_SOURCE)).toBe(false);
  });

  it("mix-ins: the no-project items, and other projects by key", () => {
    const view = { mixins: ["none", "pomade", "folder:x"] };
    expect(inScope(QUIZ, view, NONE_SOURCE)).toBe(true);
    expect(inScope(QUIZ, view, src("pomade"))).toBe(true);
    expect(inScope(QUIZ, view, src("folder:x", null))).toBe(true);
    expect(inScope(QUIZ, view, src("other"))).toBe(false);
    expect(inScope(QUIZ, { mixins: ["pomade"] }, NONE_SOURCE)).toBe(false);
  });
});

describe("inAllFilter", () => {
  it("empty filters pass everything; a project filter by source key (none = no project); a type filter by type", () => {
    expect(inAllFilter(DEFAULT_VIEW, src("quiz"), "task")).toBe(true);
    const two = { projects: ["quiz", "pomade"], types: [] };
    expect(inAllFilter(two, src("quiz"), "task")).toBe(true);
    expect(inAllFilter(two, src("pomade"), "task")).toBe(true);
    expect(inAllFilter(two, src("alpha"), "task")).toBe(false);
    expect(inAllFilter(two, NONE_SOURCE, "task")).toBe(false);
    expect(inAllFilter({ projects: ["none"], types: [] }, NONE_SOURCE, "task")).toBe(true);
    expect(inAllFilter({ projects: [], types: ["note"] }, src("quiz"), "task")).toBe(false);
    expect(inAllFilter({ projects: ["quiz"], types: ["task"] }, src("quiz"), "task")).toBe(true);
  });
});

describe("Project — every type, in two groups", () => {
  const thought = task({ title: "Why", type: "thought", created: "2026-11-12" });
  const note = task({ title: "Idea", type: "note", doOn: "2026-11-20" });
  const between = recurring({ monthly: { days: [5] }, "lead-days": 3 }, { title: "Invoices", doOn: "2026-12-05" });
  const dueRecurring = recurring({ weekly: { days: ["tue"] } }, { title: "Stretch", doOn: D });
  const ended = recurring({ monthly: { days: [1] }, end: "2026-10-31" }, { title: "Old rent", doOn: "2026-11-01" });

  it.each([
    [task({ title: "Open" }), "tasks"],
    [task({ title: "Ticked today", done: true, doneOn: D }), "tasks"],
    [task({ title: "Done before", done: true, doneOn: "2026-11-16" }), null],
    [task({ title: "Archived", archived: true }), null],
    [between, "tasks"],
    [dueRecurring, "tasks"],
    [ended, "tasks"],
    [recurring({ weekly: { days: ["tue"] } }, { title: "Stopped by hand", doOn: D, done: true }), null],
    [task({ title: "Bad rule", type: "recurring", repeat: { kind: "error", message: "x" } }), "tasks"],
    [note, "notes"],
    [thought, "notes"],
    [task({ title: "Resolved", type: "thought", done: true, doneOn: D }), null],
    [task({ title: "Archived note", type: "note", archived: true }), null],
    [task({ title: "2026-11-17", type: "daily-note", date: D }), null],
  ] as const)("%# %o → %s", (item, group) => {
    expect(projectGroupOf(item, D)).toBe(group);
  });

  it("projectRows: each group in list order", () => {
    const rows = projectRows(
      [note, task({ title: "Later", doOn: "2026-12-01" }), task({ title: "Undated" }), between, thought, task({ title: "Ticked today", done: true, doneOn: D, deadline: "2026-11-18" }), task({ title: "Overdue", deadline: "2026-11-10" })],
      D,
    );
    expect(rows.tasks.map((t) => t.title)).toEqual(["Overdue", "Ticked today", "Later", "Invoices", "Undated"]);
    expect(rows.notes.map((t) => t.title)).toEqual(["Idea", "Why"]);
  });

  it("counts: open tasks and the recurring items due — not ticked ones, recurring items between runs or ended, notes or thoughts", () => {
    expect(countsInProject(task({ title: "Open" }), D)).toBe(true);
    expect(countsInProject(task({ title: "Ticked", done: true, doneOn: D }), D)).toBe(false);
    expect(countsInProject(dueRecurring, D)).toBe(true);
    expect(countsInProject(between, D)).toBe(false);
    expect(countsInProject(ended, D)).toBe(false);
    expect(countsInProject(note, D)).toBe(false);
    expect(countsInProject(thought, D)).toBe(false);
  });

  const groupOf = (t: Task) => projectGroupOf(t, D) ?? "tasks";
  const shape = (entries: ListEntry<Task>[]) => entries.map((e) => (e.kind === "group" ? `${String(e.level)}:${e.key}` : e.row.title));

  it("inside a project: Tasks, then Notes and thoughts, level 2; a group with no row has no heading", () => {
    expect(shape(projectEntries([task({ title: "A" }), note, task({ title: "B" }), thought], groupOf))).toEqual(["2:tasks", "A", "B", "2:notes", "Idea", "Why"]);
    expect(shape(projectEntries([note], groupOf))).toEqual(["2:notes", "Idea"]);
    expect(shape(projectEntries([task({ title: "A" })], groupOf))).toEqual(["2:tasks", "A"]);
    expect(projectEntries([], groupOf)).toEqual([]);
  });

  it("at Workspace: a heading per source in heading order, the two groups keyed under it", () => {
    const quiz = src("quiz");
    const inQuiz = (t: Task): Task => ({ ...t, folder: "quiz" });
    const sourceOf = (t: Task) => (t.folder === null ? NONE_SOURCE : quiz);
    const rows = [inQuiz(task({ title: "Q" })), task({ title: "A" }), inQuiz(note), thought];
    expect(shape(projectEntries(rows, groupOf, sourceOf))).toEqual(["1:none", "2:none/tasks", "A", "2:none/notes", "Why", "1:quiz", "2:quiz/tasks", "Q", "2:quiz/notes", "Idea"]);
  });
});

describe("liveMixins", () => {
  it("drops the project itself and keys no longer known; the no-project items always stay", () => {
    expect(liveMixins(QUIZ, { mixins: ["quiz", "none", "pomade", "gone"] }, new Set(["quiz", "pomade"]))).toEqual(["none", "pomade"]);
  });
});

describe("viewListing — where an item just added shows", () => {
  const rows = { today: ["a"], project: ["a", "b"], recurring: ["r"], all: ["a", "b", "r", "n"] };
  it.each([
    ["a", "today", { view: "today", listed: true }],
    ["a", "project", { view: "project", listed: true }],
    ["a", "all", { view: "all", listed: true }],
    // A task with no date added from Today lives in Project.
    ["b", "today", { view: "project", listed: true }],
    ["b", "recurring", { view: "project", listed: true }],
    // A recurring item between occurrences lives in Recurring.
    ["r", "today", { view: "recurring", listed: true }],
    ["r", "project", { view: "recurring", listed: true }],
    ["r", "recurring", { view: "recurring", listed: true }],
    // An item no other view lists lives in All.
    ["n", "today", { view: "all", listed: true }],
    ["n", "project", { view: "all", listed: true }],
    ["n", "recurring", { view: "all", listed: true }],
    // All's filters hide it — from another view, and in All itself.
    ["x", "today", { view: "all", listed: false }],
    ["x", "all", { view: "all", listed: false }],
  ] as const)("%s added from %s → %j", (path, current, listing) => {
    expect(viewListing(path, current, rows)).toEqual(listing);
  });
});

describe("revealInAll", () => {
  it("selects All and leaves empty filters alone", () => {
    expect(revealInAll({ ...DEFAULT_VIEW, view: "today", mixins: ["none"] }, src("quiz"), "note")).toEqual({ ...DEFAULT_VIEW, view: "all", mixins: ["none"] });
  });

  it("widens a filter that hides the item by the item's own key, and only that filter", () => {
    const view = { ...DEFAULT_VIEW, view: "all" as const, projects: ["pomade"], types: ["task"], showDone: true };
    expect(revealInAll(view, src("quiz"), "task")).toEqual({ ...view, projects: ["pomade", "quiz"] });
    expect(revealInAll(view, src("pomade"), "thought")).toEqual({ ...view, types: ["task", "thought"] });
    expect(revealInAll(view, NONE_SOURCE, "note")).toEqual({ ...view, projects: ["pomade", "none"], types: ["task", "note"] });
    expect(revealInAll(view, src("pomade"), "task")).toEqual(view);
  });

  it("the widened filters pass the item", () => {
    const view = revealInAll({ ...DEFAULT_VIEW, projects: ["pomade"], types: ["task"] }, src("folder:x", null), "note");
    expect(inAllFilter(view, src("folder:x", null), "note")).toBe(true);
  });
});
