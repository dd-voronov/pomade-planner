import { describe, expect, it } from "vitest";
import type { ProjectInfo } from "pomade-kit/protocol";

import { filterProjects, folderLabel, groupLabel, splitByFolder } from "./project-folders";

const project = (id: string, name: string, groupPath: string[] = []): ProjectInfo => ({ kind: "project", id, name, root: `Projects/${id}`, groupId: groupPath.length > 0 ? "g" : null, groupPath });

const ALPHA = project("alpha", "Alpha", ["Building tools"]);
const BETA = project("beta", "Beta");
const GAMMA = project("gamma", "Gamma", ["Building tools", "Tools"]);
const KIT = project("kit", "pomade-kit", ["Building tools", "Tools"]);

describe("splitByFolder", () => {
  it("rows are the projects with a folder of their own, free the rest — each in the order given", () => {
    expect(
      splitByFolder([
        { project: ALPHA, own: null },
        { project: BETA, own: "tickets" },
        { project: GAMMA, own: null },
        { project: KIT, own: "" },
      ]),
    ).toEqual({
      rows: [
        { project: BETA, folder: "tickets" },
        { project: KIT, folder: "" },
      ],
      free: [ALPHA, GAMMA],
    });
  });

  it("no projects: both empty", () => {
    expect(splitByFolder([])).toEqual({ rows: [], free: [] });
  });
});

describe("folderLabel", () => {
  it.each([
    ["tickets", "tickets/"],
    ["docs/roadmap", "docs/roadmap/"],
    ["", "./"],
  ])("%j → %j", (folder, label) => {
    expect(folderLabel(folder)).toBe(label);
  });
});

describe("groupLabel", () => {
  it.each([
    [ALPHA, "Building tools"],
    [GAMMA, "Building tools › Tools"],
    [BETA, ""],
  ])("%#", (p, label) => {
    expect(groupLabel(p)).toBe(label);
  });
});

describe("filterProjects", () => {
  const all = [ALPHA, BETA, GAMMA, KIT];

  it.each([
    ["", ["alpha", "beta", "gamma", "kit"]],
    ["   ", ["alpha", "beta", "gamma", "kit"]],
    ["al", ["alpha"]],
    ["ALPHA", ["alpha"]],
    ["tools", ["alpha", "gamma", "kit"]],
    ["tools kit", ["kit"]],
    ["building gam", ["gamma"]],
    ["a", ["alpha", "beta", "gamma", "kit"]],
    ["nothing", []],
  ])("%j → %j", (query, ids) => {
    expect(filterProjects(all, query).map((p) => p.id)).toEqual(ids);
  });
});
