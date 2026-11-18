import { describe, expect, it } from "vitest";

import { DEFAULT_DAY_BOUNDARY, normalizeTemplatePath, parsePlannerSettings } from "./settings";

describe("parsePlannerSettings", () => {
  it.each([
    [null, { tasksRoot: null, dayBoundary: DEFAULT_DAY_BOUNDARY, dailyNoteTemplate: null, projectFolders: {} }, null],
    ["{}", { tasksRoot: null, dayBoundary: DEFAULT_DAY_BOUNDARY, dailyNoteTemplate: null, projectFolders: {} }, null],
    ['{"tasksRoot":"Knowledge/To-dos/"}', { tasksRoot: "Knowledge/To-dos", dayBoundary: DEFAULT_DAY_BOUNDARY, dailyNoteTemplate: null, projectFolders: {} }, null],
    ['{"tasksRoot":""}', { tasksRoot: "", dayBoundary: DEFAULT_DAY_BOUNDARY, dailyNoteTemplate: null, projectFolders: {} }, null],
    ['{"tasksRoot":"Tasks","dayBoundary":"4:30"}', { tasksRoot: "Tasks", dayBoundary: { hour: 4, minute: 30 }, dailyNoteTemplate: null, projectFolders: {} }, null],
    ['{"tasksRoot":"Tasks","dayBoundary":"00:00"}', { tasksRoot: "Tasks", dayBoundary: { hour: 0, minute: 0 }, dailyNoteTemplate: null, projectFolders: {} }, null],
    ['{"tasksRoot":"../out"}', { tasksRoot: null, dayBoundary: DEFAULT_DAY_BOUNDARY, dailyNoteTemplate: null, projectFolders: {} }, "tasksRoot must be a folder inside the workspace, like \"Tasks\""],
    ['{"tasksRoot":"/abs"}', { tasksRoot: null, dayBoundary: DEFAULT_DAY_BOUNDARY, dailyNoteTemplate: null, projectFolders: {} }, "tasksRoot must be a folder inside the workspace, like \"Tasks\""],
    ['{"tasksRoot":3}', { tasksRoot: null, dayBoundary: DEFAULT_DAY_BOUNDARY, dailyNoteTemplate: null, projectFolders: {} }, "tasksRoot must be a folder inside the workspace, like \"Tasks\""],
    ['{"tasksRoot":"T","dayBoundary":"25:00"}', { tasksRoot: "T", dayBoundary: DEFAULT_DAY_BOUNDARY, dailyNoteTemplate: null, projectFolders: {} }, 'dayBoundary must be a time like "3:00"'],
    ['{"tasksRoot":"T","dayBoundary":3}', { tasksRoot: "T", dayBoundary: DEFAULT_DAY_BOUNDARY, dailyNoteTemplate: null, projectFolders: {} }, 'dayBoundary must be a time like "3:00"'],
  ])("%s → %j (%s)", (text, settings, problem) => {
    expect(parsePlannerSettings(text)).toEqual({ settings, problem });
  });

  it("reads the project-id → folder map; entries without a usable folder are dropped and named", () => {
    const text = JSON.stringify({
      tasksRoot: "T",
      projectFolders: { q: { folder: "QuizLab", name: "QuizLab", groupPath: ["Work"] }, p: { folder: "Pomade" }, bad: { folder: "a/b" }, daily: { folder: "Daily" }, none: 3 },
    });
    expect(parsePlannerSettings(text)).toEqual({
      settings: {
        tasksRoot: "T",
        dayBoundary: DEFAULT_DAY_BOUNDARY,
        dailyNoteTemplate: null,
        projectFolders: { q: { folder: "QuizLab", name: "QuizLab", groupPath: ["Work"] }, p: { folder: "Pomade", name: "Pomade", groupPath: [] } },
      },
      problem: "projectFolders: bad, daily, none have no usable folder",
    });
    expect(parsePlannerSettings('{"projectFolders":[1]}').problem).toBe("projectFolders must be an object of project id → folder");
  });

  it("an invalid file is every default, with the problem", () => {
    expect(parsePlannerSettings("{nope")).toMatchObject({ settings: { tasksRoot: null }, problem: expect.stringMatching(/is not valid JSON/) as unknown });
    expect(parsePlannerSettings("[]")).toMatchObject({ settings: { tasksRoot: null }, problem: expect.stringMatching(/not a JSON object/) as unknown });
  });
});

describe("the daily-note template setting", () => {
  it("a Markdown file inside the workspace; empty is none; anything else is a problem and none", () => {
    expect(parsePlannerSettings('{"dailyNoteTemplate":"Templates/Daily.md"}').settings.dailyNoteTemplate).toBe("Templates/Daily.md");
    expect(parsePlannerSettings('{"dailyNoteTemplate":""}')).toMatchObject({ settings: { dailyNoteTemplate: null }, problem: null });
    expect(parsePlannerSettings('{"dailyNoteTemplate":"../out.md"}')).toMatchObject({
      settings: { dailyNoteTemplate: null },
      problem: 'dailyNoteTemplate must be a Markdown file inside the workspace, like "Templates/Daily.md"',
    });
    expect(parsePlannerSettings('{"dailyNoteTemplate":"Templates/Daily.txt"}').settings.dailyNoteTemplate).toBeNull();
  });

  it.each([
    ["Templates/Daily.md", { ok: true, path: "Templates/Daily.md" }],
    ["  ./Templates//Daily.MD ", { ok: true, path: "Templates/Daily.MD" }],
    ["/abs/Daily.md", { ok: false, problem: "A path inside the workspace, like Templates/Daily.md" }],
    ["../Daily.md", { ok: false, problem: "A path inside the workspace, like Templates/Daily.md" }],
    ["Templates/Daily", { ok: false, problem: "A Markdown file — its name ends in .md" }],
  ])("%j → %j", (input, out) => {
    expect(normalizeTemplatePath(input)).toEqual(out);
  });
});
