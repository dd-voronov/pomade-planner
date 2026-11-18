// E-007 on the fake host (fake-host/, test/fixtures/workspace.ts): the Planner icon's badge set by
// the Planner panel frame (the launch frame) — overdue + due today, red with anything overdue,
// live, at the day boundary, gone at zero; the morning summary on `pomade.ready`, once per planner
// day (`planner.summaryDay`), its click opening the Planner tab on the Workspace Today; the tab
// at route `today` selecting Today. The fixture's Tasks/ on Tue 2026-11-17: "Pay the tax"
// overdue, "Renew Nora's swimming class" due today, the rest planned, rolled over, done or later.

import { expect, test, type FrameLocator, type Page } from "@playwright/test";

import { APP_PORT, HARNESS_PORT } from "../playwright.config";
import { row, setClock, settled } from "./fixtures/planner";
import { shot } from "./fixtures/screens";

const APP = `http://localhost:${APP_PORT}/`;

interface Open {
  surface?: "tab" | "panel";
  route?: string;
  now?: string;
  /** The active project's id, or `workspace`. */
  project?: string;
  fixture?: string;
  tasks?: string;
  state?: Record<string, unknown>;
}

function harness(open: Open = {}): string {
  const params = new URLSearchParams({ app: APP, surface: open.surface ?? "panel", tasks: open.tasks ?? "Tasks", now: open.now ?? "2026-11-17T10:00", project: open.project ?? "workspace" });
  if ((open.surface ?? "panel") === "panel") params.set("icon", "planner");
  if (open.route !== undefined) params.set("route", open.route);
  if (open.fixture !== undefined) params.set("fixture", open.fixture);
  if (open.state !== undefined) params.set("state", JSON.stringify(open.state));
  return `http://localhost:${HARNESS_PORT}/index.html?${params.toString()}`;
}

const app = (page: Page): FrameLocator => page.frameLocator("#stage iframe");
const badges = (page: Page) => page.evaluate(() => window.fakeHost.badges);
const notices = (page: Page) => page.evaluate(() => window.fakeHost.notices);
const state = (page: Page, key: string) => page.evaluate((k) => window.fakeHost.state[k] ?? null, key);
const ready = (page: Page) => page.evaluate(() => window.fakeHost.ready());
/** Wait until the panel has checked the summary for `n` of Pomade's ready events. */
const checks = (page: Page, n: number) => expect(app(page).locator(`main[data-summary-checks="${n}"]`)).toHaveCount(1);
const write = (page: Page, path: string, text: string) => page.evaluate(([p, t]) => window.fakeHost.writeFile(p, t), [path, text] as const);
const task = (title: string, extra: string) => `---\ntype: task\ntitle: ${title}\nstatus: open\n${extra}created: 2026-11-16\n---\n`;

async function openPanel(page: Page, open: Open = {}): Promise<FrameLocator> {
  await page.goto(harness(open));
  const a = app(page);
  await expect(a.getByTestId("view-planner-panel")).toBeVisible();
  await settled(a);
  return a;
}

const SUMMARY = {
  title: "1 due today, 1 overdue",
  body: "Overdue: Pay the tax · Due today: Renew Nora's swimming class",
  action: { kind: "openApp", route: "today", projectId: "__workspace__" },
};

test.describe("the badge", () => {
  test("the panel frame badges the Planner icon with overdue + due today, red while anything is overdue — at any context", async ({ page }) => {
    const a = await openPanel(page, { project: "beta" });
    await expect.poll(() => badges(page)).toEqual({ planner: { count: 2, urgent: true } });
    await expect(a.getByTestId("view-planner-panel")).toHaveAttribute("data-context", "beta");
    await shot(page, "e007-fake-panel-badge-red");
  });

  test("ticking updates it: the overdue one ticked turns it grey, the last one clears it; unticking brings it back", async ({ page }) => {
    const a = await openPanel(page);
    await expect.poll(() => badges(page)).toEqual({ planner: { count: 2, urgent: true } });
    await row(a, "Pay the tax").getByTestId("task-check").check();
    await expect.poll(() => badges(page), { timeout: 1_000 }).toEqual({ planner: { count: 1, urgent: false } });
    await shot(page, "e007-fake-panel-badge-grey");
    await row(a, "Renew Nora's swimming class").getByTestId("task-check").check();
    await expect.poll(() => badges(page), { timeout: 1_000 }).toEqual({});
    await row(a, "Pay the tax").getByTestId("task-check").uncheck();
    await expect.poll(() => badges(page), { timeout: 1_000 }).toEqual({ planner: { count: 1, urgent: true } });
  });

  test("a file written outside the app counts within ~1 s; a recurring item missed three times counts once; one in its lead time doesn't", async ({ page }) => {
    await openPanel(page);
    await expect.poll(() => badges(page)).toEqual({ planner: { count: 2, urgent: true } });
    await write(page, "Tasks/2026-11-16-buy-milk.md", task("Buy milk", "deadline: 2026-11-17\n"));
    await expect.poll(() => badges(page), { timeout: 1_000 }).toEqual({ planner: { count: 3, urgent: true } });
    await write(page, "Tasks/2026-11-16-bins.md", "---\ntype: recurring\ntitle: Bins\nstatus: open\ndo-on: 2026-11-03\nrepeat:\n  weekly: { days: [tue] }\ncreated: 2026-01-01\n---\n");
    await expect.poll(() => badges(page), { timeout: 1_000 }).toEqual({ planner: { count: 4, urgent: true } });
    await write(page, "Tasks/2026-11-16-tax-report.md", "---\ntype: recurring\ntitle: Tax report\nstatus: open\ndo-on: 2026-11-20\nrepeat:\n  monthly: { days: [20] }\n  lead-days: 5\ncreated: 2026-01-01\n---\n");
    await expect(row(app(page), "Tax report")).toBeVisible();
    expect(await badges(page)).toEqual({ planner: { count: 4, urgent: true } });
  });

  test("at the day boundary it follows the new day: tomorrow's deadline joins, today's turns overdue", async ({ page }) => {
    const a = await openPanel(page, { now: "2026-11-18T02:59:58" });
    await write(page, "Tasks/2026-11-16-pick-up-keys.md", task("Pick up the keys", "deadline: 2026-11-18\n"));
    await expect(a.getByTestId("planner-day")).toHaveText("Tue, Nov 17");
    await expect.poll(() => badges(page)).toEqual({ planner: { count: 2, urgent: true } });
    await expect(a.getByTestId("planner-day")).toHaveText("Wed, Nov 18", { timeout: 5_000 });
    await expect.poll(() => badges(page), { timeout: 1_000 }).toEqual({ planner: { count: 3, urgent: true } });
    expect(await notices(page)).toEqual([]);
  });

  test("nothing due: no badge; the tab never sets one", async ({ page }) => {
    await openPanel(page, { now: "2026-11-12T10:00" });
    await expect.poll(() => state(page, "planner.dailyNoteDay")).toBe("2026-11-12");
    expect(await badges(page)).toEqual({});
    await page.goto(harness({ surface: "tab", route: "planner" }));
    await expect(app(page).getByTestId("view-planner-tab")).toBeVisible();
    await expect(row(app(page), "Pay the tax")).toBeVisible();
    expect(await badges(page)).toEqual({});
  });
});

test.describe("the morning summary", () => {
  test("Pomade ready posts one notice naming what's due and records the day; another ready that day posts nothing", async ({ page }) => {
    await openPanel(page);
    expect(await notices(page)).toEqual([]);
    await ready(page);
    await expect.poll(() => notices(page)).toEqual([SUMMARY]);
    await expect.poll(() => state(page, "planner.summaryDay")).toBe("2026-11-17");
    await ready(page);
    await checks(page, 2);
    expect(await notices(page)).toHaveLength(1);
  });

  test("ready heard before the items load (sticky) still posts once they're read", async ({ page }) => {
    await page.goto(harness());
    await ready(page);
    await expect.poll(() => notices(page)).toEqual([SUMMARY]);
  });

  test("a summary already settled this planner day posts nothing — 01:30 is still yesterday; the first start after 03:00 posts", async ({ page }) => {
    await openPanel(page, { now: "2026-11-18T01:30", state: { "planner.summaryDay": "2026-11-17" } });
    await ready(page);
    await checks(page, 1);
    expect(await notices(page)).toEqual([]);
    expect(await state(page, "planner.summaryDay")).toBe("2026-11-17");

    await openPanel(page, { now: "2026-11-18T03:30", state: { "planner.summaryDay": "2026-11-17" } });
    await ready(page);
    await expect.poll(() => notices(page)).toEqual([{ ...SUMMARY, title: "2 overdue", body: "Overdue: Pay the tax, Renew Nora's swimming class" }]);
    await expect.poll(() => state(page, "planner.summaryDay")).toBe("2026-11-18");
  });

  test("the boundary passing while Pomade stays open posts nothing", async ({ page }) => {
    const a = await openPanel(page, { now: "2026-11-18T02:59:58", state: { "planner.summaryDay": "2026-11-17" } });
    await ready(page);
    await checks(page, 1);
    await expect(a.getByTestId("planner-day")).toHaveText("Wed, Nov 18", { timeout: 5_000 });
    await checks(page, 1);
    expect(await notices(page)).toEqual([]);
  });

  test("nothing due: no notice, but the day is recorded — a task added later that day makes no late summary", async ({ page }) => {
    await openPanel(page, { now: "2026-11-12T10:00" });
    await ready(page);
    await expect.poll(() => state(page, "planner.summaryDay")).toBe("2026-11-12");
    expect(await notices(page)).toEqual([]);
    await write(page, "Tasks/2026-11-12-buy-milk.md", task("Buy milk", "deadline: 2026-11-12\n"));
    await expect.poll(() => badges(page)).toEqual({ planner: { count: 1, urgent: false } });
    await ready(page);
    await checks(page, 2);
    expect(await notices(page)).toEqual([]);
  });

  test("a recurring item in its lead time is named in the title; projects' items count too", async ({ page }) => {
    await page.goto(harness({ fixture: "planner" }));
    await write(page, "Tasks/2026-11-16-tax-report.md", "---\ntype: recurring\ntitle: Tax report\nstatus: open\ndo-on: 2026-11-20\nrepeat:\n  monthly: { days: [20] }\n  lead-days: 5\ncreated: 2026-01-01\n---\n");
    await expect(row(app(page), "Tax report")).toBeVisible();
    await ready(page);
    await expect.poll(() => notices(page)).toEqual([
      { ...SUMMARY, title: "2 due today, 2 overdue, Tax report due in 3 days", body: "Overdue: Pay the tax, Review the Host API · Due today: Renew Nora's swimming class · +1 more" },
    ]);
    await expect.poll(() => badges(page)).toEqual({ planner: { count: 4, urgent: true } });
  });

  test("clicking the notice opens the Planner's tab at route today in the Workspace", async ({ page }) => {
    await openPanel(page, { project: "beta" });
    await ready(page);
    await expect.poll(() => notices(page)).toHaveLength(1);
    await page.evaluate(() => window.fakeHost.clickNotice());
    expect(await page.evaluate(() => window.fakeHost.openedTabs.at(-1))).toEqual({ kind: "app", projectId: "__workspace__", route: "today" });
  });
});

test.describe("the tab at route today", () => {
  const ALL = { "planner.view.__workspace__": { view: "all", showDone: false, showArchived: false, mixNoProject: false, mixProjects: [], projects: [], types: [] } };

  test("selects the Workspace Today; picking another view takes the tab back to route planner, so the next click selects Today again", async ({ page }) => {
    await page.goto(harness({ surface: "tab", route: "today", state: ALL }));
    const a = app(page);
    await expect(a.getByTestId("view-today")).toHaveAttribute("aria-selected", "true");
    await expect(a.getByTestId("planner-day")).toHaveText("Tue, Nov 17");
    await shot(page, "e007-fake-tab-today");
    await a.getByTestId("view-all").click();
    await expect.poll(() => page.evaluate(() => window.fakeHost.openedTabs.at(-1))).toEqual({ kind: "app", projectId: "__workspace__", route: "planner" });
    await page.evaluate(() => window.mounted?.navigate("planner"));
    await expect(a.getByTestId("view-all")).toHaveAttribute("aria-selected", "true");
    await page.evaluate(() => window.mounted?.navigate("today"));
    await expect(a.getByTestId("view-today")).toHaveAttribute("aria-selected", "true");
  });

  test("opened in a project, it waits for the Workspace to become active, then selects Today there", async ({ page }) => {
    await page.goto(harness({ surface: "tab", route: "today", project: "beta", state: ALL }));
    const a = app(page);
    await expect(a.getByTestId("view-planner-tab")).toHaveAttribute("data-context", "beta");
    await page.evaluate(() => window.fakeHost.setActiveProject(null));
    await expect(a.getByTestId("view-planner-tab")).toHaveAttribute("data-context", "__workspace__");
    await expect(a.getByTestId("view-today")).toHaveAttribute("aria-selected", "true");
    expect(await state(page, "planner.view.__workspace__")).toMatchObject({ view: "today" });
  });

  test("closing the settings page takes the tab back to route planner", async ({ page }) => {
    await page.goto(harness({ surface: "tab", route: "settings" }));
    const a = app(page);
    await a.getByTestId("settings-back").click();
    await expect.poll(() => page.evaluate(() => window.fakeHost.openedTabs.at(-1))).toEqual({ kind: "app", projectId: "__workspace__", route: "planner" });
    await expect(a.getByTestId("view-today")).toBeVisible();
  });
});

test("the clock hook moves the badge with it", async ({ page }) => {
  const a = await openPanel(page);
  await expect.poll(() => badges(page)).toEqual({ planner: { count: 2, urgent: true } });
  await setClock(a, "2026-11-12T10:00");
  await expect.poll(() => badges(page)).toEqual({});
});
