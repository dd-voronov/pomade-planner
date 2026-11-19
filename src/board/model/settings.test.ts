import { describe, expect, it } from "vitest";

import {
  backlogLocation,
  DEFAULT_SYNCED_SETTINGS,
  normalizeRelative,
  normalizeReporter,
  parseProjectSettings,
  parseSyncedSettings,
  relativeToProject,
} from "./settings";

describe("parseSyncedSettings", () => {
  it("a missing file is every default, without a problem", () => {
    expect(parseSyncedSettings(null)).toEqual({ settings: { backlogPathPattern: "docs/roadmap/", reporter: "d.voronov" }, problem: null });
  });

  it.each([
    ['{"backlogPathPattern":"docs/backlog/"}', "docs/backlog/"],
    ['{"backlogPathPattern":"  roadmap  "}', "roadmap"],
    ['{"backlogPathPattern":"docs/./roadmap"}', "docs/./roadmap"],
    ['{"tasksRoot":"Tasks"}', "docs/roadmap/"],
    ["{}", "docs/roadmap/"],
  ])("%s → pattern %j", (text, pattern) => {
    expect(parseSyncedSettings(text)).toEqual({ settings: { backlogPathPattern: pattern, reporter: "d.voronov" }, problem: null });
  });

  it.each([
    ['{"reporter":"a.person"}', "a.person"],
    ['{"reporter":"  claude "}', "claude"],
    ["{}", "d.voronov"],
  ])("%s → reporter %j", (text, reporter) => {
    expect(parseSyncedSettings(text)).toEqual({ settings: { backlogPathPattern: "docs/roadmap/", reporter }, problem: null });
  });

  it.each([
    ["not json", "is not valid JSON"],
    ["[]", "is not a JSON object"],
    ["null", "is not a JSON object"],
    ['"x"', "is not a JSON object"],
    ['{"backlogPathPattern":3}', "backlogPathPattern must be"],
    ['{"backlogPathPattern":""}', "backlogPathPattern must be"],
    ['{"backlogPathPattern":"/abs/path"}', "backlogPathPattern must be"],
    ['{"backlogPathPattern":"../other"}', "backlogPathPattern must be"],
    ['{"reporter":""}', "reporter must be"],
    ['{"reporter":"Daniil Voronov"}', "reporter must be"],
    ['{"reporter":3}', "reporter must be"],
  ])("%s falls back to the defaults and says why", (text, problem) => {
    const parsed = parseSyncedSettings(text);
    expect(parsed.settings).toEqual(DEFAULT_SYNCED_SETTINGS);
    expect(parsed.problem).toContain(problem);
  });

  it("each key falls back on its own; the problems are listed together", () => {
    expect(parseSyncedSettings('{"backlogPathPattern":"/abs","reporter":"a.person"}')).toEqual({
      settings: { backlogPathPattern: "docs/roadmap/", reporter: "a.person" },
      problem: 'backlogPathPattern must be a folder inside the project, like "docs/roadmap/"',
    });
    expect(parseSyncedSettings('{"backlogPathPattern":"tickets","reporter":"a b"}').settings).toEqual({ backlogPathPattern: "tickets", reporter: "d.voronov" });
    expect(parseSyncedSettings('{"backlogPathPattern":"/abs","reporter":"a b"}').problem).toBe(
      'backlogPathPattern must be a folder inside the project, like "docs/roadmap/"; reporter must be a handle without spaces, like "d.voronov"',
    );
  });
});

describe("normalizeReporter", () => {
  it.each([
    ["d.voronov", "d.voronov"],
    ["  claude  ", "claude"],
    ["", null],
    ["   ", null],
    ["Daniil Voronov", null],
    ["a\tb", null],
  ])("%j → %j", (typed, handle) => {
    expect(normalizeReporter(typed)).toBe(handle);
  });
});

describe("normalizeRelative", () => {
  it.each([
    ["docs/roadmap/", "docs/roadmap"],
    ["docs//roadmap", "docs/roadmap"],
    ["./docs/roadmap", "docs/roadmap"],
    ["docs/x/../roadmap", "docs/roadmap"],
    ["", ""],
    ["/docs", null],
    ["../docs", null],
    ["docs\\roadmap", null],
  ])("%j → %j", (path, out) => {
    expect(normalizeRelative(path)).toBe(out);
  });
});

describe("parseProjectSettings", () => {
  it.each([
    [{}, { backlogPath: null, moveDoneToDoneFolder: true }],
    [{ backlogPath: "docs/backlog" }, { backlogPath: "docs/backlog", moveDoneToDoneFolder: true }],
    [{ backlogPath: "" }, { backlogPath: "", moveDoneToDoneFolder: true }],
    [{ backlogPath: "../x" }, { backlogPath: null, moveDoneToDoneFolder: true }],
    [{ backlogPath: 3 }, { backlogPath: null, moveDoneToDoneFolder: true }],
    [{ moveDoneToDoneFolder: false }, { backlogPath: null, moveDoneToDoneFolder: false }],
    [{ moveDoneToDoneFolder: "no" }, { backlogPath: null, moveDoneToDoneFolder: true }],
    [{ other: 1 }, { backlogPath: null, moveDoneToDoneFolder: true }],
  ])("%j → %j", (settings, parsed) => {
    expect(parseProjectSettings(settings)).toEqual(parsed);
  });
});

describe("backlogLocation", () => {
  it("is the pattern under the project root by default", () => {
    expect(backlogLocation("Projects/alpha", { backlogPath: null, moveDoneToDoneFolder: true }, DEFAULT_SYNCED_SETTINGS)).toEqual({
      path: "Projects/alpha/docs/roadmap",
      relative: "docs/roadmap",
      source: "pattern",
    });
  });

  it("follows the synced pattern", () => {
    expect(backlogLocation("Projects/alpha", { backlogPath: null, moveDoneToDoneFolder: true }, { ...DEFAULT_SYNCED_SETTINGS, backlogPathPattern: "backlog/" }).path).toBe(
      "Projects/alpha/backlog",
    );
  });

  it("prefers the project's chosen folder", () => {
    expect(backlogLocation("Projects/alpha", { backlogPath: "tickets", moveDoneToDoneFolder: true }, DEFAULT_SYNCED_SETTINGS)).toEqual({
      path: "Projects/alpha/tickets",
      relative: "tickets",
      source: "chosen",
    });
  });

  it("a chosen project root is the project folder itself", () => {
    expect(backlogLocation("Projects/alpha", { backlogPath: "", moveDoneToDoneFolder: true }, DEFAULT_SYNCED_SETTINGS).path).toBe("Projects/alpha");
  });

  it("a project at the workspace root", () => {
    expect(backlogLocation("", { backlogPath: null, moveDoneToDoneFolder: true }, DEFAULT_SYNCED_SETTINGS).path).toBe("docs/roadmap");
  });
});

describe("relativeToProject", () => {
  it.each([
    ["Projects/alpha", "Projects/alpha/docs/backlog", "docs/backlog"],
    ["Projects/alpha", "Projects/alpha", ""],
    ["Projects/alpha/", "Projects/alpha/x/", "x"],
    ["Projects/alpha", "Projects/alphabet/x", null],
    ["Projects/alpha", "Projects/beta", null],
    ["", "docs/roadmap", "docs/roadmap"],
    ["Projects/alpha", "../x", null],
  ])("root %j, picked %j → %j", (root, picked, out) => {
    expect(relativeToProject(root, picked)).toBe(out);
  });
});
