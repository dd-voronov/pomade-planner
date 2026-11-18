// E-003 on the fake host (fake-host/, test/fixtures/workspace.ts): the Planner's onboarding,
// Today and All, ticking, the day boundary, live files, quick add in the overlay and the panel,
// and the settings page — at Workspace, where every workspace-level item shows. The clock is the app's `test.clock` hook (e2e/fixtures/planner.ts); the
// fixture's Tasks/ is dated around Tue 2026-11-17.

import { expect, test, type FrameLocator, type Page } from "@playwright/test";

import { APP_PORT, HARNESS_PORT } from "../playwright.config";
import { PLANNER_TASKS } from "../test/fixtures/workspace";
import { openQuickAdd, quickAdded, row, setClock, settled, ticked, titles } from "./fixtures/planner";
import { shot } from "./fixtures/screens";

const APP = `http://localhost:${APP_PORT}/`;
const SETTINGS = "Apps/pomade-planner/settings.json";

interface Open {
  surface: "tab" | "panel" | "overlay";
  icon?: string;
  route?: string;
  /** The tasks root to seed into settings.json; absent = no settings file. */
  tasks?: string;
  now?: string;
  panelWidth?: number;
  /** The active project's id, or `workspace`. */
  project?: string;
}

function harness(open: Open): string {
  const params = new URLSearchParams({ app: APP, surface: open.surface });
  for (const key of ["icon", "route", "tasks", "now", "panelWidth", "project"] as const) {
    const value = open[key];
    if (value !== undefined) params.set(key, String(value));
  }
  return `http://localhost:${HARNESS_PORT}/index.html?${params.toString()}`;
}

const app = (page: Page): FrameLocator => page.frameLocator("#stage iframe");
const fileText = (page: Page, path: string) => page.evaluate((p) => window.fakeHost.readFile(p), path);
const fileExists = (page: Page, path: string) =>
  page.evaluate((p) => {
    try {
      window.fakeHost.readFile(p);
      return true;
    } catch {
      return false;
    }
  }, path);

const PANEL: Open = { surface: "panel", icon: "planner", tasks: "Tasks", now: "2026-11-17T10:00", project: "workspace" };
const TODAY = ["Pay the tax", "Renew Nora's swimming class", "Call the dentist", "Buy printer ink", "Book flights for the Christmas trip to see the grandparents in Valencia", "Water the plants"];

async function openPanel(page: Page, open: Open = PANEL): Promise<FrameLocator> {
  await page.goto(harness(open));
  const a = app(page);
  await expect(a.getByTestId("view-planner-panel")).toBeVisible();
  if (open.tasks !== undefined) await settled(a);
  return a;
}

test.describe("onboarding", () => {
  test("first open asks where the tasks live; the pick is saved as tasksRoot next to the Board's keys, and nothing is written into the folder", async ({ page }) => {
    await page.goto(harness({ surface: "panel", icon: "planner" }));
    const a = app(page);
    await expect(a.getByTestId("view-title")).toHaveText("Where should your tasks live?");
    await expect(a.getByTestId("onboarding")).toContainText("the Knowledge vault too");
    await shot(page, "e003-fake-onboarding");
    await page.evaluate((path) => window.fakeHost.writeFile(path, '{\n  "backlogPathPattern": "plans/"\n}\n'), SETTINGS);

    // Cancelling changes nothing.
    await page.evaluate(() => window.fakeHost.answerPick(null));
    await a.getByTestId("choose-tasks-root").click();
    await expect(a.getByTestId("view-title")).toHaveText("Where should your tasks live?");

    await page.evaluate(() => window.fakeHost.answerPick("Tasks"));
    await a.getByTestId("choose-tasks-root").click();
    await expect(a.getByTestId("view-today")).toBeVisible();
    expect(await page.evaluate(() => window.fakeHost.pickRequests.at(-1))).toEqual({ root: "", initial: "" });
    expect(JSON.parse(await fileText(page, SETTINGS))).toEqual({ backlogPathPattern: "plans/", tasksRoot: "Tasks" });
    for (const name of Object.keys(PLANNER_TASKS)) expect(await fileText(page, `Tasks/${name}`)).toBe(PLANNER_TASKS[name]);
  });

  test("a settings file that appears while the Planner is open (a git pull, another Mac) reaches it, Apps/ made with it", async ({ page }) => {
    await page.goto(harness({ surface: "panel", icon: "planner", now: "2026-11-17T10:00" }));
    const a = app(page);
    await expect(a.getByTestId("onboarding")).toBeVisible();
    await page.evaluate((path) => window.fakeHost.writeFile(path, '{ "tasksRoot": "Tasks" }\n'), SETTINGS);
    await expect(a.getByTestId("view-today")).toBeVisible();
  });
});

test.describe("Today and All", () => {
  test("Today: overdue, due today, planned and rolled-over tasks in order, each with its hint; ticked today crossed out; the unreadable file greyed", async ({ page }) => {
    const a = await openPanel(page);
    await expect(a.getByTestId("planner-day")).toHaveText("Tue, Nov 17");
    expect(await titles(a)).toEqual(TODAY);
    await expect(row(a, "Pay the tax")).toHaveAttribute("data-reason", "overdue");
    await expect(row(a, "Pay the tax").getByTestId("hint-reason")).toHaveText("Overdue");
    await expect(row(a, "Pay the tax").getByTestId("hint-deadline")).toHaveText("due Nov 14");
    await expect(row(a, "Pay the tax").getByTestId("hint-importance")).toHaveText("!5");
    await expect(row(a, "Renew Nora's swimming class").getByTestId("hint-reason")).toHaveText("Due today");
    await expect(row(a, "Call the dentist").getByTestId("hint-rolled")).toHaveText("planned 1 day ago");
    await expect(row(a, "Call the dentist").getByTestId("hint-deadline")).toHaveText("due Fri");
    await expect(row(a, "Buy printer ink").getByTestId("hint-rolled")).toHaveText("planned 8 days ago");
    await expect(row(a, "Water the plants")).toHaveAttribute("data-done", "true");
    await expect(row(a, "Water the plants").getByTestId("task-check")).toBeChecked();
    await expect(a.getByTestId("unreadable-row")).toHaveAttribute("data-path", "Tasks/2026-11-13-broken.md");
    await expect(a.getByTestId("unreadable-row")).toContainText("can't read — open to fix");
    await expect(a.getByTestId("count-today")).toHaveText("5");
    await expect(a.getByTestId("count-all")).toHaveText("7");
    // Not a Planner item, not done long ago, not later.
    for (const title of ["Reading list", "Return the parcel", "Plan the holidays", "Learn a piano piece"]) await expect(row(a, title)).toHaveCount(0);
    await shot(page, "e003-fake-today-panel");
  });

  test("All: every open task; Show done adds the done ones; the view and the filter are remembered in the app state", async ({ page }) => {
    const a = await openPanel(page);
    await a.getByTestId("view-all").click();
    expect(await titles(a)).toEqual([
      "Pay the tax",
      "Renew Nora's swimming class",
      "Call the dentist",
      "Buy printer ink",
      "Book flights for the Christmas trip to see the grandparents in Valencia",
      "Plan the holidays",
      "Learn a piano piece",
    ]);
    await expect(row(a, "Plan the holidays").getByTestId("hint-do-on")).toHaveText("do Nov 25");
    await a.getByTestId("show-done").check();
    expect((await titles(a)).slice(-2)).toEqual(["Return the parcel", "Water the plants"]);
    await expect(row(a, "Return the parcel").getByTestId("hint-done")).toHaveText("done Nov 10");
    expect(await page.evaluate(() => window.fakeHost.state["planner.view.__workspace__"])).toMatchObject({ view: "all", showDone: true });
    await shot(page, "e003-fake-all-show-done");
  });

  test("a row brings up the Planner tab with the item open; the unreadable one opens its file in an editor tab", async ({ page }) => {
    const a = await openPanel(page);
    await row(a, "Buy printer ink").getByTestId("task-open").click();
    await a.getByTestId("unreadable-row").getByRole("button").click();
    await expect.poll(() => page.evaluate(() => window.fakeHost.openedTabs)).toEqual([
      { kind: "app", projectId: "__workspace__", route: "item?path=Tasks%2F2026-11-09-buy-printer-ink.md" },
      { kind: "file", projectId: "__workspace__", path: "Tasks/2026-11-13-broken.md" },
    ]);
  });

  test("a task file added outside the app appears; a deleted one disappears; an edited one moves", async ({ page }) => {
    const a = await openPanel(page);
    await page.evaluate(() => window.fakeHost.writeFile("Tasks/from-obsidian.md", "---\ntype: task\ntitle: Written in Obsidian\nstatus: open\ndeadline: 2026-11-17\n---\n"));
    await expect(row(a, "Written in Obsidian")).toBeVisible({ timeout: 1_000 });
    await page.evaluate(() => window.fakeHost.deleteFile("Tasks/2026-11-09-buy-printer-ink.md"));
    await expect(row(a, "Buy printer ink")).toHaveCount(0, { timeout: 1_000 });
    await page.evaluate(() => window.fakeHost.writeFile("Tasks/2026-11-12-plan-holidays.md", "---\ntype: task\ntitle: Plan the holidays\nstatus: open\ndo-on: 2026-11-17\n---\n"));
    await expect(row(a, "Plan the holidays")).toHaveAttribute("data-reason", "planned", { timeout: 1_000 });
    // A file in a project's folder shows under that project's heading.
    await page.evaluate(() => window.fakeHost.writeFile("Tasks/Beta/2026-11-17-x.md", "---\ntype: task\ntitle: In a project folder\nstatus: open\ndo-on: 2026-11-17\n---\n"));
    await expect(row(a, "In a project folder")).toBeVisible({ timeout: 1_000 });
    await expect(a.locator('[data-testid="task-section"][data-source="beta"]')).toBeVisible();
    await expect(a.locator('[data-testid="task-section"][data-source="none"]')).toBeVisible();
  });
});

test.describe("ticking", () => {
  test("a tick writes status: done and done-on: <planner day> as field-only writes; unticking reverts both", async ({ page }) => {
    const a = await openPanel(page);
    const path = "Tasks/2026-11-01-pay-the-tax.md";
    const before = await fileText(page, path);
    await row(a, "Pay the tax").getByTestId("task-check").check();
    await expect.poll(() => fileText(page, path)).toBe(ticked(before, "2026-11-17"));
    await expect(row(a, "Pay the tax")).toHaveAttribute("data-done", "true");
    await expect(a.getByTestId("count-today")).toHaveText("4");
    await shot(page, "e003-fake-ticked");
    await row(a, "Pay the tax").getByTestId("task-check").uncheck();
    await expect.poll(() => fileText(page, path)).toBe(before);
    await expect(row(a, "Pay the tax")).toHaveAttribute("data-done", "false");
  });

  test("ticked at 01:30 the task stays crossed out; after 03:00 it is gone from Today and in All with Show done", async ({ page }) => {
    const a = await openPanel(page, { ...PANEL, now: "2026-11-18T01:30" });
    await expect(a.getByTestId("planner-day")).toHaveText("Tue, Nov 17");
    const path = "Tasks/2026-11-10-renew-swimming-class.md";
    const before = await fileText(page, path);
    await row(a, "Renew Nora's swimming class").getByTestId("task-check").check();
    await expect.poll(() => fileText(page, path)).toBe(ticked(before, "2026-11-17"));
    await setClock(a, "2026-11-18T02:59");
    await expect(row(a, "Renew Nora's swimming class")).toHaveAttribute("data-done", "true");
    await setClock(a, "2026-11-18T03:00");
    await expect(a.getByTestId("planner-day")).toHaveText("Wed, Nov 18");
    await expect(row(a, "Renew Nora's swimming class")).toHaveCount(0);
    await a.getByTestId("view-all").click();
    await expect(row(a, "Renew Nora's swimming class")).toHaveCount(0);
    await a.getByTestId("show-done").check();
    await expect(row(a, "Renew Nora's swimming class")).toHaveAttribute("data-done", "true");
    await expect(row(a, "Renew Nora's swimming class").getByTestId("hint-done")).toHaveText("done yesterday");
  });

  test("the boundary timer moves Today to the next day while the Planner stays open — nothing else happens", async ({ page }) => {
    const a = await openPanel(page, { ...PANEL, now: "2026-11-18T02:59:58.500" });
    await expect(a.getByTestId("planner-day")).toHaveText("Tue, Nov 17");
    await expect(row(a, "Water the plants")).toHaveAttribute("data-done", "true");
    await expect(row(a, "Call the dentist").getByTestId("hint-rolled")).toHaveText("planned 1 day ago");
    await expect(a.getByTestId("planner-day")).toHaveText("Wed, Nov 18", { timeout: 4_000 });
    await expect(row(a, "Water the plants")).toHaveCount(0);
    await expect(row(a, "Call the dentist").getByTestId("hint-rolled")).toHaveText("planned 2 days ago");
    await expect(row(a, "Pay the tax").getByTestId("hint-deadline")).toHaveText("due Nov 14");
    await expect(row(a, "Renew Nora's swimming class")).toHaveAttribute("data-reason", "overdue");
  });
});

test.describe("quick add", () => {
  const OVERLAY: Open = { surface: "overlay", route: "quick-add", tasks: "Tasks", now: "2026-11-17T10:00", project: "workspace" };

  test("the overlay: title focused, phrases resolved beside the fields, Enter creates <created>-<slug>.md and closes", async ({ page }) => {
    await page.goto(harness(OVERLAY));
    const a = app(page);
    await expect(a.getByTestId("qa-title")).toBeFocused();
    await page.keyboard.type("Renew Nora's swimming class");
    await a.getByTestId("qa-deadline").fill("fri");
    await expect(a.getByTestId("qa-deadline-resolved")).toHaveText("Fri, Nov 20");
    await a.getByTestId("qa-do-on").fill("tomorrow");
    await expect(a.getByTestId("qa-do-on-resolved")).toHaveText("Wed, Nov 18");
    await a.getByTestId("qa-do-on").fill("nov 31");
    await expect(a.getByTestId("qa-do-on-resolved")).toHaveText("Nov has no day 31");
    await shot(page, "e003-fake-quick-add-overlay");
    await page.keyboard.press("Enter");
    await expect(a.getByTestId("qa-error")).toHaveText("Fix the marked field first.");
    await a.getByTestId("qa-do-on").fill("");
    await a.getByTestId("qa-importance").fill("3");
    await page.keyboard.press("Enter");
    await expect(page.locator("#stage iframe")).toHaveCount(0);
    expect(await fileText(page, "Tasks/2026-11-17-renew-noras-swimming-class.md")).toBe(
      quickAdded({ title: "Renew Nora's swimming class", deadline: "2026-11-20", importance: 3, created: "2026-11-17" }),
    );
  });

  test("at 01:30 phrases and the created date count from the planner day; a taken name gets -2; ⇧⌘↵ also opens the file", async ({ page }) => {
    await page.goto(harness({ ...OVERLAY, now: "2026-11-18T01:30" }));
    const a = app(page);
    await page.evaluate(() => window.fakeHost.writeFile("Tasks/2026-11-17-buy-milk.md", "taken\n"));
    await a.getByTestId("qa-title").fill("Buy milk");
    await a.getByTestId("qa-do-on").fill("today");
    await expect(a.getByTestId("qa-do-on-resolved")).toHaveText("Tue, Nov 17");
    await page.keyboard.press("Shift+Meta+Enter");
    await expect(page.locator("#stage iframe")).toHaveCount(0);
    expect(await fileText(page, "Tasks/2026-11-17-buy-milk-2.md")).toBe(quickAdded({ title: "Buy milk", doOn: "2026-11-17", created: "2026-11-17" }));
    expect(await fileText(page, "Tasks/2026-11-17-buy-milk.md")).toBe("taken\n");
    expect(await page.evaluate(() => window.fakeHost.openedTabs)).toEqual([{ kind: "file", projectId: "__workspace__", path: "Tasks/2026-11-17-buy-milk-2.md" }]);
  });

  test("an empty title is refused; Escape closes without writing", async ({ page }) => {
    await page.goto(harness(OVERLAY));
    const a = app(page);
    await a.getByTestId("qa-title").fill("   ");
    await page.keyboard.press("Enter");
    await expect(a.getByTestId("qa-error")).toHaveText("Give the task a title.");
    await page.keyboard.press("Escape");
    await expect(page.locator("#stage iframe")).toHaveCount(0);
    expect(await fileExists(page, "Tasks/2026-11-17-task.md")).toBe(false);
  });

  test("with no tasks root the overlay says so and opens the Planner", async ({ page }) => {
    await page.goto(harness({ surface: "overlay", route: "quick-add" }));
    const a = app(page);
    await expect(a.getByTestId("quick-add-no-root")).toBeVisible();
    await a.getByTestId("quick-add-open-planner").click();
    await expect(page.locator("#stage iframe")).toHaveCount(0);
    expect(await page.evaluate(() => window.fakeHost.openedTabs)).toEqual([{ kind: "app", projectId: "alpha", route: "planner" }]);
  });

  test("the panel's + opens quick add over the active tab: do-on today from Today, empty from All; Enter adds the task; focus back on +", async ({ page }) => {
    const a = await openPanel(page);
    const o = await openQuickAdd(page, a);
    expect(await page.evaluate(() => window.fakeHost.overlays)).toEqual([{ route: "quick-add?do-on=today" }]);
    await expect(o.getByTestId("qa-do-on")).toHaveValue("today");
    await expect(o.getByTestId("qa-do-on-resolved")).toHaveText("Tue, Nov 17");
    await page.keyboard.type("Call the bank");
    await o.getByTestId("qa-deadline").fill("+3d");
    await shot(page, "e003-fake-quick-add-from-panel");
    await page.keyboard.press("Enter");
    await expect(page.locator("#overlay iframe")).toHaveCount(0);
    await expect(a.getByTestId("planner-add")).toBeFocused();
    await expect(row(a, "Call the bank").getByTestId("hint-deadline")).toHaveText("due Fri");
    expect(await fileText(page, "Tasks/2026-11-17-call-the-bank.md")).toBe(quickAdded({ title: "Call the bank", doOn: "2026-11-17", deadline: "2026-11-20", created: "2026-11-17" }));

    await a.getByTestId("view-all").click();
    const all = await openQuickAdd(page, a);
    expect(await page.evaluate(() => window.fakeHost.overlays.map((x) => x.route))).toEqual(["quick-add?do-on=today", "quick-add"]);
    await expect(all.getByTestId("qa-do-on")).toHaveValue("");
    await page.keyboard.press("Escape");
    await expect(page.locator("#overlay iframe")).toHaveCount(0);
    await expect(a.getByTestId("planner-add")).toBeFocused();
    expect(await page.evaluate(() => window.fakeHost.openedTabs)).toEqual([]);
  });
});

test.describe("settings and the tasks root", () => {
  test("the settings page: the boundary and the tasks root are saved; every other key of the file stays", async ({ page }) => {
    await page.goto(harness({ surface: "tab", route: "settings", tasks: "Tasks", now: "2026-11-18T02:30" }));
    const a = app(page);
    await page.evaluate((path) => window.fakeHost.writeFile(path, '{\n  "backlogPathPattern": "plans/",\n  "tasksRoot": "Tasks"\n}\n'), SETTINGS);
    await expect(a.getByTestId("settings-tasks-root")).toHaveText("Tasks/");
    await expect(a.getByTestId("settings-boundary")).toHaveValue("3:00");
    await shot(page, "e003-fake-settings");
    await a.getByTestId("settings-boundary").fill("25:00");
    await a.getByTestId("settings-boundary").press("Enter");
    await expect(a.getByTestId("settings-boundary-error")).toHaveText("A time from 0:00 to 23:59, like 3:00.");
    await a.getByTestId("settings-boundary").fill("2:00");
    await a.getByTestId("settings-boundary").press("Enter");
    await expect(a.getByTestId("settings-saved")).toHaveText("Day boundary saved.");
    expect(JSON.parse(await fileText(page, SETTINGS))).toEqual({ backlogPathPattern: "plans/", tasksRoot: "Tasks", dayBoundary: "2:00" });

    await page.evaluate(() => window.fakeHost.answerPick("Projects/beta"));
    await a.getByTestId("settings-change-root").click();
    await expect(a.getByTestId("settings-tasks-root")).toHaveText("Projects/beta/");
    expect(JSON.parse(await fileText(page, SETTINGS))).toEqual({ backlogPathPattern: "plans/", tasksRoot: "Projects/beta", dayBoundary: "2:00" });
    expect(await page.evaluate(() => window.fakeHost.pickRequests.at(-1))).toEqual({ root: "", initial: "Tasks" });
    expect(await fileText(page, "Tasks/2026-11-01-pay-the-tax.md")).toBe(PLANNER_TASKS["2026-11-01-pay-the-tax.md"]);

    // Back on the views: at 02:30 with a 2:00 boundary it is already Wednesday.
    await page.evaluate((path) => window.fakeHost.writeFile(path, '{ "tasksRoot": "Tasks", "dayBoundary": "2:00" }\n'), SETTINGS);
    await a.getByTestId("settings-back").click();
    await expect(a.getByTestId("planner-day")).toHaveText("Wed, Nov 18");
  });

  test("a settings file the Planner can't read is shown, and the defaults stand in", async ({ page }) => {
    // Written before the frame mounts: a write racing the app's first read and its watch could go unseen.
    await page.goto(`${harness({ surface: "panel", icon: "planner", now: "2026-11-17T10:00" })}&mount=manual`);
    const a = app(page);
    await page.evaluate((path) => window.fakeHost.writeFile(path, '{ "tasksRoot": "Tasks", "dayBoundary": "late" }\n'), SETTINGS);
    await page.evaluate(() => window.mountNow());
    await expect(a.getByTestId("settings-problem")).toHaveText('dayBoundary must be a time like "3:00" — using the defaults.');
    await expect(a.getByTestId("planner-day")).toHaveText("Tue, Nov 17");
  });

  test("a tasks root that disappears says so; made again, it loads by itself", async ({ page }) => {
    await page.goto(harness({ ...PANEL, tasks: "Lists/Todo" }));
    const a = app(page);
    await expect(a.getByTestId("view-title")).toHaveText("Tasks folder not found");
    await expect(a.getByTestId("tasks-root-problem")).toContainText("Lists/Todo/ isn't there any more.");
    await page.evaluate(() => window.fakeHost.writeFile("Lists/Todo/a.md", "---\ntype: task\ntitle: Back\nstatus: open\ndo-on: 2026-11-17\n---\n"));
    await expect(row(a, "Back")).toBeVisible();
  });

  test("the narrow panel and the Today with nothing in it", async ({ page }) => {
    const a = await openPanel(page, { ...PANEL, tasks: "Projects/beta" });
    // The day's daily note is the only thing pinned there.
    await expect(a.getByTestId("daily-card")).toBeVisible();
    await expect(a.getByTestId("today-empty")).toContainText("Nothing else for today");
    await shot(page, "e003-fake-empty-today");
    await openPanel(page, { ...PANEL, panelWidth: 200 });
    const overflow = await app(page)
      .locator("html")
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBe(0);
    await shot(page, "e003-fake-narrow-panel");
  });
});
