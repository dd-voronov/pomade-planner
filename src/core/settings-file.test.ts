import { describe, expect, it } from "vitest";

import { mergeSettingsText, parseSettingsText, settingsPathOf } from "./settings-file";

const PATH = settingsPathOf("pomade-sample");

describe("settingsPathOf", () => {
  it("is the app's own folder under Apps/", () => {
    expect(PATH).toBe("Apps/pomade-sample/settings.json");
    expect(settingsPathOf("pomade-board")).not.toBe(settingsPathOf("pomade-planner"));
  });
});

describe("parseSettingsText", () => {
  it("a missing file is no keys; an object is its keys", () => {
    expect(parseSettingsText(null, PATH)).toEqual({ object: {}, problem: null });
    expect(parseSettingsText('{"a":1}', PATH)).toEqual({ object: { a: 1 }, problem: null });
  });

  it.each([
    ["{oops", /^Apps\/pomade-sample\/settings\.json is not valid JSON \(/],
    ["[1]", /^Apps\/pomade-sample\/settings\.json is not a JSON object$/],
    ["null", /^Apps\/pomade-sample\/settings\.json is not a JSON object$/],
    ['"text"', /^Apps\/pomade-sample\/settings\.json is not a JSON object$/],
  ])("%j is a problem that names the file", (text, problem) => {
    const parsed = parseSettingsText(text, PATH);
    expect(parsed.object).toBeNull();
    expect(parsed.problem).toMatch(problem);
  });
});

describe("mergeSettingsText", () => {
  it("creates the file's text from nothing", () => {
    expect(mergeSettingsText(null, { tasksRoot: "Tasks" }, PATH)).toEqual({ ok: true, text: '{\n  "tasksRoot": "Tasks"\n}\n' });
  });

  it("keeps every other key and the keys' order; sets, replaces and removes only the named keys", () => {
    const before = '{"handMade":"plans/","nested":{"x":1},"tasksRoot":"Old"}';
    const r = mergeSettingsText(before, { tasksRoot: "New", dayBoundary: "4:00", gone: undefined }, PATH);
    expect(r).toEqual({ ok: true, text: '{\n  "handMade": "plans/",\n  "nested": {\n    "x": 1\n  },\n  "tasksRoot": "New",\n  "dayBoundary": "4:00"\n}\n' });
    if (!r.ok) throw new Error("refused");
    expect(mergeSettingsText(r.text, { dayBoundary: undefined }, PATH)).toMatchObject({ ok: true, text: expect.not.stringContaining("dayBoundary") as unknown });
  });

  it("refuses a file that isn't a JSON object rather than overwrite it", () => {
    expect(mergeSettingsText("{oops", { tasksRoot: "T" }, PATH)).toMatchObject({ ok: false, problem: expect.stringMatching(/settings\.json is not valid JSON/) as unknown });
    expect(mergeSettingsText("[1]", { tasksRoot: "T" }, PATH)).toMatchObject({ ok: false, problem: expect.stringMatching(/not a JSON object/) as unknown });
  });
});
