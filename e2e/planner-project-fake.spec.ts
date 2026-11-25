// E-011 on the fake host (fake-host/, test/fixtures/workspace.ts `PLANNER_WORKSPACE` with
// `NOTES_FILES`, and a recurring item of QuizLab's written before the frame mounts): the Project
// view lists everything of the project in two folding groups, "Tasks" and "Notes and thoughts";
// "Due today" narrows it to the project's Today rows, remembered per project; one "+ Add from…"
// chip mixes sources in, in Project and Recurring, and reads mix-ins saved as `mixNoProject`; at
// Workspace every project holds the two groups, two levels deep. The fixture's Tasks/ is dated
// around Tue 2026-11-17.

import { expect, test, type FrameLocator, type Page } from "@playwright/test";

import { APP_PORT, HARNESS_PORT } from "../playwright.config";
import { addFrom, row, settled, titles } from "./fixtures/planner";
import { shot } from "./fixtures/screens";

const APP = `http://localhost:${APP_PORT}/`;

interface Open {
  surface: "tab" | "panel";
  project?: string;
  panelWidth?: number;
  /** App state keys to start with. */
  state?: Record<string, unknown>;
}

function harness(open: Open): string {
  const params = new URLSearchParams({ app: APP, surface: open.surface, tasks: "Tasks", now: "2026-11-17T10:00", fixture: "planner", extra: "notes", project: open.project ?? "quiz", mount: "manual" });
  params.set(open.surface === "panel" ? "icon" : "route", "planner");
  if (open.panelWidth !== undefined) params.set("panelWidth", String(open.panelWidth));
  if (open.state !== undefined) params.set("state", JSON.stringify(open.state));
  return `http://localhost:${HARNESS_PORT}/index.html?${params.toString()}`;
}

const app = (page: Page): FrameLocator => page.frameLocator("#stage iframe >> nth=0");

/** QuizLab's recurring item, between its runs on the fixture's day (next on Dec 1). */
const BACKUP = "Tasks/QuizLab/2026-11-01-back-up-the-scores.md";
const BACKUP_TEXT = "---\ntype: recurring\ntitle: Back up the scores\nstatus: open\ndo-on: 2026-12-01\nrepeat:\n  monthly: { days: [1] }\ncreated: 2026-11-01\n---\n";

/** QuizLab's Project, top to bottom: "Tasks", then "Notes and thoughts". */
const QUIZ_TASKS = ["Fix the score screen", "Back up the scores", "Add dark mode"];
const QUIZ_NOTES = ["Does QuizLab need a leaderboard?", "Sound effects"];

async function openPlanner(page: Page, open: Open): Promise<FrameLocator> {
  await page.goto(harness(open));
  await page.evaluate(([p, c]) => window.fakeHost.writeFile(p, c), [BACKUP, BACKUP_TEXT] as const);
  await page.evaluate(() => window.mountNow());
  const a = app(page);
  await expect(a.getByTestId(open.surface === "panel" ? "view-planner-panel" : "view-planner-tab")).toBeVisible();
  await settled(a);
  await a.getByTestId("view-project").click();
  await expect(a.getByTestId("list-project")).toBeVisible();
  return a;
}

/** The headings of the list, top to bottom, by group key. */
const groups = (a: FrameLocator) => a.locator('[data-testid="task-section"]').evaluateAll((els) => els.map((el) => el.getAttribute("data-group")));
const heading = (a: FrameLocator, key: string) => a.locator(`[data-testid="task-section"][data-group="${key}"]`);
const fold = (a: FrameLocator, key: string) => heading(a, key).getByTestId("task-section-toggle").click();
const chips = (a: FrameLocator) => a.getByTestId("mix-chip").evaluateAll((els) => els.map((el) => el.getAttribute("data-source")));
const viewState = (page: Page, key: string) => page.evaluate((k) => window.fakeHost.state[k], key);
/** The test id of each entry of the list, top to bottom. */
const entries = (a: FrameLocator) => a.locator('[data-testid="list-project"] > li').evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));

test.describe("inside a project", () => {
  test("every type in two groups — the task, the recurring item between its runs, the note and the thought — then the unreadable file; each group counts, the switcher counts the tasks", async ({ page }) => {
    const a = await openPlanner(page, { surface: "panel" });
    await expect.poll(() => titles(a)).toEqual([...QUIZ_TASKS, ...QUIZ_NOTES]);
    expect(await groups(a)).toEqual(["tasks", "notes"]);
    await expect(a.getByTestId("task-section-name")).toHaveText(["Tasks", "Notes and thoughts"]);
    for (const key of ["tasks", "notes"]) {
      await expect(heading(a, key)).toHaveAttribute("data-level", "2");
      await expect(heading(a, key)).not.toHaveClass(/task-section--nested/);
    }
    await expect(heading(a, "tasks").getByTestId("task-section-count")).toHaveText("2");
    await expect(heading(a, "notes").getByTestId("task-section-count")).toHaveText("2");
    await expect(a.getByTestId("count-project")).toHaveText("2");
    // The recurring item says where it stands; the note and the thought carry their glyphs.
    await expect(row(a, "Back up the scores").getByTestId("hint-next")).toHaveText("next Dec 1");
    await expect(row(a, "Sound effects")).toHaveAttribute("data-type", "note");
    await expect(row(a, "Does QuizLab need a leaderboard?")).toHaveAttribute("data-type", "thought");
    // The notes and thoughts stand under their heading; the unreadable file after both groups.
    expect(await entries(a)).toEqual(["task-section", "task-row", "task-row", "task-row", "task-section", "task-row", "task-row", "unreadable-row"]);
    await expect(a.getByTestId("unreadable-row")).toHaveAttribute("data-path", "Tasks/QuizLab/2026-11-14-broken.md");
    // The chips: "Due today" first, "+ Add from…" after it.
    await expect(a.getByTestId("mix-bar").locator(".chip")).toHaveText(["Due today", "+ Add from…"]);
    await expect(a.getByTestId("planner-context")).toHaveText("QuizLab");
    await page.mouse.move(0, 0);
    await shot(page, "e011-fake-panel-project-240");

    // Folding "Notes and thoughts" leaves the tasks.
    await fold(a, "notes");
    await expect(heading(a, "notes")).toHaveAttribute("data-folded", "true");
    await expect.poll(() => titles(a)).toEqual(QUIZ_TASKS);
    await expect(heading(a, "notes").getByTestId("task-section-count")).toHaveText("2");
    expect(await viewState(page, "planner.folds.quiz")).toMatchObject({ project: ["notes"] });
    await shot(page, "e011-fake-panel-project-notes-folded");
    await fold(a, "notes");
    await fold(a, "tasks");
    await expect.poll(() => titles(a)).toEqual(QUIZ_NOTES);
    await shot(page, "e011-fake-panel-project-tasks-folded");
  });

  test("Due today: only the project's Today rows, with their reasons; off by default and remembered per project", async ({ page }) => {
    const a = await openPlanner(page, { surface: "panel" });
    const due = a.getByTestId("due-today");
    await expect(due).toHaveAttribute("aria-pressed", "false");
    await due.click();
    await expect(due).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => titles(a)).toEqual(["Fix the score screen"]);
    await expect(row(a, "Fix the score screen")).toHaveAttribute("data-reason", "rolled-over");
    await expect(row(a, "Fix the score screen").getByTestId("hint-rolled")).toHaveText("planned 2 days ago");
    await expect(a.getByTestId("task-section")).toHaveCount(0);
    await expect(a.getByTestId("unreadable-row")).toHaveCount(1);
    // The switcher counts the project's tasks, "Due today" or not.
    await expect(a.getByTestId("count-project")).toHaveText("2");
    expect(await viewState(page, "planner.view.quiz")).toMatchObject({ view: "project", dueToday: true });
    await page.mouse.move(0, 0);
    await shot(page, "e011-fake-panel-project-due-today");

    // Another project starts with it off; back in QuizLab it is on.
    await page.evaluate(() => window.fakeHost.setActiveProject("pomade"));
    await expect(a.getByTestId("view-planner-panel")).toHaveAttribute("data-context", "pomade");
    await a.getByTestId("view-project").click();
    await expect(a.getByTestId("due-today")).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => titles(a)).toEqual(["Review the Host API", "Ship the planner", "Write release notes"]);
    await page.evaluate(() => window.fakeHost.setActiveProject("quiz"));
    await expect(a.getByTestId("view-planner-panel")).toHaveAttribute("data-context", "quiz");
    await expect(a.getByTestId("due-today")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => titles(a)).toEqual(["Fix the score screen"]);
    await a.getByTestId("due-today").click();
    await expect.poll(() => titles(a)).toEqual([...QUIZ_TASKS, ...QUIZ_NOTES]);
  });

  test("+ Add from… ▸ No project mixes in the workspace-level items with their label, in both groups; its chip removes them; Recurring offers the same chip", async ({ page }) => {
    const a = await openPlanner(page, { surface: "panel" });
    await a.getByTestId("mix-add").click();
    await expect(a.getByTestId("picker-option").first()).toHaveText("No project");
    await expect(a.getByTestId("picker-option").first()).toHaveAttribute("data-chosen", "false");
    await page.keyboard.press("Escape");
    await addFrom(a, "No project");
    await expect.poll(() => chips(a)).toEqual(["none"]);
    await expect(a.getByTestId("mix-chip")).toHaveText("No project");
    await expect(row(a, "Pay the tax").getByTestId("hint-source")).toHaveText("No project");
    await expect(row(a, "Quiz timer idea").getByTestId("hint-source")).toHaveText("No project");
    await expect(row(a, "Fix the score screen").getByTestId("hint-source")).toHaveCount(0);
    // The no-project note stands under "Notes and thoughts", the task under "Tasks".
    await expect(a.locator('[data-testid="task-section"][data-group="notes"] ~ [data-testid="task-row"]').filter({ hasText: "Quiz timer idea" })).toBeVisible();
    await expect(a.locator('[data-testid="task-section"][data-group="notes"] ~ [data-testid="task-row"]').filter({ hasText: "Pay the tax" })).toHaveCount(0);
    expect(await viewState(page, "planner.view.quiz")).toMatchObject({ mixins: ["none"] });
    await expect(a.getByTestId("mix-bar").locator(".chip")).toHaveText(["Due today", "No project", "+ Add from…"]);
    await page.mouse.move(0, 0);
    await shot(page, "e011-fake-panel-project-add-from");

    // With "Due today" on, the mixed-in source's Today rows join the project's.
    await a.getByTestId("due-today").click();
    await expect(row(a, "Pay the tax")).toBeVisible();
    await expect(row(a, "Quiz timer idea")).toHaveCount(0);
    await a.getByTestId("due-today").click();

    await a.getByTestId("view-recurring").click();
    await expect.poll(() => chips(a)).toEqual(["none"]);
    await expect(a.getByTestId("mix-add")).toHaveText("+ Add from…");
    await expect(a.getByTestId("due-today")).toHaveCount(0);
    await a.getByTestId("view-project").click();

    await a.getByTestId("mix-chip").click();
    await expect(row(a, "Pay the tax")).toHaveCount(0);
    await expect.poll(() => titles(a)).toEqual([...QUIZ_TASKS, ...QUIZ_NOTES]);
    expect(await viewState(page, "planner.view.quiz")).toMatchObject({ mixins: [] });
  });

  test("mix-ins saved as mixNoProject and mixProjects read as the same sources: the no-project items first", async ({ page }) => {
    const a = await openPlanner(page, { surface: "panel", state: { "planner.view.quiz": { view: "project", showDone: false, showArchived: false, onlyProject: false, mixNoProject: true, mixProjects: ["pomade"], projects: [], types: [] } } });
    await expect.poll(() => chips(a)).toEqual(["none", "pomade"]);
    await expect(row(a, "Pay the tax").getByTestId("hint-source")).toHaveText("No project");
    await expect(row(a, "Ship the planner").getByTestId("hint-source")).toHaveText("Pomade");
  });

  test("the panel at its 160px minimum and the tab: the same groups and chips, nothing overflows", async ({ page }) => {
    const overflow = (a: FrameLocator) => a.locator("html").evaluate((el) => el.scrollWidth - el.clientWidth);
    let a = await openPlanner(page, { surface: "panel", panelWidth: 160 });
    await addFrom(a, "No project");
    await expect(a.getByTestId("mix-chip")).toHaveCount(1);
    await page.mouse.move(0, 0);
    await shot(page, "e011-fake-panel-project-160");
    expect(await overflow(a)).toBe(0);

    a = await openPlanner(page, { surface: "tab" });
    await expect.poll(() => titles(a)).toEqual([...QUIZ_TASKS, ...QUIZ_NOTES]);
    expect(await groups(a)).toEqual(["tasks", "notes"]);
    await page.mouse.move(0, 0);
    await shot(page, "e011-fake-tab-project");
    await a.getByTestId("due-today").click();
    await expect.poll(() => titles(a)).toEqual(["Fix the score screen"]);
    await shot(page, "e011-fake-tab-project-due-today");
  });

  test("adding from Project starts on Task; a note added there lands under Notes and thoughts, unfolded, focused", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    await fold(a, "notes");
    await a.getByTestId("planner-add").click();
    await expect(a.getByTestId("qa-title")).toBeFocused();
    await expect(a.getByTestId("qa-type-task")).toBeChecked();
    await expect(a.getByTestId("qa-project-name")).toHaveText("QuizLab");
    await page.keyboard.type("Question bank sources");
    await page.keyboard.press("Alt+Tab");
    await page.keyboard.press("Alt+Tab");
    await expect(a.getByTestId("qa-type-note")).toBeChecked();
    await page.keyboard.press("Enter");
    const added = row(a, "Question bank sources");
    await expect(added.getByTestId("task-open")).toBeFocused();
    await expect(heading(a, "notes")).toHaveAttribute("data-folded", "false");
    await expect(a.locator('[data-testid="task-section"][data-group="notes"] ~ [data-testid="task-row"]').filter({ hasText: "Question bank sources" })).toBeVisible();
    await expect(a.getByTestId("added-elsewhere")).toHaveCount(0);
    await expect(heading(a, "notes").getByTestId("task-section-count")).toHaveText("3");
  });
});

test.describe("at Workspace", () => {
  test("every project under its heading, the two groups indented inside each; a project folds whole, Tasks folds on its own inside an open one; no chips", async ({ page }) => {
    const a = await openPlanner(page, { surface: "panel", project: "workspace" });
    await expect.poll(() => groups(a)).toEqual(["none", "none/tasks", "none/notes", "folder:old stuff", "folder:old stuff/tasks", "pomade", "pomade/tasks", "quiz", "quiz/tasks", "quiz/notes"]);
    await expect(heading(a, "quiz")).toHaveAttribute("data-level", "1");
    await expect(heading(a, "quiz/notes")).toHaveAttribute("data-level", "2");
    await expect(heading(a, "quiz/notes")).toHaveClass(/task-section--nested/);
    await expect(heading(a, "quiz/notes").getByTestId("task-section-name")).toHaveText("Notes and thoughts");
    // A project's heading counts what its "Tasks" counts.
    await expect(heading(a, "quiz").getByTestId("task-section-count")).toHaveText("2");
    await expect(heading(a, "quiz/tasks").getByTestId("task-section-count")).toHaveText("2");
    await expect(heading(a, "quiz/notes").getByTestId("task-section-count")).toHaveText("2");
    await expect(a.getByTestId("mix-bar")).toHaveCount(0);
    await expect(a.getByTestId("due-today")).toHaveCount(0);
    await expect(a.getByTestId("planner-context")).toHaveText("All projects");
    await page.mouse.move(0, 0);
    await shot(page, "e011-fake-panel-workspace-project");

    // A folded project hides both its groups.
    await fold(a, "quiz");
    await expect.poll(() => groups(a)).toEqual(["none", "none/tasks", "none/notes", "folder:old stuff", "folder:old stuff/tasks", "pomade", "pomade/tasks", "quiz"]);
    for (const title of [...QUIZ_TASKS, ...QUIZ_NOTES]) await expect(row(a, title)).toHaveCount(0);
    await a.locator(".planner__body").evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await shot(page, "e011-fake-panel-workspace-project-folded");
    // Inside an open one, "Tasks" folds on its own.
    await fold(a, "quiz");
    await fold(a, "quiz/tasks");
    await expect(heading(a, "quiz/tasks")).toHaveAttribute("data-folded", "true");
    await expect(row(a, "Add dark mode")).toHaveCount(0);
    await expect(row(a, "Sound effects")).toBeVisible();
    await expect(heading(a, "quiz/notes")).toHaveAttribute("data-folded", "false");
    expect(await viewState(page, "planner.folds.__workspace__")).toMatchObject({ project: ["quiz/tasks"] });
    await shot(page, "e011-fake-panel-workspace-tasks-folded");
  });
});
