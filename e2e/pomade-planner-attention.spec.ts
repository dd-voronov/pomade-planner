// E-007's acceptance in a real Pomade ($POMADE_DIR, e2e/fixtures/pomade.ts) with the app installed
// into the fixture's user data, on real files in To-dos/: the Planner panel starts hidden at
// launch (`startOnLaunch`) and, before the Planner is ever opened, puts a red "3" on its icon,
// posts one morning summary and makes the day's daily note; the summary's click opens the Planner
// on the Workspace Today; a relaunch the same day posts nothing, a start before 03:00 the next
// day neither, the first start after 03:00 a new one; files changed on disk and ticks move the
// badge within ~1 s, and at zero it is gone. The Planner's clock is its `test.clock` hook, written
// into the app state before each launch.

import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { expect, test, type ElectronApplication, type FrameLocator, type Page } from "@playwright/test";

import { row, settled } from "./fixtures/planner";
import { APP_VERSION, POMADE_BIN, createPomadeFixture, launchPomade, panelShown, pomadeEnv, type PomadeFixture } from "./fixtures/pomade";
import { shot } from "./fixtures/screens";

const DIST = resolve(import.meta.dirname, "../dist/planner");
const INSTALL_SCRIPT = resolve(import.meta.dirname, "../scripts/install-app.mjs");
const ICON = "strip-app-pomade-planner-planner";
const BADGE = "strip-badge-app-pomade-planner-planner";
const PANEL = '[data-testid="panel-frame-app-pomade-planner-planner"]';
const TAB = '[data-testid="app-frame-pomade-planner"]:visible';
const TODOS = "To-dos";
const SETTINGS = "Apps/pomade-planner/settings.json";

const task = (title: string, extra = ""): string => `---\ntype: task\ntitle: ${title}\nstatus: open\n${extra}created: 2026-11-07\n---\n`;
const recurring = (title: string, doOn: string, repeat: string): string => `---\ntype: recurring\ntitle: ${title}\nstatus: open\ndo-on: ${doOn}\nrepeat:\n${repeat}created: 2026-01-01\n---\n`;

// Tuesday, Nov 10: one overdue, two due today (one of them recurring), one in its lead time, one only planned.
const FILES: Record<string, string> = {
  "2026-11-07-pay-the-tax.md": task("Pay the tax", "deadline: 2026-11-09\n"),
  "2026-11-07-buy-printer-ink.md": task("Buy printer ink", "deadline: 2026-11-10\n"),
  "2026-11-07-call-the-dentist.md": task("Call the dentist", "do-on: 2026-11-10\n"),
  "2026-01-01-upload-invoices.md": recurring("Upload invoices", "2026-11-10", "  monthly: { days: [10] }\n"),
  "2026-01-01-tax-report.md": recurring("Tax report", "2026-11-13", "  monthly: { days: [13] }\n  lead-days: 5\n"),
};

const WORKSPACE_ALL = { view: "all", showDone: false, showArchived: false, mixNoProject: false, mixProjects: [], projects: [], types: [] };

test.describe("the Planner's badge and morning summary in a real Pomade", () => {
  test.describe.configure({ mode: "serial" });
  let fixture: PomadeFixture;
  let app: ElectronApplication | undefined;
  let page: Page;
  const abs = (rel: string) => join(fixture.workspaceRoot, rel);
  const todo = (name: string) => abs(`${TODOS}/${name}`);
  const there = (name: string) =>
    stat(todo(name)).then(
      () => true,
      () => false,
    );
  const panel = (): FrameLocator => page.frameLocator(PANEL);
  const stateFile = () => join(fixture.userDataDir, "app-state/pomade-planner/state.json");
  const badge = () => page.getByTestId(BADGE);
  const toasts = () => page.getByTestId("notice-toast");

  /** The app state with the Planner's clock at `local` (and `values`), written while Pomade is closed. */
  async function seedState(local: string, values: Record<string, unknown> = {}): Promise<void> {
    await mkdir(join(stateFile(), ".."), { recursive: true });
    const before = JSON.parse(await readFile(stateFile(), "utf8").catch(() => "{}")) as Record<string, unknown>;
    await writeFile(stateFile(), JSON.stringify({ ...before, ...values, "test.clock": { offsetMs: new Date(local).getTime() - Date.now() } }));
  }

  const savedState = async (): Promise<Record<string, unknown>> => JSON.parse(await readFile(stateFile(), "utf8")) as Record<string, unknown>;

  async function launch(): Promise<void> {
    ({ app, page } = await launchPomade(fixture));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1400, 900));
  }

  async function quit(): Promise<void> {
    await app?.close();
    app = undefined;
  }

  /** The hidden launch frame has checked the morning summary for this start. */
  async function summaryChecked(): Promise<void> {
    await expect(panel().locator('main[data-summary-checks="1"]')).toHaveCount(1);
  }

  async function openPanel(): Promise<FrameLocator> {
    if ((await page.getByTestId(ICON).getAttribute("aria-pressed")) !== "true") await page.getByTestId(ICON).click();
    await panelShown(page, ICON);
    await expect(panel().getByTestId("view-planner-panel")).toBeVisible();
    await settled(panel());
    return panel();
  }

  /** The Planner tab on the Workspace Today — where the summary's click lands. */
  async function expectWorkspaceToday(): Promise<FrameLocator> {
    await expect(page.getByTestId("project-__workspace__")).toHaveAttribute("data-active", "true");
    const tab = page.frameLocator(TAB);
    await expect(tab.getByTestId("view-planner-tab")).toHaveAttribute("data-context", "__workspace__");
    await expect(tab.getByTestId("view-today")).toHaveAttribute("aria-selected", "true");
    return tab;
  }

  test.beforeAll(async () => {
    fixture = await createPomadeFixture([
      { key: "alpha", name: "Alpha", root: "Projects/alpha", files: { "README.md": "# Alpha\n" } },
      { key: "quizlab", name: "QuizLab", root: "Projects/QuizLab", files: { "README.md": "# QuizLab\n" } },
    ]);
    await mkdir(abs("Apps/pomade-planner"), { recursive: true });
    await writeFile(abs(SETTINGS), `${JSON.stringify({ tasksRoot: TODOS }, null, 2)}\n`);
    await mkdir(todo(""), { recursive: true });
    for (const [name, content] of Object.entries(FILES)) await writeFile(todo(name), content);
    const out = execFileSync(process.execPath, [INSTALL_SCRIPT, DIST], { env: pomadeEnv(fixture, { POMADE_BIN }), encoding: "utf8" });
    expect(out).toContain(`Planner ${APP_VERSION} (pomade-planner)`);
    // Tuesday, Nov 10, 07:30 — Pomade last ran on Monday the 9th; the Workspace Planner was left on All.
    await seedState("2026-11-10T07:30", { "planner.dailyNoteDay": "2026-11-09", "planner.summaryDay": "2026-11-09", "planner.view.__workspace__": WORKSPACE_ALL });
    await launch();
  });

  test.afterAll(async () => {
    await app?.close();
    await fixture.cleanup();
  });

  test("starting Pomade shows a red “3” on the Planner icon before the Planner is opened, one notification, and makes the day's daily note", async () => {
    await expect(badge()).toHaveText("3");
    await expect(badge()).toHaveAttribute("data-urgent", "true");
    await expect(page.getByTestId(ICON)).toHaveAttribute("aria-label", "Planner (3)");
    await expect(page.getByTestId(ICON)).not.toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(PANEL)).toBeHidden();
    await expect(toasts()).toHaveCount(1);
    await expect(toasts().getByTestId("notice-toast-title")).toHaveText("2 due today, 1 overdue, Tax report due in 3 days");
    await expect(toasts().getByTestId("notice-toast-body")).toHaveText("Overdue: Pay the tax · Due today: Buy printer ink, Upload invoices");
    await expect(toasts().getByTestId("notice-toast-source")).toContainText("Planner");
    await toasts().hover();
    await shot(page, "e007-pomade-launch-badge-red-toast");
    expect(await there("Daily/2026-11-10.md")).toBe(true);
    expect(await savedState()).toMatchObject({ "planner.summaryDay": "2026-11-10", "planner.dailyNoteDay": "2026-11-10" });
    await toasts().getByTestId("notice-toast-dismiss").click();
    await expect(toasts()).toHaveCount(0);
  });

  test("the notification stays in the Notices panel; clicking it opens the Planner on the Workspace Today", async () => {
    await expect(page.getByTestId("project-proj-alpha")).toHaveAttribute("data-active", "true");
    await page.getByTestId("strip-notices").click();
    const rows = page.getByTestId("notice-row");
    await expect(rows).toHaveCount(1);
    await expect(rows.getByTestId("notice-row-title")).toHaveText("2 due today, 1 overdue, Tax report due in 3 days");
    await shot(page, "e007-pomade-notices-panel-row");
    await rows.click();
    const tab = await expectWorkspaceToday();
    await expect(row(tab, "Pay the tax")).toBeVisible();
    await shot(page, "e007-pomade-click-workspace-today");
  });

  test("restarting Pomade the same day posts no second summary; the badge is back from launch", async () => {
    await quit();
    await launch();
    await expect(badge()).toHaveText("3");
    await summaryChecked();
    await expect(toasts()).toHaveCount(0);
    await page.getByTestId("strip-notices").click();
    await expect(page.getByTestId("notice-row")).toHaveCount(0);
  });

  test("the next day: a start at 02:30 posts nothing; the first start after 03:00 posts a new summary, whose toast opens the Workspace Today", async () => {
    await quit();
    await seedState("2026-11-11T02:30", { "planner.view.__workspace__": WORKSPACE_ALL });
    await launch();
    await summaryChecked();
    await expect(badge()).toHaveText("3");
    await expect(toasts()).toHaveCount(0);

    await quit();
    await seedState("2026-11-11T03:30");
    await launch();
    await expect(toasts()).toHaveCount(1);
    await expect(toasts().getByTestId("notice-toast-title")).toHaveText("3 overdue, Tax report due in 2 days");
    await expect(toasts().getByTestId("notice-toast-body")).toHaveText("Overdue: Pay the tax, Buy printer ink, Upload invoices");
    // Wednesday: what was due yesterday is overdue now.
    await expect(badge()).toHaveText("3");
    await expect(badge()).toHaveAttribute("data-urgent", "true");
    expect(await there("Daily/2026-11-11.md")).toBe(true);
    await toasts().getByTestId("notice-toast-open").click();
    await expectWorkspaceToday();
  });

  test("a file changed on disk moves the badge within ~1 s, the Planner still closed", async () => {
    await expect(page.locator(PANEL)).toBeHidden();
    // A change in the first moments of a watch can go unreported (FSEvents): write until it shows.
    await expect(async () => {
      await writeFile(todo("2026-11-11-buy-milk.md"), task("Buy milk", "deadline: 2026-11-11\n"));
      await expect(badge()).toHaveText("4", { timeout: 1_500 });
    }).toPass();
    await expect(badge()).toHaveAttribute("data-urgent", "true");
    await writeFile(todo("2026-11-11-buy-milk.md"), task("Buy milk", "deadline: 2026-11-20\n"));
    const saved = Date.now();
    await expect(badge()).toHaveText("3", { timeout: 1_500 });
    expect(Date.now() - saved).toBeLessThan(1_500);
    await rm(todo("2026-11-11-buy-milk.md"));
  });

  test("ticking a due task updates the badge within ~1 s; red turns grey when nothing is overdue; at zero it disappears", async () => {
    await writeFile(todo("2026-11-11-water-plants.md"), task("Water the plants", "deadline: 2026-11-11\n"));
    await expect(badge()).toHaveText("4");
    const p = await openPanel();
    for (const [title, left] of [
      ["Pay the tax", "3"],
      ["Buy printer ink", "2"],
    ] as const) {
      await row(p, title).getByTestId("task-check").check();
      const ticked = Date.now();
      await expect(badge()).toHaveText(left, { timeout: 1_500 });
      expect(Date.now() - ticked).toBeLessThan(1_500);
    }
    await expect(badge()).toHaveAttribute("data-urgent", "true");
    // The recurring item's missed run: done advances it.
    await row(p, "Upload invoices").getByTestId("task-check").click();
    await expect(badge()).toHaveText("1", { timeout: 1_500 });
    await expect(badge()).not.toHaveAttribute("data-urgent", /.*/);
    await shot(page, "e007-pomade-badge-grey");
    await row(p, "Water the plants").getByTestId("task-check").check();
    const last = Date.now();
    await expect(badge()).toHaveCount(0, { timeout: 1_500 });
    expect(Date.now() - last).toBeLessThan(1_500);
    await expect(page.getByTestId(ICON)).toHaveAttribute("aria-label", "Planner");
    await shot(page, "e007-pomade-badge-gone");
  });
});
