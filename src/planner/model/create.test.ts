import { describe, expect, it } from "vitest";

import { at } from "./fixtures";
import { detailsBody, newTaskContent, parseImportance, resolveDateField, taskFileName, taskFilePath } from "./create";
import { taskOf } from "./items";
import { appendLog } from "./recurring";
import { getBody } from "pomade-kit/frontmatter";
import { readFrontmatter } from "pomade-kit/protocol";
import { parseSchedule } from "pomade-kit/schedule";

const B3 = { hour: 3, minute: 0 };

describe("resolveDateField — phrases against the planner day", () => {
  // Tue 2026-11-17 10:00.
  const day = at("2026-11-17 10:00");
  it.each([
    ["", { kind: "empty" }],
    ["   ", { kind: "empty" }],
    ["today", { kind: "date", date: "2026-11-17" }],
    ["tomorrow", { kind: "date", date: "2026-11-18" }],
    ["fri", { kind: "date", date: "2026-11-20" }],
    ["Friday", { kind: "date", date: "2026-11-20" }],
    ["tue", { kind: "date", date: "2026-11-24" }],
    ["+3d", { kind: "date", date: "2026-11-20" }],
    ["nov 20", { kind: "date", date: "2026-11-20" }],
    ["nov 1", { kind: "date", date: "2027-11-01" }],
    ["2026-12-01", { kind: "date", date: "2026-12-01" }],
    ["fri 9:00", { kind: "date", date: "2026-11-20" }],
  ])("%j → %j", (text, result) => {
    expect(resolveDateField(text, day, B3)).toEqual(result);
  });

  it.each([
    ["nov 31", /Nov has no day 31|no day 31/i],
    ["buy milk", /Not a date/],
    ["next fri", /Not a date/],
  ])("%j is refused with a reason", (text, message) => {
    const r = resolveDateField(text, day, B3);
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.message).toMatch(message);
  });

  it("at 01:30 the planner day is still yesterday: today, tomorrow and fri count from it", () => {
    const night = at("2026-11-18 01:30");
    expect(resolveDateField("today", night, B3)).toEqual({ kind: "date", date: "2026-11-17" });
    expect(resolveDateField("tomorrow", night, B3)).toEqual({ kind: "date", date: "2026-11-18" });
    expect(resolveDateField("+1d", night, B3)).toEqual({ kind: "date", date: "2026-11-18" });
    expect(resolveDateField("today", night, { hour: 0, minute: 0 })).toEqual({ kind: "date", date: "2026-11-18" });
  });
});

describe("parseImportance", () => {
  it.each([
    ["", { kind: "empty" }],
    ["3", { kind: "number", value: 3 }],
    [" 10 ", { kind: "number", value: 10 }],
    ["-1", { kind: "number", value: -1 }],
    ["2.5", { kind: "number", value: 2.5 }],
    ["high", { kind: "error", message: "A number — higher is more important" }],
    ["3!", { kind: "error", message: "A number — higher is more important" }],
  ])("%j → %j", (text, result) => {
    expect(parseImportance(text)).toEqual(result);
  });
});

describe("taskFileName", () => {
  it.each([
    ["Renew Nora's swimming class", 1, "2026-11-17-renew-noras-swimming-class.md"],
    ["Renew Nora's swimming class", 2, "2026-11-17-renew-noras-swimming-class-2.md"],
    ["Renew Nora's swimming class", 3, "2026-11-17-renew-noras-swimming-class-3.md"],
    ["Café crème", 1, "2026-11-17-cafe-creme.md"],
    ["Купить хлеб", 1, "2026-11-17-купить-хлеб.md"],
    ["🎉🎉", 1, "2026-11-17-task.md"],
    ["🎉🎉", 2, "2026-11-17-task-2.md"],
  ])("%j, try %i → %s", (title, n, name) => {
    expect(taskFileName("2026-11-17", title, n)).toBe(name);
  });

  it("joins the tasks root", () => {
    expect(taskFilePath("Knowledge/To-dos", "2026-11-17", "Buy ink")).toBe("Knowledge/To-dos/2026-11-17-buy-ink.md");
    expect(taskFilePath("", "2026-11-17", "Buy ink")).toBe("2026-11-17-buy-ink.md");
  });
});

describe("newTaskContent", () => {
  it("writes the §3.2 keys in order, only the set ones, and no body", () => {
    expect(newTaskContent({ title: "Renew Nora's swimming class", doOn: null, deadline: "2026-11-20", importance: null, created: "2026-11-17" })).toBe(
      "---\ntype: task\ntitle: Renew Nora's swimming class\nstatus: open\ndeadline: 2026-11-20\ncreated: 2026-11-17\n---\n",
    );
    expect(newTaskContent({ title: "Ink", doOn: "2026-11-17", deadline: "2026-11-20", importance: 3, created: "2026-11-17" })).toBe(
      "---\ntype: task\ntitle: Ink\nstatus: open\ndo-on: 2026-11-17\ndeadline: 2026-11-20\nimportance: 3\ncreated: 2026-11-17\n---\n",
    );
  });

  it.each(["true", "123", "Fix: the colon", "#hash", "- dash", "2026-11-17", "Проверить"])("a title %j reads back as itself", (title) => {
    const text = newTaskContent({ title, doOn: null, deadline: null, importance: null, created: "2026-11-17" });
    const t = taskOf({ path: "T/x.md", name: "x.md", kind: "file", mtimeMs: 1, ...readFrontmatter(text) });
    expect(t?.title).toBe(title);
    expect(t?.problems).toEqual([]);
  });
});

describe("newTaskContent — a recurring item", () => {
  it("type recurring, do-on the first occurrence, the kit's repeat: block, created — and it reads back", () => {
    const r = parseSchedule({ monthly: { days: [5] }, "lead-days": 3, start: "2026-01-01" }, { resolution: "day" });
    if (!r.ok) throw new Error("schedule");
    const text = newTaskContent({ title: "Upload invoices", doOn: "2026-12-05", deadline: null, importance: 2, created: "2026-11-18", repeat: r.schedule });
    expect(text).toBe("---\ntype: recurring\ntitle: Upload invoices\nstatus: open\ndo-on: 2026-12-05\nimportance: 2\nrepeat:\n  monthly: { days: [5] }\n  start: 2026-01-01\n  lead-days: 3\ncreated: 2026-11-18\n---\n");
    const t = taskOf({ path: "T/x.md", name: "x.md", kind: "file", mtimeMs: 1, ...readFrontmatter(text) });
    expect(t).toMatchObject({ type: "recurring", doOn: "2026-12-05", repeat: { kind: "ok", description: "monthly on the 5th, from Jan 1, 2026, shows 3 days early" } });
  });
});

describe("notes and thoughts", () => {
  it("type, title, status, created — no dates, no importance, no body", () => {
    expect(newTaskContent({ type: "note", title: "Idea: a quiz timer", doOn: "2026-11-18", deadline: null, importance: 3, created: "2026-11-17" })).toBe(
      '---\ntype: note\ntitle: "Idea: a quiz timer"\nstatus: open\ncreated: 2026-11-17\n---\n',
    );
    expect(newTaskContent({ type: "thought", title: "Why do we test", doOn: null, deadline: null, importance: null, created: "2026-11-17" })).toBe(
      "---\ntype: thought\ntitle: Why do we test\nstatus: open\ncreated: 2026-11-17\n---\n",
    );
  });
});

describe("Details as the body", () => {
  it.each([
    ["", ""],
    ["   ", ""],
    [" \n\t\n", ""],
    ["one line", "one line\n"],
    ["one line\n", "one line\n"],
    ["**bold**\n### Heading\n- item", "**bold**\n### Heading\n- item\n"],
    ["two\n\n", "two\n\n"],
    ["\n  indented first line", "\n  indented first line\n"],
    ["---\nnot: frontmatter\n---", "---\nnot: frontmatter\n---\n"],
  ])("%j → %j", (typed, body) => {
    expect(detailsBody(typed)).toBe(body);
  });

  const BODY = "**Why:** the old one flickers\n### Options\n- the brass one\n";

  it("follows the frontmatter byte for byte; the frontmatter is the one a file without Details gets", () => {
    const task = { title: "Buy a lamp", doOn: "2026-11-17", deadline: null, importance: 2, created: "2026-11-17" } as const;
    expect(newTaskContent({ ...task, body: BODY })).toBe(`${newTaskContent(task)}${BODY}`);
    expect(newTaskContent({ ...task, body: "" })).toBe(newTaskContent(task));
    expect(newTaskContent({ type: "note", title: "Lamp", doOn: null, deadline: null, importance: null, created: "2026-11-17", body: BODY })).toBe(`---\ntype: note\ntitle: Lamp\nstatus: open\ncreated: 2026-11-17\n---\n${BODY}`);
  });

  it("reads back as the body, with the fields untouched — a body that opens with --- too", () => {
    for (const body of [BODY, "---\nnot: frontmatter\n---\n"]) {
      const text = newTaskContent({ type: "thought", title: "Why", doOn: null, deadline: null, importance: null, created: "2026-11-17", body });
      const read = readFrontmatter(text);
      expect(text.slice(text.length - body.length)).toBe(body);
      expect(taskOf({ path: "T/x.md", name: "x.md", kind: "file", mtimeMs: 1, ...read })).toMatchObject({ type: "thought", title: "Why", problems: [] });
    }
  });

  it("a recurring item's ## Log follows its Details", () => {
    const r = parseSchedule({ daily: {} }, { resolution: "day" });
    if (!r.ok) throw new Error("schedule");
    const text = newTaskContent({ title: "Water the ficus", doOn: "2026-11-17", deadline: null, importance: null, created: "2026-11-17", repeat: r.schedule, body: "Half a glass.\n" });
    const body = getBody(text);
    expect(body).toBe("Half a glass.\n");
    expect(appendLog(body, "2026-11-17", "done")).toBe("Half a glass.\n\n## Log\n- 2026-11-17 done\n");
  });
});
