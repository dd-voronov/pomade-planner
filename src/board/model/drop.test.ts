import { describe, expect, it } from "vitest";

import { DEFAULT_AREAS, type AreaDef } from "./areas";
import { describeFailure, localDay, planDrop, planEdit } from "./drop";
import { BACKLOG, t } from "./fixtures";
import type { Ticket } from "./ticket";

const [SIGNALS, PROBLEMS, SOLUTIONS] = DEFAULT_AREAS as [AreaDef, AreaDef, AreaDef];
const TODAY = "2026-11-17";

function target(area: AreaDef, status: string) {
  const c = area.columns.find((x) => x.status === status);
  if (!c) throw new Error(status);
  return c;
}

function plan(ticket: Ticket, area: AreaDef, status: string, moveDone = true, parentChoice?: string | null) {
  return planDrop({ ticket, target: target(area, status), backlog: BACKLOG, moveDone, today: TODAY, ...(parentChoice === undefined ? {} : { parentChoice }) });
}

const fields = (status: string) => [
  { key: "status", value: status },
  { key: "updated", value: TODAY },
];

describe("planDrop", () => {
  it("does nothing when dropped on its own column", () => {
    expect(plan(t("E-1", { status: "review" }), SOLUTIONS, "review")).toEqual({ kind: "same" });
  });

  it("writes status and updated, nothing else, between open columns", () => {
    expect(plan(t("E-1", { status: "planned" }), SOLUTIONS, "in-progress")).toEqual({
      kind: "write",
      path: `${BACKLOG}/E-1-x.md`,
      fields: fields("in-progress"),
      move: null,
    });
  });

  it.each([
    ["T-1", "review", "Tasks can't be in Review"],
    ["T-1", "parked", "Tasks can't be in Parked"],
    ["E-1", "backlog", "Epics can't be in Backlog"],
  ])("refuses %s onto %s", (id, status, reason) => {
    expect(plan(t(id, { status: "planned" }), SOLUTIONS, status)).toEqual({ kind: "refused", reason });
  });

  it.each(["epic", "task"] as const)("moves a %s into done/ when it lands in done", (kind) => {
    const id = kind === "epic" ? "E-17" : "T-3";
    expect(plan(t(id, { status: kind === "epic" ? "review" : "in-progress" }), SOLUTIONS, "done")).toEqual({
      kind: "write",
      path: `${BACKLOG}/${id}-x.md`,
      fields: fields("done"),
      move: { from: `${BACKLOG}/${id}-x.md`, to: `${BACKLOG}/done/${id}-x.md` },
    });
  });

  it.each(["planned", "in-progress", "dropped"])("moves a done epic back to the backlog folder when it leaves done for %s", (status) => {
    expect(plan(t("E-1", { status: "done", inDone: true }), SOLUTIONS, status)).toMatchObject({
      move: { from: `${BACKLOG}/done/E-1-x.md`, to: `${BACKLOG}/E-1-x.md` },
    });
  });

  it("moves by folder: a file in done/ with another status leaves done/ when dropped outside done", () => {
    expect(plan(t("E-1", { status: "review", inDone: true }), SOLUTIONS, "planned")).toMatchObject({ move: { to: `${BACKLOG}/E-1-x.md` } });
  });

  it("does not move a done ticket already sitting in the backlog folder when it leaves done", () => {
    expect(plan(t("E-1", { status: "done", inDone: false }), SOLUTIONS, "review")).toMatchObject({ kind: "write", move: null });
  });

  it("does not move a ticket into done/ when it is already there", () => {
    expect(plan(t("E-1", { status: "review", inDone: true }), SOLUTIONS, "done")).toMatchObject({ kind: "write", move: null });
  });

  it.each([
    ["into done", "review", false, "done"],
    ["out of done", "done", true, "review"],
  ] as const)("never moves %s while the setting is off", (_what, from, inDone, to) => {
    expect(plan(t("E-1", { status: from, inDone }), SOLUTIONS, to, false)).toMatchObject({ kind: "write", move: null });
  });

  it.each([
    ["into done", "review", false, "done"],
    ["out of done", "done", true, "review"],
  ] as const)("never moves a problem %s", (_what, from, inDone, to) => {
    expect(plan(t("P-1", { status: from, inDone }), PROBLEMS, to)).toMatchObject({ kind: "write", fields: fields(to), move: null });
  });

  it("works for a backlog at a project root of the workspace root", () => {
    const ticket = t("E-1", { status: "review", path: "E-1-x.md" });
    expect(planDrop({ ticket, target: target(SOLUTIONS, "done"), backlog: "", moveDone: true, today: TODAY })).toMatchObject({
      move: { from: "E-1-x.md", to: "done/E-1-x.md" },
    });
  });
});

describe("planDrop for signals", () => {
  it("a signal without a problem dropped on triaged asks for its problem first", () => {
    expect(plan(t("S-1", { status: "new" }), SIGNALS, "triaged")).toEqual({ kind: "ask-parent" });
  });

  it("the chosen problem is written with the status, then updated", () => {
    expect(plan(t("S-1", { status: "new" }), SIGNALS, "triaged", true, "P-012")).toEqual({
      kind: "write",
      path: `${BACKLOG}/S-1-x.md`,
      fields: [
        { key: "status", value: "triaged" },
        { key: "problem", value: "P-012" },
        { key: "updated", value: TODAY },
      ],
      move: null,
    });
  });

  it("skipping the question writes only status and updated", () => {
    expect(plan(t("S-1", { status: "new" }), SIGNALS, "triaged", true, null)).toEqual({ kind: "write", path: `${BACKLOG}/S-1-x.md`, fields: fields("triaged"), move: null });
  });

  it("a signal that has a problem is triaged without asking, and its problem stays", () => {
    expect(plan(t("S-1", { status: "new", parent: "P-3" }), SIGNALS, "triaged")).toEqual({ kind: "write", path: `${BACKLOG}/S-1-x.md`, fields: fields("triaged"), move: null });
    expect(plan(t("S-1", { status: "new", parent: "P-3" }), SIGNALS, "triaged", true, "P-9")).toMatchObject({ fields: fields("triaged") });
  });

  it.each(["new", "dismissed"])("a drop on %s never asks", (status) => {
    expect(plan(t("S-1", { status: status === "new" ? "triaged" : "new" }), SIGNALS, status)).toEqual({ kind: "write", path: `${BACKLOG}/S-1-x.md`, fields: fields(status), move: null });
  });

  it("an already triaged signal dropped on triaged is the same column", () => {
    expect(plan(t("S-1", { status: "triaged" }), SIGNALS, "triaged")).toEqual({ kind: "same" });
  });

  it("signals never move, even into a column named done", () => {
    const doneLike = { ...target(SIGNALS, "dismissed"), status: "done" };
    expect(planDrop({ ticket: t("S-1", { status: "new" }), target: doneLike, backlog: BACKLOG, moveDone: true, today: TODAY })).toMatchObject({ move: null });
  });

  it("other kinds refuse the Signals columns", () => {
    expect(plan(t("P-1", { status: "new" }), SIGNALS, "triaged")).toEqual({ kind: "refused", reason: "Problems can't be in Triaged" });
  });
});

describe("planEdit", () => {
  const write = (path: string, key: string, value: string | null) => ({
    kind: "write",
    path,
    fields: [
      { key, value },
      { key: "updated", value: TODAY },
    ],
  });

  it.each([
    [t("E-1", { priority: "P2" }), "priority", "P1", write(`${BACKLOG}/E-1-x.md`, "priority", "P1")],
    [t("P-1", { priority: null }), "priority", "P0", write(`${BACKLOG}/P-1-x.md`, "priority", "P0")],
    [t("S-1", { priority: "P3" }), "priority", "P3", { kind: "same" }],
    [t("E-1"), "parent", "P-4", write(`${BACKLOG}/E-1-x.md`, "problem", "P-4")],
    [t("T-1", { parent: "E-1" }), "parent", "E-2", write(`${BACKLOG}/T-1-x.md`, "epic", "E-2")],
    [t("T-1", { parent: "E-1" }), "parent", null, write(`${BACKLOG}/T-1-x.md`, "epic", null)],
    [t("S-1"), "parent", "P-12", write(`${BACKLOG}/S-1-x.md`, "problem", "P-12")],
    [t("T-1", { parent: "E-1" }), "parent", "E-1", { kind: "same" }],
    [t("E-1"), "parent", null, { kind: "same" }],
    [t("P-1"), "parent", "P-2", { kind: "none", reason: "Problems have no parent" }],
    [t("E-1", { inDone: true }), "priority", "P0", write(`${BACKLOG}/done/E-1-x.md`, "priority", "P0")],
  ] as const)("%#: %s %s → %j", (ticket, field, value, expected) => {
    expect(planEdit(ticket, field, value, TODAY)).toEqual(expected);
  });
});

describe("describeFailure", () => {
  it.each([
    [{ kind: "changed" }, "Changed on disk since the board read it — not saved. The card shows the file as it is now."],
    [{ kind: "host", step: "read", code: "not-found", message: "x" }, "The file is gone — not saved."],
    [{ kind: "host", step: "field", code: "not-found", message: "x" }, "The file is gone — not saved."],
    [{ kind: "host", step: "field", code: "unreadable-frontmatter", message: "bad" }, "Its frontmatter can't be read — not saved. Open it to fix."],
    [{ kind: "host", step: "field", code: "io-error", message: "EACCES: permission denied, open '/private/var/x/T-1.md.tmp'" }, "Couldn't save: permission denied."],
    [{ kind: "host", step: "field", code: "io-error", message: "ENOSPC: no space left on device, write" }, "Couldn't save: the disk is full."],
    [{ kind: "host", step: "field", code: "io-error", message: "something odd, with detail" }, "Couldn't save: something odd."],
    [{ kind: "host", step: "field", code: "io-error", message: "" }, "Couldn't save: the disk refused the write."],
    [{ kind: "host", step: "move", code: "already-exists", message: "x", moveTo: "done/E-1-x.md" }, "Status saved, but not moved: done/E-1-x.md already exists."],
    [{ kind: "host", step: "move", code: "io-error", message: "EPERM: operation not permitted, rename 'a' -> 'b'" }, "Status saved, but not moved: permission denied."],
    [{ kind: "host", step: "create", code: "io-error", message: "EACCES: permission denied, open 'x'" }, "Couldn't create it: permission denied."],
  ] as const)("%j", (failure, text) => {
    expect(describeFailure(failure)).toBe(text);
  });
});

describe("localDay", () => {
  it.each([
    [new Date(2026, 10, 17, 0, 0, 1), "2026-11-17"],
    [new Date(2026, 0, 5, 23, 59, 59), "2026-01-05"],
    [new Date(2026, 11, 31, 12), "2026-12-31"],
  ])("%s → %s", (date, day) => {
    expect(localDay(date)).toBe(day);
  });
});
