// E-013's acceptance in a real Pomade ($POMADE_DIR, e2e/fixtures/pomade.ts) with the app installed
// into the fixture's user data: an item added from the quick-add overlay shows in the Planner — the
// side panel comes forward on the Planner at the item, whether it showed the Planner, the file tree,
// or nothing (collapsed), and an open Planner tab follows too; the view is one that lists the item,
// its row marked; the keyboard focus stays where Pomade returns it, never in a Planner frame. The
// panel's + and Add button open the form beside the panel every time, ⌘⇧A where the user left it.

import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { expect, test, type ElectronApplication, type FrameLocator, type Page } from "@playwright/test";

import { frameShown } from "./fixtures/frames";
import { row, settled } from "./fixtures/planner";
import { APP_VERSION, POMADE_BIN, createPomadeFixture, launchPomade, panelShown, pomadeEnv, type PomadeFixture } from "./fixtures/pomade";
import { shot } from "./fixtures/screens";

const DIST = resolve(import.meta.dirname, "../dist/planner");
const INSTALL_SCRIPT = resolve(import.meta.dirname, "../scripts/install-app.mjs");
const ICON = "strip-app-pomade-planner-planner";
const PANEL_FRAME = "panel-frame-app-pomade-planner-planner";
const TAB_FRAME = "app-frame-pomade-planner";
const OVERLAY_FRAME = "overlay-frame-pomade-planner";
const TODOS = "To-dos";

test.describe("after an add from the overlay, the Planner shows the item, in a real Pomade", () => {
  test.describe.configure({ mode: "serial" });
  let fixture: PomadeFixture;
  let app: ElectronApplication | undefined;
  let page: Page;
  const read = (name: string) => readFile(join(fixture.workspaceRoot, TODOS, name), "utf8").catch(() => null);
  const panel = (): FrameLocator => page.frameLocator(`[data-testid="${PANEL_FRAME}"]`);
  const tab = (): FrameLocator => page.frameLocator(`[data-testid="${TAB_FRAME}"]:visible`);
  const overlay = (): FrameLocator => page.frameLocator(`[data-testid="${OVERLAY_FRAME}"]`);
  /** The test id of the element Pomade's own document has its focus on: the frame the keys go to. */
  const pomadeFocus = () => page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null);
  const editor = () => page.locator(".cm-content:visible");

  /** Select a view; a click sent in a frame Pomade has just shown can be lost, so it is sent until it took. */
  async function view(frame: FrameLocator, id: "today" | "project"): Promise<void> {
    await expect(async () => {
      await frame.getByTestId(`view-${id}`).click();
      await expect(frame.getByTestId(`view-${id}`)).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
    }).toPass();
  }

  async function openPanel(): Promise<FrameLocator> {
    if ((await page.getByTestId(ICON).getAttribute("aria-pressed")) !== "true") await page.getByTestId(ICON).click();
    await panelShown(page, ICON);
    await expect(panel().getByTestId("view-planner-panel")).toBeVisible();
    await settled(panel());
    return panel();
  }

  /** The editor tab of notes.md, its text focused: where the keyboard is when ⌘⇧A is pressed. */
  async function focusEditor(): Promise<void> {
    await page.getByTestId("tabstrip").getByRole("tab", { name: /notes\.md/ }).click();
    await editor().click();
    await expect(editor()).toBeFocused();
  }

  /** ⌘⇧A, a title, the type walked to with ⌥Tab (`steps` from Task), and `keys` to add. */
  async function quickAdd(title: string, keys: string, steps = 0): Promise<void> {
    await page.keyboard.press("Meta+Shift+A");
    await expect(page.getByTestId("app-overlay")).toBeVisible();
    await expect(overlay().getByTestId("qa-title")).toBeFocused();
    await page.keyboard.type(title);
    for (let i = 0; i < steps; i++) await page.keyboard.press("Alt+Tab");
    await page.keyboard.press(keys);
    await expect(page.getByTestId("app-overlay")).toHaveCount(0);
  }

  /** The Planner's panel is in front, on `id`, with the row of `title` marked. */
  async function panelOn(id: "today" | "project", title: string): Promise<void> {
    await expect(page.getByTestId("side-panel")).toBeVisible();
    await expect(page.getByTestId(ICON)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(`[data-testid="${PANEL_FRAME}"]`)).toBeVisible();
    await expect(panel().getByTestId(`view-${id}`)).toHaveAttribute("aria-selected", "true");
    await expect(row(panel(), title)).toHaveAttribute("data-added", "");
    await expect(panel().locator(".task-row[data-added]")).toHaveCount(1);
  }

  /** Drag the overlay card by its handle by (dx, dy). */
  async function dragOverlay(dx: number, dy: number): Promise<void> {
    const h = await page.getByTestId("app-overlay-handle").boundingBox();
    if (h === null) throw new Error("no overlay handle");
    const [x, y] = [h.x + h.width / 2, h.y + h.height / 2];
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
    await page.mouse.move(x + dx, y + dy, { steps: 4 });
    await page.mouse.up();
  }
  const cardAt = async () => {
    const card = await page.getByTestId("app-overlay-card").boundingBox();
    return { x: card?.x ?? NaN, y: card?.y ?? NaN };
  };

  test.beforeAll(async () => {
    fixture = await createPomadeFixture([{ key: "alpha", name: "Alpha", root: "Projects/alpha", files: { "README.md": "# Alpha\n" } }]);
    await mkdir(join(fixture.workspaceRoot, "Apps/pomade-planner"), { recursive: true });
    await writeFile(join(fixture.workspaceRoot, "Apps/pomade-planner/settings.json"), `${JSON.stringify({ tasksRoot: TODOS }, null, 2)}\n`);
    await mkdir(join(fixture.workspaceRoot, TODOS), { recursive: true });
    await writeFile(join(fixture.workspaceRoot, TODOS, "2026-11-10-pay-the-tax.md"), "---\ntype: task\ntitle: Pay the tax\nstatus: open\ndo-on: 2026-11-17\ncreated: 2026-11-10\n---\n");
    await writeFile(join(fixture.workspaceRoot, "notes.md"), "# Notes\n\nSomething to type in.\n");
    const out = execFileSync(process.execPath, [INSTALL_SCRIPT, DIST], { env: pomadeEnv(fixture, { POMADE_BIN }), encoding: "utf8" });
    expect(out).toContain(`Planner ${APP_VERSION} (pomade-planner)`);
    const state = join(fixture.userDataDir, "app-state/pomade-planner");
    await mkdir(state, { recursive: true });
    await writeFile(join(state, "state.json"), JSON.stringify({ "test.clock": { offsetMs: new Date("2026-11-17T10:00").getTime() - Date.now() } }));
    ({ app, page } = await launchPomade(fixture));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1400, 900));
    await page.getByTestId("project-__workspace__").click();
    // The panel is the launch frame: it makes the day's note before anything else is looked at.
    await openPanel();
    await page.getByTestId("strip-files").click();
    await page.getByTestId("tree-node-notes.md").click();
    await expect(editor()).toBeVisible();
  });

  test.afterAll(async () => {
    await app?.close();
    await fixture.cleanup();
  });

  test("the panel on Today: ⌘⇧A, a thought, ⌘↵ — the panel shows it in its list, on Project, marked; the editor keeps the keyboard", async () => {
    const p = await openPanel();
    await view(p, "today");
    await focusEditor();
    await quickAdd("Why do I sleep badly on Sundays", "Meta+Enter", 3);
    await expect.poll(() => read("2026-11-17-why-do-i-sleep-badly-on-sundays.md")).toContain("type: thought\n");
    await panelOn("project", "Why do I sleep badly on Sundays");
    await expect(editor()).toBeFocused();
    await shot(page, "e013-pomade-panel-thought");
  });

  test("the side panel on the file tree: the add brings the Planner panel forward on the item, the editor keeping the keyboard; collapsed: it expands on it; ⇧⌘↵ — the item's editor tab opens, the Planner takes no focus", async () => {
    await page.getByTestId("strip-files").click();
    await expect(page.getByTestId("strip-files")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(`[data-testid="${PANEL_FRAME}"]`)).toBeHidden();
    await focusEditor();
    await quickAdd("Someday maybe", "Enter");
    await panelOn("project", "Someday maybe");
    await expect(page.getByTestId("side-panel-files")).toBeHidden();
    await expect(editor()).toBeFocused();
    await shot(page, "e013-pomade-panel-forward-from-files");

    await page.getByTestId("side-panel-collapse").click();
    await expect(page.getByTestId("side-panel")).toBeHidden();
    await focusEditor();
    await quickAdd("Post the parcel", "Shift+Meta+Enter");
    await panelOn("project", "Post the parcel");
    await expect(page.getByTestId("tabstrip").getByRole("tab", { name: /2026-11-17-post-the-parcel/, selected: true })).toBeVisible();
    // The Planner takes no focus: where Pomade puts it after the overlay's editor tab is Pomade's.
    expect([PANEL_FRAME, TAB_FRAME, OVERLAY_FRAME]).not.toContain(await pomadeFocus());
    await shot(page, "e013-pomade-panel-forward-from-collapsed");
  });

  test("the Planner tab on Today, ⌘⇧A from it: the tab goes to Project on the item, marked, and keeps the keyboard; the panel follows too", async () => {
    await page.getByTestId("tab-add").click();
    await page.getByTestId("tab-add-app-pomade-planner").click();
    await expect(tab().getByTestId("view-planner-tab")).toBeVisible();
    await frameShown(page);
    await view(tab(), "today");
    await view(panel(), "today");
    await tab().getByTestId("view-today").focus();
    await expect.poll(pomadeFocus).toBe(TAB_FRAME);
    await quickAdd("Fix the gate", "Enter");
    await expect(tab().getByTestId("view-project")).toHaveAttribute("aria-selected", "true");
    await expect(row(tab(), "Fix the gate")).toHaveAttribute("data-added", "");
    await panelOn("project", "Fix the gate");
    await expect.poll(pomadeFocus).toBe(TAB_FRAME);
    await shot(page, "e013-pomade-tab-follows");
  });

  test("the panel's + and Add button open the form beside the panel every time, wherever ⌘⇧A's form was dragged; ⌘⇧A opens where it was left", async () => {
    await focusEditor();
    await page.keyboard.press("Meta+Shift+A");
    await expect(page.getByTestId("app-overlay")).toBeVisible();
    const centred = await cardAt();
    await dragOverlay(-200, 120);
    const left = await cardAt();
    expect(left).toEqual({ x: centred.x - 200, y: centred.y + 120 });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app-overlay")).toHaveCount(0);

    const p = await openPanel();
    await view(p, "project");
    for (const opener of ["planner-add", "add-item"]) {
      await p.getByTestId(opener).click();
      await expect(overlay().getByTestId("qa-title")).toBeFocused();
      const pane = await page.getByTestId("app-overlay").boundingBox();
      expect(await cardAt()).toEqual({ x: (pane?.x ?? 0) + 16, y: (pane?.y ?? 0) + 16 });
      await shot(page, `e013-pomade-${opener}-beside-panel`);
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("app-overlay")).toHaveCount(0);
    }

    await focusEditor();
    await page.keyboard.press("Meta+Shift+A");
    await expect(overlay().getByTestId("qa-title")).toBeFocused();
    expect(await cardAt()).toEqual(left);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app-overlay")).toHaveCount(0);
  });
});
