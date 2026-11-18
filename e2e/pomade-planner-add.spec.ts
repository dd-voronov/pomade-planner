// E-008's acceptance in a real Pomade ($POMADE_DIR, e2e/fixtures/pomade.ts) with the app installed
// into the fixture's user data: the Planner tab's + and Add button open the add form in place
// inside the tab's frame, never Pomade's overlay; a task added with three lines of markdown in
// Details is a file with the usual frontmatter and exactly those lines as its body; ⌥Tab walks the
// five types with the caret in the title, and Tab goes round the form's fields without Pomade's
// focus ever leaving the frame — in place and in the overlay of ⌘⇧A; the panel's + and Add button
// open the overlay with the view's pre-fills, and Esc gives the focus back to the one that opened it.

import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { expect, test, type ElectronApplication, type FrameLocator, type Page } from "@playwright/test";

import { quickAdded, row, settled } from "./fixtures/planner";
import { POMADE_BIN, createPomadeFixture, frameShown, launchPomade, panelShown, pomadeEnv, type PomadeFixture } from "./fixtures/pomade";
import { shot } from "./fixtures/screens";

const DIST = resolve(import.meta.dirname, "../dist/planner");
const INSTALL_SCRIPT = resolve(import.meta.dirname, "../scripts/install-app.mjs");
const ICON = "strip-app-pomade-planner-planner";
const PANEL_FRAME = "panel-frame-app-pomade-planner-planner";
const TAB_FRAME = "app-frame-pomade-planner";
const OVERLAY_FRAME = "overlay-frame-pomade-planner";
const TODOS = "To-dos";
const KINDS = ["task", "recurring", "note", "thought", "daily-note"] as const;
const FIELDS = ["qa-title", "qa-project", "qa-type-task", "qa-do-on", "qa-deadline", "qa-importance", "qa-details"];

test.describe("adding in place and in the overlay in a real Pomade", () => {
  test.describe.configure({ mode: "serial" });
  let fixture: PomadeFixture;
  let app: ElectronApplication | undefined;
  let page: Page;
  const todo = (name: string) => join(fixture.workspaceRoot, TODOS, name);
  const read = (name: string) => readFile(todo(name), "utf8").catch(() => null);
  const panel = (): FrameLocator => page.frameLocator(`[data-testid="${PANEL_FRAME}"]`);
  const tab = (): FrameLocator => page.frameLocator(`[data-testid="${TAB_FRAME}"]:visible`);
  const overlay = (): FrameLocator => page.frameLocator(`[data-testid="${OVERLAY_FRAME}"]`);
  /** The test id of the element Pomade's own document has its focus on: the frame the keys go to. */
  const pomadeFocus = () => page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null);
  /** The test id of the element `frame`'s document has its focus on. */
  const focusIn = (frame: FrameLocator) => frame.locator("html").evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.testid ?? null);

  /** ⌥Tab round the five types and ⌥⇧Tab back, the caret staying in the title one character before its end. */
  async function walkTypes(frame: FrameLocator): Promise<void> {
    const title = frame.getByTestId("qa-title");
    await expect(title).toBeFocused();
    await page.keyboard.type("Walk");
    await page.keyboard.press("ArrowLeft");
    for (const kind of [...KINDS.slice(1), "task"] as const) {
      await page.keyboard.press("Alt+Tab");
      await expect(frame.getByTestId(`qa-type-${kind}`)).toBeChecked();
      await expect(title).toBeFocused();
    }
    for (const kind of [...KINDS].reverse()) {
      await page.keyboard.press("Alt+Shift+Tab");
      await expect(frame.getByTestId(`qa-type-${kind}`)).toBeChecked();
      await expect(title).toBeFocused();
    }
    await page.keyboard.type("!");
    await expect(title).toHaveValue("Wal!k");
  }

  /** Tab twice round the fields and Shift+Tab once back: the focus is on each field in turn and Pomade's stays on `frameId`. */
  async function walkFields(frame: FrameLocator, frameId: string): Promise<void> {
    await expect(frame.getByTestId("qa-title")).toBeFocused();
    for (const id of [...FIELDS.slice(1), ...FIELDS, "qa-title"]) {
      await page.keyboard.press("Tab");
      expect(await focusIn(frame)).toBe(id);
      expect(await pomadeFocus()).toBe(frameId);
    }
    for (const id of [...FIELDS].reverse()) {
      await page.keyboard.press("Shift+Tab");
      expect(await focusIn(frame)).toBe(id);
      expect(await pomadeFocus()).toBe(frameId);
    }
  }

  /** Select a view; a click sent in the frame Pomade shows the tab in can be lost, so it is sent until it took. */
  async function view(frame: FrameLocator, id: "today" | "recurring"): Promise<void> {
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

  test.beforeAll(async () => {
    fixture = await createPomadeFixture([{ key: "alpha", name: "Alpha", root: "Projects/alpha", files: { "README.md": "# Alpha\n" } }]);
    await mkdir(join(fixture.workspaceRoot, "Apps/pomade-planner"), { recursive: true });
    await writeFile(join(fixture.workspaceRoot, "Apps/pomade-planner/settings.json"), `${JSON.stringify({ tasksRoot: TODOS }, null, 2)}\n`);
    await mkdir(join(fixture.workspaceRoot, TODOS), { recursive: true });
    await writeFile(todo("2026-11-10-pay-the-tax.md"), "---\ntype: task\ntitle: Pay the tax\nstatus: open\ndo-on: 2026-11-17\ncreated: 2026-11-10\n---\n");
    const out = execFileSync(process.execPath, [INSTALL_SCRIPT, DIST], { env: pomadeEnv(fixture, { POMADE_BIN }), encoding: "utf8" });
    expect(out).toContain("Planner 0.1.0 (pomade-planner)");
    const state = join(fixture.userDataDir, "app-state/pomade-planner");
    await mkdir(state, { recursive: true });
    await writeFile(join(state, "state.json"), JSON.stringify({ "test.clock": { offsetMs: new Date("2026-11-17T10:00").getTime() - Date.now() } }));
    ({ app, page } = await launchPomade(fixture));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1400, 900));
    await page.getByTestId("project-__workspace__").click();
    // The panel is the launch frame: it makes the day's note before the tab is looked at.
    await openPanel();
    await page.getByTestId("tab-add").click();
    await page.getByTestId("tab-add-app-pomade-planner").click();
    await expect(tab().getByTestId("view-planner-tab")).toBeVisible();
  });

  test.afterAll(async () => {
    await app?.close();
    await fixture.cleanup();
  });

  test("the tab's empty Recurring view: Add recurring task opens the form in place with Recurring chosen; Enter shows the new row — no overlay ever opens", async () => {
    const t = tab();
    await view(t, "recurring");
    const button = t.getByTestId("recurring-empty").getByTestId("add-item");
    await expect(button).toHaveText("Add recurring task");
    await shot(page, "e008-pomade-tab-recurring-empty");
    await button.click();
    await expect(t.getByTestId("qa-title")).toBeFocused();
    await expect(t.getByTestId("add-form")).toBeVisible();
    await expect(t.getByTestId("qa-type-recurring")).toBeChecked();
    await expect(page.getByTestId("app-overlay")).toHaveCount(0);
    await page.keyboard.type("Water the ficus");
    await t.getByTestId("qa-repeat-unit").selectOption("day");
    await shot(page, "e008-pomade-tab-recurring-form");
    await t.getByTestId("qa-title").press("Enter");
    await expect(t.getByTestId("add-form")).toHaveCount(0);
    await expect(row(t, "Water the ficus").getByTestId("task-open")).toBeFocused();
    await expect(page.getByTestId("app-overlay")).toHaveCount(0);
    expect(await read("2026-11-17-water-the-ficus.md")).toBe("---\ntype: recurring\ntitle: Water the ficus\nstatus: open\ndo-on: 2026-11-17\nrepeat:\n  daily: {}\ncreated: 2026-11-17\n---\n");
  });

  test("the tab's + opens the form inside the tab; three lines of markdown in Details are exactly the file's body under the usual frontmatter", async () => {
    const t = tab();
    await view(t, "today");
    await t.getByTestId("planner-add").click();
    await expect(t.getByTestId("qa-title")).toBeFocused();
    expect(await pomadeFocus()).toBe(TAB_FRAME);
    await expect(page.getByTestId("app-overlay")).toHaveCount(0);
    await expect(t.getByTestId("qa-do-on")).toHaveValue("today");
    await page.keyboard.type("Buy a lamp");
    await t.getByTestId("qa-details").click();
    await page.keyboard.type("**Why:** the old one flickers");
    await page.keyboard.press("Enter");
    await page.keyboard.type("### Options");
    await page.keyboard.press("Enter");
    await page.keyboard.type("- the brass one from the market");
    await expect(t.getByTestId("add-form")).toBeVisible();
    await shot(page, "e008-pomade-tab-details");
    await page.keyboard.press("Meta+Enter");
    await expect(t.getByTestId("add-form")).toHaveCount(0);
    const added = row(t, "Buy a lamp");
    await expect(added.getByTestId("task-open")).toBeFocused();
    await shot(page, "e008-pomade-tab-added");
    expect(await read("2026-11-17-buy-a-lamp.md")).toBe(
      quickAdded({ title: "Buy a lamp", doOn: "2026-11-17", created: "2026-11-17", body: "**Why:** the old one flickers\n### Options\n- the brass one from the market\n" }),
    );
    await expect(page.getByTestId("app-overlay")).toHaveCount(0);
    // ⇧⌘↵ opens the new item's compact view in the tab; Pomade opens no tab for it.
    const tabs = await page.getByTestId("tabstrip").getByRole("tab").count();
    await t.getByTestId("add-item").click();
    await page.keyboard.type("Post the parcel");
    await page.keyboard.press("Shift+Meta+Enter");
    await expect(t.getByTestId("item-pane")).toBeFocused();
    await expect(t.getByTestId("item-pane")).toHaveAttribute("data-path", `${TODOS}/2026-11-17-post-the-parcel.md`);
    await expect(page.getByTestId("tabstrip").getByRole("tab")).toHaveCount(tabs);
    await page.keyboard.press("Escape");
    await expect(row(t, "Post the parcel").getByTestId("task-open")).toBeFocused();
    // ⌘-click is the way to Pomade's editor.
    await row(t, "Post the parcel").getByTestId("task-open").click({ modifiers: ["Meta"] });
    await expect(page.getByTestId("tabstrip").getByRole("tab", { name: /2026-11-17-post-the-parcel/, selected: true })).toBeVisible();
    await page.getByTestId("tabstrip").getByRole("tab", { name: /Planner/ }).click();
    await expect(tab().getByTestId("view-planner-tab")).toBeVisible();
    await frameShown(page);
  });

  test("in place: ⌥Tab walks the five types with the caret in the title; Tab goes round the fields and Pomade's focus stays on the tab's frame; Esc gives the focus back to +", async () => {
    const t = tab();
    await t.getByTestId("planner-add").click();
    await walkTypes(t);
    await walkFields(t, TAB_FRAME);
    await page.keyboard.press("Escape");
    await expect(t.getByTestId("add-form")).toHaveCount(0);
    await expect(t.getByTestId("planner-add")).toBeFocused();
    expect(await pomadeFocus()).toBe(TAB_FRAME);
  });

  test("in the overlay of ⌘⇧A: ⌥Tab walks the types, Tab goes round the fields and Pomade's focus stays on the overlay's frame; ⌘↵ in Details adds with the body", async () => {
    await page.keyboard.press("Meta+Shift+A");
    await expect(page.getByTestId("app-overlay")).toBeVisible();
    const o = overlay();
    await walkTypes(o);
    await walkFields(o, OVERLAY_FRAME);
    await expect(o.getByTestId("qa-do-on")).toHaveValue("");
    await o.getByTestId("qa-details").focus();
    await page.keyboard.type("one");
    await page.keyboard.press("Enter");
    await page.keyboard.type("two");
    await expect(page.getByTestId("app-overlay")).toBeVisible();
    expect(await o.locator("form").evaluate((f) => f.scrollHeight <= f.clientHeight && f.scrollWidth <= f.clientWidth)).toBe(true);
    expect(await o.locator(".qa__body").evaluate((b) => b.scrollHeight <= b.clientHeight)).toBe(true);
    await shot(page, "e008-pomade-overlay-details");
    await page.keyboard.press("Meta+Enter");
    await expect(page.getByTestId("app-overlay")).toHaveCount(0);
    await expect.poll(() => read("2026-11-17-wal-k.md")).toBe(quickAdded({ title: "Wal!k", created: "2026-11-17", body: "one\ntwo\n" }));
    expect(await pomadeFocus()).toBe(TAB_FRAME);
  });

  test("the panel's + and Add button open the overlay with the view's pre-fills, never a form in the panel; Esc gives the focus back to the button that opened it", async () => {
    // Over an editor tab: Pomade gives the focus back to what its own document had it on, and that
    // stays the Planner tab's frame when the focus went from it straight into the panel's frame.
    await page.getByTestId("tabstrip").getByRole("tab", { name: /2026-11-17-post-the-parcel/ }).click();
    await expect(page.locator('[data-testid="mode-toggle"]:visible')).toBeVisible();
    await page.locator(".cm-content:visible").click();
    const p = await openPanel();
    const o = overlay();
    await view(p, "recurring");
    for (const opener of ["add-item", "planner-add"]) {
      await p.getByTestId(opener).click();
      await expect(page.getByTestId("app-overlay")).toBeVisible();
      await expect(o.getByTestId("qa-title")).toBeFocused();
      await expect(o.getByTestId("qa-type-recurring")).toBeChecked();
      await expect(p.getByTestId("add-form")).toHaveCount(0);
      await shot(page, `e008-pomade-panel-${opener}-overlay`);
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("app-overlay")).toHaveCount(0);
      await expect.poll(pomadeFocus).toBe(PANEL_FRAME);
      await expect(p.getByTestId(opener)).toBeFocused();
    }
    await view(p, "today");
    await expect(p.getByTestId("add-item")).toHaveText("Add task");
    await p.getByTestId("add-item").click();
    await expect(o.getByTestId("qa-type-task")).toBeChecked();
    await expect(o.getByTestId("qa-do-on")).toHaveValue("today");
    await page.keyboard.type("Call the bank");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app-overlay")).toHaveCount(0);
    await expect(row(p, "Call the bank")).toBeVisible();
    await expect.poll(() => read("2026-11-17-call-the-bank.md")).toBe(quickAdded({ title: "Call the bank", doOn: "2026-11-17", created: "2026-11-17" }));
    await shot(page, "e008-pomade-panel-added");
  });
});
