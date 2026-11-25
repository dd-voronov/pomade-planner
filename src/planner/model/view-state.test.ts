import { describe, expect, it } from "vitest";

import { resolveWrites, tickWrites } from "./tick";
import { DEFAULT_VIEW, parsePlannerView, plannerViewKey, serializePlannerView, toggled, type PlannerView } from "./view-state";

const V = (fields: Partial<PlannerView>): PlannerView => ({ ...DEFAULT_VIEW, ...fields });

describe("planner view state", () => {
  it.each([
    [null, DEFAULT_VIEW],
    ["all", DEFAULT_VIEW],
    [[], DEFAULT_VIEW],
    [{ view: "all" }, V({ view: "all" })],
    [{ view: "project" }, V({ view: "project" })],
    [{ view: "all", showDone: true }, V({ view: "all", showDone: true })],
    [{ view: "all", showArchived: true }, V({ view: "all", showArchived: true })],
    [{ showArchived: 1 }, DEFAULT_VIEW],
    [{ view: "recurring", showDone: "yes" }, V({ view: "recurring" })],
    [{ view: "notes" }, DEFAULT_VIEW],
    [{ mixins: ["none", "quiz", "quiz", 3, ""] }, V({ mixins: ["none", "quiz"] })],
    [{ mixins: "quiz" }, DEFAULT_VIEW],
    [{ dueToday: true }, V({ dueToday: true })],
    [{ dueToday: "yes" }, DEFAULT_VIEW],
    [{ projects: ["none", "quiz"], types: ["task", null] }, V({ projects: ["none", "quiz"], types: ["task"] })],
    [{ onlyProject: true }, V({ onlyProject: true })],
    [{ onlyProject: "yes" }, DEFAULT_VIEW],
  ])("%j → %j", (value, view) => {
    expect(parsePlannerView(value)).toEqual(view);
  });

  it.each([
    // The no-project items read as that source, first; the projects as they were.
    [{ view: "project", mixNoProject: true, mixProjects: ["quiz", "pomade"] }, V({ view: "project", mixins: ["none", "quiz", "pomade"] })],
    [{ mixNoProject: true, mixProjects: [] }, V({ mixins: ["none"] })],
    [{ mixNoProject: false, mixProjects: ["quiz", "quiz", 3, ""] }, V({ mixins: ["quiz"] })],
    [{ mixNoProject: true, mixProjects: ["none", "quiz"] }, V({ mixins: ["none", "quiz"] })],
    [{ mixNoProject: "yes", mixProjects: "quiz" }, DEFAULT_VIEW],
    // With `mixins` saved, the other two are not read.
    [{ mixins: ["quiz"], mixNoProject: true, mixProjects: ["pomade"] }, V({ mixins: ["quiz"] })],
  ])("mix-ins saved as mixNoProject and mixProjects: %j → %j", (value, view) => {
    expect(parsePlannerView(value)).toEqual(view);
    expect(serializePlannerView(parsePlannerView(value))).not.toHaveProperty("mixNoProject");
  });

  it("round-trips and keys by context", () => {
    const view = V({ view: "project", showDone: true, showArchived: true, onlyProject: true, dueToday: true, mixins: ["none", "a"], projects: ["none"], types: ["task"] });
    expect(parsePlannerView(serializePlannerView(view))).toEqual(view);
    expect(plannerViewKey("__workspace__")).toBe("planner.view.__workspace__");
  });

  it("toggled adds an absent key and removes a present one", () => {
    expect(toggled(["a"], "b")).toEqual(["a", "b"]);
    expect(toggled(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("tickWrites", () => {
  it("ticking sets status done and done-on the planner day; unticking sets status open and removes done-on", () => {
    expect(tickWrites(true, "2026-11-17")).toEqual([
      { key: "status", value: "done" },
      { key: "done-on", value: "2026-11-17" },
    ]);
    expect(tickWrites(false, "2026-11-17")).toEqual([
      { key: "status", value: "open" },
      { key: "done-on", value: null },
    ]);
  });
});

describe("resolveWrites", () => {
  it("resolving a thought sets status resolved and done-on; reopening sets it open and removes done-on", () => {
    expect(resolveWrites(true, "2026-11-17")).toEqual([
      { key: "status", value: "resolved" },
      { key: "done-on", value: "2026-11-17" },
    ]);
    expect(resolveWrites(false, "2026-11-17")).toEqual(tickWrites(false, "2026-11-17"));
  });
});
