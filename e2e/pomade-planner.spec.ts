// E-003's acceptance in a real Pomade ($POMADE_DIR, e2e/fixtures/pomade.ts) with the app installed
// into the fixture's user data — so Pomade links its `pomade-planner` command into the fixture's
// POMADE_HOME/bin — against a workspace with QuizLab and a Knowledge vault folder for the tasks.
// The Planner's clock is its `test.clock` hook (e2e/fixtures/planner.ts); the folder picker is
// Pomade's NODE_ENV=test hook. Real files, real watcher, real overlay, real restarts.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { expect, test, type ElectronApplication, type FrameLocator, type Page } from "@playwright/test";

import { quickAdded, row, setClock, settled, ticked, titles } from "./fixtures/planner";
import { APP_VERSION, POMADE_BIN, createPomadeFixture, launchPomade, panelShown, pomadeEnv, queuePickerAnswers, type PomadeFixture } from "./fixtures/pomade";
import { shot } from "./fixtures/screens";

const DIST = resolve(import.meta.dirname, "../dist/planner");
const INSTALL_SCRIPT = resolve(import.meta.dirname, "../scripts/install-app.mjs");
const ICON = "strip-app-pomade-planner-planner";
const PANEL = '[data-testid="panel-frame-app-pomade-planner-planner"]';
const OVERLAY = '[data-testid="overlay-frame-pomade-planner"]';
const TODOS = "Knowledge/Notes/To-dos";

/** A shell's environment outside Pomade: nothing of Pomade's — the shim sets its own POMADE_HOME. */
function shellEnv(): Record<string, string> {
  return Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined && !e[0].startsWith("POMADE_") && e[0] !== "ELECTRON_RUN_AS_NODE"));
}

test.describe("the Planner in a real Pomade", () => {
  test.describe.configure({ mode: "serial" });
  let fixture: PomadeFixture;
  let app: ElectronApplication | undefined;
  let page: Page;
  const abs = (rel: string) => join(fixture.workspaceRoot, rel);
  const todo = (name: string) => abs(`${TODOS}/${name}`);
  const panel = (): FrameLocator => page.frameLocator(PANEL);

  /** Pomade on the fixture, at Workspace: every workspace-level task shows there. */
  async function launch(): Promise<void> {
    ({ app, page } = await launchPomade(fixture));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1400, 900));
    await page.getByTestId("project-__workspace__").click();
  }

  async function quit(): Promise<void> {
    await app?.close();
    app = undefined;
  }

  async function openPanel(): Promise<FrameLocator> {
    if ((await page.getByTestId(ICON).getAttribute("aria-pressed")) !== "true") await page.getByTestId(ICON).click();
    await panelShown(page, ICON);
    await expect(panel().getByTestId("view-planner-panel")).toBeVisible();
    return panel();
  }

  /** The visible list's rows as the command reports them: title, reason (Today) and whether done. */
  async function shownToday(p: FrameLocator): Promise<{ title: string; reason: string; done: boolean; path: string }[]> {
    return p.locator('[data-testid="task-row"]').evaluateAll((els) =>
      els.map((el) => ({
        title: el.querySelector('[data-testid="task-title"]')?.textContent ?? "",
        reason: el.getAttribute("data-reason") ?? "",
        done: el.getAttribute("data-done") === "true",
        path: el.getAttribute("data-path") ?? "",
      })),
    );
  }

  test.beforeAll(async () => {
    fixture = await createPomadeFixture([
      { key: "alpha", name: "Alpha", root: "Projects/alpha", files: { "README.md": "# Alpha\n" } },
      { key: "quizlab", name: "QuizLab", root: "Projects/QuizLab", files: { "README.md": "# QuizLab\n" } },
    ]);
    // The vault folder the tasks will live in, with a note of Daniil's that isn't a task.
    await mkdir(abs(TODOS), { recursive: true });
    await writeFile(todo("index.md"), "# To-dos\n\nMy lists.\n");
    const out = execFileSync(process.execPath, [INSTALL_SCRIPT, DIST], { env: pomadeEnv(fixture, { POMADE_BIN }), encoding: "utf8" });
    expect(out).toContain(`Planner ${APP_VERSION} (pomade-planner)`);
    await launch();
  });

  test.afterAll(async () => {
    await app?.close();
    await fixture.cleanup();
  });

  test("first open asks for the tasks folder; the vault folder chosen is saved and only the day's daily note is made in it", async () => {
    const p = await openPanel();
    await expect(p.getByTestId("view-title")).toHaveText("Where should your tasks live?");
    await shot(page, "e003-pomade-onboarding");
    const chosen = await realpath(abs(TODOS));
    await queuePickerAnswers(app, [chosen]);
    await p.getByTestId("choose-tasks-root").click();
    await expect(p.getByTestId("today-empty")).toBeVisible();
    expect(JSON.parse(await readFile(abs("Apps/pomade-planner/settings.json"), "utf8"))).toEqual({ tasksRoot: TODOS });
    await settled(p);
    expect(await readdir(abs(TODOS))).toEqual(["Daily", "index.md"]);
    expect(await readdir(abs(`${TODOS}/Daily`))).toHaveLength(1);
    await setClock(p, "2026-11-17T10:00");
    await expect(p.getByTestId("planner-day")).toHaveText("Tue, Nov 17");
    await shot(page, "e003-pomade-empty-today");
  });

  test("the panel wears Pomade's theme and tokens: light on its root (also from a Pomade that names no theme), Pomade's --bg and --text", async () => {
    const p = await openPanel();
    const root = p.locator("html");
    await expect(root).toHaveAttribute("data-theme", "light");
    await expect(root).toHaveCSS("color-scheme", "light");
    await expect(root).toHaveCSS("color", "rgb(31, 41, 51)");
    await expect(root).toHaveCSS("background-color", "rgb(250, 251, 252)");
  });

  test("files added in Finder or Obsidian appear within ~1 s, a deleted one disappears; yesterday's do-on shows as “planned 1 day ago”; a broken one is greyed", async () => {
    const p = await openPanel();
    await writeFile(todo("2026-11-16-call-the-dentist.md"), "---\ntype: task\ntitle: Call the dentist\nstatus: open\ndo-on: 2026-11-16\ncreated: 2026-11-16\n---\n");
    await writeFile(todo("2026-11-10-pay-the-tax.md"), "---\ntype: task\ntitle: Pay the tax\nstatus: open\ndeadline: 2026-11-14\nimportance: 5\ncreated: 2026-11-10\n---\n");
    await writeFile(todo("2026-11-17-water-plants.md"), "---\ntype: task\ntitle: Water the plants\nstatus: open\ndo-on: 2026-11-17\ncreated: 2026-11-17\n---\n");
    await writeFile(todo("2026-11-17-broken.md"), "---\ntype: task\ntitle: [unclosed\n---\n");
    await writeFile(todo("2026-11-17-gone.md"), "---\ntype: task\ntitle: Short-lived\nstatus: open\ndo-on: 2026-11-17\n---\n");
    await expect(row(p, "Call the dentist")).toBeVisible({ timeout: 1_500 });
    await expect(row(p, "Call the dentist").getByTestId("hint-rolled")).toHaveText("planned 1 day ago");
    await expect(row(p, "Short-lived")).toBeVisible({ timeout: 1_500 });
    await rm(todo("2026-11-17-gone.md"));
    await expect(row(p, "Short-lived")).toHaveCount(0, { timeout: 1_500 });
    expect(await titles(p)).toEqual(["Pay the tax", "Call the dentist", "Water the plants"]);
    await expect(p.getByTestId("unreadable-row")).toHaveAttribute("data-path", `${TODOS}/2026-11-17-broken.md`);
    await expect(row(p, "index")).toHaveCount(0);
    await shot(page, "e003-pomade-today");
  });

  test("from a terminal tab at Workspace, ⌘⇧A opens quick add; “Renew Nora's swimming class”, deadline fri, Enter → the file in the tasks root, focus back in the terminal", async () => {
    await page.getByTestId("tab-add").click();
    await page.getByTestId("tab-add-terminal").click();
    const terminal = page.locator('[data-term-id][data-status="live"]:visible');
    await expect(terminal).toHaveCount(1);
    await terminal.click();
    await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains("xterm-helper-textarea") ?? false)).toBe(true);
    await page.evaluate(() => {
      (document.activeElement as HTMLElement).dataset.focusMark = "terminal";
    });

    await page.keyboard.press("Meta+Shift+A");
    await expect(page.getByTestId("app-overlay")).toBeVisible();
    const overlay = page.frameLocator(OVERLAY);
    await expect(overlay.getByTestId("qa-title")).toBeFocused();
    await page.keyboard.type("Renew Nora's swimming class");
    await overlay.getByTestId("qa-deadline").fill("fri");
    await expect(overlay.getByTestId("qa-deadline-resolved")).toHaveText("Fri, Nov 20");
    await expect(overlay.getByTestId("qa-title")).toHaveValue("Renew Nora's swimming class");
    await shot(page, "e003-pomade-quick-add-over-terminal");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app-overlay")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.focusMark ?? null)).toBe("terminal");

    const path = todo("2026-11-17-renew-noras-swimming-class.md");
    expect(await readFile(path, "utf8")).toBe(quickAdded({ title: "Renew Nora's swimming class", deadline: "2026-11-20", created: "2026-11-17" }));
  });

  test("Esc in quick add closes it without writing and focus returns to the terminal", async () => {
    await page.keyboard.press("Meta+Shift+A");
    await expect(page.getByTestId("app-overlay")).toBeVisible();
    await expect(page.frameLocator(OVERLAY).getByTestId("qa-title")).toBeFocused();
    await page.keyboard.type("Never mind");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app-overlay")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.focusMark ?? null)).toBe("terminal");
    expect((await readdir(abs(TODOS))).filter((n) => n.includes("never-mind"))).toEqual([]);
  });

  test("the swimming task is not in Tuesday's Today, shows on Friday as due today and on Saturday as overdue", async () => {
    const p = await openPanel();
    await expect(row(p, "Renew Nora's swimming class")).toHaveCount(0);
    await p.getByTestId("view-all").click();
    await expect(row(p, "Renew Nora's swimming class").getByTestId("hint-deadline")).toHaveText("due Fri");
    await p.getByTestId("view-today").click();
    await setClock(p, "2026-11-20T10:00");
    await expect(p.getByTestId("planner-day")).toHaveText("Fri, Nov 20");
    await expect(row(p, "Renew Nora's swimming class")).toHaveAttribute("data-reason", "due-today");
    await setClock(p, "2026-11-21T10:00");
    await expect(row(p, "Renew Nora's swimming class")).toHaveAttribute("data-reason", "overdue");
    await expect(row(p, "Renew Nora's swimming class").getByTestId("hint-deadline")).toHaveText("due yesterday");
  });

  test("ticking at 01:30 keeps the task crossed out; at 03:00 the boundary timer takes it out of Today; All with Show done still has it", async () => {
    const p = await openPanel();
    await setClock(p, "2026-11-21T01:30");
    await expect(p.getByTestId("planner-day")).toHaveText("Fri, Nov 20");
    const path = todo("2026-11-17-renew-noras-swimming-class.md");
    const before = await readFile(path, "utf8");
    await row(p, "Renew Nora's swimming class").getByTestId("task-check").check();
    await expect.poll(() => readFile(path, "utf8")).toBe(ticked(before, "2026-11-20"));
    await expect(row(p, "Renew Nora's swimming class")).toHaveAttribute("data-done", "true");
    await shot(page, "e003-pomade-ticked");

    // Pomade stays open over the boundary: only the timer moves the day.
    await setClock(p, "2026-11-21T02:59:58.500");
    await expect(row(p, "Renew Nora's swimming class")).toHaveAttribute("data-done", "true");
    await expect(p.getByTestId("planner-day")).toHaveText("Sat, Nov 21", { timeout: 5_000 });
    await expect(row(p, "Renew Nora's swimming class")).toHaveCount(0);

    await p.getByTestId("view-all").click();
    await p.getByTestId("show-done").check();
    await expect(row(p, "Renew Nora's swimming class")).toHaveAttribute("data-done", "true");
    await expect(row(p, "Renew Nora's swimming class").getByTestId("hint-done")).toHaveText("done yesterday");
    await shot(page, "e003-pomade-all-show-done");
  });

  test("⌘-click on a row opens its file in an editor tab", async () => {
    const p = await openPanel();
    await row(p, "Pay the tax").getByTestId("task-open").click({ modifiers: ["Meta"] });
    await expect(page.getByTestId("tabstrip").getByRole("tab", { name: /2026-11-10-pay-the-tax/, selected: true })).toBeVisible();
  });

  test("the panel's ⋯ opens the settings page in a tab", async () => {
    const p = await openPanel();
    await p.getByTestId("planner-menu-button").click();
    await p.getByTestId("menu-settings").click();
    const tab = page.frameLocator('[data-testid="app-frame-pomade-planner"]:visible');
    await expect(tab.getByTestId("planner-settings-page")).toBeVisible();
    await expect(tab.getByTestId("settings-tasks-root")).toHaveText(`${TODOS}/`);
    await expect(tab.getByTestId("settings-boundary")).toHaveValue("3:00");
    await shot(page, "e003-pomade-settings");
    await tab.getByTestId("settings-back").click();
    await expect(tab.getByTestId("view-planner-tab")).toBeVisible();
    await shot(page, "e003-pomade-planner-tab");
  });

  test("`pomade-planner today --json` with Pomade closed prints the same items as the Today view, each with its reason", async () => {
    const p = await openPanel();
    await p.getByTestId("view-today").click();
    await setClock(p, "2026-11-17T10:00");
    await expect(p.getByTestId("planner-day")).toHaveText("Tue, Nov 17");
    // Something ticked today, so a crossed-out row is part of the comparison.
    await row(p, "Water the plants").getByTestId("task-check").check();
    await expect(row(p, "Water the plants")).toHaveAttribute("data-done", "true");
    await expect.poll(() => readFile(todo("2026-11-17-water-plants.md"), "utf8")).toContain("done-on: 2026-11-17");
    const shown = await shownToday(p);
    expect(shown.map((r) => r.title)).toEqual(["Pay the tax", "Call the dentist", "Water the plants"]);
    // Leave the view on All: the next launch must open there.
    await p.getByTestId("view-all").click();
    await expect(p.getByTestId("list-all")).toBeVisible();

    await quit();
    const shim = join(fixture.homeDir, "bin/pomade-planner");
    const env = shellEnv();
    const r = spawnSync(shim, ["today", "--json", "--date", "2026-11-17"], { env, encoding: "utf8" });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    const report = JSON.parse(r.stdout) as { day: string; items: { title: string; reason: string; status: string; path: string }[] };
    expect(report.day).toBe("2026-11-17");
    expect(report.items.map((i) => ({ title: i.title, reason: i.reason, done: i.status === "done", path: i.path }))).toEqual(shown);

    const text = spawnSync(shim, ["today", "--date", "2026-11-17"], { env, encoding: "utf8" });
    expect(text.stdout).toContain("  [x] Water the plants — planned today\n");
    // No tasks root → a readable error, exit 1.
    await writeFile(abs("Apps/pomade-planner/settings.json"), "{}\n");
    const none = spawnSync(shim, ["today"], { env, encoding: "utf8" });
    expect(none.status).toBe(1);
    expect(none.stderr).toContain("No tasks folder is set");
    await writeFile(abs("Apps/pomade-planner/settings.json"), `${JSON.stringify({ tasksRoot: TODOS }, null, 2)}\n`);
  });

  test("after a restart the tasks folder is still chosen and the Planner opens on the last view", async () => {
    await launch();
    // The view is remembered per context: Workspace was active when it was left on All.
    const p = await openPanel();
    await expect(p.getByTestId("view-all")).toHaveAttribute("aria-selected", "true");
    await expect(p.getByTestId("show-done")).toBeChecked();
    await expect(row(p, "Pay the tax")).toBeVisible();
    await p.getByTestId("view-today").click();
    await expect(p.getByTestId("planner-day")).toBeVisible();
  });
});
