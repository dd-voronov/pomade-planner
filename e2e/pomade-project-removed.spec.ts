// T-013's acceptance in a real Pomade ($POMADE_DIR, e2e/fixtures/pomade.ts) with both apps
// dev-linked: projects deleted through Pomade's own sidebar (⋯ → Delete → the confirmation) leave
// the Board's "Needs you" list and project chooser and the Planner's All filter without a reload; an
// opened "Needs you" project falls back to the list, and the active project deleted takes the
// Planner panel to the Workspace with the project's tasks under its last-seen name.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test, type ElectronApplication, type FrameLocator, type Page } from "@playwright/test";

import { deltaBacklog, sampleBacklog, under } from "../test/fixtures/backlog";
import { row } from "./fixtures/planner";
import { BOTH_BUILDS, createPomadeFixture, launchPomade, panelShown, type PomadeFixture } from "./fixtures/pomade";
import { shot } from "./fixtures/screens";

const BOARD_ICON = "strip-app-pomade-board-board";
const BOARD_PANEL = '[data-testid="panel-frame-app-pomade-board-board"]';
const PLANNER_ICON = "strip-app-pomade-planner-planner";
const PLANNER_PANEL = '[data-testid="panel-frame-app-pomade-planner-planner"]';
const WORKSPACE = "project-__workspace__";
const TODOS = "Tasks";
const SETTINGS = "Apps/pomade-planner/settings.json";

test.describe("a project deleted in a real Pomade", () => {
  test.describe.configure({ mode: "serial" });
  let fixture: PomadeFixture;
  let app: ElectronApplication | undefined;
  let page: Page;
  const abs = (rel: string) => join(fixture.workspaceRoot, rel);
  const id = (key: string) => fixture.projects[key] ?? "";
  const map = async () => (JSON.parse(await readFile(abs(SETTINGS), "utf8")) as { projectFolders?: Record<string, { folder: string; name: string; groupPath: string[] }> }).projectFolders ?? {};

  /** Delete project `key` the way a person does: its sidebar row's ⋯ → Delete → Delete in the confirmation. */
  async function deleteProject(key: string): Promise<void> {
    await page.getByTestId(`project-${id(key)}`).hover();
    await page.getByTestId(`project-menu-${id(key)}`).click();
    await page.getByTestId(`project-delete-${id(key)}`).click();
    await page.getByTestId("confirm-ok").click();
    await expect(page.getByTestId(`project-${id(key)}`)).toHaveCount(0);
  }

  async function showPanel(icon: string, selector: string): Promise<FrameLocator> {
    if ((await page.getByTestId(icon).getAttribute("aria-pressed")) !== "true") await page.getByTestId(icon).click();
    await panelShown(page, icon);
    return page.frameLocator(selector);
  }

  test.beforeAll(async () => {
    fixture = await createPomadeFixture([
      { key: "alpha", name: "Alpha", root: "Projects/alpha", files: { "README.md": "# Alpha\n", ...under("docs/roadmap", sampleBacklog()) } },
      { key: "delta", name: "Delta", root: "Projects/delta", files: { "README.md": "# Delta\n", ...under("docs/roadmap", deltaBacklog()) } },
      { key: "gamma", name: "Gamma", root: "Projects/gamma", files: { "README.md": "# Gamma\n", ...under("docs/roadmap", deltaBacklog()) } },
      { key: "beta", name: "Beta", root: "Projects/beta", files: { "README.md": "# Beta\n" } },
    ]);
    await mkdir(abs(`${TODOS}/Beta`), { recursive: true });
    await mkdir(abs("Apps/pomade-planner"), { recursive: true });
    await writeFile(abs(SETTINGS), `${JSON.stringify({ tasksRoot: TODOS }, null, 2)}\n`);
    await writeFile(abs(`${TODOS}/Beta/2026-11-10-plan-beta.md`), "---\ntype: task\ntitle: Plan Beta\nstatus: open\ncreated: 2026-11-10\n---\n");
    ({ app, page } = await launchPomade(fixture, { POMADE_DEV_APPS: BOTH_BUILDS }));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1400, 900));
  });

  test.afterAll(async () => {
    await app?.close();
    await fixture.cleanup();
  });

  test("“Needs you” at Workspace: the deleted project leaves the list; deleted while opened, the panel falls back to the list", async () => {
    await page.getByTestId(WORKSPACE).click();
    const p = await showPanel(BOARD_ICON, BOARD_PANEL);
    const view = p.getByTestId("view-needs-you-panel");
    const listed = () => p.getByTestId("needs-you-list-project").evaluateAll((els) => els.map((e) => e.getAttribute("data-project")));
    await expect(view).toHaveAttribute("data-project", "__workspace__");
    await expect.poll(listed).toEqual([id("alpha"), id("delta"), id("gamma")]);

    await p.locator(`[data-testid="needs-you-list-project"][data-project="${id("delta")}"]`).click();
    await expect(view).toHaveAttribute("data-level-project", id("delta"));
    await deleteProject("delta");
    const after = await showPanel(BOARD_ICON, BOARD_PANEL);
    await expect(after.getByTestId("view-needs-you-panel")).toHaveAttribute("data-level", "list");
    await expect.poll(listed).toEqual([id("alpha"), id("gamma")]);
    await expect(after.getByTestId("needs-you-back")).toHaveCount(0);
    await shot(page, "t013-pomade-needs-you-after-delete");
  });

  test("the Board tab at Workspace: the deleted project leaves the chooser", async () => {
    await page.getByTestId(WORKSPACE).click();
    await page.getByTestId(BOARD_ICON).click();
    const chooser = page.frameLocator('[data-testid="app-frame-pomade-board"]:visible');
    const rows = () => chooser.getByTestId("chooser-project").evaluateAll((els) => els.map((e) => e.getAttribute("data-project")));
    await expect(chooser.getByTestId("project-chooser")).toBeVisible();
    await expect.poll(rows).toEqual([id("alpha"), id("gamma")]);
    await deleteProject("gamma");
    await expect.poll(rows).toEqual([id("alpha")]);
    await shot(page, "t013-pomade-chooser-after-delete");
  });

  test("the active project deleted: the Planner panel goes to the Workspace, its tasks under its last-seen name, and it leaves the All filter", async () => {
    await page.getByTestId(`project-${id("beta")}`).click();
    const p = await showPanel(PLANNER_ICON, PLANNER_PANEL);
    await expect(p.getByTestId("planner-where")).toHaveText(`${TODOS}/Beta/`);
    await expect.poll(async () => (await map())[id("beta")]?.folder).toBe("Beta");

    await deleteProject("beta");
    const after = await showPanel(PLANNER_ICON, PLANNER_PANEL);
    await expect(after.getByTestId("view-planner-panel")).toHaveAttribute("data-context", "__workspace__");
    await expect(after.getByTestId("planner-where")).toHaveText(`${TODOS}/`);
    await after.getByTestId("view-all").click();
    await expect(row(after, "Plan Beta").getByTestId("hint-source")).toHaveText("Beta");
    await after.getByTestId("filter-projects").click();
    expect(await after.getByTestId("filter-option").evaluateAll((els) => els.map((el) => el.getAttribute("data-key")))).toEqual(["none", id("alpha")]);
    await page.keyboard.press("Escape");
    await shot(page, "t013-pomade-planner-after-delete");
  });
});
