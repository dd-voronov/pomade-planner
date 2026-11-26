import { describe, expect, it } from "vitest";

import { areaOf, buildArea, canTake, countByArea, countOpen, creatableKinds, createTarget, DEFAULT_AREAS, defaultAreaId, isOpen, refusalText, type AreaDef } from "./areas";
import { t } from "./fixtures";
import { KINDS, type Kind } from "./ticket";

const [SIGNALS, PROBLEMS, SOLUTIONS] = DEFAULT_AREAS as [AreaDef, AreaDef, AreaDef];

function col(area: AreaDef, status: string) {
  const c = area.columns.find((x) => x.status === status);
  if (!c) throw new Error(`no column ${status} in ${area.id}`);
  return c;
}

describe("DEFAULT_AREAS", () => {
  it("are Signals (first), Problems and Solutions", () => {
    expect(DEFAULT_AREAS.map((a) => [a.id, a.label, a.kinds])).toEqual([
      ["signals", "Signals", ["signal"]],
      ["problems", "Problems", ["problem"]],
      ["solutions", "Solutions", ["epic", "task"]],
    ]);
  });

  it("Signals has new and triaged, dismissed on the side", () => {
    expect(SIGNALS.columns.map((c) => [c.status, c.placement, c.startsCollapsed])).toEqual([
      ["new", "main", false],
      ["triaged", "main", false],
      ["dismissed", "side", true],
    ]);
  });

  it("a board opens on Problems; a mapping without it opens on its first area", () => {
    expect(defaultAreaId(DEFAULT_AREAS)).toBe("problems");
    expect(defaultAreaId([SOLUTIONS, SIGNALS])).toBe("solutions");
    expect(defaultAreaId([])).toBe("");
  });

  it("Problems has the problem flow, done collapsed, dropped and parked on the side", () => {
    expect(PROBLEMS.columns.map((c) => [c.status, c.placement, c.startsCollapsed])).toEqual([
      ["backlog", "main", false],
      ["grooming", "main", false],
      ["planned", "main", false],
      ["delivering", "main", false],
      ["review", "main", false],
      ["reviewed", "main", false],
      ["done", "main", true],
      ["dropped", "side", true],
      ["parked", "side", true],
    ]);
  });

  it("Solutions has the epic and task flows, done collapsed, dropped and parked on the side", () => {
    expect(SOLUTIONS.columns.map((c) => [c.status, c.placement, c.startsCollapsed])).toEqual([
      ["backlog", "main", false],
      ["planned", "main", false],
      ["in-progress", "main", false],
      ["review", "main", false],
      ["reviewed", "main", false],
      ["done", "main", true],
      ["dropped", "side", true],
      ["parked", "side", true],
    ]);
  });

  it("side columns come after every main column", () => {
    for (const area of DEFAULT_AREAS) {
      const placements = area.columns.map((c) => c.placement);
      expect(placements.indexOf("side")).toBeGreaterThan(placements.lastIndexOf("main"));
    }
  });
});

describe("canTake — which kind may sit in which column (Pomade process/backlog 'Statuses')", () => {
  const matrix: [AreaDef, string, Kind, boolean][] = [];
  const allowed: Record<string, Record<string, Kind[]>> = {
    signals: { new: ["signal"], triaged: ["signal"], dismissed: ["signal"] },
    problems: {
      backlog: ["problem"],
      grooming: ["problem"],
      planned: ["problem"],
      delivering: ["problem"],
      review: ["problem"],
      reviewed: ["problem"],
      done: ["problem"],
      dropped: ["problem"],
      parked: ["problem"],
    },
    solutions: {
      backlog: ["task"],
      planned: ["epic", "task"],
      "in-progress": ["epic", "task"],
      review: ["epic", "task"],
      reviewed: ["epic", "task"],
      done: ["epic", "task"],
      dropped: ["epic", "task"],
      parked: ["epic"],
    },
  };
  for (const area of DEFAULT_AREAS) {
    for (const c of area.columns) {
      for (const kind of KINDS) matrix.push([area, c.status, kind, allowed[area.id]?.[c.status]?.includes(kind) ?? false]);
    }
  }
  it.each(matrix.map(([a, s, k, ok]) => [a.id, s, k, ok, a] as const))("%s/%s takes %s: %s", (_id, status, kind, ok, area) => {
    expect(canTake(col(area, status), kind)).toBe(ok);
  });
});

describe("refusalText", () => {
  it.each([
    [SOLUTIONS, "backlog", "epic", "Epics can't be in Backlog"],
    [SOLUTIONS, "parked", "task", "Tasks can't be in Parked"],
    [PROBLEMS, "delivering", "task", "Tasks can't be in Delivering"],
    [PROBLEMS, "reviewed", "epic", "Epics can't be in Reviewed"],
    [SOLUTIONS, "reviewed", "problem", "Problems can't be in Reviewed"],
    [SIGNALS, "triaged", "problem", "Problems can't be in Triaged"],
  ] as const)("%s %s refuses %s: %s", (area, status, kind, text) => {
    expect(refusalText(col(area, status), kind)).toBe(text);
  });
});

describe("areaOf", () => {
  it.each([
    ["problem", "problems"],
    ["epic", "solutions"],
    ["task", "solutions"],
    ["signal", "signals"],
  ] as const)("%s → %s", (kind, id) => {
    expect(areaOf(DEFAULT_AREAS, kind)?.id ?? null).toBe(id);
  });
});

describe("buildArea", () => {
  const tickets = [
    t("P-1", { status: "grooming" }),
    t("P-2", { status: "done", inDone: true }),
    t("E-1", { status: "review", priority: "P2" }),
    t("E-2", { status: "review", priority: "P0" }),
    t("T-1", { status: "review" }),
    t("T-2", { status: "backlog" }),
    t("E-3", { status: "backlog" }),
    t("T-3", { status: "wip" }),
    t("E-4", { status: null }),
    t("S-1", { status: "new" }),
    t("E-5", { status: "done", inDone: true }),
    t("T-4", { status: "parked" }),
  ];

  it("puts each Solutions ticket in its status column, in order", () => {
    const board = buildArea(SOLUTIONS, tickets);
    expect(Object.fromEntries(board.columns.map((c) => [c.def.status, c.cards.map((x) => x.id)]))).toEqual({
      backlog: ["E-3", "T-2"],
      planned: [],
      "in-progress": [],
      review: ["E-2", "E-1", "T-1"],
      reviewed: [],
      done: ["E-5"],
      dropped: [],
      parked: ["T-4"],
    });
  });

  it("shows a ticket in its status column even where its kind can't be dropped (the file is the truth)", () => {
    const board = buildArea(SOLUTIONS, tickets);
    expect(board.columns.find((c) => c.def.status === "parked")?.cards.map((x) => x.id)).toContain("T-4");
  });

  it("puts a task in review in Solutions › Review", () => {
    const board = buildArea(SOLUTIONS, [t("T-7", { status: "review" })]);
    expect(board.columns.find((c) => c.def.status === "review")?.cards.map((x) => x.id)).toEqual(["T-7"]);
    expect(board.misfits).toEqual([]);
  });

  it("puts a reviewed epic and task in Solutions › Reviewed and a reviewed problem in Problems › Reviewed, right after Review", () => {
    const reviewed = [t("T-8", { status: "reviewed" }), t("E-8", { status: "reviewed" }), t("P-8", { status: "reviewed" })];
    for (const [area, ids] of [
      [SOLUTIONS, ["E-8", "T-8"]],
      [PROBLEMS, ["P-8"]],
    ] as const) {
      const board = buildArea(area, reviewed);
      expect(board.columns.find((c) => c.def.status === "reviewed")?.cards.map((x) => x.id)).toEqual(ids);
      expect(board.misfits).toEqual([]);
      const statuses = area.columns.map((c) => c.status);
      expect(statuses.indexOf("reviewed")).toBe(statuses.indexOf("review") + 1);
      expect(col(area, "reviewed").label).toBe("Reviewed");
    }
  });

  it("a reviewed signal has no column: Signals lists it as a misfit", () => {
    expect(buildArea(SIGNALS, [t("S-8", { status: "reviewed" })]).misfits).toEqual([{ ticket: expect.objectContaining({ id: "S-8" }) as unknown, reason: "status “reviewed” has no column" }]);
  });

  it("lists tickets with no status or a status without a column as misfits", () => {
    expect(buildArea(SOLUTIONS, tickets).misfits).toEqual([
      { ticket: expect.objectContaining({ id: "E-4" }) as unknown, reason: "no status" },
      { ticket: expect.objectContaining({ id: "T-3" }) as unknown, reason: "status “wip” has no column" },
    ]);
  });

  it("Problems shows only problems; Signals only signals", () => {
    const board = buildArea(PROBLEMS, tickets);
    expect(board.columns.flatMap((c) => c.cards.map((x) => x.id))).toEqual(["P-1", "P-2"]);
    expect(board.misfits).toEqual([]);
    expect(buildArea(SOLUTIONS, tickets).columns.flatMap((c) => c.cards).some((x) => x.kind === "signal")).toBe(false);
    expect(buildArea(SIGNALS, tickets).columns.flatMap((c) => c.cards.map((x) => x.id))).toEqual(["S-1"]);
  });

  it("an empty backlog gives every column empty", () => {
    expect(buildArea(PROBLEMS, []).columns.every((c) => c.cards.length === 0)).toBe(true);
  });

  it("a custom mapping is rendered as given", () => {
    const custom: AreaDef = {
      id: "signals",
      label: "Signals",
      kinds: ["signal"],
      columns: [{ status: "new", label: "New", kinds: ["signal"], placement: "main", startsCollapsed: false }],
    };
    expect(buildArea(custom, tickets).columns[0]?.cards.map((x) => x.id)).toEqual(["S-1"]);
  });
});

describe("counts", () => {
  const tickets = [
    t("P-1", { status: "planned" }),
    t("P-2", { status: "done" }),
    t("P-3", { status: "parked" }),
    t("E-1", { status: "review" }),
    t("E-2", { status: "dropped" }),
    t("T-1", { status: null }),
    t("S-1", { status: "new" }),
    t("S-2", { status: "triaged" }),
    t("S-3", { status: "dismissed" }),
  ];

  it("countOpen counts shown tickets that are not done, dropped, parked, triaged or dismissed", () => {
    expect(countOpen(DEFAULT_AREAS, tickets)).toBe(4);
    expect(countOpen([PROBLEMS, SOLUTIONS], tickets)).toBe(3);
  });

  it("countOpen counts a reviewed problem, epic and task as open", () => {
    expect(countOpen(DEFAULT_AREAS, [t("P-9", { status: "reviewed" }), t("E-9", { status: "reviewed" }), t("T-9", { status: "reviewed" }), t("E-2", { status: "done" })])).toBe(3);
  });

  it.each([
    ["planned", true],
    ["review", true],
    ["reviewed", true],
    ["new", true],
    [null, true],
    ["wip", true],
    ["done", false],
    ["dropped", false],
    ["parked", false],
    ["triaged", false],
    ["dismissed", false],
  ] as const)("isOpen with status %s: %s", (status, open) => {
    expect(isOpen(t("E-1", { status }))).toBe(open);
  });

  it("countByArea counts every shown ticket per area", () => {
    expect(countByArea(DEFAULT_AREAS, tickets)).toEqual({ signals: 3, problems: 3, solutions: 3 });
  });
});

describe("create targets", () => {
  it.each([
    [SIGNALS, "new", "signal"],
    [PROBLEMS, "backlog", "problem"],
    [SOLUTIONS, "planned", "epic"],
  ] as const)("the empty %s area's call to action creates in %s as a %s", (area, status, kind) => {
    const target = createTarget(area);
    expect([target?.column.status, target?.kind]).toEqual([status, kind]);
  });

  it("an area with no kinds or no column for them has none", () => {
    expect(createTarget({ ...SIGNALS, kinds: [] })).toBeNull();
    expect(createTarget({ ...SIGNALS, columns: [] })).toBeNull();
  });

  it.each([
    [SOLUTIONS, "backlog", ["task"]],
    [SOLUTIONS, "planned", ["epic", "task"]],
    [SOLUTIONS, "in-progress", ["epic", "task"]],
    [SOLUTIONS, "review", ["epic", "task"]],
    [SOLUTIONS, "reviewed", ["epic", "task"]],
    [PROBLEMS, "reviewed", ["problem"]],
    [SOLUTIONS, "parked", ["epic"]],
    [SOLUTIONS, "dropped", ["epic", "task"]],
    [PROBLEMS, "grooming", ["problem"]],
    [SIGNALS, "new", ["signal"]],
    [SIGNALS, "dismissed", ["signal"]],
  ] as const)("%s/%s offers %j", (area, status, kinds) => {
    expect(creatableKinds(area, col(area, status))).toEqual(kinds);
  });
});
