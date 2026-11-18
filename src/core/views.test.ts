import { describe, expect, it } from "vitest";

import { boardView, itemRoute, parseItemRoute, parseQuickAddRoute, plannerView, quickAddRoute, ROUTES } from "./views";

describe("plannerView", () => {
  it.each([
    ["tab", ROUTES.planner, "planner-tab"],
    ["tab", "", "planner-tab"],
    ["tab", ROUTES.settings, "planner-tab"],
    ["tab", ROUTES.today, "planner-tab"],
    ["tab", ROUTES.board, "unknown"],
    ["tab", ROUTES.needsYou, "unknown"],
    ["tab", ROUTES.quickAdd, "unknown"],
    ["tab", "quick-add?do-on=today", "unknown"],
    ["tab", "elsewhere", "unknown"],
    ["panel", ROUTES.planner, "planner-panel"],
    ["panel", "", "planner-panel"],
    ["panel", ROUTES.today, "unknown"],
    ["panel", ROUTES.settings, "unknown"],
    ["panel", ROUTES.needsYou, "unknown"],
    ["panel", ROUTES.board, "unknown"],
    ["overlay", ROUTES.quickAdd, "quick-add"],
    ["overlay", "quick-add?do-on=today", "quick-add"],
    ["overlay", "quick-add-x", "unknown"],
    ["overlay", "planner?do-on=today", "unknown"],
    ["overlay", "", "unknown"],
    ["overlay", ROUTES.planner, "unknown"],
    ["backend", "", "unknown"],
    ["command", "", "unknown"],
  ] as const)("%s at %j → %s", (surface, route, view) => {
    expect(plannerView(surface, route)).toBe(view);
  });
});

describe("boardView", () => {
  it.each([
    ["tab", ROUTES.board, "board-tab"],
    ["tab", "", "board-tab"],
    ["tab", ROUTES.planner, "unknown"],
    ["tab", ROUTES.settings, "unknown"],
    ["tab", ROUTES.today, "unknown"],
    ["tab", ROUTES.needsYou, "unknown"],
    ["tab", "elsewhere", "unknown"],
    ["panel", ROUTES.needsYou, "needs-you-panel"],
    ["panel", "", "unknown"],
    ["panel", ROUTES.board, "unknown"],
    ["panel", ROUTES.planner, "unknown"],
    ["overlay", ROUTES.quickAdd, "unknown"],
    ["overlay", "", "unknown"],
    ["backend", "", "unknown"],
    ["command", "", "unknown"],
  ] as const)("%s at %j → %s", (surface, route, view) => {
    expect(boardView(surface, route)).toBe(view);
  });
});

describe("quick-add routes", () => {
  it("carry do-on and the type only when they aren't the shortcut's own", () => {
    expect(quickAddRoute({ doOn: "", kind: "task" })).toBe("quick-add");
    expect(quickAddRoute({ doOn: "today", kind: "task" })).toBe("quick-add?do-on=today");
    expect(quickAddRoute({ doOn: "nov 20", kind: "task" })).toBe("quick-add?do-on=nov+20");
    expect(quickAddRoute({ doOn: "", kind: "recurring" })).toBe("quick-add?type=recurring");
    expect(quickAddRoute({ doOn: "today", kind: "note" })).toBe("quick-add?do-on=today&type=note");
  });

  it.each([
    ["quick-add", { doOn: "", kind: "task" }],
    ["quick-add?do-on=today", { doOn: "today", kind: "task" }],
    ["quick-add?do-on=nov+20", { doOn: "nov 20", kind: "task" }],
    ["quick-add?do-on=%20fri%20", { doOn: "fri", kind: "task" }],
    ["quick-add?", { doOn: "", kind: "task" }],
    ["quick-add?other=1", { doOn: "", kind: "task" }],
    ["quick-add?do-on=today&do-on=fri", { doOn: "today", kind: "task" }],
    ["quick-add?type=recurring", { doOn: "", kind: "recurring" }],
    ["quick-add?type=daily-note", { doOn: "", kind: "daily-note" }],
    ["quick-add?type=Recurring", { doOn: "", kind: "task" }],
    ["quick-add?type=chore&do-on=today", { doOn: "today", kind: "task" }],
    ["", null],
    ["planner", null],
    ["quick-add-x", null],
    ["planner?do-on=today", null],
  ] as const)("%j → %j", (route, prefill) => {
    expect(parseQuickAddRoute(route)).toEqual(prefill);
  });

  it("round-trips", () => {
    for (const doOn of ["", "today", "nov 20", "+3d", "a&b=c"]) for (const kind of ["task", "recurring", "note", "thought", "daily-note"] as const) expect(parseQuickAddRoute(quickAddRoute({ doOn, kind }))).toEqual({ doOn, kind });
  });
});

describe("the item route — the tab with an item's compact view open", () => {
  it.each(["Tasks/2026-11-12-gift-ideas.md", "To-dos/Quiz Lab/a&b=c?.md", "Задачи/купить молоко.md", "a.md"])("%j round-trips and is a Planner tab's", (path) => {
    expect(parseItemRoute(itemRoute(path))).toBe(path);
    expect(plannerView("tab", itemRoute(path))).toBe("planner-tab");
  });

  it("names the path as a query", () => {
    expect(itemRoute("Tasks/a b.md")).toBe("item?path=Tasks%2Fa+b.md");
  });

  it.each(["item", "item?", "item?path=", "item?file=a.md", "items?path=a.md", "planner", "", "quick-add?path=a.md"])("%j is none", (route) => {
    expect(parseItemRoute(route)).toBeNull();
  });

  it("only a tab renders it", () => {
    expect(plannerView("tab", "item")).toBe("unknown");
    expect(plannerView("panel", itemRoute("a.md"))).toBe("unknown");
    expect(plannerView("overlay", itemRoute("a.md"))).toBe("unknown");
  });
});
