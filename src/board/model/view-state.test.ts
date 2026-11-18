import { describe, expect, it } from "vitest";

import { DEFAULT_AREAS, type AreaDef } from "./areas";
import { isCollapsed, parseView, serializeView, setCollapsed, viewKey } from "./view-state";

const [, PROBLEMS, SOLUTIONS] = DEFAULT_AREAS as [AreaDef, AreaDef, AreaDef];
const column = (area: AreaDef, status: string) => {
  const c = area.columns.find((x) => x.status === status);
  if (!c) throw new Error(status);
  return c;
};

describe("parseView", () => {
  it.each([
    [null, { area: "problems", toggled: {} }],
    ["solutions", { area: "problems", toggled: {} }],
    [[], { area: "problems", toggled: {} }],
    [{ area: "solutions" }, { area: "solutions", toggled: {} }],
    [{ area: "signals" }, { area: "signals", toggled: {} }],
    [{ area: "ideas" }, { area: "problems", toggled: {} }],
    [{ area: 3, toggled: { solutions: ["done"] } }, { area: "problems", toggled: { solutions: ["done"] } }],
    [{ area: "solutions", toggled: { solutions: ["done", "done", "nope", 4], other: ["done"], problems: "done" } }, { area: "solutions", toggled: { solutions: ["done"] } }],
    [{ area: "problems", toggled: { problems: [] } }, { area: "problems", toggled: {} }],
    [{ area: "problems", toggled: [] }, { area: "problems", toggled: {} }],
  ])("%j → %j", (value, view) => {
    expect(parseView(value, DEFAULT_AREAS)).toEqual(view);
  });

  it("round-trips through serializeView", () => {
    const view = { area: "solutions", toggled: { solutions: ["done", "parked"], problems: ["backlog"] } };
    expect(parseView(serializeView(view), DEFAULT_AREAS)).toEqual(view);
  });

  it("is keyed per project", () => {
    expect(viewKey("proj-alpha")).toBe("board.view.proj-alpha");
  });
});

describe("collapsed columns", () => {
  const empty = { area: "problems", toggled: {} };

  it.each([
    [SOLUTIONS, "planned", false],
    [SOLUTIONS, "done", true],
    [SOLUTIONS, "dropped", true],
    [SOLUTIONS, "parked", true],
    [PROBLEMS, "grooming", false],
    [PROBLEMS, "done", true],
  ] as const)("by default %s/%s collapsed: %s", (area, status, collapsed) => {
    expect(isCollapsed(empty, area.id, column(area, status))).toBe(collapsed);
  });

  it("expanding done and collapsing it again returns to the default", () => {
    const done = column(SOLUTIONS, "done");
    const expanded = setCollapsed(empty, "solutions", done, false);
    expect(expanded.toggled).toEqual({ solutions: ["done"] });
    expect(isCollapsed(expanded, "solutions", done)).toBe(false);
    expect(isCollapsed(expanded, "problems", column(PROBLEMS, "done"))).toBe(true);
    const back = setCollapsed(expanded, "solutions", done, true);
    expect(back.toggled).toEqual({});
    expect(isCollapsed(back, "solutions", done)).toBe(true);
  });

  it("collapsing an open column and setting it twice is idempotent", () => {
    const planned = column(PROBLEMS, "planned");
    const once = setCollapsed(empty, "problems", planned, true);
    expect(setCollapsed(once, "problems", planned, true)).toEqual(once);
    expect(isCollapsed(once, "problems", planned)).toBe(true);
  });
});
