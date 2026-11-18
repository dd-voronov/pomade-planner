import type { FileEntry } from "pomade-kit/protocol";
import { describe, expect, it } from "vitest";

import { classifyEntry, idFromName, isBacklogChange, readBacklog } from "./ticket";

const B = "Projects/alpha/docs/roadmap";

function entry(name: string, frontmatter: Record<string, unknown> | null | undefined, extra: Partial<FileEntry> = {}): FileEntry {
  const e: FileEntry = { path: `${B}/${name}`, name, kind: "file", size: 10, mtimeMs: 1000, ...extra };
  if (frontmatter !== undefined) e.frontmatter = frontmatter;
  return e;
}

describe("idFromName", () => {
  it.each([
    ["E-017-icon-picker.md", "E-017"],
    ["P-001-x.md", "P-001"],
    ["T-999-broken.md", "T-999"],
    ["S-003-signal.md", "S-003"],
    ["E-017.md", "E-017"],
    ["E-1-a.md", "E-1"],
    ["X-001-x.md", null],
    ["e-001-x.md", null],
    ["E-abc-x.md", null],
    ["E-001-x.txt", null],
    ["BACKLOG.md", null],
    ["E-001x.md", null],
  ])("%s → %s", (name, id) => {
    expect(idFromName(name)).toBe(id);
  });
});

describe("classifyEntry", () => {
  it("reads a ticket's fields", () => {
    const c = classifyEntry(
      entry("E-017-x.md", { id: "E-017", kind: "epic", title: "Icon picker", status: "review", priority: "P1", problem: "P-004", source: "daniil" }),
      B,
    );
    expect(c).toEqual({
      type: "ticket",
      ticket: {
        path: `${B}/E-017-x.md`,
        name: "E-017-x.md",
        id: "E-017",
        kind: "epic",
        title: "Icon picker",
        status: "review",
        priority: "P1",
        parent: "P-004",
        source: "daniil",
        inDone: false,
        mtimeMs: 1000,
      },
    });
  });

  it.each([
    ["problem", {}, null],
    ["problem", { problem: "P-1" }, null],
    ["epic", { problem: "P-1" }, "P-1"],
    ["epic", { epic: "E-1" }, null],
    ["task", { epic: "E-017" }, "E-017"],
    ["task", { problem: "P-1" }, null],
    ["task", {}, null],
    ["signal", { problem: "P-012" }, "P-012"],
  ] as const)("a %s's parent from %j is %s", (kind, extra, parent) => {
    const c = classifyEntry(entry("X.md", { kind, ...extra }), B);
    expect(c.type === "ticket" && c.ticket.parent).toBe(parent);
  });

  it.each([
    [{ source: "daniil" }, "daniil"],
    [{ source: "  review  " }, "review"],
    [{ source: "" }, null],
    [{ source: 3 }, "3"],
    [{ source: ["a"] }, null],
    [{}, null],
  ] as const)("source from %j is %s", (extra, source) => {
    const c = classifyEntry(entry("S-001-x.md", { kind: "signal", ...extra }), B);
    expect(c.type === "ticket" && c.ticket.source).toBe(source);
  });

  it.each([
    ["no frontmatter block", null],
    ["no kind", { id: "E-1", title: "x", status: "planned" }],
    ["an unknown kind", { kind: "decision" }],
    ["a kind that is not a string", { kind: ["epic"] }],
    ["an empty kind", { kind: "" }],
  ])("ignores a file with %s", (_what, fm) => {
    expect(classifyEntry(entry("E-001-x.md", fm), B)).toEqual({ type: "ignored" });
  });

  it("ignores BACKLOG.md and other non-ticket files", () => {
    expect(classifyEntry(entry("BACKLOG.md", null), B).type).toBe("ignored");
    expect(classifyEntry(entry("PLAN.md", { title: "Plan" }), B).type).toBe("ignored");
    expect(classifyEntry(entry("notes.txt", undefined), B).type).toBe("ignored");
  });

  it("keeps a file with a known kind whatever its name", () => {
    expect(classifyEntry(entry("my-idea.md", { kind: "problem", title: "Idea" }), B).type).toBe("ticket");
  });

  it("ignores folders and non-Markdown files", () => {
    expect(classifyEntry(entry("done", undefined, { kind: "dir" }), B).type).toBe("ignored");
    expect(classifyEntry(entry("E-001-x.markdown", { kind: "epic" }), B).type).toBe("ignored");
  });

  it("reads tickets in done/ and marks them", () => {
    const c = classifyEntry(entry("E-001-x.md", { kind: "epic", status: "done" }, { path: `${B}/done/E-001-x.md` }), B);
    expect(c.type === "ticket" && c.ticket.inDone).toBe(true);
  });

  it.each([
    [`${B}/archive/E-001-x.md`],
    [`${B}/done/old/E-001-x.md`],
    [`Projects/alpha/docs/E-001-x.md`],
    [`Projects/alpha/docs/roadmapx/E-001-x.md`],
  ])("ignores a ticket outside the folder and done/: %s", (path) => {
    expect(classifyEntry(entry("E-001-x.md", { kind: "epic" }, { path }), B).type).toBe("ignored");
  });

  it("works for a backlog at the workspace root", () => {
    expect(classifyEntry({ path: "E-1-x.md", name: "E-1-x.md", kind: "file", size: 1, mtimeMs: 1, frontmatter: { kind: "epic" } }, "").type).toBe("ticket");
  });

  it("marks a ticket-named file with unreadable frontmatter as unreadable", () => {
    expect(classifyEntry(entry("T-999-broken.md", undefined, { frontmatterError: "bad indentation" }), B)).toEqual({
      type: "unreadable",
      file: { path: `${B}/T-999-broken.md`, name: "T-999-broken.md", id: "T-999", reason: "bad indentation", inDone: false },
    });
  });

  it("ignores an unreadable file whose name is not a ticket's", () => {
    expect(classifyEntry(entry("notes.md", undefined, { frontmatterError: "bad" }), B).type).toBe("ignored");
  });

  it.each([
    ["the file name's ID without id:", { kind: "task" }, "T-005", "T-005-cache"],
    ["id: as a number", { kind: "task", id: 5 }, "5", "T-005-cache"],
    ["a blank id: and title:", { kind: "task", id: "  ", title: "" }, "T-005", "T-005-cache"],
  ])("falls back for %s", (_what, fm, id, title) => {
    const c = classifyEntry(entry("T-005-cache.md", fm), B);
    expect(c.type === "ticket" && [c.ticket.id, c.ticket.title]).toEqual([id, title]);
  });

  it("falls back to the file name when neither id: nor a ticket name gives an ID", () => {
    const c = classifyEntry(entry("idea.md", { kind: "problem" }), B);
    expect(c.type === "ticket" && c.ticket.id).toBe("idea");
  });

  it.each([
    [{ kind: "epic" }, null, null],
    [{ kind: "epic", status: 3, priority: true }, "3", null],
    [{ kind: "epic", status: " review ", priority: "P0" }, "review", "P0"],
    [{ kind: "epic", status: null, priority: "high" }, null, "high"],
  ])("status and priority from %j", (fm, status, priority) => {
    const c = classifyEntry(entry("E-1-x.md", fm), B);
    expect(c.type === "ticket" && [c.ticket.status, c.ticket.priority]).toEqual([status, priority]);
  });
});

describe("isBacklogChange", () => {
  it.each([
    [{ path: B }, true],
    [{ path: `${B}/E-1-x.md` }, true],
    [{ path: `${B}/BACKLOG.md` }, true],
    [{ path: `${B}/done` }, true],
    [{ path: `${B}/done/E-1-x.md` }, true],
    [{ path: `${B}/done/old/E-1-x.md` }, false],
    [{ path: `${B}/archive/E-1-x.md` }, false],
    [{ path: `${B}x/E-1-x.md` }, false],
    [{ path: "Projects/alpha/README.md" }, false],
    [{ path: `${B}/done/E-1-x.md`, oldPath: `${B}/E-1-x.md` }, true],
    [{ path: "Projects/alpha/E-1-x.md", oldPath: `${B}/E-1-x.md` }, true],
    [{ path: `${B}/archive/E-1-x.md`, oldPath: `${B}/archive/E-0.md` }, false],
  ])("%j → %s", (change, relevant) => {
    expect(isBacklogChange(change, B)).toBe(relevant);
  });

  it("at the workspace root", () => {
    expect(isBacklogChange({ path: "E-1-x.md" }, "")).toBe(true);
    expect(isBacklogChange({ path: "done/E-1-x.md" }, "")).toBe(true);
    expect(isBacklogChange({ path: "a/b.md" }, "")).toBe(false);
  });
});

describe("readBacklog", () => {
  it("splits tickets and unreadable files and drops the rest", () => {
    const b = readBacklog(
      [
        entry("BACKLOG.md", null),
        entry("E-001-a.md", { kind: "epic", status: "planned" }),
        entry("T-999-broken.md", undefined, { frontmatterError: "x" }),
        entry("S-001-sig.md", { kind: "signal", status: "new" }),
        entry("E-000-b.md", { kind: "epic", status: "done" }, { path: `${B}/done/E-000-b.md` }),
        entry("P-002-bad.md", undefined, { frontmatterError: "y", path: `${B}/done/P-002-bad.md` }),
      ],
      B,
    );
    expect(b.tickets.map((t) => t.id)).toEqual(["E-001", "S-001", "E-000"]);
    expect(b.unreadable.map((u) => u.path)).toEqual([`${B}/T-999-broken.md`, `${B}/done/P-002-bad.md`]);
  });
});
