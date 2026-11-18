import { describe, expect, it } from "vitest";

import { t } from "./fixtures";
import { LIST_LEVEL, needsYou, needsYouCount, needsYouCounts, needsYouParts, shownLevel, waitingProjects, type Level } from "./needs-you";

describe("needsYou", () => {
  const tickets = [
    t("E-17", { status: "review", priority: "P1" }),
    t("P-5", { status: "review", priority: "P2" }),
    t("E-2", { status: "review", priority: "P0" }),
    t("T-9", { status: "review" }),
    t("E-3", { status: "review", priority: "P1" }),
    t("E-4", { status: "in-progress" }),
    t("S-2", { status: "new", priority: "P3" }),
    t("S-1", { status: "new" }),
    t("S-3", { status: "new", priority: "P0" }),
    t("S-4", { status: "triaged" }),
    t("S-5", { status: "dismissed" }),
    t("P-6", { status: "new" }),
    t("E-10", { status: "done", inDone: true }),
  ];

  it("review: any kind in review, by priority then ID", () => {
    expect(needsYou(tickets).review.map((x) => x.id)).toEqual(["E-2", "E-3", "E-17", "P-5", "T-9"]);
  });

  it("signals: only signals in new, by priority then ID", () => {
    expect(needsYou(tickets).signals.map((x) => x.id)).toEqual(["S-3", "S-2", "S-1"]);
  });

  it("counts both groups", () => {
    expect(needsYouCount(needsYou(tickets))).toBe(8);
    expect(needsYouCount(needsYou([]))).toBe(0);
  });
});

const n = (review: number, signals: number) => ({
  review: Array.from({ length: review }, (_, i) => t(`E-${i}`, { status: "review" })),
  signals: Array.from({ length: signals }, (_, i) => t(`S-${i}`, { status: "new" })),
});

describe("needsYouParts", () => {
  it.each([
    [0, 0, []],
    [3, 0, ["3 in review"]],
    [0, 1, ["1 new signal"]],
    [0, 2, ["2 new signals"]],
    [1, 1, ["1 in review", "1 new signal"]],
    [12, 30, ["12 in review", "30 new signals"]],
  ])("%d in review, %d new → %j", (review, signals, parts) => {
    expect(needsYouParts({ review, signals })).toEqual(parts);
  });
});

describe("needsYouCounts", () => {
  it("adds each group across backlogs", () => {
    expect(needsYouCounts([n(2, 1), n(0, 0), n(3, 4)])).toEqual({ review: 5, signals: 5 });
  });

  it("is zero for no backlog and for one backlog its own counts", () => {
    expect(needsYouCounts([])).toEqual({ review: 0, signals: 0 });
    expect(needsYouCounts([n(1, 0)])).toEqual({ review: 1, signals: 0 });
  });
});

describe("waitingProjects", () => {
  const projects = [
    { project: "alpha", items: n(2, 1) },
    { project: "beta", items: null },
    { project: "gamma", items: n(0, 0) },
    { project: "delta", items: n(0, 3) },
    { project: "scale", items: n(1, 0) },
  ];

  it("keeps the projects with something waiting, in the given order", () => {
    expect(waitingProjects(projects).map((p) => p.project)).toEqual(["alpha", "delta", "scale"]);
  });

  it("leaves out a backlog not read yet and one with nothing", () => {
    expect(waitingProjects([{ project: "beta", items: null }, { project: "gamma", items: n(0, 0) }])).toEqual([]);
    expect(waitingProjects([])).toEqual([]);
  });
});

describe("shownLevel", () => {
  const ids = ["alpha", "delta"];
  const project = (id: string): Level => ({ kind: "project", id });

  it("keeps the list and every project's sections whatever the projects are", () => {
    expect(shownLevel(LIST_LEVEL, [])).toEqual({ kind: "list" });
    expect(shownLevel({ kind: "all" }, [])).toEqual({ kind: "all" });
    expect(shownLevel({ kind: "all" }, ids)).toEqual({ kind: "all" });
  });

  it("keeps an opened project while it is among the projects", () => {
    expect(shownLevel(project("delta"), ids)).toEqual(project("delta"));
  });

  it("falls back to the list when the opened project is gone", () => {
    expect(shownLevel(project("gamma"), ids)).toEqual({ kind: "list" });
    expect(shownLevel(project("alpha"), [])).toEqual({ kind: "list" });
  });

  it("a project whose id is “all” or “list” is a project", () => {
    expect(shownLevel(project("all"), ["all"])).toEqual(project("all"));
    expect(shownLevel(project("list"), ids)).toEqual({ kind: "list" });
  });
});
