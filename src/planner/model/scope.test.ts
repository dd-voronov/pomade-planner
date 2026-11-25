import { describe, expect, it } from "vitest";

import { task } from "./fixtures";
import { NONE_SOURCE, type ProjectSource } from "./projects";
import { inAllFilter, inScope, inToday, isOwn, liveMixins, projectRows, revealInAll, viewListing, type Context } from "./scope";
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
    const view = { mixNoProject: true, mixProjects: ["pomade", "folder:x"] };
    expect(inScope(QUIZ, view, NONE_SOURCE)).toBe(true);
    expect(inScope(QUIZ, view, src("pomade"))).toBe(true);
    expect(inScope(QUIZ, view, src("folder:x", null))).toBe(true);
    expect(inScope(QUIZ, view, src("other"))).toBe(false);
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

describe("projectRows", () => {
  it("every open item and the ones ticked today, in list order; done before today drops out", () => {
    const rows = projectRows(
      [
        task({ title: "Later", doOn: "2026-12-01" }),
        task({ title: "Undated" }),
        task({ title: "Ticked today", done: true, doneOn: D, deadline: "2026-11-18" }),
        task({ title: "Done before", done: true, doneOn: "2026-11-16" }),
        task({ title: "Overdue", deadline: "2026-11-10" }),
      ],
      D,
    );
    expect(rows.map((t) => t.title)).toEqual(["Overdue", "Ticked today", "Later", "Undated"]);
  });
});

describe("liveMixins", () => {
  it("drops the project itself and keys no longer known", () => {
    expect(liveMixins(QUIZ, { mixProjects: ["quiz", "pomade", "gone", "none"] }, new Set(["quiz", "pomade"]))).toEqual(["pomade"]);
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
    // A note or a thought, or an item out of the context's scope, lives in All.
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
    expect(revealInAll({ ...DEFAULT_VIEW, view: "today", mixNoProject: true }, src("quiz"), "note")).toEqual({ ...DEFAULT_VIEW, view: "all", mixNoProject: true });
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
