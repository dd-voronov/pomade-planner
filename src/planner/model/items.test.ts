import { readFrontmatter } from "pomade-kit/protocol";
import { describe, expect, it } from "vitest";

import { brokenItemType, isItemChange, mergeItems, needsText, needsTypeCheck, projectFolders, readItems, taskOf, type ItemEntry } from "./items";

const R = "Knowledge/To-dos";

function entry(name: string, text: string, mtimeMs = 7): ItemEntry {
  return { path: `${R}/${name}`, name, kind: "file", mtimeMs, ...readFrontmatter(text) };
}

describe("taskOf", () => {
  it("reads every item-type field", () => {
    const t = taskOf(
      entry(
        "2026-11-09-renew.md",
        "---\ntype: task\ntitle: Renew Nora's swimming class\nstatus: open\ndo-on: 2026-11-09\ndeadline: 2026-11-14\nimportance: 3\ncreated: 2026-11-09\n---\nbody\n",
      ),
    );
    expect(t).toEqual({
      path: `${R}/2026-11-09-renew.md`,
      name: "2026-11-09-renew.md",
      folder: null,
      type: "task",
      title: "Renew Nora's swimming class",
      titled: true,
      done: false,
      archived: false,
      date: null,
      doOn: "2026-11-09",
      deadline: "2026-11-14",
      importance: 3,
      created: "2026-11-09",
      doneOn: null,
      problems: [],
      mtimeMs: 7,
      repeat: null,
      lastLog: null,
      progress: null,
      excerpt: null,
    });
  });

  it.each([
    ["status: done", true],
    ["status: open", false],
    ["status: Done", false],
    ["status: waiting", false],
    ["", false],
  ])("%j → done %s", (line, done) => {
    expect(taskOf(entry("x.md", `---\ntype: task\n${line}\n---\n`))?.done).toBe(done);
  });

  it("falls back to the file name for a missing or empty title", () => {
    expect(taskOf(entry("Buy ink.md", "---\ntype: task\n---\n"))?.title).toBe("Buy ink");
    expect(taskOf(entry("Buy ink.md", "---\ntype: task\ntitle: '  '\n---\n"))?.title).toBe("Buy ink");
    expect(taskOf(entry("n.md", "---\ntype: task\ntitle: 42\n---\n"))?.title).toBe("42");
  });

  it.each([
    ["do-on: next week", ["do-on isn't a date (YYYY-MM-DD)"]],
    ["do-on: 2026-02-30", ["do-on isn't a date (YYYY-MM-DD)"]],
    ["deadline: 20261109", ["deadline isn't a date (YYYY-MM-DD)"]],
    ["deadline: 2026-11-9", ["deadline isn't a date (YYYY-MM-DD)"]],
    ["created: [2026-11-09]", ["created isn't a date (YYYY-MM-DD)"]],
    ["done-on: yesterday", ["done-on isn't a date (YYYY-MM-DD)"]],
    ["importance: high", ["importance isn't a number"]],
    ["importance: '5'", []],
    ["importance: -1.5", []],
    ["do-on:", []],
    ["do-on: ''", []],
    ["deadline: ' 2026-11-09 '", []],
  ])("%j → problems %j", (line, problems) => {
    expect(taskOf(entry("x.md", `---\ntype: task\n${line}\n---\n`))?.problems).toEqual(problems);
  });

  it("an invalid field reads as unset", () => {
    const t = taskOf(entry("x.md", "---\ntype: task\ndo-on: soon\nimportance: lots\n---\n"));
    expect(t).toMatchObject({ doOn: null, importance: null });
    expect(taskOf(entry("x.md", "---\ntype: task\nimportance: '5'\n---\n"))?.importance).toBe(5);
  });

  it.each([
    ["no frontmatter", "# Just a note\n"],
    ["no type", "---\ntitle: x\n---\n"],
    ["an unknown type", "---\ntype: recipe\n---\n"],
    ["a type in another case", "---\ntype: Note\n---\n"],
    ["a non-string type", "---\ntype: [task]\n---\n"],
  ])("ignores a file with %s", (_, text) => {
    expect(taskOf(entry("x.md", text))).toBeNull();
  });

  it("ignores folders and files that aren't Markdown", () => {
    expect(taskOf({ ...entry("x.md", "---\ntype: task\n---\n"), kind: "dir" })).toBeNull();
    expect(taskOf({ ...entry("x.txt", "---\ntype: task\n---\n") })).toBeNull();
    expect(taskOf(entry("X.MD", "---\ntype: task\n---\n"))?.title).toBe("X");
  });
});

describe("brokenItemType", () => {
  it.each([
    ["---\ntype: task\ntitle: [oops\n---\n", "task"],
    ['---\ntitle: [oops\ntype: "task"\n---\n', "task"],
    ["---\ntype: 'task' # a to-do\nx: [\n---\n", "task"],
    ["---\r\ntype: task\r\nx: [\r\n---\r\n", "task"],
    ["﻿---\ntype: task\nx: [\n---\n", "task"],
    ["---\ntype: task\nx: [\n", "task"],
    ["---\ntype: note\nx: [\n---\n", "note"],
    ["---\ntype: idea\nx: [\n---\n", null],
    ["---\n  type: task\nx: [\n---\n", null],
    ["---\nx: [\n---\ntype: task\n", null],
    ["type: task\n", null],
    ["", null],
  ])("%j → %s", (text, type) => {
    expect(brokenItemType(text)).toBe(type);
  });
});

describe("readItems", () => {
  it("tasks, unreadable files of a Planner type (sorted by path), and nothing else", () => {
    const broken = entry("b-broken.md", "---\ntype: task\ntitle: [oops\n---\n");
    const brokenOther = entry("a-broken-other.md", "---\ntype: recipe\nx: [\n---\n");
    const brokenTask2 = entry("a-broken.md", "---\ntype: task\nx: [\n---\n");
    const entries = [entry("t.md", "---\ntype: task\ntitle: T\n---\n"), broken, brokenOther, brokenTask2, entry("n.md", "plain\n")];
    expect(entries.filter(needsTypeCheck).map((e) => e.name)).toEqual(["b-broken.md", "a-broken-other.md", "a-broken.md"]);
    const types = new Map([
      [broken.path, "task" as const],
      [brokenOther.path, null],
      [brokenTask2.path, "task" as const],
    ]);
    const items = readItems(entries, types);
    expect(items.tasks.map((t) => t.title)).toEqual(["T"]);
    expect(items.unreadable.map((u) => [u.name, u.type])).toEqual([
      ["a-broken.md", "task"],
      ["b-broken.md", "task"],
    ]);
    expect(items.unreadable[0]?.reason).toMatch(/flow collection|unexpected end/);
    expect(items.tasks[0]?.folder).toBeNull();
  });

  it("a project sub-folder's items carry its folder", () => {
    const t = entry("QuizLab/t.md", "---\ntype: task\ntitle: T\n---\n");
    const b = entry("QuizLab/b.md", "---\ntype: task\nx: [\n---\n");
    const items = readItems([t, b], new Map([[b.path, "task" as const]]), "QuizLab");
    expect(items.tasks.map((x) => x.folder)).toEqual(["QuizLab"]);
    expect(items.unreadable.map((x) => x.folder)).toEqual(["QuizLab"]);
  });
});

describe("projectFolders and mergeItems", () => {
  const dir = (name: string): ItemEntry => ({ path: `${R}/${name}`, name, kind: "dir", mtimeMs: 1 });
  it("sub-folders other than hidden and reserved ones, sorted", () => {
    expect(projectFolders([dir("QuizLab"), dir("Daily"), dir("_archive"), dir(".git"), dir("Pomade"), entry("x.md", "x\n"), dir("daily")])).toEqual(["Pomade", "QuizLab"]);
  });

  it("joins the root's and each folder's items; unreadable ones by path", () => {
    const merged = mergeItems(
      [
        { tasks: [taskOf(entry("t.md", "---\ntype: task\n---\n"))!], unreadable: [{ path: `${R}/z.md`, name: "z.md", folder: null, archived: false, type: "task", reason: "r" }] },
        { tasks: [], unreadable: [{ path: `${R}/A/a.md`, name: "a.md", folder: "A", archived: false, type: "task", reason: "r" }] },
      ],
      ["A"],
    );
    expect(merged.tasks).toHaveLength(1);
    expect(merged.unreadable.map((u) => u.path)).toEqual([`${R}/A/a.md`, `${R}/z.md`]);
    expect(merged.folders).toEqual(["A"]);
  });
});

describe("isItemChange", () => {
  it.each([
    [{ path: R }, true],
    [{ path: `${R}/x.md` }, true],
    [{ path: `${R}/sub/x.md` }, true],
    [{ path: `${R}/sub` }, true],
    [{ path: `${R}/sub/deeper/x.md` }, false],
    [{ path: `${R}/QuizLab2`, oldPath: `${R}/QuizLab` }, true],
    [{ path: "Knowledge/To-dos-old/x.md" }, false],
    [{ path: "Knowledge/x.md" }, false],
    [{ path: "elsewhere.md", oldPath: `${R}/x.md` }, true],
  ])("%j → %s", (change, expected) => {
    expect(isItemChange(change, R)).toBe(expected);
  });

  it("works for a tasks root at the workspace root", () => {
    expect(isItemChange({ path: "x.md" }, "")).toBe(true);
    expect(isItemChange({ path: "a/x.md" }, "")).toBe(true);
    expect(isItemChange({ path: "a/b/x.md" }, "")).toBe(false);
  });
});

describe("notes, thoughts and daily notes", () => {
  it("a note: open, never done; a thought: resolved is closed, done isn't", () => {
    expect(taskOf(entry("n.md", "---\ntype: note\ntitle: Idea\nstatus: done\n---\n"))).toMatchObject({ type: "note", done: false, archived: false });
    expect(taskOf(entry("t.md", "---\ntype: thought\nstatus: resolved\ndone-on: 2026-11-12\n---\n"))).toMatchObject({ type: "thought", done: true, doneOn: "2026-11-12" });
    expect(taskOf(entry("t.md", "---\ntype: thought\nstatus: done\n---\n"))?.done).toBe(false);
    expect(taskOf(entry("t.md", "---\ntype: task\nstatus: resolved\n---\n"))?.done).toBe(false);
  });

  it("a daily note: its date, untitled, its checkbox progress and excerpt from the text", () => {
    const text = "---\ntype: daily-note\ndate: 2026-11-10\n---\n# Tuesday\n\n- [x] one\n- [ ] two\n";
    expect(taskOf(entry("2026-11-10.md", text), null, text)).toMatchObject({ type: "daily-note", date: "2026-11-10", titled: false, title: "2026-11-10", progress: { done: 1, total: 2 }, excerpt: "one · two" });
    expect(taskOf(entry("2026-11-10.md", text))?.progress).toBeNull();
    expect(taskOf(entry("x.md", "---\ntype: daily-note\ndate: soon\n---\n"))?.problems).toEqual(["date isn't a date (YYYY-MM-DD)"]);
  });

  it("an item read from _archive/ is archived", () => {
    expect(readItems([entry("n.md", "---\ntype: note\n---\n")], new Map(), "QuizLab", new Map(), true).tasks[0]).toMatchObject({ folder: "QuizLab", archived: true });
  });

  it("which texts are read: recurring items' and daily notes'; with all, every item's", () => {
    const of = (t: string) => entry("x.md", `---\ntype: ${t}\n---\n`);
    expect(["task", "recurring", "daily-note", "note", "thought"].map((t) => needsText(of(t)))).toEqual([false, true, true, false, false]);
    expect(["task", "note", "recipe"].map((t) => needsText(of(t), true))).toEqual([true, true, false]);
  });

  it("a change in a sub-folder of _archive/ is an item change; one deeper elsewhere isn't", () => {
    expect(isItemChange({ path: `${R}/_archive/QuizLab/n.md` }, R)).toBe(true);
    expect(isItemChange({ path: `${R}/QuizLab/deeper/n.md` }, R)).toBe(false);
    expect(isItemChange({ path: `${R}/Daily/2026-11-10.md` }, R)).toBe(true);
  });
});
