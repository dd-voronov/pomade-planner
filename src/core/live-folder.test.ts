import { describe, expect, it } from "vitest";

import { ancestorsOf, isFolderAppearance } from "./live-folder";

const B = "Projects/alpha/docs/roadmap";

describe("isFolderAppearance", () => {
  it.each([
    [{ path: B }, true],
    [{ path: "Projects/alpha/docs" }, true],
    [{ path: "Projects/alpha" }, true],
    [{ path: `${B}/E-001-x.md` }, true],
    [{ path: `${B}/done/E-001-x.md` }, true],
    [{ path: "Projects/alpha/docs/other" }, false],
    [{ path: "Projects/alpha/docs/roadmap-old" }, false],
    [{ path: "Projects/alpha/doc" }, false],
    [{ path: "Projects/alpha/README.md" }, false],
    [{ path: "Projects/beta/docs/roadmap" }, false],
    [{ path: "Projects/alpha/tmp", oldPath: "Projects/alpha/docs" }, true],
    [{ path: "Projects/alpha/docs", oldPath: "Projects/alpha/tmp" }, true],
    [{ path: "Projects/alpha/x", oldPath: "Projects/alpha/y" }, false],
  ])("%j → %s", (change, expected) => {
    expect(isFolderAppearance(change, B)).toBe(expected);
  });
});

describe("ancestorsOf", () => {
  it.each([
    ["Projects/alpha/docs/roadmap", ["Projects/alpha/docs", "Projects/alpha", "Projects"]],
    ["Projects/alpha", ["Projects"]],
    ["roadmap", []],
    ["", []],
    ["a/b/", ["a"]],
  ])("%j → %j", (path, expected) => {
    expect(ancestorsOf(path)).toEqual(expected);
  });
});
