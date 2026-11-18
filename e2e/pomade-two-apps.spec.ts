// T-004 in a real Pomade (e2e/fixtures/pomade.ts): the Planner and the Board are two apps.
// `npm run install-app`'s script installs both build folders, `pomade apps list` names both, the
// new-tab menu lists both and each opens its own tab; each is installed alone and works with the
// other removed; the Board reads its synced settings from Apps/pomade-board/ and keeps its
// per-project settings and its state under its own id.

import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { expect, test, type ElectronApplication, type Page } from "@playwright/test";

import { settled } from "./fixtures/planner";
import { POMADE_BIN, createPomadeFixture, launchPomade, panelShown, pomadeEnv, type FixtureProject, type PomadeFixture } from "./fixtures/pomade";
import { shot } from "./fixtures/screens";

const INSTALL_SCRIPT = resolve(import.meta.dirname, "../scripts/install-app.mjs");

const PLANNER = {
  id: "pomade-planner",
  icon: "strip-app-pomade-planner-planner",
  panel: '[data-testid="panel-frame-app-pomade-planner-planner"]',
  tab: '[data-testid="app-frame-pomade-planner"]:visible',
  menu: "tab-add-app-pomade-planner",
};
const BOARD = {
  id: "pomade-board",
  icon: "strip-app-pomade-board-board",
  panel: '[data-testid="panel-frame-app-pomade-board-board"]',
  tab: '[data-testid="app-frame-pomade-board"]:visible',
  menu: "tab-add-app-pomade-board",
};

const epic = (id: string, title: string): string => `---\nid: ${id}\nkind: epic\ntitle: ${title}\nstatus: planned\npriority: P1\n---\n\n# ${id} — ${title}\n`;
const TASK = "---\ntype: task\ntitle: Pay the tax\nstatus: open\n---\n";
const PLANNER_SETTINGS = `${JSON.stringify({ tasksRoot: "To-dos", backlogPathPattern: "elsewhere/" }, null, 2)}\n`;
const BOARD_SETTINGS = `${JSON.stringify({ backlogPathPattern: "tickets/" }, null, 2)}\n`;

/** Alpha's backlog is where the Board's settings file says (`tickets/`); Beta's only where the Planner's file says (`elsewhere/`). */
const PROJECTS: FixtureProject[] = [
  { key: "alpha", name: "Alpha", root: "Projects/alpha", files: { "tickets/E-001-first.md": epic("E-001", "First") } },
  { key: "beta", name: "Beta", root: "Projects/beta", files: { "elsewhere/E-002-second.md": epic("E-002", "Second") } },
];

/** The fixture workspace: the two projects, each app's own settings file, and one task in the Planner's tasks folder. */
async function createFixture(): Promise<PomadeFixture> {
  const fixture = await createPomadeFixture(PROJECTS);
  const files = { "Apps/pomade-planner/settings.json": PLANNER_SETTINGS, "Apps/pomade-board/settings.json": BOARD_SETTINGS, "To-dos/2026-11-10-pay-the-tax.md": TASK };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(fixture.workspaceRoot, path)), { recursive: true });
    await writeFile(join(fixture.workspaceRoot, path), content);
  }
  return fixture;
}

/** What `pomade apps list` prints under "Installed:", one line per app. */
function installedApps(fixture: PomadeFixture): string[] {
  const out = execFileSync(POMADE_BIN, ["apps", "list"], { env: pomadeEnv(fixture), encoding: "utf8" });
  const lines = out.split("\n");
  return lines.slice(lines.indexOf("Installed:") + 1, lines.indexOf("Dev links:")).map((line) => line.trim());
}

/** Run `npm run install-app`'s script on the fixture's Pomade: both apps, or the one named. */
function install(fixture: PomadeFixture, ...which: string[]): string {
  return execFileSync(process.execPath, [INSTALL_SCRIPT, ...which], { env: pomadeEnv(fixture, { POMADE_BIN }), encoding: "utf8" });
}

function remove(fixture: PomadeFixture, id: string): string {
  return execFileSync(POMADE_BIN, ["apps", "remove", id], { env: pomadeEnv(fixture), encoding: "utf8" });
}

/** The apps Pomade's new-tab menu lists, by their menu rows' test ids; the menu is left closed. */
async function menuApps(page: Page): Promise<string[]> {
  await page.locator('[data-testid="tab-add"]:visible').click();
  await expect(page.getByTestId("tab-add-menu")).toBeVisible();
  const ids = await page.locator('[data-testid^="tab-add-app-"]').evaluateAll((els) => els.map((el) => el.getAttribute("data-testid") ?? ""));
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("tab-add-menu")).toHaveCount(0);
  return ids.sort();
}

async function openFromMenu(page: Page, row: string): Promise<void> {
  await page.locator('[data-testid="tab-add"]:visible').click();
  await page.getByTestId(row).click();
}

/** The Planner works: its panel lists the task of its own tasks folder, and its tab opens from the new-tab menu. */
async function expectPlannerWorks(page: Page): Promise<void> {
  await page.getByTestId("project-__workspace__").click();
  if ((await page.getByTestId(PLANNER.icon).getAttribute("aria-pressed")) !== "true") await page.getByTestId(PLANNER.icon).click();
  await panelShown(page, PLANNER.icon);
  const panel = page.frameLocator(PLANNER.panel);
  await expect(panel.getByTestId("view-planner-panel")).toBeVisible();
  await settled(panel);
  await panel.getByTestId("view-all").click();
  await expect(panel.getByTestId("task-title").filter({ hasText: "Pay the tax" })).toBeVisible();
  await openFromMenu(page, PLANNER.menu);
  await expect(page.frameLocator(PLANNER.tab).getByTestId("view-planner-tab")).toBeVisible();
}

/** The Board works: Alpha's Board tab shows the ticket of `tickets/`, and its panel is "Needs you". */
async function expectBoardWorks(page: Page, fixture: PomadeFixture): Promise<void> {
  await page.getByTestId(`project-${fixture.projects.alpha as string}`).click();
  await page.getByTestId(BOARD.icon).click();
  const board = page.frameLocator(BOARD.tab);
  await expect(board.getByTestId("board")).toBeVisible();
  await expect(board.getByTestId("area-solutions")).toHaveText("Solutions1");
  await expect(board.getByTestId("backlog-location")).toContainText("tickets");
  await expect(page.frameLocator(BOARD.panel).getByTestId("view-needs-you-panel")).toBeVisible();
}

test.describe("both apps installed", () => {
  test.describe.configure({ mode: "serial" });
  let fixture: PomadeFixture;
  let app: ElectronApplication | undefined;
  let page: Page;
  const abs = (rel: string) => join(fixture.workspaceRoot, rel);

  test.beforeAll(async () => {
    fixture = await createFixture();
  });

  test.afterAll(async () => {
    await app?.close();
    await fixture.cleanup();
  });

  test("install-app installs both build folders; `pomade apps list` names Planner and Board with their versions", async () => {
    const out = install(fixture);
    expect(out).toContain("Planner 0.1.0 (pomade-planner)");
    expect(out).toContain("Board 0.1.0 (pomade-board)");
    expect(installedApps(fixture)).toEqual(["pomade-board  0.1.0  Board", "pomade-planner  0.1.0  Planner"]);
  });

  test("the new-tab menu lists both apps, each with its name and icon, and each opens its own tab", async () => {
    ({ app, page } = await launchPomade(fixture));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 900));
    await page.locator('[data-testid="tab-add"]:visible').click();
    await expect(page.getByTestId(PLANNER.menu)).toContainText("Planner");
    await expect(page.getByTestId(BOARD.menu)).toContainText("Board");
    await expect(page.getByTestId(PLANNER.menu).locator("img")).toHaveAttribute("src", "pomade-app://pomade-planner/planner.svg");
    await expect(page.getByTestId(BOARD.menu).locator("img")).toHaveAttribute("src", "pomade-app://pomade-board/board.svg");
    await shot(page, "t004-pomade-new-tab-menu");

    await page.getByTestId(BOARD.menu).click();
    await expect(page.getByTestId("tabstrip").getByRole("tab", { name: "Board", selected: true })).toBeVisible();
    await expect(page.frameLocator(BOARD.tab).getByTestId("board")).toBeVisible();
    await expect(page.frameLocator(BOARD.tab).getByTestId("area-solutions")).toHaveText("Solutions1");
    await expect(page.frameLocator(BOARD.tab).getByTestId("view-planner-tab")).toHaveCount(0);
    await shot(page, "t004-pomade-board-tab-from-menu");

    await openFromMenu(page, PLANNER.menu);
    await expect(page.getByTestId("tabstrip").getByRole("tab", { name: "Planner", selected: true })).toBeVisible();
    await expect(page.frameLocator(PLANNER.tab).getByTestId("view-planner-tab")).toBeVisible();
    await expect(page.frameLocator(PLANNER.tab).getByTestId("board")).toHaveCount(0);
    await shot(page, "t004-pomade-planner-tab-from-menu");
  });

  test("each app has its own strip icon and panel", async () => {
    await expect(page.getByTestId(PLANNER.icon)).toHaveAttribute("aria-label", "Planner");
    await expect(page.getByTestId(BOARD.icon)).toHaveAttribute("aria-label", "Board");
    await expect(page.locator('[data-testid^="strip-app-pomade-"]')).toHaveCount(2);
    await expectBoardWorks(page, fixture);
    await expectPlannerWorks(page);
    await shot(page, "t004-pomade-both-apps");
  });

  test("the Board reads its backlog pattern from Apps/pomade-board/settings.json, never from the Planner's file", async () => {
    await page.getByTestId(`project-${fixture.projects.beta as string}`).click();
    await page.getByTestId(BOARD.icon).click();
    const board = page.frameLocator(BOARD.tab);
    // Beta's tickets are only where the Planner's file names a pattern: the Board looks in tickets/ and finds none.
    await expect(board.getByTestId("choose-backlog-state")).toBeVisible();
    await expect(board.getByTestId("choose-backlog-state")).toContainText("tickets");
    await expect(board.getByTestId("board")).toHaveCount(0);
    await shot(page, "t004-pomade-board-own-settings");
  });

  test("the Board's per-project settings and its state are written under pomade-board; the Planner's files stay as they were", async () => {
    await page.getByTestId(`project-${fixture.projects.alpha as string}`).click();
    await page.getByTestId(BOARD.icon).click();
    const board = page.frameLocator(BOARD.tab);
    await expect(board.getByTestId("board")).toBeVisible();
    await board.getByTestId("area-problems").click();
    await board.getByTestId("board-menu-button").click();
    await expect(board.getByTestId("menu-move-done")).toHaveAttribute("aria-checked", "true");
    await board.getByTestId("menu-move-done").click();

    interface Config {
      projects: { id: string; appSettings?: Record<string, unknown> }[];
    }
    const alphaSettings = async () => {
      const config = JSON.parse(await readFile(abs(".pomade/workspace.json"), "utf8")) as Config;
      return config.projects.find((p) => p.id === fixture.projects.alpha)?.appSettings ?? {};
    };
    await expect.poll(alphaSettings).toEqual({ "pomade-board": { moveDoneToDoneFolder: false } });

    const state = async (id: string) => JSON.parse(await readFile(join(fixture.userDataDir, `app-state/${id}/state.json`), "utf8").catch(() => "{}")) as Record<string, unknown>;
    await expect.poll(async () => Object.keys(await state("pomade-board"))).toContain(`board.view.${fixture.projects.alpha as string}`);
    expect(Object.keys(await state("pomade-board")).filter((key) => !key.startsWith("board."))).toEqual([]);
    expect(Object.keys(await state("pomade-planner")).filter((key) => key.startsWith("board."))).toEqual([]);

    expect(await readFile(abs("Apps/pomade-board/settings.json"), "utf8")).toBe(BOARD_SETTINGS);
    expect(await readFile(abs("Apps/pomade-planner/settings.json"), "utf8")).toBe(PLANNER_SETTINGS);
  });

  test("`pomade apps remove pomade-board` leaves the Planner working: the Board's icon and menu row go, its tab says unavailable", async () => {
    expect(remove(fixture, BOARD.id)).toContain("Removed pomade-board");
    expect(installedApps(fixture)).toEqual(["pomade-planner  0.1.0  Planner"]);
    await expect(page.getByTestId(BOARD.icon)).toHaveCount(0);
    await expect(page.getByTestId(PLANNER.icon)).toBeVisible();
    await expect.poll(() => menuApps(page)).toEqual([PLANNER.menu]);
    await expect(page.locator('[data-testid^="app-unavailable-"]:visible').first()).toBeVisible();
    await expectPlannerWorks(page);
    await shot(page, "t004-pomade-planner-alone");
  });
});

test.describe("each app installed alone", () => {
  let fixture: PomadeFixture;
  let app: ElectronApplication | undefined;

  test.beforeEach(async () => {
    fixture = await createFixture();
  });

  test.afterEach(async () => {
    await app?.close();
    app = undefined;
    await fixture.cleanup();
  });

  test("install-app board installs the Board only, and it works with no Planner", async () => {
    const out = install(fixture, "board");
    expect(out).toContain("Board 0.1.0 (pomade-board)");
    expect(out).not.toContain("(pomade-planner)");
    expect(installedApps(fixture)).toEqual(["pomade-board  0.1.0  Board"]);
    let page: Page;
    ({ app, page } = await launchPomade(fixture));
    await expect(page.getByTestId(BOARD.icon)).toBeVisible();
    await expect(page.getByTestId(PLANNER.icon)).toHaveCount(0);
    expect(await menuApps(page)).toEqual([BOARD.menu]);
    await expectBoardWorks(page, fixture);
    await shot(page, "t004-pomade-board-alone");
  });

  test("install-app planner installs the Planner only, with its command, and it works with no Board", async () => {
    const out = install(fixture, "planner");
    expect(out).toContain("Planner 0.1.0 (pomade-planner)");
    expect(out).not.toContain("(pomade-board)");
    expect(installedApps(fixture)).toEqual(["pomade-planner  0.1.0  Planner"]);
    let page: Page;
    ({ app, page } = await launchPomade(fixture));
    await expect(page.getByTestId(PLANNER.icon)).toBeVisible();
    await expect(page.getByTestId(BOARD.icon)).toHaveCount(0);
    expect(await menuApps(page)).toEqual([PLANNER.menu]);
    await expectPlannerWorks(page);
    await app.close();
    app = undefined;
    const today = execFileSync(join(fixture.homeDir, "bin/pomade-planner"), ["today", "--date", "2026-11-18"], { env: pomadeEnv(fixture), encoding: "utf8" });
    expect(today).toContain("Today");
  });

  test("`pomade apps remove pomade-planner` leaves the Board working: the Planner's icon, menu row and command go", async () => {
    install(fixture);
    let page: Page;
    ({ app, page } = await launchPomade(fixture));
    await expect(page.getByTestId(PLANNER.icon)).toBeVisible();
    expect(remove(fixture, PLANNER.id)).toContain("Removed pomade-planner");
    expect(installedApps(fixture)).toEqual(["pomade-board  0.1.0  Board"]);
    await expect(page.getByTestId(PLANNER.icon)).toHaveCount(0);
    await expect.poll(() => menuApps(page)).toEqual([BOARD.menu]);
    await expectBoardWorks(page, fixture);
  });
});
