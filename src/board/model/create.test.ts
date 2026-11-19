import type { FileEntry } from "pomade-kit/protocol";
import { describe, expect, it } from "vitest";

import {
  bumpId,
  formatId,
  highestNumber,
  idNumber,
  newTicketContent,
  newTicketPath,
  nextId,
  ticketFileName,
  type NewTicket,
} from "./create";
import { yamlString } from "../../core/text";

const B = "Projects/alpha/docs/roadmap";

function file(rel: string, frontmatter?: Record<string, unknown> | null): FileEntry {
  const name = rel.split("/").at(-1) ?? rel;
  const e: FileEntry = { path: `${B}/${rel}`, name, kind: "file", size: 1, mtimeMs: 1 };
  if (frontmatter !== undefined) e.frontmatter = frontmatter;
  return e;
}
const dir = (rel: string): FileEntry => ({ path: `${B}/${rel}`, name: rel.split("/").at(-1) ?? rel, kind: "dir", size: 0, mtimeMs: 1 });

describe("formatId / idNumber / bumpId", () => {
  it.each([
    ["T", 1, "T-001"],
    ["E", 17, "E-017"],
    ["P", 999, "P-999"],
    ["S", 1000, "S-1000"],
    ["T", 12345, "T-12345"],
  ] as const)("formatId(%s, %d) = %s", (prefix, n, id) => {
    expect(formatId(prefix, n)).toBe(id);
    expect(idNumber(id)).toBe(n);
  });

  it.each([
    ["T-001", "T-002"],
    ["E-009", "E-010"],
    ["P-099", "P-100"],
    ["S-999", "S-1000"],
    ["T-1000", "T-1001"],
  ])("bumpId(%s) = %s", (id, next) => {
    expect(bumpId(id)).toBe(next);
  });

  it.each(["T-", "T-1a", "TT-1", "t-1", "E-017-x", ""])("idNumber(%j) is null and bumpId throws", (id) => {
    expect(idNumber(id)).toBeNull();
    expect(() => bumpId(id)).toThrow();
  });
});

describe("highestNumber / nextId", () => {
  it("an empty backlog starts at 001", () => {
    expect(highestNumber("T", [], B)).toBe(0);
    expect(nextId("task", [], B)).toBe("T-001");
    expect(nextId("signal", [], B)).toBe("S-001");
  });

  it("counts the folder and done/, per kind", () => {
    const entries = [file("T-004-a.md"), file("done/T-041-old.md"), file("E-017-x.md"), file("done/E-020-y.md"), file("P-003-z.md")];
    expect(nextId("task", entries, B)).toBe("T-042");
    expect(nextId("epic", entries, B)).toBe("E-021");
    expect(nextId("problem", entries, B)).toBe("P-004");
    expect(nextId("signal", entries, B)).toBe("S-001");
  });

  it("a maximum only in done/ counts", () => {
    expect(nextId("task", [file("done/T-200-x.md")], B)).toBe("T-201");
  });

  it("gaps are never filled: the highest wins", () => {
    expect(nextId("task", [file("T-001-a.md"), file("T-007-b.md"), file("T-003-c.md")], B)).toBe("T-008");
  });

  it("999 → 1000 and beyond, compared as numbers", () => {
    expect(nextId("task", [file("T-999-broken.md")], B)).toBe("T-1000");
    expect(nextId("task", [file("T-1000-a.md"), file("T-999-b.md")], B)).toBe("T-1001");
    expect(nextId("task", [file("T-0099-a.md"), file("T-100-b.md")], B)).toBe("T-101");
  });

  it("an id: in the frontmatter counts even when the file name says less", () => {
    expect(nextId("task", [file("renamed-by-hand.md", { id: "T-077", kind: "task" })], B)).toBe("T-078");
    expect(nextId("task", [file("T-002-a.md", { id: " T-090 ", kind: "task" })], B)).toBe("T-091");
  });

  it("a file whose frontmatter can't be read holds its number by its name", () => {
    const broken: FileEntry = { ...file("T-500-broken.md"), frontmatterError: "bad" };
    expect(nextId("task", [broken], B)).toBe("T-501");
  });

  it.each([
    ["non-ticket names", [file("BACKLOG.md"), file("PLAN.md"), file("TT-900.md"), file("t-900-lower.md"), file("T900.md"), file("XT-900.md"), file("T-9x9.md")]],
    ["another kind's id: in the frontmatter", [file("x.md", { id: "E-900" }), file("y.md", { id: "T-9a" }), file("z.md", { id: 900 })]],
    ["folders", [dir("T-900-folder"), dir("done")]],
    ["deeper folders", [file("done/old/T-900-x.md"), file("archive/T-901-x.md")]],
    ["other folders", [{ ...file("T-902-x.md"), path: "Projects/beta/docs/roadmap/T-902-x.md" }]],
  ] as const)("ignores %s", (_what, entries) => {
    expect(nextId("task", [file("T-003-a.md"), ...entries], B)).toBe("T-004");
  });

  it("counts any file named like the kind, Markdown or not", () => {
    expect(nextId("task", [file("T-010-sketch.png"), file("T-011.md"), file("T-012")], B)).toBe("T-013");
  });

  it("works for a backlog at the workspace root", () => {
    expect(nextId("task", [{ path: "T-005-a.md", name: "T-005-a.md", kind: "file", size: 1, mtimeMs: 1 }], "")).toBe("T-006");
  });
});

describe("ticketFileName / newTicketPath", () => {
  it.each([
    ["T-007", "Verify T-199", "T-007-verify-t-199.md"],
    ["S-001", "!!!", "S-001.md"],
    ["E-1000", "Big one", "E-1000-big-one.md"],
  ])("%s %j → %s", (id, title, name) => {
    expect(ticketFileName(id, title)).toBe(name);
  });

  it.each([
    ["task", "planned", true, `${B}/T-1.md`],
    ["task", "done", true, `${B}/done/T-1.md`],
    ["epic", "done", true, `${B}/done/T-1.md`],
    ["epic", "done", false, `${B}/T-1.md`],
    ["problem", "done", true, `${B}/T-1.md`],
    ["signal", "dismissed", true, `${B}/T-1.md`],
  ] as const)("a %s created on %s (move done %s) goes to %s", (kind, status, moveDone, path) => {
    expect(newTicketPath(B, kind, status, moveDone, "T-1.md")).toBe(path);
  });
});

describe("newTicketContent", () => {
  const base: NewTicket = { id: "T-042", kind: "task", title: "Verify T-199", status: "planned", priority: "P2", parent: "E-017", reporter: "d.voronov", source: "", today: "2026-11-17" };

  it("a task: the convention's keys in order, epic: as parent, reporter after updated, no source; Goal and Acceptance", () => {
    expect(newTicketContent(base)).toBe(
      [
        "---",
        "id: T-042",
        "kind: task",
        "title: Verify T-199",
        "status: planned",
        "type: feature",
        "priority: P2",
        "epic: E-017",
        "created: 2026-11-17",
        "updated: 2026-11-17",
        "reporter: d.voronov",
        "---",
        "",
        "# T-042 — Verify T-199",
        "",
        "## Goal",
        "",
        "## Acceptance",
        "",
      ].join("\n"),
    );
  });

  it("an epic: problem: as parent, Goal · Scope · Acceptance", () => {
    expect(newTicketContent({ ...base, id: "E-021", kind: "epic", title: "Sync", parent: "P-002", priority: "P1" })).toBe(
      "---\nid: E-021\nkind: epic\ntitle: Sync\nstatus: planned\ntype: feature\npriority: P1\nproblem: P-002\ncreated: 2026-11-17\nupdated: 2026-11-17\nreporter: d.voronov\n---\n\n# E-021 — Sync\n\n## Goal\n\n## Scope\n\n## Acceptance\n",
    );
  });

  it("a problem: no parent key, Problem · Outcome", () => {
    expect(newTicketContent({ ...base, id: "P-004", kind: "problem", title: "Slow", status: "backlog", parent: "E-1" })).toBe(
      "---\nid: P-004\nkind: problem\ntitle: Slow\nstatus: backlog\ntype: feature\npriority: P2\ncreated: 2026-11-17\nupdated: 2026-11-17\nreporter: d.voronov\n---\n\n# P-004 — Slow\n\n## Problem\n\n## Outcome\n",
    );
  });

  it("a signal: the same order without type; source after reporter when named; the description under the heading", () => {
    expect(newTicketContent({ ...base, id: "S-001", kind: "signal", title: "Cmd+click opened files", status: "new", parent: null })).toBe(
      "---\nid: S-001\nkind: signal\ntitle: Cmd+click opened files\nstatus: new\npriority: P2\ncreated: 2026-11-17\nupdated: 2026-11-17\nreporter: d.voronov\n---\n\n# S-001 — Cmd+click opened files\n",
    );
    expect(newTicketContent({ ...base, id: "S-002", kind: "signal", title: "x", status: "triaged", parent: "P-012", source: " review " })).toContain(
      "priority: P2\nproblem: P-012\ncreated: 2026-11-17\nupdated: 2026-11-17\nreporter: d.voronov\nsource: review\n---",
    );
  });

  it.each([
    ["d.voronov", "reporter: d.voronov\n"],
    ["claude", "reporter: claude\n"],
    [" a.person ", "reporter: a.person\n"],
  ])("the reporter setting %j is written as %j", (reporter, line) => {
    expect(newTicketContent({ ...base, reporter })).toContain(`updated: 2026-11-17\n${line}---`);
  });

  it("no reporter and no source: neither key", () => {
    const text = newTicketContent({ ...base, reporter: "", source: "  " });
    expect(text).not.toMatch(/^reporter:/m);
    expect(text).not.toMatch(/^source:/m);
  });

  it("source on a task, when named: after reporter", () => {
    expect(newTicketContent({ ...base, source: "session-2026-11-19" })).toContain("updated: 2026-11-17\nreporter: d.voronov\nsource: session-2026-11-19\n---");
  });

  it("no parent: no parent key", () => {
    expect(newTicketContent({ ...base, parent: null })).not.toMatch(/^epic:/m);
  });

  it.each([
    ["true", 'title: "true"'],
    ["123", 'title: "123"'],
    ["Fix: the colon", 'title: "Fix: the colon"'],
    ["#hash first", 'title: "#hash first"'],
    ["[bracket] first", 'title: "[bracket] first"'],
    ['Say "hi"', 'title: Say "hi"'],
    ["- dash", 'title: "- dash"'],
    ["Проверить импорт", "title: Проверить импорт"],
  ])("a title %j is written so it reads back the same: %s", (title, line) => {
    expect(newTicketContent({ ...base, title }).split("\n")).toContain(line);
  });

  it("every written scalar reads back as the same string (js-yaml, the parser Pomade uses)", async () => {
    const yaml = await import("js-yaml");
    const titles = ["true", "False", "yes", "NO", "on", "y", "null", "~", "123", "-1.5", "1e3", "0x1F", "0o17", ".inf", "-.NaN", "1_000", "2026-11-17", "Verify T-199", "a: b", "#x", "it's", "x # y", " lead", "tab\there", "Ёлка"];
    for (const title of titles) {
      for (const schema of [yaml.JSON_SCHEMA, yaml.CORE_SCHEMA, yaml.DEFAULT_SCHEMA]) {
        expect(yaml.load(`title: ${yamlString(title)}`, { schema })).toEqual({ title });
      }
    }
  });

  it("a source that needs quoting is quoted", () => {
    expect(newTicketContent({ ...base, kind: "signal", status: "new", source: "user: anna" })).toContain('source: "user: anna"');
  });
});
