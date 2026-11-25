// T-002 in a real Pomade ($POMADE_DIR, e2e/fixtures/pomade.ts) with the app installed into the
// fixture's user data: the tooltips of the app's own controls show inside Pomade's app frames —
// the side panel at Pomade's default and minimum widths, a tab, the Board — whole inside the
// frame's edges; the panel's Open in tab opens the Planner tab, whose Settings is Pomade's gear.

import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { expect, test, type ElectronApplication, type FrameLocator, type Locator, type Page } from "@playwright/test";

import { row, settled } from "./fixtures/planner";
import { APP_VERSION, POMADE_BIN, createPomadeFixture, launchPomade, panelShown, pomadeEnv, type PomadeFixture } from "./fixtures/pomade";
import { shot } from "./fixtures/screens";

const INSTALL_SCRIPT = resolve(import.meta.dirname, "../scripts/install-app.mjs");
const ICON = "strip-app-pomade-planner-planner";
const BOARD_ICON = "strip-app-pomade-board-board";
const PANEL = '[data-testid="panel-frame-app-pomade-planner-planner"]';
const TAB = '[data-testid="app-frame-pomade-planner"]:visible';
const BOARD_TAB = '[data-testid="app-frame-pomade-board"]:visible';
const TODOS = "To-dos";

const item = (type: string, title: string): string => `---\ntype: ${type}\ntitle: ${title}\nstatus: open\ncreated: 2026-11-10\n---\n\nSome notes.\n`;

test.describe("tooltips and the Planner's header in a real Pomade", () => {
  test.describe.configure({ mode: "serial" });
  let fixture: PomadeFixture;
  let app: ElectronApplication | undefined;
  let page: Page;
  const abs = (rel: string) => join(fixture.workspaceRoot, rel);
  const panel = (): FrameLocator => page.frameLocator(PANEL);

  /** Hover `control` in `frame` (the iframe `selector`): its tip shows `text` within half a second, whole inside the frame. */
  async function hoverShows(frame: FrameLocator, selector: string, control: Locator, text: string): Promise<void> {
    await control.hover();
    const tip = frame.getByTestId("tip");
    await expect(tip).toHaveText(text, { timeout: 600 });
    await expect(tip).toBeVisible();
    const box = await tip.boundingBox();
    const edge = await page.locator(selector).boundingBox();
    if (!box || !edge) throw new Error("no tip or frame box");
    expect(box.x).toBeGreaterThanOrEqual(edge.x + 8);
    expect(box.y).toBeGreaterThanOrEqual(edge.y + 8);
    expect(box.x + box.width).toBeLessThanOrEqual(edge.x + edge.width - 8);
    expect(box.y + box.height).toBeLessThanOrEqual(edge.y + edge.height - 8);
  }

  async function openPanel(): Promise<FrameLocator> {
    if ((await page.getByTestId(ICON).getAttribute("aria-pressed")) !== "true") await page.getByTestId(ICON).click();
    await panelShown(page, ICON);
    await expect(panel().getByTestId("view-planner-panel")).toBeVisible();
    await settled(panel());
    return panel();
  }

  test.beforeAll(async () => {
    fixture = await createPomadeFixture();
    await mkdir(abs("Apps/pomade-planner"), { recursive: true });
    await writeFile(abs("Apps/pomade-planner/settings.json"), `${JSON.stringify({ tasksRoot: TODOS }, null, 2)}\n`);
    await mkdir(abs(TODOS), { recursive: true });
    await writeFile(abs(`${TODOS}/2026-11-10-pay-the-tax.md`), item("task", "Pay the tax"));
    await writeFile(abs(`${TODOS}/2026-11-10-gift-ideas.md`), item("note", "Gift ideas"));
    const out = execFileSync(process.execPath, [INSTALL_SCRIPT], { env: pomadeEnv(fixture, { POMADE_BIN }), encoding: "utf8" });
    expect(out).toContain(`Planner ${APP_VERSION} (pomade-planner)`);
    expect(out).toContain(`Board ${APP_VERSION} (pomade-board)`);
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
  });

  test("the panel: +, Open in tab, ⋯, a row's pin and a row's action show their tips inside the panel frame", async () => {
    const p = await openPanel();
    expect(await p.locator(".planner__actions button").evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")))).toEqual(["planner-add", "planner-open-tab", "planner-menu-button"]);
    await hoverShows(p, PANEL, p.getByTestId("planner-add"), "New task (⌘⇧A)");
    await shot(page, "t002-pomade-tip-add");
    await hoverShows(p, PANEL, p.getByTestId("planner-open-tab"), "Open in tab");
    await shot(page, "t002-pomade-tip-open-tab");
    await hoverShows(p, PANEL, p.getByTestId("planner-menu-button"), "More");
    await shot(page, "t002-pomade-tip-more");

    await p.getByTestId("view-all").click();
    const note = row(p, "Gift ideas");
    await note.hover();
    await hoverShows(p, PANEL, note.getByTestId("task-pin"), "Pin to the top of this view");
    await shot(page, "t002-pomade-tip-pin");
    await hoverShows(p, PANEL, note.getByTestId("task-archive"), "Move it into _archive/ — All shows it with “Show archived”");
    await shot(page, "t002-pomade-tip-action");

    // Off the control, the tip leaves.
    await p.getByTestId("show-done").hover();
    await expect(p.getByTestId("tip")).toHaveCount(0);
  });

  test("keyboard focus inside the panel frame shows the tip", async () => {
    const p = await openPanel();
    await p.getByTestId("view-all").click();
    await page.keyboard.press("Tab");
    await expect(p.getByTestId("planner-add")).toBeFocused();
    await expect(p.getByTestId("tip")).toHaveText("New task (⌘⇧A)");
    await page.keyboard.press("Tab");
    await expect(p.getByTestId("tip")).toHaveText("Open in tab");
    await shot(page, "t002-pomade-tip-focus");
  });

  test("Open in tab opens the Planner tab; its Settings is the gear Pomade's own Settings row shows, with its tip", async () => {
    const p = await openPanel();
    await p.getByTestId("planner-open-tab").click();
    const tab = page.frameLocator(TAB);
    await expect(tab.getByTestId("view-planner-tab")).toBeVisible();
    await settled(tab);
    const gear = tab.getByTestId("planner-settings");
    const own = page.getByTestId("settings-gear");
    await expect(gear).toHaveText((await own.innerText()).trim());
    const glyph = (l: Locator) => l.evaluate((el) => ({ size: getComputedStyle(el).fontSize, family: getComputedStyle(el).fontFamily }));
    expect(await glyph(gear.locator(".gear-glyph"))).toEqual(await glyph(own));
    await hoverShows(tab, TAB, gear, "Settings");
    await shot(page, "t002-pomade-tab-gear");
    await gear.click();
    await expect(tab.getByTestId("planner-settings-page")).toBeVisible();
  });

  test("the Board tab: ⋯ and a column's + show their tips inside the tab frame", async () => {
    await page.getByTestId(`project-${fixture.projects.alpha as string}`).click();
    await page.getByTestId(BOARD_ICON).click();
    const b = page.frameLocator(BOARD_TAB);
    await expect(b.getByTestId("board")).toBeVisible();
    await hoverShows(b, BOARD_TAB, b.getByTestId("board-menu-button"), "Board settings");
    await shot(page, "t002-pomade-tip-board-menu");
    await b.getByRole("tab", { name: /^Solutions/ }).click();
    const add = b.getByTestId("column-add").first();
    await expect(add).toBeVisible();
    await hoverShows(b, BOARD_TAB, add, await add.getAttribute("aria-label").then((name) => name ?? ""));
    await expect(b.getByTestId("tip")).toHaveText(/^New .+ in .+$/);
    await shot(page, "t002-pomade-tip-board-add");
  });
});
