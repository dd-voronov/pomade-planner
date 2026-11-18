// E-004's acceptance in a real Pomade ($POMADE_DIR, e2e/fixtures/pomade.ts) on real files: the
// app installed into the fixture's user data (its `pomade-planner` command linked into
// POMADE_HOME/bin), a workspace with nested groups and two projects named QuizLab, and the tasks in
// a Knowledge vault folder. Quick add through Pomade's own overlay shortcut, project switches and
// the rename through Pomade's own sidebar and project dialog, the command with Pomade closed, and a
// rename made while Pomade was closed (the workspace config edited, as a sync from another Mac
// would). The Planner's clock is its `test.clock` hook.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { expect, test, type ElectronApplication, type FrameLocator, type Page } from "@playwright/test";

import { quickAdded, row, setClock, titles } from "./fixtures/planner";
import { POMADE_BIN, createPomadeFixture, launchPomade, panelShown, pomadeEnv, type PomadeFixture } from "./fixtures/pomade";
import { shot } from "./fixtures/screens";

const DIST = resolve(import.meta.dirname, "../dist/planner");
const INSTALL_SCRIPT = resolve(import.meta.dirname, "../scripts/install-app.mjs");
const ICON = "strip-app-pomade-planner-planner";
const PANEL = '[data-testid="panel-frame-app-pomade-planner-planner"]';
const OVERLAY = '[data-testid="overlay-frame-pomade-planner"]';
const TODOS = "Knowledge/Notes/To-dos";
const SETTINGS = "Apps/pomade-planner/settings.json";

const task = (title: string, extra: string): string => `---\ntype: task\ntitle: ${title}\nstatus: open\n${extra}created: 2026-11-10\n---\n`;

/** A shell's environment outside Pomade: nothing of Pomade's — the shim sets its own POMADE_HOME. */
function shellEnv(): Record<string, string> {
  return Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined && !e[0].startsWith("POMADE_") && e[0] !== "ELECTRON_RUN_AS_NODE"));
}

test.describe("Planner projects in a real Pomade", () => {
  test.describe.configure({ mode: "serial" });
  let fixture: PomadeFixture;
  let app: ElectronApplication | undefined;
  let page: Page;
  const abs = (rel: string) => join(fixture.workspaceRoot, rel);
  const todo = (rel: string) => abs(`${TODOS}/${rel}`);
  const panel = (): FrameLocator => page.frameLocator(PANEL);
  const ids = () => ({ pomade: fixture.projects.pomade ?? "", quiz: fixture.projects.quizlab ?? "", old: fixture.projects.quizold ?? "" });
  /** The project folders of the tasks root (Daily/ holds the daily notes). */
  const folders = async () => (await readdir(abs(TODOS), { withFileTypes: true })).filter((e) => e.isDirectory() && e.name !== "Daily").map((e) => e.name).sort();
  const map = async () => (JSON.parse(await readFile(abs(SETTINGS), "utf8")) as { projectFolders?: Record<string, { folder: string; name: string; groupPath: string[] }> }).projectFolders ?? {};

  async function launch(): Promise<void> {
    ({ app, page } = await launchPomade(fixture));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1400, 900));
  }

  async function openPanel(): Promise<FrameLocator> {
    if ((await page.getByTestId(ICON).getAttribute("aria-pressed")) !== "true") await page.getByTestId(ICON).click();
    await panelShown(page, ICON);
    await expect(panel().getByTestId("view-planner-panel")).toBeVisible();
    await expect(panel().getByTestId("planner-day")).toBeVisible();
    return panel();
  }

  const goTo = async (project: string) => {
    await page.getByTestId(`project-${project}`).click();
    await expect(panel().getByTestId("view-planner-panel")).toHaveAttribute("data-context", project);
  };

  test.beforeAll(async () => {
    fixture = await createPomadeFixture(
      [
        { key: "pomade", name: "Pomade", root: "Projects/Pomade", files: { "README.md": "# Pomade\n" }, group: "g-build" },
        { key: "quizlab", name: "QuizLab", root: "Projects/QuizLab", files: { "README.md": "# QuizLab\n" }, group: "g-tools" },
        { key: "quizold", name: "QuizLab", root: "Projects/QuizLab-old", files: { "README.md": "# Old QuizLab\n" }, group: "g-archive" },
      ],
      [
        { id: "g-build", name: "Building tools" },
        { id: "g-tools", name: "Tools", parent: "g-build" },
        { id: "g-archive", name: "Archive" },
      ],
    );
    await mkdir(abs("Apps/pomade-planner"), { recursive: true });
    await writeFile(abs(SETTINGS), `${JSON.stringify({ tasksRoot: TODOS }, null, 2)}\n`);
    await mkdir(todo("Pomade"), { recursive: true });
    await writeFile(todo("2026-11-10-pay-the-tax.md"), task("Pay the tax", "deadline: 2026-11-14\n"));
    await writeFile(todo("Pomade/2026-11-16-ship-the-planner.md"), task("Ship the planner", "do-on: 2026-11-17\n"));
    await writeFile(todo("Pomade/2026-11-16-write-release-notes.md"), task("Write release notes", "do-on: 2026-11-24\n"));
    const out = execFileSync(process.execPath, [INSTALL_SCRIPT, DIST], { env: pomadeEnv(fixture, { POMADE_BIN }), encoding: "utf8" });
    expect(out).toContain("Planner 0.1.0 (pomade-planner)");
    await launch();
  });

  test.afterAll(async () => {
    await app?.close();
    await fixture.cleanup();
  });

  test("inside Pomade, quick add files “Fix login bug” into QuizLab via the picker (“qui” finds it): To-dos/QuizLab/; QuizLab's Today has it, Pomade's doesn't", async () => {
    const p = await openPanel();
    await setClock(p, "2026-11-17T10:00");
    await expect(p.getByTestId("planner-day")).toHaveText("Tue, Nov 17");
    await expect(p.getByTestId("planner-where")).toHaveText(`${TODOS}/Pomade/`);
    // The Pomade/ folder that was already there is Pomade's, in the map.
    await expect.poll(() => map()).toEqual({ [ids().pomade]: { folder: "Pomade", name: "Pomade", groupPath: ["Building tools"] } });

    await page.keyboard.press("Meta+Shift+A");
    const overlay = page.frameLocator(OVERLAY);
    await expect(overlay.getByTestId("qa-title")).toBeFocused();
    await expect(overlay.getByTestId("qa-project-name")).toHaveText("Pomade");
    await page.keyboard.type("Fix login bug");
    await overlay.getByTestId("qa-do-on").fill("today");
    await overlay.getByTestId("qa-title").focus();
    await page.keyboard.press("Tab");
    await expect(overlay.getByTestId("qa-project")).toBeFocused();
    await page.keyboard.type("qui");
    await expect(overlay.getByTestId("picker-option-name")).toHaveText(["QuizLab", "QuizLab"]);
    await expect(overlay.locator('[data-testid="picker-option"][aria-selected="true"]')).toContainText("Building tools › Tools");
    await shot(page, "e004-pomade-picker-filtered");
    await page.keyboard.press("Enter");
    await expect(overlay.getByTestId("qa-where")).toHaveText(`in ${TODOS}/QuizLab/`);
    await shot(page, "e004-pomade-quick-add");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app-overlay")).toHaveCount(0);
    expect(await readFile(todo("QuizLab/2026-11-17-fix-login-bug.md"), "utf8")).toBe(quickAdded({ title: "Fix login bug", doOn: "2026-11-17", created: "2026-11-17" }));
    await expect.poll(async () => (await map())[ids().quiz]).toEqual({ folder: "QuizLab", name: "QuizLab", groupPath: ["Building tools", "Tools"] });

    await expect(row(p, "Fix login bug")).toHaveCount(0);
    expect(await titles(p)).toEqual(["Ship the planner"]);
    await goTo(ids().quiz);
    await expect(row(p, "Fix login bug")).toHaveAttribute("data-reason", "planned");
    await expect(p.getByTestId("planner-where")).toHaveText(`${TODOS}/QuizLab/`);
  });

  test("the archived QuizLab, picked group first (Archive → QuizLab), gets its own folder: To-dos/QuizLab (Archive)/", async () => {
    await page.keyboard.press("Meta+Shift+A");
    const overlay = page.frameLocator(OVERLAY);
    await expect(overlay.getByTestId("qa-title")).toBeFocused();
    await page.keyboard.type("Export the old scores");
    await overlay.getByTestId("qa-project").press("ArrowDown");
    await expect(overlay.getByTestId("project-picker")).toHaveAttribute("data-step", "group");
    await expect(overlay.getByTestId("picker-option-name")).toHaveText(["Building tools", "Building tools › Tools", "Archive"]);
    await shot(page, "e004-pomade-picker-groups");
    await page.keyboard.type("arch");
    await page.keyboard.press("Enter");
    await expect(overlay.getByTestId("picker-group")).toHaveText("Archive");
    await page.keyboard.press("Enter");
    await expect(overlay.getByTestId("qa-where")).toHaveText(`in ${TODOS}/QuizLab (Archive)/`);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app-overlay")).toHaveCount(0);
    expect(await readFile(todo("QuizLab (Archive)/2026-11-17-export-the-old-scores.md"), "utf8")).toBe(quickAdded({ title: "Export the old scores", created: "2026-11-17" }));
    await expect.poll(async () => (await map())[ids().old]).toEqual({ folder: "QuizLab (Archive)", name: "QuizLab", groupPath: ["Archive"] });
  });

  test("at Workspace, Today lists the no-project items and each project's Today items under project headings", async () => {
    await page.getByTestId("project-__workspace__").click();
    const p = await openPanel();
    await expect(p.getByTestId("view-planner-panel")).toHaveAttribute("data-context", "__workspace__");
    await expect(p.getByTestId("task-section-name")).toHaveText(["No project", "Pomade", "QuizLab"]);
    expect(await titles(p)).toEqual(["Pay the tax", "Ship the planner", "Fix login bug"]);
    await shot(page, "e004-pomade-workspace-today");
  });

  test("in Pomade, “+ No-project items” mixes them in, each with its source; switching to QuizLab and back restores Pomade's chip and its last view (Project)", async () => {
    await goTo(ids().pomade);
    const p = panel();
    await p.getByTestId("mix-no-project").click();
    await expect(row(p, "Pay the tax").getByTestId("hint-source")).toHaveText("No project");
    expect(await titles(p)).toEqual(["Pay the tax", "Ship the planner"]);
    await shot(page, "e004-pomade-today-mixins");
    await p.getByTestId("view-project").click();
    expect(await titles(p)).toEqual(["Pay the tax", "Ship the planner", "Write release notes"]);
    await shot(page, "e004-pomade-project-view");

    await goTo(ids().quiz);
    await expect(p.getByTestId("view-today")).toHaveAttribute("aria-selected", "true");
    await expect(p.getByTestId("mix-no-project")).toHaveAttribute("aria-pressed", "false");
    expect(await titles(p)).toEqual(["Fix login bug"]);
    await goTo(ids().pomade);
    await expect(p.getByTestId("view-project")).toHaveAttribute("aria-selected", "true");
    await expect(p.getByTestId("mix-no-project")).toHaveAttribute("aria-pressed", "true");
    expect(await titles(p)).toEqual(["Pay the tax", "Ship the planner", "Write release notes"]);
  });

  test("`pomade-planner today` groups by project; --project narrows; a name two projects share asks for one", async () => {
    const shim = join(fixture.homeDir, "bin/pomade-planner");
    const env = shellEnv();
    // The day's daily note, whichever days the Planner ran on before: the command names it.
    await mkdir(todo("Daily"), { recursive: true });
    await writeFile(todo("Daily/2026-11-17.md"), "---\ntype: daily-note\ndate: 2026-11-17\n---\n");
    const all = spawnSync(shim, ["today", "--date", "2026-11-17"], { env, encoding: "utf8" });
    expect(all.stderr).toBe("");
    expect(all.stdout).toBe(
      [
        "Today — Tue, Nov 17, 2026",
        `  Daily note: ${TODOS}/Daily/2026-11-17.md`,
        "",
        "No project",
        "  [ ] Pay the tax — overdue, due Nov 14",
        "",
        "Pomade",
        "  [ ] Ship the planner — planned today",
        "",
        "QuizLab (Building tools › Tools)",
        "  [ ] Fix login bug — planned today",
        "",
      ].join("\n"),
    );
    const shared = spawnSync(shim, ["today", "--project", "QuizLab"], { env, encoding: "utf8" });
    expect(shared.status).toBe(2);
    expect(shared.stderr).toBe('pomade-planner: More than one project is named "QuizLab" — name one of them: "QuizLab (Archive)", "QuizLab (Building tools › Tools)".\n');
    const one = spawnSync(shim, ["today", "--date", "2026-11-17", "--project", "QuizLab (Tools)"], { env, encoding: "utf8" });
    expect(one.stdout).toBe("Today — QuizLab (Building tools › Tools) — Tue, Nov 17, 2026\n  [ ] Fix login bug — planned today\n");
  });

  test("renaming QuizLab in Pomade's sidebar renames To-dos/QuizLab/ and every task stays visible under the new name", async () => {
    await goTo(ids().quiz);
    const p = panel();
    await expect(page.getByTestId(`project-menu-${ids().quiz}`)).toBeAttached();
    await expect(async () => {
      await page.getByTestId(`project-${ids().quiz}`).hover();
      await page.getByTestId(`project-menu-${ids().quiz}`).click({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    await page.getByTestId(`project-edit-${ids().quiz}`).click();
    await page.getByTestId("project-name").fill("QuizLab Pro");
    await page.getByTestId("project-save").click();
    await expect(page.getByTestId("project-modal")).toHaveCount(0);

    await expect.poll(() => folders()).toEqual(["Pomade", "QuizLab (Archive)", "QuizLab Pro"]);
    // The sidebar's menu brings Pomade's Files panel forward: back to the Planner.
    await openPanel();
    expect(await readFile(todo("QuizLab Pro/2026-11-17-fix-login-bug.md"), "utf8")).toContain("title: Fix login bug");
    await expect.poll(async () => (await map())[ids().quiz]).toEqual({ folder: "QuizLab Pro", name: "QuizLab Pro", groupPath: ["Building tools", "Tools"] });
    await expect(p.getByTestId("planner-where")).toHaveText(`${TODOS}/QuizLab Pro/`);
    await expect(row(p, "Fix login bug")).toBeVisible();
    await expect(p.getByTestId("folder-problem")).toHaveCount(0);
    await page.getByTestId("project-__workspace__").click();
    await expect(p.getByTestId("task-section-name")).toHaveText(["No project", "Pomade", "QuizLab Pro"]);
  });

  test("All, filtered to two projects, shows only their items", async () => {
    const p = await openPanel();
    await p.getByTestId("view-all").click();
    await expect.poll(() => titles(p)).toHaveLength(5);
    await p.getByTestId("filter-projects").click();
    await p.locator('[data-testid="filter-option"]').filter({ hasText: "Pomade" }).click();
    await p.locator('[data-testid="filter-option"]').filter({ hasText: "QuizLab Pro" }).click();
    await shot(page, "e004-pomade-all-filter-menu");
    await page.keyboard.press("Escape");
    await expect(p.getByTestId("filter-projects")).toHaveText("2 projects");
    // Same do-on: the earlier created first.
    await expect.poll(() => titles(p)).toEqual(["Ship the planner", "Fix login bug", "Write release notes"]);
    await shot(page, "e004-pomade-all-filtered");
    await p.getByTestId("view-today").click();
  });

  test("a rename onto a folder that is already there is reported in the panel and never merged", async () => {
    await mkdir(todo("Ideas"), { recursive: true });
    await writeFile(todo("Ideas/notes.md"), "mine\n");
    await goTo(ids().pomade);
    const p = panel();
    await expect(async () => {
      await page.getByTestId(`project-${ids().pomade}`).hover();
      await page.getByTestId(`project-menu-${ids().pomade}`).click({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    await page.getByTestId(`project-edit-${ids().pomade}`).click();
    await page.getByTestId("project-name").fill("Ideas");
    await page.getByTestId("project-save").click();
    await expect(page.getByTestId("project-modal")).toHaveCount(0);
    await openPanel();
    await expect(p.getByTestId("folder-problem")).toContainText(`“Ideas” can't take ${TODOS}/Ideas/ — a folder with that name is already there. Its tasks stay in ${TODOS}/Pomade/`);
    await shot(page, "e004-pomade-rename-collision");
    expect(await readdir(todo("Ideas"))).toEqual(["notes.md"]);
    expect((await readdir(todo("Pomade"))).sort()).toEqual(["2026-11-16-ship-the-planner.md", "2026-11-16-write-release-notes.md"]);
    await expect(row(p, "Ship the planner")).toBeVisible();
  });

  test("renamed while Pomade was closed: on the next open the folder follows, through the map and the stable id", async () => {
    await app?.close();
    app = undefined;
    // Another Mac renamed the project to "Pomade App", synced through the workspace config.
    const configPath = abs(".pomade/workspace.json");
    const config = JSON.parse(await readFile(configPath, "utf8")) as { projects: { id: string; name: string }[] };
    await writeFile(configPath, JSON.stringify({ ...config, projects: config.projects.map((x) => (x.id === ids().pomade ? { ...x, name: "Pomade App" } : x)) }));
    await launch();
    await goTo(ids().pomade);
    const p = await openPanel();
    await expect.poll(() => folders()).toEqual(["Ideas", "Pomade App", "QuizLab (Archive)", "QuizLab Pro"]);
    await expect(p.getByTestId("planner-where")).toHaveText(`${TODOS}/Pomade App/`);
    await expect(row(p, "Ship the planner")).toBeVisible();
    await expect(p.getByTestId("folder-problem")).toHaveCount(0);
    await expect.poll(async () => (await map())[ids().pomade]?.folder).toBe("Pomade App");
  });
});
