import { describe, expect, it } from "vitest";

import { foldsKey, groupKey, NO_FOLDS, parseFolds, rowsByGroup, serializeFolds, setFolded, unfoldAll, unfoldedEntries, type ListEntry } from "./folds";

describe("fold state", () => {
  it.each([
    [null, NO_FOLDS],
    ["today", NO_FOLDS],
    [[], NO_FOLDS],
    [{ today: ["quiz", "quiz", 3, ""] }, { ...NO_FOLDS, today: ["quiz"] }],
    [{ project: ["pomade/tasks"], all: "x" }, { ...NO_FOLDS, project: ["pomade/tasks"] }],
  ])("%j → %j", (value, folds) => {
    expect(parseFolds(value)).toEqual(folds);
  });

  it("round-trips, keys by context, and names a nested group under its outer one", () => {
    const folds = { ...NO_FOLDS, today: ["none"], recurring: ["quiz", "pomade/notes"] };
    expect(parseFolds(serializeFolds(folds))).toEqual(folds);
    expect(foldsKey("__workspace__")).toBe("planner.folds.__workspace__");
    expect(groupKey(["quiz"])).toBe("quiz");
    expect(groupKey(["quiz", "tasks"])).toBe("quiz/tasks");
  });

  it("folds and unfolds one group of one view; unchanged state stays the same object", () => {
    const folded = setFolded(NO_FOLDS, "today", "quiz", true);
    expect(folded).toEqual({ ...NO_FOLDS, today: ["quiz"] });
    expect(setFolded(folded, "today", "quiz", true)).toBe(folded);
    expect(setFolded(folded, "today", "quiz", false)).toEqual(NO_FOLDS);
    expect(setFolded(folded, "project", "quiz", false)).toBe(folded);
  });

  it("unfoldAll unfolds the groups an item is in; nothing folded, the same object", () => {
    const folds = { ...NO_FOLDS, today: ["quiz", "pomade", "quiz/notes"] };
    expect(unfoldAll(folds, "today", ["quiz", "quiz/notes"])).toEqual({ ...NO_FOLDS, today: ["pomade"] });
    expect(unfoldAll(folds, "today", ["none"])).toBe(folds);
    expect(unfoldAll(folds, "project", ["quiz"])).toBe(folds);
  });
});

describe("unfoldedEntries — two levels", () => {
  const g = (key: string, level: 1 | 2 = 1): ListEntry<string> => ({ kind: "group", key, level });
  const r = (row: string): ListEntry<string> => ({ kind: "row", row });
  const list = [g("none"), r("tax"), g("quiz"), g("quiz/tasks", 2), r("fix"), g("quiz/notes", 2), r("idea"), g("pomade"), g("pomade/tasks", 2), r("ship")];
  const shown = (folded: string[]) => unfoldedEntries(list, new Set(folded)).map((e) => (e.kind === "group" ? `#${e.key}` : e.row));

  it("nothing folded: everything", () => {
    expect(shown([])).toEqual(["#none", "tax", "#quiz", "#quiz/tasks", "fix", "#quiz/notes", "idea", "#pomade", "#pomade/tasks", "ship"]);
  });

  it("a folded group keeps its heading and hides its rows", () => {
    expect(shown(["none"])).toEqual(["#none", "#quiz", "#quiz/tasks", "fix", "#quiz/notes", "idea", "#pomade", "#pomade/tasks", "ship"]);
  });

  it("a folded outer group hides its inner groups whole, folded or not", () => {
    expect(shown(["quiz"])).toEqual(["#none", "tax", "#quiz", "#pomade", "#pomade/tasks", "ship"]);
    expect(shown(["quiz", "quiz/notes"])).toEqual(["#none", "tax", "#quiz", "#pomade", "#pomade/tasks", "ship"]);
  });

  it("an inner group folds on its own: its sibling and the next outer group show", () => {
    expect(shown(["quiz/tasks"])).toEqual(["#none", "tax", "#quiz", "#quiz/tasks", "#quiz/notes", "idea", "#pomade", "#pomade/tasks", "ship"]);
    expect(shown(["quiz/notes"])).toEqual(["#none", "tax", "#quiz", "#quiz/tasks", "fix", "#quiz/notes", "#pomade", "#pomade/tasks", "ship"]);
  });

  it("inner groups without an outer one (a list of level-2 groups alone) fold each on its own", () => {
    const flat = [g("tasks", 2), r("fix"), g("notes", 2), r("idea")];
    expect(unfoldedEntries(flat, new Set(["tasks"])).map((e) => (e.kind === "group" ? `#${e.key}` : e.row))).toEqual(["#tasks", "#notes", "idea"]);
  });
});

describe("rowsByGroup — what each heading counts", () => {
  const g = (key: string, level: 1 | 2 = 1): ListEntry<string> => ({ kind: "group", key, level });
  const r = (row: string): ListEntry<string> => ({ kind: "row", row });

  it("an outer group holds its inner groups' rows; an inner group its own", () => {
    const list = [g("none"), r("tax"), g("quiz"), g("quiz/tasks", 2), r("fix"), r("dark"), g("quiz/notes", 2), r("idea"), g("pomade"), g("pomade/tasks", 2), r("ship")];
    expect(Object.fromEntries(rowsByGroup(list))).toEqual({
      none: ["tax"],
      quiz: ["fix", "dark", "idea"],
      "quiz/tasks": ["fix", "dark"],
      "quiz/notes": ["idea"],
      pomade: ["ship"],
      "pomade/tasks": ["ship"],
    });
  });

  it("level-2 groups alone: each its own rows", () => {
    expect(Object.fromEntries(rowsByGroup([g("tasks", 2), r("fix"), g("notes", 2), r("idea")]))).toEqual({ tasks: ["fix"], notes: ["idea"] });
  });
});
