import { describe, expect, it } from "vitest";

import { archivePath, numbered, restorePath } from "./archive";

describe("archive paths", () => {
  it("into _archive/, keeping the sub-folder; a taken name steps to -2, -3", () => {
    expect(archivePath("To-dos", "To-dos/idea.md")).toBe("To-dos/_archive/idea.md");
    expect(archivePath("To-dos", "To-dos/QuizLab/idea.md")).toBe("To-dos/_archive/QuizLab/idea.md");
    expect(archivePath("To-dos", "To-dos/QuizLab/idea.md", 2)).toBe("To-dos/_archive/QuizLab/idea-2.md");
    expect(archivePath("", "QuizLab/idea.md", 3)).toBe("_archive/QuizLab/idea-3.md");
  });

  it("nothing outside the root or already archived", () => {
    expect(archivePath("To-dos", "Other/idea.md")).toBeNull();
    expect(archivePath("To-dos", "To-dos/_archive/idea.md")).toBeNull();
  });

  it("restoring goes back where it came from", () => {
    expect(restorePath("To-dos", "To-dos/_archive/QuizLab/idea.md")).toBe("To-dos/QuizLab/idea.md");
    expect(restorePath("To-dos", "To-dos/_archive/idea.md", 2)).toBe("To-dos/idea-2.md");
    expect(restorePath("To-dos", "To-dos/idea.md")).toBeNull();
  });

  it.each([
    ["a.md", 1, "a.md"],
    ["a.md", 2, "a-2.md"],
    ["a.b.md", 3, "a.b-3.md"],
    ["noext", 2, "noext-2"],
  ])("numbered(%j, %i) → %j", (name, n, out) => {
    expect(numbered(name, n)).toBe(out);
  });
});
