// E-004 on the fake host (fake-host/, test/fixtures/workspace.ts `PLANNER_WORKSPACE`): project
// folders and the project-id → folder map, the context (Workspace or the active project), Today
// grouped by project, Project and All with their filters, mix-ins remembered per project, the
// two-step project picker in quick add, and project renames and regroups following the folder.
// The fixture's Tasks/ is dated around Tue 2026-11-17.

import { expect, test, type FrameLocator, type Page } from "@playwright/test";

import { APP_PORT, HARNESS_PORT } from "../playwright.config";
import { openQuickAdd, quickAdded, row, settled, titles } from "./fixtures/planner";
import { shot } from "./fixtures/screens";

const APP = `http://localhost:${APP_PORT}/`;
const SETTINGS = "Apps/pomade-planner/settings.json";
const NOW = "2026-11-17T10:00";

interface Open {
  surface: "tab" | "panel" | "overlay";
  icon?: string;
  route?: string;
  /** The active project's id, or `workspace`. */
  project?: string;
  panelWidth?: number;
  /** Mount the frame only when the spec says (`window.mountNow()`). */
  manual?: boolean;
}

function harness(open: Open): string {
  const params = new URLSearchParams({ app: APP, surface: open.surface, tasks: "Tasks", now: NOW, fixture: "planner" });
  for (const key of ["icon", "route", "project", "panelWidth"] as const) {
    const value = open[key];
    if (value !== undefined) params.set(key, String(value));
  }
  if (open.manual) params.set("mount", "manual");
  return `http://localhost:${HARNESS_PORT}/index.html?${params.toString()}`;
}

const app = (page: Page): FrameLocator => page.frameLocator("#stage iframe >> nth=0");
const fileText = (page: Page, path: string) => page.evaluate((p) => window.fakeHost.readFile(p), path);
const exists = (page: Page, path: string) =>
  page.evaluate((p) => {
    try {
      window.fakeHost.readFile(p);
      return true;
    } catch {
      return false;
    }
  }, path);
const settings = async (page: Page) => JSON.parse(await fileText(page, SETTINGS)) as { tasksRoot: string; projectFolders?: Record<string, { folder: string; name: string; groupPath: string[] }> };
const sections = (a: FrameLocator) => a.locator('[data-testid="task-section"]').evaluateAll((els) => els.map((el) => el.getAttribute("data-source")));
const sectionNames = (a: FrameLocator) => a.getByTestId("task-section-name").allTextContents();

async function openPanel(page: Page, project?: string, extra: Partial<Open> = {}): Promise<FrameLocator> {
  await page.goto(harness({ surface: "panel", icon: "planner", ...(project === undefined ? {} : { project }), ...extra }));
  const a = app(page);
  await expect(a.getByTestId("view-planner-panel")).toBeVisible();
  await settled(a);
  return a;
}

const NO_PROJECT_TODAY = ["Pay the tax", "Renew Nora's swimming class", "Call the dentist", "Buy printer ink", "Book flights for the Christmas trip to see the grandparents in Valencia", "Water the plants"];

test.describe("storage: project folders and the map", () => {
  test("on open, folders named after projects are taken over and the map is written — every other settings key kept", async ({ page }) => {
    await page.goto(harness({ surface: "panel", icon: "planner", project: "workspace", manual: true }));
    await page.evaluate((path) => window.fakeHost.writeFile(path, '{\n  "backlogPathPattern": "plans/",\n  "tasksRoot": "Tasks"\n}\n'), SETTINGS);
    await page.evaluate(() => window.mountNow());
    await expect(app(page).getByTestId("view-planner-panel")).toBeVisible();
    await expect.poll(() => settings(page)).toEqual({
      backlogPathPattern: "plans/",
      tasksRoot: "Tasks",
      projectFolders: {
        pomade: { folder: "Pomade", name: "Pomade", groupPath: ["Building tools"] },
        quiz: { folder: "QuizLab", name: "QuizLab", groupPath: ["Building tools", "Tools"] },
      },
    });
  });
});

test.describe("context and views", () => {
  test("Workspace Today: the no-project items, then each project's Today under its heading; a folder no project owns by its name", async ({ page }) => {
    const a = await openPanel(page, "workspace");
    await expect(a.getByTestId("planner-day")).toHaveText("Tue, Nov 17");
    await expect.poll(() => sections(a)).toEqual(["none", "folder:old stuff", "pomade", "quiz"]);
    expect(await sectionNames(a)).toEqual(["No project", "Old stuff", "Pomade", "QuizLab"]);
    expect(await titles(a)).toEqual([...NO_PROJECT_TODAY, "Sort the attic", "Review the Host API", "Ship the planner", "Fix the score screen"]);
    // Headings carry the rows; the rows carry no source label of their own.
    await expect(a.getByTestId("hint-source")).toHaveCount(0);
    expect(await a.getByTestId("unreadable-row").evaluateAll((els) => els.map((el) => el.getAttribute("data-path")))).toEqual(["Tasks/2026-11-13-broken.md", "Tasks/QuizLab/2026-11-14-broken.md"]);
    await expect(a.getByTestId("count-today")).toHaveText("9");
    await expect(a.getByTestId("planner-where")).toHaveText("Tasks/");
    await shot(page, "e004-fake-workspace-today");
  });

  test("inside Pomade: Today and Project show Pomade's items only; the subheader names its folder", async ({ page }) => {
    const a = await openPanel(page);
    await expect(a.getByTestId("planner-where")).toHaveText("Tasks/Pomade/");
    expect(await titles(a)).toEqual(["Review the Host API", "Ship the planner"]);
    await expect(a.getByTestId("task-section")).toHaveCount(0);
    await expect(a.getByTestId("unreadable-row")).toHaveCount(0);
    await a.getByTestId("view-project").click();
    expect(await titles(a)).toEqual(["Review the Host API", "Ship the planner", "Write release notes"]);
    await expect(a.getByTestId("count-project")).toHaveText("3");
    await shot(page, "e004-fake-project-view");
  });

  test("mix-ins: + No-project items and + a project mix them in, each row with its source; switching projects and back restores the chips and the view", async ({ page }) => {
    const a = await openPanel(page);
    await a.getByTestId("mix-no-project").click();
    await expect(a.getByTestId("mix-no-project")).toHaveAttribute("aria-pressed", "true");
    await expect(row(a, "Pay the tax").getByTestId("hint-source")).toHaveText("No project");
    await expect(row(a, "Ship the planner").getByTestId("hint-source")).toHaveCount(0);
    expect(await titles(a)).toEqual(["Pay the tax", "Review the Host API", "Renew Nora's swimming class", "Call the dentist", "Buy printer ink", "Ship the planner", "Book flights for the Christmas trip to see the grandparents in Valencia", "Water the plants"]);

    // + Project: the two-step picker leaves Pomade itself out; typing finds QuizLab straight away.
    await a.getByTestId("mix-add").click();
    await expect(a.getByTestId("project-picker")).toBeVisible();
    await expect(a.getByTestId("picker-filter")).toBeFocused();
    await expect(a.getByTestId("picker-option-name")).toHaveText(["Building tools › Tools", "Archive", "Life", "Ungrouped"]);
    await a.getByTestId("picker-filter").pressSequentially("quiz");
    await expect(a.getByTestId("picker-option-name")).toHaveText(["QuizLab", "QuizLab"]);
    await shot(page, "e004-fake-mixin-picker");
    await a.getByTestId("picker-filter").press("Enter");
    await expect(a.getByTestId("mix-chip")).toHaveAttribute("data-source", "quiz");
    await expect(row(a, "Fix the score screen").getByTestId("hint-source")).toHaveText("QuizLab");
    await shot(page, "e004-fake-today-mixins");

    await a.getByTestId("view-project").click();
    await expect(row(a, "Add dark mode").getByTestId("hint-source")).toHaveText("QuizLab");
    await expect.poll(() => page.evaluate(() => window.fakeHost.state["planner.view.pomade"])).toEqual({ view: "project", showDone: false, showArchived: false, mixNoProject: true, mixProjects: ["quiz"], projects: [], types: [] });

    // Another project has its own view and no chips; back in Pomade both are restored.
    await page.evaluate(() => window.fakeHost.setActiveProject("quiz"));
    await expect(a.getByTestId("planner-where")).toHaveText("Tasks/QuizLab/");
    await expect(a.getByTestId("view-today")).toHaveAttribute("aria-selected", "true");
    await expect(a.getByTestId("mix-no-project")).toHaveAttribute("aria-pressed", "false");
    await expect(a.getByTestId("mix-chip")).toHaveCount(0);
    expect(await titles(a)).toEqual(["Fix the score screen"]);
    await page.evaluate(() => window.fakeHost.setActiveProject("pomade"));
    await expect(a.getByTestId("view-project")).toHaveAttribute("aria-selected", "true");
    await expect(a.getByTestId("mix-no-project")).toHaveAttribute("aria-pressed", "true");
    await expect(a.getByTestId("mix-chip")).toHaveAttribute("data-source", "quiz");

    // A chip's × takes it out again.
    await a.getByTestId("mix-chip").click();
    await expect(row(a, "Add dark mode")).toHaveCount(0);
  });

  test("All spans every project: filtered to two projects it shows only theirs; the type filter; both remembered", async ({ page }) => {
    const a = await openPanel(page);
    await a.getByTestId("view-all").click();
    await expect(row(a, "Learn a piano piece").getByTestId("hint-source")).toHaveText("No project");
    await expect(row(a, "Add dark mode").getByTestId("hint-source")).toHaveText("QuizLab");
    await expect(row(a, "Write release notes").getByTestId("hint-source")).toHaveCount(0);
    await expect(a.getByTestId("count-all")).toHaveText("13");

    await a.getByTestId("filter-projects").click();
    await expect(a.getByTestId("filter-projects-search")).toBeFocused();
    expect(await a.getByTestId("filter-option").evaluateAll((els) => els.map((el) => el.getAttribute("data-key")))).toEqual(["none", "pomade", "kit", "quiz", "quiz-old", "school", "errands", "folder:old stuff"]);
    await a.locator('[data-testid="filter-option"][data-key="pomade"]').click();
    await a.getByTestId("filter-projects-search").fill("old");
    await a.locator('[data-testid="filter-option"][data-key="folder:old stuff"]').click();
    await shot(page, "e004-fake-all-filter-menu");
    await page.keyboard.press("Escape");
    await expect(a.getByTestId("filter-projects")).toHaveText("2 projects");
    expect(await titles(a)).toEqual(["Review the Host API", "Sort the attic", "Ship the planner", "Write release notes"]);
    await expect(a.getByTestId("count-all")).toHaveText("4");
    await shot(page, "e004-fake-all-filtered");

    await a.getByTestId("filter-types").click();
    await a.locator('[data-testid="filter-option"][data-key="task"]').click();
    await page.keyboard.press("Escape");
    await expect(a.getByTestId("filter-types")).toHaveText("Tasks");
    expect(await titles(a)).toHaveLength(4);
    await expect.poll(() => page.evaluate(() => window.fakeHost.state["planner.view.pomade"])).toMatchObject({ view: "all", projects: ["pomade", "folder:old stuff"], types: ["task"] });

    await a.getByTestId("filter-projects").click();
    await a.getByTestId("filter-projects-clear").click();
    await page.keyboard.press("Escape");
    await expect(a.getByTestId("filter-projects")).toHaveText("All projects");
    await expect(a.getByTestId("count-all")).toHaveText("13");
  });

  test("Workspace Project: every open item, grouped by project", async ({ page }) => {
    const a = await openPanel(page, "workspace");
    await a.getByTestId("view-project").click();
    await expect.poll(() => sections(a)).toEqual(["none", "folder:old stuff", "pomade", "quiz"]);
    await expect(row(a, "Add dark mode")).toBeVisible();
    await expect(row(a, "Learn a piano piece")).toBeVisible();
    await expect(a.getByTestId("mix-bar")).toHaveCount(0);
  });

  test("the narrow panel in a project with mix-ins and in All with filters: nothing overflows", async ({ page }) => {
    const a = await openPanel(page, undefined, { panelWidth: 200 });
    await a.getByTestId("mix-no-project").click();
    await a.getByTestId("mix-add").click();
    await a.getByTestId("picker-filter").pressSequentially("nora");
    await a.getByTestId("picker-filter").press("Enter");
    await expect(a.getByTestId("mix-chip")).toHaveCount(1);
    const overflow = () => a.locator("html").evaluate((el) => el.scrollWidth - el.clientWidth);
    await shot(page, "e004-fake-narrow-mixins");
    expect(await overflow()).toBe(0);
    await a.getByTestId("view-all").click();
    await expect(a.getByTestId("view-all")).toHaveAttribute("aria-selected", "true");
    // The switcher's colours ease over 90 ms: shoot once they settled.
    await expect(a.getByTestId("view-today")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await shot(page, "e004-fake-narrow-all");
    expect(await overflow()).toBe(0);
    // The default 240px panel: four views, whole, without their counts.
    await page.goto(harness({ surface: "panel", icon: "planner", project: "workspace" }));
    await expect(app(page).getByTestId("view-all")).toBeVisible();
    await expect(app(page).getByTestId("count-project")).toBeHidden();
    expect(await app(page).getByRole("tablist", { name: "Planner views" }).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await app(page).locator("html").evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
    await shot(page, "e004-fake-panel-240-counts");
  });
});

test.describe("quick add: the project field", () => {
  test("the overlay inside Pomade: “Fix login bug” → Tab, “qui”, Enter, Enter files it into Tasks/QuizLab/; QuizLab's Today has it, Pomade's doesn't", async ({ page }) => {
    await page.goto(harness({ surface: "overlay", route: "quick-add" }));
    const a = app(page);
    await expect(a.getByTestId("qa-title")).toBeFocused();
    await expect(a.getByTestId("qa-project-name")).toHaveText("Pomade");
    await expect(a.getByTestId("qa-where")).toHaveText("in Tasks/Pomade/");
    await shot(page, "e004-fake-quick-add-overlay");
    await page.keyboard.type("Fix login bug");
    await a.getByTestId("qa-do-on").fill("today");
    await a.getByTestId("qa-title").focus();
    await page.keyboard.press("Tab");
    await expect(a.getByTestId("qa-project")).toBeFocused();
    await page.keyboard.type("qui");
    await expect(a.getByTestId("picker-filter")).toHaveValue("qui");
    await expect(a.getByTestId("picker-option-name")).toHaveText(["QuizLab", "QuizLab"]);
    await expect(a.locator('[data-testid="picker-option"][aria-selected="true"]')).toContainText("Building tools › Tools");
    await shot(page, "e004-fake-picker-filtered");
    await page.keyboard.press("Enter");
    await expect(a.getByTestId("qa-project")).toBeFocused();
    await expect(a.getByTestId("qa-project-name")).toHaveText("QuizLab");
    await expect(a.getByTestId("qa-where")).toHaveText("in Tasks/QuizLab/");
    await page.keyboard.press("Enter");
    await expect(page.locator("#stage iframe")).toHaveCount(0);
    expect(await fileText(page, "Tasks/QuizLab/2026-11-17-fix-login-bug.md")).toBe(quickAdded({ title: "Fix login bug", doOn: "2026-11-17", created: "2026-11-17" }));

    await page.goto(harness({ surface: "panel", icon: "planner", project: "quiz" }));
    await page.evaluate(() => window.fakeHost.writeFile("Tasks/QuizLab/2026-11-17-fix-login-bug.md", "---\ntype: task\ntitle: Fix login bug\nstatus: open\ndo-on: 2026-11-17\ncreated: 2026-11-17\n---\n"));
    await expect(row(app(page), "Fix login bug")).toBeVisible();
    await page.evaluate(() => window.fakeHost.setActiveProject("pomade"));
    await expect(app(page).getByTestId("planner-where")).toHaveText("Tasks/Pomade/");
    await expect(row(app(page), "Fix login bug")).toHaveCount(0);
  });

  test("two steps: group → project, typing filters each step, Backspace goes back, Escape closes only the picker; at Workspace the field starts on No project", async ({ page }) => {
    await page.goto(harness({ surface: "overlay", route: "quick-add", project: "workspace" }));
    const a = app(page);
    await expect(a.getByTestId("qa-project-name")).toHaveText("No project");
    await expect(a.getByTestId("qa-where")).toHaveText("in Tasks/");
    await a.getByTestId("qa-title").fill("Pack the swimming bag");
    await a.getByTestId("qa-project").press("ArrowDown");
    await expect(a.getByTestId("project-picker")).toHaveAttribute("data-step", "group");
    const optionTexts = () => a.locator('[data-testid="picker-option"]').allTextContents();
    expect(await optionTexts()).toEqual(["No project", "Building tools1", "Building tools › Tools2", "Archive1", "Life1", "Ungrouped1"]);
    await expect(a.locator('[data-testid="picker-option"][aria-selected="true"]')).toHaveText("No project");
    await shot(page, "e004-fake-picker-groups");
    await page.keyboard.type("tool");
    expect(await optionTexts()).toEqual(["No project", "Building tools1", "Building tools › Tools2"]);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(a.getByTestId("project-picker")).toHaveAttribute("data-step", "project");
    await expect(a.getByTestId("picker-group")).toHaveText("Building tools › Tools");
    await expect(a.getByTestId("picker-option-name")).toHaveText(["pomade-kit", "QuizLab"]);
    await page.keyboard.type("kit");
    await expect(a.getByTestId("picker-option-name")).toHaveText(["pomade-kit"]);
    await shot(page, "e004-fake-picker-projects");
    for (let i = 0; i < 3; i++) await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await expect(a.getByTestId("project-picker")).toHaveAttribute("data-step", "group");
    await page.keyboard.type("lif");
    await page.keyboard.press("Enter");
    await expect(a.getByTestId("picker-group")).toHaveText("Life");
    await page.keyboard.press("Enter");
    await expect(a.getByTestId("qa-project-name")).toHaveText("Nora's school");
    // Escape in the picker closes the picker only, keeping the project.
    await a.getByTestId("qa-project").press("ArrowDown");
    await page.keyboard.press("Escape");
    await expect(a.getByTestId("project-picker")).toHaveCount(0);
    await expect(a.getByTestId("qa-project")).toBeFocused();
    await expect(a.getByTestId("qa-project-name")).toHaveText("Nora's school");
    await expect(page.locator("#stage iframe")).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(page.locator("#stage iframe")).toHaveCount(0);
    expect(await exists(page, "Tasks/Nora's school/2026-11-17-pack-the-swimming-bag.md")).toBe(true);
    expect((await settings(page)).projectFolders?.school).toEqual({ folder: "Nora's school", name: "Nora's school", groupPath: ["Life"] });
  });

  test("the later of two same-named projects gets its group appended: QuizLab (Archive)/", async ({ page }) => {
    await page.goto(harness({ surface: "overlay", route: "quick-add", project: "quiz-old" }));
    const a = app(page);
    await expect(a.getByTestId("qa-project-name")).toHaveText("QuizLab");
    // The map is written by a Planner panel or tab; here QuizLab/ is QuizLab (Tools)'s by sidebar order as soon as it is.
    await page.evaluate((path) => window.fakeHost.writeFile(path, JSON.stringify({ tasksRoot: "Tasks", projectFolders: { quiz: { folder: "QuizLab", name: "QuizLab", groupPath: ["Building tools", "Tools"] } } })), SETTINGS);
    await expect(a.getByTestId("qa-where")).toHaveText("in Tasks/QuizLab (Archive)/");
    await a.getByTestId("qa-title").fill("Export the old scores");
    await page.keyboard.press("Enter");
    await expect(page.locator("#stage iframe")).toHaveCount(0);
    expect(await exists(page, "Tasks/QuizLab (Archive)/2026-11-17-export-the-old-scores.md")).toBe(true);
    expect((await settings(page)).projectFolders).toEqual({
      quiz: { folder: "QuizLab", name: "QuizLab", groupPath: ["Building tools", "Tools"] },
      "quiz-old": { folder: "QuizLab (Archive)", name: "QuizLab", groupPath: ["Archive"] },
    });
  });

  test("the panel's +: quick add pre-filled with the active project, the picker to change it", async ({ page }) => {
    const a = await openPanel(page, "quiz");
    const o = await openQuickAdd(page, a);
    await expect(o.getByTestId("qa-project-name")).toHaveText("QuizLab");
    await expect(o.getByTestId("qa-where")).toHaveText("in Tasks/QuizLab/");
    await page.keyboard.type("Ship the leaderboard");
    await shot(page, "e004-fake-quick-add-from-panel");
    await o.getByTestId("qa-project").click();
    await page.keyboard.type("pomade");
    await expect(o.getByTestId("picker-option-name")).toHaveText(["Pomade", "pomade-kit"]);
    await shot(page, "e004-fake-quick-add-from-panel-picker");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect(page.locator('iframe[data-surface="overlay"]')).toHaveCount(0);
    expect(await exists(page, "Tasks/Pomade/2026-11-17-ship-the-leaderboard.md")).toBe(true);
    // QuizLab's Today doesn't list it: it is Pomade's.
    await expect(row(a, "Ship the leaderboard")).toHaveCount(0);
  });
});

test.describe("renames follow", () => {
  test("renaming QuizLab renames Tasks/QuizLab/ and updates the map; every task stays visible under the new name", async ({ page }) => {
    const a = await openPanel(page, "quiz");
    await expect.poll(async () => (await settings(page)).projectFolders?.quiz?.folder).toBe("QuizLab");
    expect(await titles(a)).toEqual(["Fix the score screen"]);
    await page.evaluate(() => window.fakeHost.updateProject("quiz", { name: "QuizLab Pro" }));
    await expect(a.getByTestId("planner-where")).toHaveText("Tasks/QuizLab Pro/");
    await expect.poll(() => exists(page, "Tasks/QuizLab Pro/2026-11-14-add-dark-mode.md")).toBe(true);
    expect(await exists(page, "Tasks/QuizLab/2026-11-14-add-dark-mode.md")).toBe(false);
    await expect.poll(async () => (await settings(page)).projectFolders?.quiz).toEqual({ folder: "QuizLab Pro", name: "QuizLab Pro", groupPath: ["Building tools", "Tools"] });
    await expect.poll(() => titles(a)).toEqual(["Fix the score screen"]);
    await a.getByTestId("view-project").click();
    expect(await titles(a)).toEqual(["Fix the score screen", "Add dark mode"]);
    await expect(a.getByTestId("folder-problem")).toHaveCount(0);
  });

  test("a rename onto a folder that is already there is reported in the panel and never merged; the tasks stay visible", async ({ page }) => {
    const a = await openPanel(page);
    await expect.poll(async () => (await settings(page)).projectFolders?.pomade?.folder).toBe("Pomade");
    await page.evaluate(() => window.fakeHost.writeFile("Tasks/Old stuff/keep.md", "mine\n"));
    await page.evaluate(() => window.fakeHost.updateProject("pomade", { name: "Old stuff" }));
    await expect(a.getByTestId("folder-problem")).toHaveText("“Old stuff” can't take Tasks/Old stuff/ — a folder with that name is already there. Its tasks stay in Tasks/Pomade/; rename or move one of the two folders and it follows.");
    await expect.poll(() => titles(a)).toEqual(["Review the Host API", "Ship the planner"]);
    await shot(page, "e004-fake-rename-collision");
    expect(await fileText(page, "Tasks/Old stuff/keep.md")).toBe("mine\n");
    expect(await exists(page, "Tasks/Old stuff/2026-11-16-ship-the-planner.md")).toBe(false);
    expect((await settings(page)).projectFolders?.pomade?.folder).toBe("Pomade");
    // The blocking folder moved away: the rename catches up by itself.
    await page.evaluate(() => window.fakeHost.rename("Tasks/Old stuff", "Tasks/Attic"));
    await expect(a.getByTestId("folder-problem")).toHaveCount(0);
    await expect.poll(() => exists(page, "Tasks/Old stuff/2026-11-16-ship-the-planner.md")).toBe(true);
    expect(await titles(a)).toEqual(["Review the Host API", "Ship the planner"]);
  });

  test("renamed while the Planner was closed: on open the map and the stable id catch the folder up", async ({ page }) => {
    await page.goto(harness({ surface: "panel", icon: "planner", project: "quiz", manual: true }));
    await page.evaluate((path) => {
      window.fakeHost.batch(() => {
        window.fakeHost.rename("Tasks/QuizLab", "Tasks/Quiz");
        window.fakeHost.writeFile(path, JSON.stringify({ tasksRoot: "Tasks", projectFolders: { quiz: { folder: "Quiz", name: "Quiz", groupPath: [] } } }));
      });
      window.mountNow();
    }, SETTINGS);
    const a = app(page);
    await expect(a.getByTestId("planner-where")).toHaveText("Tasks/QuizLab/");
    await expect.poll(() => exists(page, "Tasks/QuizLab/2026-11-14-add-dark-mode.md")).toBe(true);
    expect(await exists(page, "Tasks/Quiz/2026-11-14-add-dark-mode.md")).toBe(false);
    expect(await titles(a)).toEqual(["Fix the score screen"]);
  });

  test("a regroup moves the folder only when the suffix rule requires it", async ({ page }) => {
    await page.goto(harness({ surface: "panel", icon: "planner", project: "workspace", manual: true }));
    await page.evaluate(() => {
      window.fakeHost.writeFile("Tasks/QuizLab (Archive)/a.md", "---\ntype: task\ntitle: Old scores\nstatus: open\ndo-on: 2026-11-17\n---\n");
      window.mountNow();
    });
    const a = app(page);
    await expect.poll(async () => (await settings(page)).projectFolders?.["quiz-old"]?.folder).toBe("QuizLab (Archive)");
    // Pomade into another group: its plain-named folder stays.
    await page.evaluate(() => window.fakeHost.updateProject("pomade", { group: "life" }));
    await expect.poll(async () => (await settings(page)).projectFolders?.pomade?.groupPath).toEqual(["Life"]);
    expect(await exists(page, "Tasks/Pomade/2026-11-16-ship-the-planner.md")).toBe(true);
    // The archived QuizLab into Life: its suffix follows the group.
    await page.evaluate(() => window.fakeHost.updateProject("quiz-old", { group: "life" }));
    await expect.poll(() => exists(page, "Tasks/QuizLab (Life)/a.md")).toBe(true);
    await expect(a.locator('[data-testid="task-section"][data-source="quiz-old"]')).toContainText("QuizLab");
    await expect(row(a, "Old scores")).toBeVisible();
  });
});

test.describe("a project removed", () => {
  test("leaves the project picker and the All filter at once; its tasks stay in its folder under its last-seen name", async ({ page }) => {
    const a = await openPanel(page);
    await expect.poll(async () => (await settings(page)).projectFolders?.quiz?.folder).toBe("QuizLab");
    await a.getByTestId("mix-add").click();
    await a.getByTestId("picker-filter").pressSequentially("quiz");
    await expect(a.getByTestId("picker-option-name")).toHaveText(["QuizLab", "QuizLab"]);
    await a.getByTestId("picker-filter").press("Escape");
    await expect(a.getByTestId("project-picker")).toHaveCount(0);

    await page.evaluate(() => window.fakeHost.removeProject("quiz"));
    await a.getByTestId("mix-add").click();
    await a.getByTestId("picker-filter").pressSequentially("quiz");
    await expect(a.getByTestId("picker-option-name")).toHaveText(["QuizLab"]);
    await expect(a.getByTestId("picker-option")).toContainText("Archive");
    await a.getByTestId("picker-filter").press("Escape");

    await a.getByTestId("view-all").click();
    await expect(row(a, "Add dark mode").getByTestId("hint-source")).toHaveText("QuizLab");
    await a.getByTestId("filter-projects").click();
    expect(await a.getByTestId("filter-option").evaluateAll((els) => els.map((el) => el.getAttribute("data-key")))).toEqual(["none", "pomade", "kit", "quiz-old", "school", "errands", "folder:old stuff"]);
    await page.keyboard.press("Escape");
    expect(await exists(page, "Tasks/QuizLab/2026-11-14-add-dark-mode.md")).toBe(true);
    expect((await settings(page)).projectFolders?.quiz).toEqual({ folder: "QuizLab", name: "QuizLab", groupPath: ["Building tools", "Tools"] });
  });

  test("the active project removed: the panel falls back to the Workspace, its tasks under its last-seen name", async ({ page }) => {
    const a = await openPanel(page, "quiz");
    await expect.poll(async () => (await settings(page)).projectFolders?.quiz?.folder).toBe("QuizLab");
    await expect(a.getByTestId("planner-where")).toHaveText("Tasks/QuizLab/");
    await page.evaluate(() => window.fakeHost.removeProject("quiz"));
    await expect(a.getByTestId("planner-where")).toHaveText("Tasks/");
    await expect.poll(() => sections(a)).toEqual(["none", "folder:old stuff", "pomade", "quiz"]);
    expect(await sectionNames(a)).toEqual(["No project", "Old stuff", "Pomade", "QuizLab"]);
    await expect(row(a, "Fix the score screen")).toBeVisible();
    await shot(page, "t013-fake-planner-removed-active");
  });

  test("quick add's picker drops it while the overlay is open", async ({ page }) => {
    await page.goto(harness({ surface: "overlay", route: "quick-add", project: "workspace" }));
    const a = app(page);
    await expect(a.getByTestId("qa-project-name")).toHaveText("No project");
    const optionTexts = () => a.locator('[data-testid="picker-option"]').allTextContents();
    await a.getByTestId("qa-project").press("ArrowDown");
    expect(await optionTexts()).toEqual(["No project", "Building tools1", "Building tools › Tools2", "Archive1", "Life1", "Ungrouped1"]);
    await page.keyboard.press("Escape");
    await expect(a.getByTestId("project-picker")).toHaveCount(0);

    await page.evaluate(() => window.fakeHost.removeProject("kit"));
    await a.getByTestId("qa-project").press("ArrowDown");
    await expect.poll(optionTexts).toEqual(["No project", "Building tools1", "Building tools › Tools1", "Archive1", "Life1", "Ungrouped1"]);
    await page.keyboard.type("tools ›");
    await page.keyboard.press("Enter");
    await expect(a.getByTestId("picker-group")).toHaveText("Building tools › Tools");
    await expect(a.getByTestId("picker-option-name")).toHaveText(["QuizLab"]);
  });
});

test.describe("each project's folder is in its scope (T-021)", () => {
  const PROJECTS = ["pomade", "kit", "quiz", "quiz-old", "school", "errands"];
  const scopes = (page: Page) => page.evaluate(async (ids) => Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await window.scopeFolders(id)] as const))), PROJECTS);
  const scopeWrites = (page: Page) => page.evaluate(() => window.hostCalls.filter((c) => c.method === "project.addScopeFolder" || c.method === "project.removeScopeFolder").length);
  const MAPPED = { pomade: ["Tasks/Pomade"], kit: [], quiz: ["Tasks/QuizLab"], "quiz-old": [], school: [], errands: [] };

  test("after an open each mapped project has exactly its folder; a second frame adds nothing", async ({ page }) => {
    await openPanel(page, "workspace");
    await expect.poll(() => scopes(page)).toEqual(MAPPED);
    const writes = await scopeWrites(page);
    expect(writes).toBe(2);
    await page.evaluate(() => {
      window.mountNow();
    });
    await expect(page.locator("#stage iframe")).toHaveCount(2);
    await expect(page.frameLocator("#stage iframe >> nth=1").getByTestId("view-planner-panel")).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.hostCalls.filter((c) => c.method === "project.getScopeFolders").length)).toBeGreaterThanOrEqual(2 * PROJECTS.length);
    await settled(page.frameLocator("#stage iframe >> nth=1"));
    expect(await scopeWrites(page)).toBe(writes);
    expect(await scopes(page)).toEqual(MAPPED);
  });

  test("a rename swaps the folder; a changed tasks folder moves every project's", async ({ page }) => {
    const a = await openPanel(page, "quiz");
    await expect.poll(() => scopes(page)).toEqual(MAPPED);
    await page.evaluate(() => window.fakeHost.updateProject("quiz", { name: "QuizLab Pro" }));
    await expect(a.getByTestId("planner-where")).toHaveText("Tasks/QuizLab Pro/");
    await expect.poll(() => scopes(page)).toEqual({ ...MAPPED, quiz: ["Tasks/QuizLab Pro"] });

    const current = await settings(page);
    await page.evaluate(([path, text]) => window.fakeHost.writeFile(path, text), [SETTINGS, JSON.stringify({ ...current, tasksRoot: "Chores" })] as const);
    await expect(a.getByTestId("planner-where")).toHaveText("Chores/QuizLab Pro/");
    await expect.poll(() => scopes(page)).toEqual({ ...MAPPED, pomade: ["Chores/Pomade"], quiz: ["Chores/QuizLab Pro"] });
  });

  test("quick add making a project's folder puts it in the project's scope", async ({ page }) => {
    await page.goto(harness({ surface: "overlay", route: "quick-add", project: "kit" }));
    const a = app(page);
    await expect(a.getByTestId("qa-where")).toHaveText("in Tasks/pomade-kit/");
    await page.keyboard.type("Cut a release");
    await page.keyboard.press("Enter");
    await expect(page.locator("#stage iframe")).toHaveCount(0);
    expect(await exists(page, "Tasks/pomade-kit/2026-11-17-cut-a-release.md")).toBe(true);
    expect(await page.evaluate(() => window.scopeFolders("kit"))).toEqual(["Tasks/pomade-kit"]);
  });
});
