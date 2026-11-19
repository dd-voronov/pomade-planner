import { describe, expect, it } from "vitest";

import { holdingProjectId } from "./open-file";

const PROJECTS = [
  { id: "pomade", root: "Projects/Pomade" },
  { id: "pomade-docs", root: "Projects/Pomade/docs" },
  { id: "kit", root: "Projects/pomade-kit/" },
];

describe("holdingProjectId", () => {
  it.each([
    ["Tasks/2026-11-12-sleep.md", "__workspace__"],
    ["Tasks/Pomade/2026-11-12-idea.md", "__workspace__"],
    ["Projects/Pomade/README.md", "pomade"],
    ["Projects/Pomade/docs/roadmap/T-001-x.md", "pomade-docs"],
    ["Projects/Pomade-old/notes.md", "__workspace__"],
    ["Projects/pomade-kit/tasks/a.md", "kit"],
    ["Projects/pomade-kit", "kit"],
  ])("%s → %s", (path, id) => {
    expect(holdingProjectId(path, PROJECTS)).toBe(id);
  });

  it("is the Workspace scope with no projects", () => {
    expect(holdingProjectId("Projects/Pomade/a.md", [])).toBe("__workspace__");
  });
});
