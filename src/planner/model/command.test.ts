import { describe, expect, it } from "vitest";

import { recurring, task } from "./fixtures";
import { parseArgs, todayOutput, todayReport, todayText } from "./command";
import type { Items } from "./items";
import { todayRows } from "./today";

const D = "2026-11-17";

describe("parseArgs", () => {
  it.each([
    [[], { kind: "help" }],
    [["--help"], { kind: "help" }],
    [["today", "-h"], { kind: "help" }],
    [["today"], { kind: "today", json: false, date: null, project: null }],
    [["today", "--json"], { kind: "today", json: true, date: null, project: null }],
    [["today", "--date", D, "--json"], { kind: "today", json: true, date: D, project: null }],
    [["today", `--date=${D}`], { kind: "today", json: false, date: D, project: null }],
    [["today", "--project", "QuizLab"], { kind: "today", json: false, date: null, project: "QuizLab" }],
    [["today", "--project=QuizLab (Archive)", "--json"], { kind: "today", json: true, date: null, project: "QuizLab (Archive)" }],
  ])("%j → %j", (argv, args) => {
    expect(parseArgs(argv)).toEqual(args);
  });

  it.each([
    [["tomorrow"], 'Unknown command "tomorrow".'],
    [["today", "--date"], '--date needs a date as YYYY-MM-DD, got "".'],
    [["today", "--date", "fri"], '--date needs a date as YYYY-MM-DD, got "fri".'],
    [["today", "--date", "2026-02-30"], '--date needs a date as YYYY-MM-DD, got "2026-02-30".'],
    [["today", "--project"], "--project needs a project's name."],
    [["today", "--project", " "], "--project needs a project's name."],
    [["today", "--projects", "x"], 'Unknown option "--projects".'],
  ])("%j → %s", (argv, message) => {
    expect(parseArgs(argv)).toEqual({ kind: "error", message });
  });
});

const tasks = [
  task({ title: "Pay the tax", path: "T/tax.md", deadline: "2026-11-14", importance: 3, created: "2026-11-01" }),
  task({ title: "Buy ink", path: "T/ink.md", doOn: "2026-11-15" }),
  task({ title: "Call mum", path: "T/mum.md", doOn: D, done: true, doneOn: D }),
  task({ title: "Swim", path: "T/swim.md", deadline: D }),
];

describe("todayReport", () => {
  it("one object per Today item, in order, each with its reason; and the unreadable files", () => {
    const report = todayReport(D, todayRows(tasks, D), [{ path: "T/bad.md", name: "bad.md", folder: null, archived: false, type: "task", reason: "bad YAML" }]);
    expect(report.day).toBe(D);
    expect(report.items.map((i) => [i.path, i.reason, i.status, i["planned-days-ago"]])).toEqual([
      ["T/tax.md", "overdue", "open", 0],
      ["T/swim.md", "due-today", "open", 0],
      ["T/ink.md", "rolled-over", "open", 2],
      ["T/mum.md", "planned", "done", 0],
    ]);
    expect(report.items[0]).toEqual({
      title: "Pay the tax",
      type: "task",
      project: null,
      status: "open",
      "do-on": null,
      deadline: "2026-11-14",
      importance: 3,
      created: "2026-11-01",
      "done-on": null,
      reason: "overdue",
      "planned-days-ago": 0,
      missed: 0,
      path: "T/tax.md",
    });
    expect(report.unreadable).toEqual([{ path: "T/bad.md", reason: "bad YAML" }]);
  });
});

describe("todayText", () => {
  it("a heading with the planner day, a line per item, then the unreadable files", () => {
    expect(todayText(D, todayRows(tasks, D), [{ path: "T/bad.md", name: "bad.md", folder: null, archived: false, type: "task", reason: "bad YAML" }])).toBe(
      [
        "Today — Tue, Nov 17, 2026",
        "  [ ] Pay the tax — overdue, due Nov 14, !3",
        "  [ ] Swim — due today",
        "  [ ] Buy ink — planned 2 days ago",
        "  [x] Call mum — planned today",
        "",
        "Can't read (open to fix):",
        "  T/bad.md — bad YAML",
        "",
      ].join("\n"),
    );
  });

  it("says so when Today is empty", () => {
    expect(todayText(D, [], [])).toBe("Today — Tue, Nov 17, 2026\n  Nothing for today.\n");
  });
});

describe("todayOutput — projects", () => {
  const items: Items = {
    tasks: [
      task({ title: "Pay the tax", path: "T/tax.md", deadline: "2026-11-14" }),
      task({ title: "Fix login bug", path: "T/QuizLab/fix.md", folder: "QuizLab", doOn: D }),
      task({ title: "Old quiz", path: "T/QuizLab (Archive)/old.md", folder: "QuizLab (Archive)", deadline: D }),
      task({ title: "Ship kit", path: "T/pomade-kit/ship.md", folder: "pomade-kit", doOn: "2026-11-16" }),
      task({ title: "Stray", path: "T/Stray/s.md", folder: "Stray", doOn: D }),
      task({ title: "Later", path: "T/QuizLab/later.md", folder: "QuizLab", doOn: "2026-12-01" }),
    ],
    unreadable: [{ path: "T/QuizLab/bad.md", name: "bad.md", folder: "QuizLab", archived: false, type: "task", reason: "bad YAML" }],
    folders: ["QuizLab", "QuizLab (Archive)", "Stray", "pomade-kit"],
  };
  const map = {
    a: { folder: "QuizLab", name: "QuizLab", groupPath: [] },
    b: { folder: "QuizLab (Archive)", name: "QuizLab", groupPath: ["Archive"] },
    k: { folder: "pomade-kit", name: "pomade-kit", groupPath: ["Building tools", "Tools"] },
  };
  const text = (project: string | null) => todayOutput({ json: false, project }, D, items, map);

  it("the whole workspace: No project first, then every project's Today under its heading by name (ungrouped before grouped), same-named ones qualified", () => {
    expect(text(null)).toEqual({
      ok: true,
      text: [
        "Today — Tue, Nov 17, 2026",
        "",
        "No project",
        "  [ ] Pay the tax — overdue, due Nov 14",
        "",
        "pomade-kit",
        "  [ ] Ship kit — planned 1 day ago",
        "",
        "QuizLab (Ungrouped)",
        "  [ ] Fix login bug — planned today",
        "",
        "QuizLab (Archive)",
        "  [ ] Old quiz — due today",
        "",
        "Stray",
        "  [ ] Stray — planned today",
        "",
        "Can't read (open to fix):",
        "  T/QuizLab/bad.md — bad YAML",
        "",
      ].join("\n"),
    });
  });

  it("--project narrows to one project's Today: no mix-ins, no headings, its unreadable files only", () => {
    expect(text("pomade-kit")).toEqual({ ok: true, text: "Today — pomade-kit — Tue, Nov 17, 2026\n  [ ] Ship kit — planned 1 day ago\n" });
    expect(text("QuizLab (Ungrouped)")).toEqual({
      ok: true,
      text: "Today — QuizLab (Ungrouped) — Tue, Nov 17, 2026\n  [ ] Fix login bug — planned today\n\nCan't read (open to fix):\n  T/QuizLab/bad.md — bad YAML\n",
    });
    expect(text("quizlab (archive)")).toMatchObject({ ok: true, text: expect.stringContaining("Old quiz") as unknown });
    expect(text("Stray")).toMatchObject({ ok: true, text: expect.stringContaining("[ ] Stray") as unknown });
  });

  it("a name two projects share, and a name no project has, are wrong arguments (exit 2) that say what to type", () => {
    expect(text("QuizLab")).toEqual({ ok: false, code: 2, message: 'More than one project is named "QuizLab" — name one of them: "QuizLab (Archive)", "QuizLab (Ungrouped)".' });
    expect(text("Nope")).toEqual({ ok: false, code: 2, message: 'No project named "Nope". Projects with tasks: pomade-kit, QuizLab (Archive), QuizLab (Ungrouped), Stray.' });
    expect(todayOutput({ json: false, project: "X" }, D, { tasks: [], unreadable: [], folders: [] }, {})).toEqual({ ok: false, code: 2, message: 'No project named "X". No project has tasks yet.' });
  });

  it("names the day's daily note when its file exists — text and --json; never with --project", () => {
    const note = "To-dos/Daily/2026-11-17.md";
    const text = todayOutput({ json: false, project: null }, D, items, map, note);
    if (!text.ok) throw new Error("refused");
    expect(text.text.split("\n").slice(0, 2)).toEqual(["Today — Tue, Nov 17, 2026", `  Daily note: ${note}`]);
    const json = todayOutput({ json: true, project: null }, D, items, map, note);
    if (!json.ok) throw new Error("refused");
    expect(Object.keys(JSON.parse(json.text) as object)).toEqual(["day", "daily-note", "items", "unreadable"]);
    expect((JSON.parse(json.text) as { "daily-note": string })["daily-note"]).toBe(note);
    const none = todayOutput({ json: true, project: null }, D, items, map, null);
    if (!none.ok) throw new Error("refused");
    expect((JSON.parse(none.text) as { "daily-note": string | null })["daily-note"]).toBeNull();
    const narrowed = todayOutput({ json: false, project: "pomade-kit" }, D, items, map, note);
    if (!narrowed.ok) throw new Error("refused");
    expect(narrowed.text).not.toContain("Daily note");
  });

  it("--json names each item's project by the same label; --project narrows it too", () => {
    const all = todayOutput({ json: true, project: null }, D, items, map);
    if (!all.ok) throw new Error("refused");
    const report = JSON.parse(all.text) as { items: { title: string; project: string | null }[] };
    expect(report.items.map((i) => [i.title, i.project])).toEqual([
      ["Pay the tax", null],
      ["Old quiz", "QuizLab (Archive)"],
      ["Ship kit", "pomade-kit"],
      ["Fix login bug", "QuizLab (Ungrouped)"],
      ["Stray", "Stray"],
    ]);
    const one = todayOutput({ json: true, project: "pomade-kit" }, D, items, map);
    if (!one.ok) throw new Error("refused");
    expect((JSON.parse(one.text) as { items: { title: string }[] }).items.map((i) => i.title)).toEqual(["Ship kit"]);
  });

  it("only workspace-level items: no headings, as before projects existed", () => {
    expect(todayOutput({ json: false, project: null }, D, { tasks: [items.tasks[0]!], unreadable: [], folders: [] }, {})).toEqual({
      ok: true,
      text: "Today — Tue, Nov 17, 2026\n  [ ] Pay the tax — overdue, due Nov 14\n",
    });
  });
});

describe("recurring items in the command", () => {
  const items = [
    recurring({ monthly: { days: [5] }, "lead-days": 3 }, { title: "Upload invoices", path: "T/invoices.md", doOn: "2026-10-05" }),
    recurring({ "after-completion": { months: 3 } }, { title: "Change toothbrush", path: "T/brush.md", doOn: "2026-11-20" }),
    recurring({ weekly: { days: ["mon"] }, "lead-days": 1 }, { title: "Bins out", path: "T/bins.md", doOn: "2026-11-19" }),
    recurring({ weekly: { days: ["mon"] }, "lead-days": 2 }, { title: "Swim kit", path: "T/swim.md", doOn: "2026-11-20" }),
    recurring({ weekly: { days: ["mon"] } }, { title: "Later", path: "T/later.md", doOn: "2026-11-23" }),
  ];
  const day = "2026-11-18";

  it("JSON: reasons recurring-due and lead-time, and missed N×", () => {
    const report = todayReport(day, todayRows(items, day), []);
    expect(report.items.map((i) => [i.title, i.type, i.reason, i.missed, i["do-on"]])).toEqual([
      ["Upload invoices", "recurring", "recurring-due", 2, "2026-10-05"],
      ["Bins out", "recurring", "lead-time", 0, "2026-11-19"],
      ["Swim kit", "recurring", "lead-time", 0, "2026-11-20"],
    ]);
    const due = todayReport("2026-11-20", todayRows(items, "2026-11-20"), []);
    expect(due.items.map((i) => [i.title, i.reason, i.missed])).toEqual([
      ["Upload invoices", "recurring-due", 2],
      ["Bins out", "recurring-due", 1],
      ["Change toothbrush", "recurring-due", 0],
      ["Swim kit", "recurring-due", 0],
    ]);
  });

  it("text: the same words as the rows", () => {
    expect(todayText(day, todayRows(items, day), [])).toBe(
      "Today — Wed, Nov 18, 2026\n  [ ] Upload invoices — missed 2×, since Oct 5, monthly on the 5th, shows 3 days early\n  [ ] Bins out — due in 1 day, every Mon, shows 1 day early\n  [ ] Swim kit — due in 2 days, every Mon, shows 2 days early\n",
    );
  });

  it("every N days or weeks from a start date: in Today on its runs only, as in the views", () => {
    const cycles = [
      recurring({ weekly: { every: 2, days: ["mon"] }, start: "2026-11-02" }, { title: "Pay the cleaner", path: "T/cleaner.md", doOn: "2026-11-30" }),
      recurring({ daily: { every: 10 }, start: "2026-01-03", "lead-days": 1 }, { title: "Water the ficus", path: "T/ficus.md", doOn: "2026-11-19" }),
    ];
    expect(todayText(day, todayRows(cycles, day), [])).toBe("Today — Wed, Nov 18, 2026\n  [ ] Water the ficus — due in 1 day, every 10 days, from Jan 3, 2026, shows 1 day early\n");
    expect(todayReport("2026-11-30", todayRows(cycles, "2026-11-30"), []).items.map((i) => [i.title, i.reason, i.missed])).toEqual([
      ["Water the ficus", "recurring-due", 2],
      ["Pay the cleaner", "recurring-due", 0],
    ]);
  });
});
