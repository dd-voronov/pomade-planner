import { describe, expect, it } from "vitest";

import { groupLabel, initialActive, matchesQuery, pickerGroups, stepOneOptions, stepTwoOptions, UNGROUPED, type PickerOption, type PickerProject } from "./picker";

const groups = [
  { id: "build", path: ["Building tools"] },
  { id: "tools", path: ["Building tools", "Tools"] },
  { id: "empty", path: ["Empty"] },
  { id: "life", path: ["Life"] },
];
const p = (id: string, name: string, groupId: string | null, groupPath: string[] = []): PickerProject => ({ id, name, groupId, groupPath });
const projects = [
  p("pomade", "Pomade", "build", ["Building tools"]),
  p("kit", "pomade-kit", "tools", ["Building tools", "Tools"]),
  p("quiz", "QuizLab", "tools", ["Building tools", "Tools"]),
  p("nora", "Nora's swimming", "life", ["Life"]),
  p("loose", "Loose ends", null),
  p("quiz2", "QuizLab", "life", ["Life"]),
];
const G = pickerGroups(groups, projects);
const names = (options: PickerOption[]) => options.map((o) => (o.kind === "none" ? "No project" : o.kind === "group" ? `group:${o.group.label}` : `${o.project.name} (${groupLabel(o.project.groupPath)})`));

describe("pickerGroups", () => {
  it("every nested group path that holds projects, in sidebar order, then Ungrouped", () => {
    expect(G.map((g) => [g.id, g.label, g.projects.map((x) => x.id)])).toEqual([
      ["build", "Building tools", ["pomade"]],
      ["tools", "Building tools › Tools", ["kit", "quiz"]],
      ["life", "Life", ["nora", "quiz2"]],
      [UNGROUPED, "Ungrouped", ["loose"]],
    ]);
  });
});

describe("step one", () => {
  it("no query: No project first, then the groups", () => {
    expect(names(stepOneOptions(G, ""))).toEqual(["No project", "group:Building tools", "group:Building tools › Tools", "group:Life", "group:Ungrouped"]);
  });

  it("typing finds projects straight away, then matching groups; No project stays first", () => {
    expect(names(stepOneOptions(G, "qui"))).toEqual(["No project", "QuizLab (Building tools › Tools)", "QuizLab (Life)"]);
    expect(names(stepOneOptions(G, "tools"))).toEqual(["No project", "group:Building tools", "group:Building tools › Tools"]);
    expect(names(stepOneOptions(G, "pom"))).toEqual(["No project", "Pomade (Building tools)", "pomade-kit (Building tools › Tools)"]);
    expect(names(stepOneOptions(G, "zzz"))).toEqual(["No project"]);
  });
});

describe("step two", () => {
  it("the group's projects; typing filters them", () => {
    const tools = G[1]!;
    expect(names(stepTwoOptions(tools, ""))).toEqual(["pomade-kit (Building tools › Tools)", "QuizLab (Building tools › Tools)"]);
    expect(names(stepTwoOptions(tools, "KIT"))).toEqual(["pomade-kit (Building tools › Tools)"]);
  });
});

describe("matchesQuery", () => {
  it.each([
    ["", "anything", true],
    ["qui", "QuizLab", true],
    ["QUIZ lab", "QuizLab", true],
    ["nora swim", "Nora's swimming", true],
    ["cafe", "Café", true],
    ["café", "Cafe", true],
    ["tools build", "Building tools › Tools", true],
    ["x", "QuizLab", false],
  ])("%j in %j → %s", (query, text, expected) => {
    expect(matchesQuery(query, text)).toBe(expected);
  });
});

describe("initialActive", () => {
  it("with a query the first match after No project; without, the current value; else the first", () => {
    const withQuery = stepOneOptions(G, "qui");
    expect(initialActive(withQuery, "qui", () => false)).toBe(1);
    expect(initialActive(stepOneOptions(G, "zzz"), "zzz", () => false)).toBe(0);
    const none = stepOneOptions(G, "");
    expect(initialActive(none, "", (o) => o.kind === "group" && o.group.id === "life")).toBe(3);
    expect(initialActive(none, "", () => false)).toBe(0);
  });
});
