// E-003's last two boxes in a real Pomade ($POMADE_DIR, e2e/fixtures/pomade.ts) with the app
// installed into the fixture's user data: the panel's + opens quick add as Pomade's overlay
// (`overlay.open`) over the active tab — a terminal, an editor — with its pre-fills, and Esc gives
// the focus back to the +; All's select mode deletes two files through `files.delete`, one of them
// open in an editor with unsaved edits, whose buffer stays while Pomade says the file is gone.
// Deletes go to the real macOS Trash: the files carry this run's unique suffix, and teardown
// removes exactly those from ~/.Trash.

import { execFileSync } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test, type ElectronApplication, type FrameLocator, type Page } from "@playwright/test";

import { quickAdded, row, settled } from "./fixtures/planner";
import { APP_VERSION, POMADE_BIN, createPomadeFixture, launchPomade, panelShown, pomadeEnv, type PomadeFixture } from "./fixtures/pomade";
import { shot } from "./fixtures/screens";

const DIST = resolve(import.meta.dirname, "../dist/planner");
const INSTALL_SCRIPT = resolve(import.meta.dirname, "../scripts/install-app.mjs");
const ICON = "strip-app-pomade-planner-planner";
const PANEL = '[data-testid="panel-frame-app-pomade-planner-planner"]';
const OVERLAY = '[data-testid="overlay-frame-pomade-planner"]';
const TODOS = "To-dos";
const SETTINGS = "Apps/pomade-planner/settings.json";
const TRASH = join(homedir(), ".Trash");

const task = (title: string, extra = ""): string => `---\ntype: task\ntitle: ${title}\nstatus: open\n${extra}created: 2026-11-10\n---\n\nSome notes.\n`;

const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

test.describe("quick add from + and bulk delete in a real Pomade", () => {
  test.describe.configure({ mode: "serial" });
  let fixture: PomadeFixture;
  let app: ElectronApplication | undefined;
  let page: Page;
  const run = `${String(process.pid)}-${String(Date.now())}`;
  const DIRTY = `2026-11-10-trim-dirty-${run}.md`;
  const PLAIN = `2026-11-10-trim-plain-${run}.md`;
  const trashed: string[] = [];
  const abs = (rel: string) => join(fixture.workspaceRoot, rel);
  const todo = (name: string) => abs(`${TODOS}/${name}`);
  const panel = (): FrameLocator => page.frameLocator(PANEL);
  const overlay = (): FrameLocator => page.frameLocator(OVERLAY);
  const vis = (sel: string) => page.locator(`${sel}:visible`);
  const quiz = () => fixture.projects.quizlab as string;

  async function openPanel(): Promise<FrameLocator> {
    if ((await page.getByTestId(ICON).getAttribute("aria-pressed")) !== "true") await page.getByTestId(ICON).click();
    await panelShown(page, ICON);
    await expect(panel().getByTestId("view-planner-panel")).toBeVisible();
    await settled(panel());
    return panel();
  }

  async function view(p: FrameLocator, id: "today" | "all"): Promise<void> {
    await p.getByTestId(`view-${id}`).click();
    await expect(p.getByTestId(`view-${id}`)).toHaveAttribute("aria-selected", "true");
  }

  /** Focus is back on the panel's + — Pomade's focus in the panel frame, the frame's on the button. */
  async function focusOnPlus(p: FrameLocator): Promise<void> {
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null)).toBe("panel-frame-app-pomade-planner-planner");
    await expect(p.getByTestId("planner-add")).toBeFocused();
  }

  /** The visible editor in raw mode (its toggle flips raw ↔ live). */
  async function rawMode(): Promise<void> {
    const toggle = vis('[data-testid="mode-toggle"]');
    await expect(toggle).toBeVisible();
    if ((await toggle.getAttribute("data-mode")) !== "raw") await toggle.click();
    await expect(toggle).toHaveAttribute("data-mode", "raw");
  }

  test.beforeAll(async () => {
    fixture = await createPomadeFixture([
      { key: "alpha", name: "Alpha", root: "Projects/alpha", files: { "README.md": "# Alpha\n" } },
      { key: "quizlab", name: "QuizLab", root: "Projects/QuizLab", files: { "README.md": "# QuizLab\n" } },
    ]);
    await mkdir(abs("Apps/pomade-planner"), { recursive: true });
    await writeFile(abs(SETTINGS), `${JSON.stringify({ tasksRoot: TODOS, projectFolders: { [quiz()]: { folder: "QuizLab", name: "QuizLab", groupPath: [] } } }, null, 2)}\n`);
    await mkdir(todo("QuizLab"), { recursive: true });
    await writeFile(todo("2026-11-10-pay-the-tax.md"), task("Pay the tax", "deadline: 2026-11-20\n"));
    await writeFile(todo("QuizLab/2026-11-10-fix-the-timer.md"), task("Fix the timer", "do-on: 2026-11-17\n"));
    await writeFile(todo(DIRTY), task("Old shopping list"));
    await writeFile(todo(PLAIN), task("Old packing list"));
    const out = execFileSync(process.execPath, [INSTALL_SCRIPT, DIST], { env: pomadeEnv(fixture, { POMADE_BIN }), encoding: "utf8" });
    expect(out).toContain(`Planner ${APP_VERSION} (pomade-planner)`);
    const state = join(fixture.userDataDir, "app-state/pomade-planner");
    await mkdir(state, { recursive: true });
    await writeFile(join(state, "state.json"), JSON.stringify({ "test.clock": { offsetMs: new Date("2026-11-17T10:00").getTime() - Date.now() } }));
    ({ app, page } = await launchPomade(fixture));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1400, 900));
    await page.getByTestId("project-__workspace__").click();
  });

  test.afterAll(async () => {
    await app?.close();
    await fixture.cleanup();
    for (const name of trashed) {
      await rm(join(TRASH, name), { force: true });
      expect(await exists(join(TRASH, name)), `${name} left in the Trash`).toBe(false);
    }
  });

  test("over a terminal: + on Today opens quick add as Pomade's overlay with do-on today; Esc puts the focus back on +; Enter adds the task", async () => {
    await page.getByTestId("tab-add").click();
    await page.getByTestId("tab-add-terminal").click();
    await expect(page.locator('[data-term-id][data-status="live"]:visible')).toHaveCount(1);
    const p = await openPanel();
    await view(p, "today");

    await p.getByTestId("planner-add").click();
    await expect(page.getByTestId("app-overlay")).toBeVisible();
    await expect(overlay().getByTestId("qa-title")).toBeFocused();
    await expect(overlay().getByTestId("qa-do-on")).toHaveValue("today");
    await expect(overlay().getByTestId("qa-do-on-resolved")).toHaveText("Tue, Nov 17");
    await expect(overlay().getByTestId("qa-project-name")).toHaveText("No project");
    // Over the terminal's area, not squeezed into the panel.
    const card = await page.locator(OVERLAY).boundingBox();
    const side = await page.locator(PANEL).boundingBox();
    expect(card?.width).toBeGreaterThan(400);
    expect((card?.x ?? 0) >= (side?.x ?? 0) + (side?.width ?? 0)).toBe(true);
    await page.keyboard.type("Call the bank");
    await shot(page, "e003-pomade-plus-over-terminal");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app-overlay")).toHaveCount(0);
    await focusOnPlus(p);
    expect(await exists(todo("2026-11-17-call-the-bank.md"))).toBe(false);

    await page.keyboard.press("Enter");
    await expect(overlay().getByTestId("qa-title")).toBeFocused();
    await page.keyboard.type("Call the bank");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app-overlay")).toHaveCount(0);
    await focusOnPlus(p);
    await expect.poll(() => readFile(todo("2026-11-17-call-the-bank.md"), "utf8").catch(() => null)).toBe(quickAdded({ title: "Call the bank", doOn: "2026-11-17", created: "2026-11-17" }));
    await expect(row(p, "Call the bank")).toBeVisible();
  });

  test("over an editor in QuizLab: + on All opens it with no do-on and QuizLab as the project; Esc puts the focus back on +", async () => {
    await page.getByTestId(`project-${quiz()}`).click();
    // A file of QuizLab's own, from Pomade's file tree: the Planner opens its tasks in the Workspace that holds them.
    await page.locator('[data-testid^="tree-node-"][data-testid$="README.md"]').click();
    await expect(vis('[data-testid="mode-toggle"]')).toBeVisible();
    await expect(page.getByTestId(`project-${quiz()}`)).toHaveAttribute("data-active", "true");
    const p = await openPanel();
    await view(p, "all");

    await p.getByTestId("planner-add").click();
    await expect(page.getByTestId("app-overlay")).toBeVisible();
    await expect(overlay().getByTestId("qa-title")).toBeFocused();
    await expect(overlay().getByTestId("qa-do-on")).toHaveValue("");
    await expect(overlay().getByTestId("qa-project-name")).toHaveText("QuizLab");
    await expect(overlay().getByTestId("qa-where")).toHaveText(`in ${TODOS}/QuizLab/`);
    await shot(page, "e003-pomade-plus-over-editor");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app-overlay")).toHaveCount(0);
    await focusOnPlus(p);
  });

  test("bulk delete of two files, one open with unsaved edits: the confirmation lists both; they leave To-dos for the Trash; the open one keeps its buffer and Pomade says it's gone", async () => {
    await page.getByTestId("project-__workspace__").click();
    let p = await openPanel();
    await view(p, "all");
    await row(p, "Old shopping list").getByTestId("task-open").click({ modifiers: ["Meta"] });
    await rawMode();
    await vis('[data-testid="raw-editor"] .cm-content').click();
    await page.keyboard.press("Meta+ArrowUp");
    await page.keyboard.type("MINE ");
    await expect(vis('[data-testid="doc-save"]')).toHaveAttribute("data-saved", "false");

    p = await openPanel();
    await p.getByTestId("planner-menu-button").click();
    await p.getByTestId("menu-select").click();
    await expect(p.getByTestId("select-bar")).toBeVisible();
    await row(p, "Old shopping list").getByTestId("select-row").click();
    await row(p, "Old packing list").getByTestId("select-row").click();
    await shot(page, "e003-pomade-select-mode");
    await p.getByTestId("select-delete").click();
    await expect(p.getByTestId("delete-confirm-title")).toHaveText("Delete 2 files?");
    await expect(p.getByTestId("delete-confirm")).toContainText("They go to the macOS Trash — Finder can put them back.");
    await expect(p.getByTestId("delete-file")).toHaveCount(2);
    expect((await p.getByTestId("delete-file").evaluateAll((els) => els.map((el) => el.getAttribute("data-path")))).sort()).toEqual([`${TODOS}/${DIRTY}`, `${TODOS}/${PLAIN}`].sort());
    await shot(page, "e003-pomade-delete-confirm");
    await p.getByTestId("delete-confirm-button").click();
    trashed.push(DIRTY, PLAIN);

    await expect(p.getByTestId("delete-confirm")).toHaveCount(0);
    await expect(row(p, "Old shopping list")).toHaveCount(0);
    await expect(row(p, "Old packing list")).toHaveCount(0);
    await expect(p.getByTestId("select-bar")).toHaveCount(0);
    await expect(p.getByTestId("planner-error")).toHaveCount(0);
    expect(await exists(todo(DIRTY))).toBe(false);
    expect(await exists(todo(PLAIN))).toBe(false);
    expect(await exists(join(TRASH, DIRTY))).toBe(true);
    expect(await exists(join(TRASH, PLAIN))).toBe(true);
    await expect(row(p, "Pay the tax")).toBeVisible();

    // Rule 8: the editor keeps the unsaved text and says the file is gone.
    await expect(vis('[data-testid="editor-missing"]')).toHaveText(/This file no longer exists on disk/);
    const buffer = await vis('[data-testid="raw-editor"] .cm-content').innerText();
    expect(buffer.startsWith("MINE ---")).toBe(true);
    await expect(vis('[data-testid="doc-save"]')).toHaveAttribute("data-saved", "false");
    await shot(page, "e003-pomade-deleted-file-in-editor");
  });
});
