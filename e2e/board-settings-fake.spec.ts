// T-023 on pomade-kit's fake host (fixture test/fixtures/workspace.ts): the Board's default backlog
// folder, and its settings page — the workspace's default folder, a folder per project, the
// reporter of new tickets — with every open board following a change. Screenshots of every state.

import { expect, test, type FrameLocator, type Page } from "@playwright/test";

import { BOARD_URL, HARNESS_PORT } from "../playwright.config";
import { ticketFile } from "../test/fixtures/backlog";
import { boxOf, card, column, createdTicket } from "./fixtures/board";
import { shot } from "./fixtures/screens";

const SETTINGS = "Apps/pomade-board/settings.json";
const DELTA = "Projects/delta/private/roadmap";

function harness(project: string, options: { manual?: boolean; theme?: "dark" } = {}): string {
  const params = new URLSearchParams({ app: BOARD_URL, surface: "tab", icon: "board", project });
  if (options.manual) params.set("mount", "manual");
  if (options.theme) params.set("theme", options.theme);
  return `http://localhost:${HARNESS_PORT}/index.html?${params.toString()}`;
}

const frame = (page: Page, nth = 0): FrameLocator => page.frameLocator(`#stage iframe >> nth=${nth}`);

test.use({ viewport: { width: 1280, height: 800 } });

let pageErrors: Error[] = [];

test.beforeEach(({ page }) => {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e));
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

const readOrNull = (page: Page, path: string) =>
  page.evaluate((p) => {
    try {
      return window.fakeHost.readFile(p);
    } catch {
      return null;
    }
  }, path);
const writeFile = (page: Page, path: string, content: string) => page.evaluate(([p, c]) => window.fakeHost.writeFile(p, c), [path, content] as const);
const focusedTestId = (app: FrameLocator) => app.locator(":root").evaluate(() => document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.tagName ?? null);

/** Every `project.setSettings` the app made, in order. */
const settingsWrites = (page: Page) => page.evaluate(() => window.hostCalls.filter((c) => c.method === "project.setSettings").map((c) => c.params));
/** How many times the app wrote or created the synced settings file. */
const fileWrites = (page: Page) =>
  page.evaluate((path) => window.hostCalls.filter((c) => (c.method === "files.write" || c.method === "files.create") && (c.params as { path?: string }).path === path).length, SETTINGS);

/** The Board tab of `project` (`workspace`: the chooser), then its settings page through the gear. */
async function openSettings(page: Page, project: string, options: { theme?: "dark" } = {}): Promise<FrameLocator> {
  await page.goto(harness(project, options));
  const app = frame(page);
  await app.getByTestId("board-settings").click();
  await expect(app.getByTestId("board-settings-page")).toBeVisible();
  await expect(app.getByTestId("settings-pattern")).toBeVisible();
  return app;
}

/** The per-project rows as the page lists them: `[project id, folder]`. */
const folderRows = (app: FrameLocator) =>
  app.getByTestId("settings-folder").evaluateAll((rows) => rows.map((row) => [row.getAttribute("data-project"), row.querySelector('[data-testid="settings-folder-path"]')?.textContent]));

test.describe("the default folder", () => {
  test("with no settings file a project's backlog is read from private/roadmap/; tickets only in docs/roadmap/ ask for the folder", async ({ page }) => {
    await page.goto(harness("alpha"));
    const app = frame(page);
    await expect(card(app, "P-001")).toBeVisible();
    await expect(card(app, "P-001")).toHaveAttribute("data-path", /^Projects\/alpha\/private\/roadmap\//);
    await expect(app.getByTestId("backlog-location")).toHaveText("private/roadmap");
    expect(await readOrNull(page, SETTINGS)).toBeNull();

    await page.goto(harness("beta", { manual: true }));
    await writeFile(page, "Projects/beta/docs/roadmap/E-030-old-place.md", ticketFile({ id: "E-030", kind: "epic", title: "In the old place", status: "planned" }));
    await page.evaluate(() => window.mountNow());
    await expect(frame(page).getByTestId("choose-backlog-state")).toContainText("Beta has no private/roadmap/ folder.");
    await expect(frame(page).getByTestId("choose-backlog")).toHaveText("Choose backlog folder");
    await expect(frame(page).getByTestId("card")).toHaveCount(0);
  });
});

test.describe("the settings page", () => {
  test("⚙ in the Board's header opens it and ← Board leaves it; it is the same page whichever project is active", async ({ page }) => {
    await page.goto(harness("alpha"));
    const app = frame(page);
    await expect(app.getByTestId("board")).toBeVisible();
    await expect(app.getByTestId("board-settings")).toHaveAttribute("aria-label", "Settings");
    await shot(page, "t023-board-header");
    // The gear closes the header, 2px right of ⋯ (the Planner's header actions), on the same line.
    const gear = await boxOf(app.getByTestId("board-settings"));
    const menu = await boxOf(app.getByTestId("board-menu-button"));
    expect(gear.x - (menu.x + menu.width)).toBe(2);
    expect(gear.y).toBe(menu.y);
    expect([gear.width, gear.height]).toEqual([24, 24]);

    await app.getByTestId("board-settings").click();
    const settingsPage = app.getByTestId("board-settings-page");
    await expect(settingsPage).toBeVisible();
    await expect(app.getByTestId("settings-back")).toHaveText("← Board");
    await expect(settingsPage.locator(".settings__section")).toHaveText(["Backlog folder", "New tickets"]);
    await expect(settingsPage.locator(".settings__name")).toHaveText(["Default for this workspace", "Folder for a project", "Reporter"]);
    await expect(app.getByTestId("settings-pattern")).toHaveValue("private/roadmap/");
    await expect(app.getByTestId("settings-reporter")).toHaveValue("d.voronov");
    expect(await folderRows(app)).toEqual([["gamma", "plans/"]]);
    await expect(app.getByTestId("board")).toHaveCount(0);
    await shot(page, "t023-settings-light");

    // Another project active, and Workspace: the page stays, with the same content.
    await page.evaluate(() => window.fakeHost.setActiveProject("delta"));
    await expect(settingsPage).toBeVisible();
    expect(await folderRows(app)).toEqual([["gamma", "plans/"]]);
    await page.evaluate(() => window.fakeHost.setActiveProject(null));
    await expect(settingsPage).toBeVisible();
    await expect(app.getByTestId("settings-pattern")).toHaveValue("private/roadmap/");

    await app.getByTestId("settings-back").click();
    await expect(app.getByTestId("project-chooser")).toBeVisible();
    await expect(settingsPage).toHaveCount(0);
    // Nothing was written by looking.
    expect(await readOrNull(page, SETTINGS)).toBeNull();
    expect(await settingsWrites(page)).toEqual([]);
  });

  test("it opens from “Choose a project” at Workspace", async ({ page }) => {
    await page.goto(harness("workspace"));
    const app = frame(page);
    await expect(app.getByTestId("project-chooser")).toBeVisible();
    await expect(app.getByTestId("chooser-project")).toHaveCount(4);
    // The gear sits on the title's line, at the right edge of the list's column.
    const gear = await boxOf(app.getByTestId("board-settings"));
    const title = await boxOf(app.getByTestId("view-title"));
    const row = await boxOf(app.getByTestId("chooser-project").first());
    expect(Math.round(gear.x + gear.width)).toBe(Math.round(row.x + row.width));
    expect(Math.abs(gear.y + gear.height / 2 - (title.y + title.height / 2))).toBeLessThanOrEqual(0.5);
    await shot(page, "t023-chooser");

    await app.getByTestId("board-settings").click();
    await expect(app.getByTestId("board-settings-page")).toBeVisible();
    await expect(app.getByTestId("settings-pattern")).toHaveValue("private/roadmap/");
    expect(await folderRows(app)).toEqual([["gamma", "plans/"]]);
    await app.getByTestId("settings-back").click();
    await expect(app.getByTestId("project-chooser")).toBeVisible();
  });

  test("the default field writes backlogPathPattern and keeps the file's other keys; the board re-reads from the new folder; emptied, the key goes", async ({ page }) => {
    await page.goto(harness("alpha", { manual: true }));
    await writeFile(page, SETTINGS, '{\n  "reporter": "a.person",\n  "somethingElse": [1, 2]\n}\n');
    await writeFile(page, "Projects/alpha/tickets/E-050-elsewhere.md", ticketFile({ id: "E-050", kind: "epic", title: "Elsewhere", status: "planned" }));
    await page.evaluate(() => window.mountNow());
    const app = frame(page);
    await expect(card(app, "P-001")).toBeVisible();
    await app.getByTestId("board-settings").click();
    const field = app.getByTestId("settings-pattern");
    await expect(field).toHaveValue("private/roadmap/");

    await field.fill("  tickets ");
    await field.press("Enter");
    await expect(app.getByTestId("settings-saved")).toHaveText("Default folder saved.");
    await expect(field).toHaveValue("tickets/");
    expect(await readOrNull(page, SETTINGS)).toBe('{\n  "reporter": "a.person",\n  "somethingElse": [\n    1,\n    2\n  ],\n  "backlogPathPattern": "tickets/"\n}\n');

    await app.getByTestId("settings-back").click();
    await expect(app.getByTestId("backlog-location")).toHaveText("tickets");
    await app.getByTestId("area-solutions").click();
    await expect(card(app, "E-050")).toHaveAttribute("data-path", "Projects/alpha/tickets/E-050-elsewhere.md");
    await expect(card(app, "E-001")).toHaveCount(0);

    // Emptied — here by leaving the field — the key goes and the built-in default is back.
    await app.getByTestId("board-settings").click();
    await expect(field).toHaveValue("tickets/");
    await field.fill("");
    await app.getByTestId("settings-reporter").focus();
    await expect(app.getByTestId("settings-saved")).toHaveText("The default folder is private/roadmap/ again.");
    await expect(field).toHaveValue("private/roadmap/");
    expect(await readOrNull(page, SETTINGS)).toBe('{\n  "reporter": "a.person",\n  "somethingElse": [\n    1,\n    2\n  ]\n}\n');
    await app.getByTestId("settings-back").click();
    await expect(app.getByTestId("backlog-location")).toHaveText("private/roadmap");
    await expect(card(app, "E-001")).toBeVisible();
  });

  test("an absolute path, or one that climbs out of the project, is refused with a message and nothing is written", async ({ page }) => {
    const app = await openSettings(page, "alpha");
    const field = app.getByTestId("settings-pattern");
    for (const typed of ["/Users/me/roadmap", "../roadmap", "docs/../../roadmap"]) {
      await field.fill(typed);
      await field.press("Enter");
      await expect(app.getByTestId("settings-pattern-error")).toHaveText("A folder inside each project, like private/roadmap/ — not an absolute path or one that leaves the project.");
      await expect(field).toHaveAttribute("aria-invalid", "true");
      await expect(field).toHaveValue(typed);
    }
    await shot(page, "t023-settings-error");
    expect(await readOrNull(page, SETTINGS)).toBeNull();
    expect(await fileWrites(page)).toBe(0);

    // The same folder as now, however it is typed, is no change: no file is made for it.
    await field.fill("./private//roadmap");
    await field.press("Enter");
    await expect(app.getByTestId("settings-pattern-error")).toHaveCount(0);
    await expect(field).toHaveValue("private/roadmap/");
    expect(await readOrNull(page, SETTINGS)).toBeNull();
    expect(await fileWrites(page)).toBe(0);
  });

  test("a settings file that isn't JSON: the page says so, and a save refuses to write over it", async ({ page }) => {
    await page.goto(harness("alpha", { manual: true }));
    await writeFile(page, SETTINGS, "{ not json");
    await page.evaluate(() => window.mountNow());
    const app = frame(page);
    await app.getByTestId("board-settings").click();
    await expect(app.getByTestId("settings-problem")).toContainText("Apps/pomade-board/settings.json is not valid JSON");
    await app.getByTestId("settings-pattern").fill("tickets");
    await app.getByTestId("settings-pattern").press("Enter");
    await expect(app.getByTestId("settings-pattern-error")).toContainText("Not saved: Apps/pomade-board/settings.json is not valid JSON");
    await expect(app.getByTestId("settings-pattern-error")).toContainText("Fix the file first.");
    expect(await readOrNull(page, SETTINGS)).toBe("{ not json");
  });

  test("Add a project… → the project → its folder stores backlogPath; the row appears and that project's board reads the folder; × clears it", async ({ page }) => {
    const app = await openSettings(page, "alpha");
    expect(await folderRows(app)).toEqual([["gamma", "plans/"]]);

    // The picker offers the projects without a folder of their own, in the sidebar's order with their group.
    await app.getByTestId("settings-add-project").click();
    const picker = app.getByTestId("project-picker");
    await expect(picker).toBeVisible();
    await expect(picker.getByTestId("project-filter")).toBeFocused();
    expect(await picker.getByTestId("project-option").evaluateAll((els) => els.map((el) => [el.getAttribute("data-id"), el.textContent]))).toEqual([
      ["alpha", "AlphaBuilding tools"],
      ["delta", "DeltaBuilding tools"],
      ["beta", "Beta"],
      ["scale", "Scale"],
    ]);
    await shot(page, "t023-settings-picker");

    // Escape closes it, focus back on the button; nothing was asked or stored.
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
    expect(await focusedTestId(app)).toBe("settings-add-project");
    expect(await page.evaluate(() => window.fakeHost.pickRequests.length)).toBe(0);

    // Typing filters; Enter picks; then Pomade's folder dialog, bounded by that project.
    await page.evaluate(() => window.fakeHost.answerPick("Projects/beta/tickets"));
    await app.getByTestId("settings-add-project").click();
    await picker.getByTestId("project-filter").fill("bet");
    await expect(picker.getByTestId("project-option")).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(picker).toHaveCount(0);
    await expect(app.getByTestId("settings-saved")).toHaveText("Folder for Beta saved.");
    expect(await page.evaluate(() => window.fakeHost.pickRequests.at(-1))).toEqual({ kind: "folder", root: "Projects/beta", initial: "Projects/beta" });
    expect(await settingsWrites(page)).toEqual([{ projectId: "beta", settings: { backlogPath: "tickets" } }]);
    await expect.poll(() => folderRows(app)).toEqual([
      ["gamma", "plans/"],
      ["beta", "tickets/"],
    ]);
    await shot(page, "t023-settings-two-rows");

    // Beta has its folder now: the picker no longer offers it.
    await app.getByTestId("settings-add-project").click();
    await expect(picker.getByTestId("project-option")).toHaveCount(3);
    await expect(picker.locator('[data-testid="project-option"][data-id="beta"]')).toHaveCount(0);
    await picker.getByTestId("project-picker-cancel").click();

    // Beta's board reads the folder.
    await page.evaluate(() => window.fakeHost.setActiveProject("beta"));
    await app.getByTestId("settings-back").click();
    await expect(app.getByTestId("board")).toHaveAttribute("data-project", "beta");
    await expect(app.getByTestId("backlog-location")).toHaveText("tickets");
    await app.getByTestId("area-solutions").click();
    await expect(card(app, "E-010")).toHaveAttribute("data-path", "Projects/beta/tickets/E-010-beta-epic.md");

    // × puts the project back on the default: the key is removed, the row goes, the board asks again.
    await app.getByTestId("board-settings").click();
    await app.locator('[data-testid="settings-folder"][data-project="beta"]').getByTestId("settings-folder-remove").click();
    await expect(app.getByTestId("settings-saved")).toHaveText("Beta uses the default folder again.");
    await expect.poll(() => folderRows(app)).toEqual([["gamma", "plans/"]]);
    expect((await settingsWrites(page)).at(-1)).toEqual({ projectId: "beta", settings: { backlogPath: null } });
    await app.getByTestId("settings-back").click();
    await expect(app.getByTestId("choose-backlog-state")).toContainText("Beta has no private/roadmap/ folder.");
  });

  test("Change… re-points a project's row; a cancelled dialog and a folder outside the project store nothing; with no row the list says so", async ({ page }) => {
    const app = await openSettings(page, "alpha");
    const gamma = app.locator('[data-testid="settings-folder"][data-project="gamma"]');

    // Cancel, then a folder of another project (the dialog refuses it): nothing is stored.
    await page.evaluate(() => window.fakeHost.answerPick(null));
    await gamma.getByTestId("settings-folder-change").click();
    await expect.poll(() => page.evaluate(() => window.fakeHost.pickRequests.length)).toBe(1);
    await page.evaluate(() => window.fakeHost.answerPick("Projects/alpha/private"));
    await gamma.getByTestId("settings-folder-change").click();
    await expect.poll(() => page.evaluate(() => window.fakeHost.pickRequests.length)).toBe(2);
    expect(await page.evaluate(() => window.fakeHost.pickRequests.at(-1))).toEqual({ kind: "folder", root: "Projects/gamma", initial: "Projects/gamma" });
    expect(await settingsWrites(page)).toEqual([]);
    expect(await folderRows(app)).toEqual([["gamma", "plans/"]]);
    await expect(app.getByTestId("settings-folder-error")).toHaveCount(0);

    // The project's own root is a folder like any other.
    await page.evaluate(() => window.fakeHost.answerPick("Projects/gamma"));
    await gamma.getByTestId("settings-folder-change").click();
    await expect(app.getByTestId("settings-saved")).toHaveText("Folder for Gamma saved.");
    await expect.poll(() => folderRows(app)).toEqual([["gamma", "./"]]);
    expect(await settingsWrites(page)).toEqual([{ projectId: "gamma", settings: { backlogPath: "" } }]);

    await gamma.getByTestId("settings-folder-remove").click();
    await expect(app.getByTestId("settings-folders-none")).toHaveText("Every project uses the default.");
    await expect(app.getByTestId("settings-folder")).toHaveCount(0);
    await shot(page, "t023-settings-empty-list");
  });

  test("the reporter saved on the page is written on the next ticket the Board creates; emptied, it is d.voronov again", async ({ page }) => {
    await page.goto(harness("delta"));
    const app = frame(page);
    await app.getByTestId("area-solutions").click();

    // ⋯ keeps the project's two items; the reporter is on the page.
    await app.getByTestId("board-menu-button").click();
    await expect(app.getByTestId("board-menu").getByRole("menuitemcheckbox")).toHaveText(["Move done epics and tasks to done/"]);
    await expect(app.getByTestId("board-menu").getByRole("menuitem")).toHaveText(["Change backlog folder…"]);
    await shot(page, "t023-board-menu");
    await page.keyboard.press("Escape");

    await app.getByTestId("board-settings").click();
    const field = app.getByTestId("settings-reporter");
    await expect(field).toHaveValue("d.voronov");

    // A handle with a space is refused, nothing written.
    await field.fill("Daniil Voronov");
    await field.press("Enter");
    await expect(app.getByTestId("settings-reporter-error")).toHaveText("A handle without spaces, like d.voronov.");
    expect(await readOrNull(page, SETTINGS)).toBeNull();

    await field.fill("a.person");
    await field.press("Enter");
    await expect(app.getByTestId("settings-saved")).toHaveText("Reporter saved.");
    await expect(app.getByTestId("settings-reporter-error")).toHaveCount(0);
    expect(await readOrNull(page, SETTINGS)).toBe('{\n  "reporter": "a.person"\n}\n');

    await app.getByTestId("settings-back").click();
    await column(app, "planned").getByTestId("column-add").click();
    await app.getByTestId("kind-task").check();
    await app.getByTestId("create-title").fill("Mine");
    await app.getByTestId("create-submit").click();
    await expect.poll(() => readOrNull(page, `${DELTA}/T-042-mine.md`)).toBe(createdTicket({ id: "T-042", kind: "task", title: "Mine", status: "planned", reporter: "a.person" }));
    await expect(card(app, "T-042").getByTestId("card-reporter")).toHaveText("a.person");

    // Emptied: the key goes, the default is back; other keys stay.
    await writeFile(page, SETTINGS, '{\n  "backlogPathPattern": "private/roadmap/",\n  "reporter": "a.person"\n}\n');
    await app.getByTestId("board-settings").click();
    await expect(field).toHaveValue("a.person");
    await field.fill("");
    await field.press("Enter");
    await expect(app.getByTestId("settings-saved")).toHaveText("The reporter is d.voronov again.");
    await expect(field).toHaveValue("d.voronov");
    expect(await readOrNull(page, SETTINGS)).toBe('{\n  "backlogPathPattern": "private/roadmap/"\n}\n');
    await app.getByTestId("settings-back").click();
    await column(app, "planned").getByTestId("column-add").click();
    await app.getByTestId("kind-task").check();
    await app.getByTestId("create-title").fill("Default again");
    await app.getByTestId("create-submit").click();
    await expect.poll(() => readOrNull(page, `${DELTA}/T-043-default-again.md`)).toBe(createdTicket({ id: "T-043", kind: "task", title: "Default again", status: "planned" }));
  });
});

test.describe("every open board follows the page", () => {
  test("a second Board tab re-points when the default changes, and when a project's folder is added and removed — without a reload", async ({ page }) => {
    await page.goto(harness("beta", { manual: true }));
    await writeFile(page, "Projects/beta/elsewhere/E-060-third-place.md", ticketFile({ id: "E-060", kind: "epic", title: "Third place", status: "planned" }));
    await page.evaluate(() => {
      window.mountNow();
      window.mountNow({ surface: "tab", icon: "board" });
    });
    const settings = frame(page, 0);
    const other = frame(page, 1);
    await expect(settings.getByTestId("choose-backlog-state")).toBeVisible();
    await expect(other.getByTestId("choose-backlog-state")).toContainText("Beta has no private/roadmap/ folder.");

    // The page is reached at Workspace here (Beta's tab has no board yet); the other tab stays on Beta.
    await page.evaluate(() => window.fakeHost.setActiveProject(null));
    await settings.getByTestId("board-settings").click();
    await page.evaluate(() => window.fakeHost.setActiveProject("beta"));
    await expect(settings.getByTestId("board-settings-page")).toBeVisible();
    await expect(other.getByTestId("choose-backlog-state")).toBeVisible();

    // The default.
    await settings.getByTestId("settings-pattern").fill("tickets/");
    await settings.getByTestId("settings-pattern").press("Enter");
    await expect(other.getByTestId("backlog-location")).toHaveText("tickets");
    await other.getByTestId("area-solutions").click();
    await expect(card(other, "E-010")).toBeVisible();

    // A folder for the project.
    await page.evaluate(() => window.fakeHost.answerPick("Projects/beta/elsewhere"));
    await settings.getByTestId("settings-add-project").click();
    await settings.locator('[data-testid="project-option"][data-id="beta"]').click();
    await expect(other.getByTestId("backlog-location")).toHaveText("elsewhere");
    await expect(card(other, "E-060")).toBeVisible();
    await expect(card(other, "E-010")).toHaveCount(0);

    // Removed: back on the default.
    await settings.locator('[data-testid="settings-folder"][data-project="beta"]').getByTestId("settings-folder-remove").click();
    await expect(other.getByTestId("backlog-location")).toHaveText("tickets");
    await expect(card(other, "E-010")).toBeVisible();

    // The default emptied: the built-in one, where Beta has nothing.
    await settings.getByTestId("settings-pattern").fill("");
    await settings.getByTestId("settings-pattern").press("Enter");
    await expect(other.getByTestId("choose-backlog-state")).toContainText("Beta has no private/roadmap/ folder.");
  });

  test("the default changed in the file itself (another Mac, a pull) re-points an open board and the chooser, and shows on the page", async ({ page }) => {
    await page.goto(harness("beta"));
    const app = frame(page);
    await expect(app.getByTestId("choose-backlog-state")).toBeVisible();
    await writeFile(page, SETTINGS, '{ "backlogPathPattern": "tickets/" }\n');
    await expect(app.getByTestId("backlog-location")).toHaveText("tickets");

    await page.evaluate(() => window.fakeHost.setActiveProject(null));
    await expect(app.locator('[data-testid="chooser-project"][data-project="beta"]')).toBeVisible();
    await expect(app.locator('[data-testid="chooser-project"][data-project="alpha"]')).toHaveCount(0);
    await page.evaluate((path) => window.fakeHost.deleteFile(path), SETTINGS);
    await expect(app.locator('[data-testid="chooser-project"][data-project="alpha"]')).toBeVisible();
    await expect(app.locator('[data-testid="chooser-project"][data-project="beta"]')).toHaveCount(0);

    await app.getByTestId("board-settings").click();
    await expect(app.getByTestId("settings-pattern")).toHaveValue("private/roadmap/");
    await writeFile(page, SETTINGS, '{ "backlogPathPattern": "plans/", "reporter": "claude" }\n');
    await expect(app.getByTestId("settings-pattern")).toHaveValue("plans/");
    await expect(app.getByTestId("settings-reporter")).toHaveValue("claude");
  });
});

test.describe("how it looks", () => {
  test("dark, and long names: a long project name, group and folder shorten inside their row; the buttons keep their place", async ({ page }) => {
    await page.goto(harness("alpha", { manual: true, theme: "dark" }));
    await writeFile(page, "Projects/delta/a/very/deep/folder/of/tickets/kept/far/from/the/root/E-070-deep.md", ticketFile({ id: "E-070", kind: "epic", title: "Deep", status: "planned" }));
    await page.evaluate(() => {
      window.fakeHost.updateProject("delta", { name: "A project whose name is much longer than the row it is listed in" });
      window.fakeHost.updateProject("scale", { name: "Another project with a long name to pick from the list" });
      window.mountNow();
    });
    const app = frame(page);
    await expect(app.locator("html")).toHaveAttribute("data-theme", "dark");
    await app.getByTestId("board-settings").click();
    await page.evaluate(() => window.fakeHost.answerPick("Projects/delta/a/very/deep/folder/of/tickets/kept/far/from/the/root"));
    await app.getByTestId("settings-add-project").click();
    await shot(page, "t023-settings-picker-long-dark");
    await app.locator('[data-testid="project-option"][data-id="delta"]').click();
    const row = app.locator('[data-testid="settings-folder"][data-project="delta"]');
    await expect(row).toBeVisible();
    await shot(page, "t023-settings-dark");

    // Nothing leaves the row; the name and the folder are cut with an ellipsis, the buttons are whole.
    const rowBox = await boxOf(row);
    const list = await boxOf(app.getByTestId("settings-folders"));
    expect(rowBox.width).toBe(list.width);
    for (const testId of ["settings-folder-path", "settings-folder-change", "settings-folder-remove"]) {
      const box = await boxOf(row.getByTestId(testId));
      expect(box.x).toBeGreaterThanOrEqual(rowBox.x);
      expect(box.x + box.width).toBeLessThanOrEqual(rowBox.x + rowBox.width);
    }
    const clipped = (testIdOrClass: string) => row.locator(testIdOrClass).evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(await clipped(".settings__item-name")).toBe(true);
    expect(await clipped('[data-testid="settings-folder-path"]')).toBe(true);
    await expect(row.getByTestId("settings-folder-path")).toHaveAttribute("title", "Projects/delta/a/very/deep/folder/of/tickets/kept/far/from/the/root");
    const change = await boxOf(row.getByTestId("settings-folder-change"));
    const gammaChange = await boxOf(app.locator('[data-testid="settings-folder"][data-project="gamma"]').getByTestId("settings-folder-change"));
    expect(change.x).toBe(gammaChange.x);
    expect(change.width).toBe(gammaChange.width);
  });

  test("a narrow tab: the rows stack, nothing is clipped at the right edge", async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 800 });
    const app = await openSettings(page, "alpha");
    const frameBox = await boxOf(page.locator("#stage iframe"));
    for (const testId of ["settings-pattern", "settings-folders", "settings-add-project", "settings-reporter"]) {
      const box = await boxOf(app.getByTestId(testId));
      expect(box.x).toBeGreaterThanOrEqual(frameBox.x + 16);
      expect(box.x + box.width).toBeLessThanOrEqual(frameBox.x + frameBox.width - 16);
    }
    await shot(page, "t023-settings-narrow");
  });
});
