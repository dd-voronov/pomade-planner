// E-009's acceptance in a real Pomade ($POMADE_DIR, e2e/fixtures/pomade.ts) with the app installed
// into the fixture's user data, on real files: in the Planner tab a click on a task opens its
// compact view beside the list and Pomade opens no tab; a deadline typed as `fri` changes only the
// file's `deadline:` line, Details only its body; an edit made on disk shows in the open view
// within about a second, and Details typed over a version that changed on disk is not written; a
// recurring item's rule changed in the view rewrites only its `repeat:` lines (T-006);
// in the panel a click on a note brings up the Planner tab with the note open — through the tab's
// route, for a tab already open and for the same note asked again — and Open in tab opens
// Pomade's editor; ⌘-click on a row opens the editor and no view; ⇧⌘↵ in the overlay opens the
// editor too; from a project's view the editor tab opens in the Workspace that holds the file, with no
// "Outside this project" mark (T-012).

import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { expect, test, type ElectronApplication, type FrameLocator, type Page } from "@playwright/test";

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

const TAX = "2026-11-10-pay-the-tax.md";
const TAX_TEXT = "---\ntype: task\ntitle: Pay the tax   # the big one\nstatus: open\ndeadline: 2026-11-14\nimportance: 5\ncreated: 2026-11-10\n---\n";
const GIFTS = "2026-11-12-gift-ideas.md";
const GIFTS_TEXT = "---\ntype: note\ntitle: Gift ideas for Greta\nstatus: open\ncreated: 2026-11-12\n---\n- the blue scarf from the market\n";
const DENTIST = "2026-11-15-call-the-dentist.md";
const DENTIST_TEXT = "---\ntype: task\ntitle: Call the dentist\nstatus: open\ndo-on: 2026-11-17\ncreated: 2026-11-15\n---\n";
const INVOICES = "2026-01-01-upload-invoices.md";
const INVOICES_TEXT =
  "---\ntype: recurring\ntitle: Upload invoices   # monthly\nstatus: open\ndo-on: 2026-12-05\nrepeat:   # the rule\n  monthly: { days: [5] }\n  lead-days: 3\ncreated: 2026-01-01\n---\nUpload all invoices.\n\n## Log\n- 2026-11-04 done\n";

test.describe("an item opened in place in a real Pomade", () => {
  test.describe.configure({ mode: "serial" });
  let fixture: PomadeFixture;
  let app: ElectronApplication | undefined;
  let page: Page;
  const todo = (name: string) => join(fixture.workspaceRoot, TODOS, name);
  const read = (name: string) => readFile(todo(name), "utf8");
  const panel = (): FrameLocator => page.frameLocator(`[data-testid="${PANEL_FRAME}"]`);
  const tab = (): FrameLocator => page.frameLocator(`[data-testid="${TAB_FRAME}"]:visible`);
  const pomadeTabs = () => page.getByTestId("tabstrip").getByRole("tab");
  const plannerTab = () => page.getByTestId("tabstrip").getByRole("tab", { name: /Planner/ });
  /** The test id of the element Pomade's own document has its focus on: the frame the keys go to. */
  const pomadeFocus = () => page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null);

  /** Select a view; a click sent in the frame Pomade shows the tab in can be lost, so it is sent until it took. */
  async function view(frame: FrameLocator, id: "today" | "all" | "recurring"): Promise<void> {
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
    await writeFile(todo(TAX), TAX_TEXT);
    await writeFile(todo(GIFTS), GIFTS_TEXT);
    await writeFile(todo(DENTIST), DENTIST_TEXT);
    await writeFile(todo(INVOICES), INVOICES_TEXT);
    const out = execFileSync(process.execPath, [INSTALL_SCRIPT, DIST], { env: pomadeEnv(fixture, { POMADE_BIN }), encoding: "utf8" });
    expect(out).toContain(`Planner ${APP_VERSION} (pomade-planner)`);
    const state = join(fixture.userDataDir, "app-state/pomade-planner");
    await mkdir(state, { recursive: true });
    await writeFile(join(state, "state.json"), JSON.stringify({ "test.clock": { offsetMs: new Date("2026-11-17T10:00").getTime() - Date.now() } }));
    ({ app, page } = await launchPomade(fixture));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1400, 900));
    await page.getByTestId("project-__workspace__").click();
    await openPanel();
    await page.getByTestId("tab-add").click();
    await page.getByTestId("tab-add-app-pomade-planner").click();
    await expect(tab().getByTestId("view-planner-tab")).toBeVisible();
    await view(tab(), "all");
  });

  test.afterAll(async () => {
    await app?.close();
    await fixture.cleanup();
  });

  test("in the tab a click on a task opens its view beside the list — Pomade opens no tab; “fri” changes only the deadline line, Details only the body", async () => {
    const t = tab();
    const tabs = await pomadeTabs().count();
    await row(t, "Pay the tax").getByTestId("task-open").click();
    const pane = t.getByTestId("item-pane");
    await expect(pane).toBeFocused();
    await expect(pane).toHaveAttribute("data-path", `${TODOS}/${TAX}`);
    await expect(t.getByTestId("list-all")).toBeVisible();
    const [list, view_] = [await t.getByTestId("list-all").boundingBox(), await pane.boundingBox()];
    expect(list!.x + list!.width).toBeLessThanOrEqual(view_!.x);
    await expect(row(t, "Pay the tax")).toHaveAttribute("data-open", "true");
    await expect(pomadeTabs()).toHaveCount(tabs);
    await expect(plannerTab()).toHaveAttribute("aria-selected", "true");
    expect(await pomadeFocus()).toBe(TAB_FRAME);

    await pane.getByTestId("qa-deadline").fill("fri");
    await expect(pane.getByTestId("qa-deadline-resolved")).toHaveText("Fri, Nov 20");
    await pane.getByTestId("qa-deadline").press("Enter");
    await expect.poll(() => read(TAX)).toBe(TAX_TEXT.replace("deadline: 2026-11-14", "deadline: 2026-11-20"));
    await expect(pane.getByTestId("qa-deadline")).toHaveValue("2026-11-20");
    await expect(row(t, "Pay the tax").getByTestId("hint-deadline")).toHaveText("due Fri");

    await pane.getByTestId("qa-details").focus();
    await page.keyboard.type("Bring **form 100**.\n- and the receipts");
    await expect.poll(() => read(TAX)).toBe(`${TAX_TEXT.replace("deadline: 2026-11-14", "deadline: 2026-11-20")}Bring **form 100**.\n- and the receipts\n`);
    await expect(pane.getByTestId("item-status")).toHaveText("Saved");
    await expect(pane.getByTestId("qa-details")).toBeFocused();
    expect(await pomadeFocus()).toBe(TAB_FRAME);
    await shot(page, "e009-pomade-tab-view");
    await expect(pomadeTabs()).toHaveCount(tabs);
  });

  test("an edit made on disk shows in the open view within about a second; Details typed over the older version is not written and the view says the file changed", async () => {
    const t = tab();
    const pane = t.getByTestId("item-pane");
    await expect(pane).toHaveAttribute("data-path", `${TODOS}/${TAX}`);
    const edited = "---\ntype: task\ntitle: Pay the tax today\nstatus: open\ndeadline: 2026-11-21\ncreated: 2026-11-10\n---\nFrom another editor.\n";
    const started = Date.now();
    await writeFile(todo(TAX), edited);
    await expect(pane.getByTestId("qa-title")).toHaveValue("Pay the tax today", { timeout: 2_000 });
    test.info().annotations.push({ type: "disk edit → view (ms)", description: String(Date.now() - started) });
    await expect(pane.getByTestId("qa-deadline")).toHaveValue("2026-11-21");
    await expect(pane.getByTestId("qa-importance")).toHaveValue("");
    await expect(pane.getByTestId("qa-details")).toHaveValue("From another editor.");
    await expect(pane.getByTestId("item-notice")).toHaveCount(0);

    await pane.getByTestId("qa-details").focus();
    await page.keyboard.type("Mine, over the old version. ");
    const theirs = edited.replace("From another editor.", "Theirs, saved meanwhile.");
    await writeFile(todo(TAX), theirs);
    await expect(pane.getByTestId("item-notice")).toContainText("The file changed on disk — nothing was written over it.");
    await expect(pane.getByTestId("qa-details")).toHaveValue("Theirs, saved meanwhile.");
    await shot(page, "e009-pomade-changed-on-disk");
    // Past the save delay and the watch: the disk still holds the other editor's bytes.
    await page.waitForTimeout(1_500); // eslint-disable-line playwright/no-wait-for-timeout -- nothing must be written once the delay has passed
    expect(await read(TAX)).toBe(theirs);
    await page.keyboard.press("Escape");
    await expect(pane).toHaveCount(0);
    await expect(row(t, "Pay the tax today").getByTestId("task-open")).toBeFocused();
    expect(await read(TAX)).toBe(theirs);
  });

  test("a rule changed in the view rewrites only the repeat: key's lines (files.setKeyLines) and moves do-on; every other byte stays", async () => {
    const t = tab();
    await view(t, "recurring");
    await row(t, "Upload invoices").getByTestId("task-open").click();
    const pane = t.getByTestId("item-pane");
    await expect(pane).toHaveAttribute("data-path", `${TODOS}/${INVOICES}`);
    await pane.getByTestId("qa-repeat-on").fill("10");
    await pane.getByTestId("qa-repeat-on").press("Enter");
    await expect
      .poll(() => read(INVOICES))
      .toBe(INVOICES_TEXT.replace("repeat:   # the rule\n  monthly: { days: [5] }\n", "repeat:\n  monthly: { days: [10] }\n").replace("do-on: 2026-12-05", "do-on: 2026-12-10"));
    await expect(pane.getByTestId("item-repeat")).toHaveText("monthly on the 10th, shows 3 days early · next Thu, Dec 10");
    await page.keyboard.press("Escape");
    await expect(pane).toHaveCount(0);
    await view(t, "all");
  });

  test("⌘-click on a row opens Pomade's editor and no view", async () => {
    const t = tab();
    await row(t, "Call the dentist").getByTestId("task-open").click({ modifiers: ["Meta"] });
    await expect(page.getByTestId("tabstrip").getByRole("tab", { name: /2026-11-15-call-the-dentist/, selected: true })).toBeVisible();
    await plannerTab().click();
    await expect(tab().getByTestId("view-planner-tab")).toBeVisible();
    await expect(tab().getByTestId("item-pane")).toHaveCount(0);
    await expect(tab().locator('[data-open="true"]')).toHaveCount(0);
  });

  test("in the panel a click on a note brings up the Planner tab with the note open; the same note asked again opens again; Open in tab opens Pomade's editor", async () => {
    // The editor tab is the active one: the Planner tab is behind it.
    await page.getByTestId("tabstrip").getByRole("tab", { name: /2026-11-15-call-the-dentist/ }).click();
    const p = await openPanel();
    await expect(p.getByTestId("view-all")).toHaveAttribute("aria-selected", "true");
    const tabs = await pomadeTabs().count();
    await row(p, "Gift ideas for Greta").getByTestId("task-open").click();
    await expect(plannerTab()).toHaveAttribute("aria-selected", "true");
    const t = tab();
    const pane = t.getByTestId("item-pane");
    await expect(pane).toHaveAttribute("data-path", `${TODOS}/${GIFTS}`);
    await expect(pane.getByTestId("qa-details")).toHaveValue("- the blue scarf from the market");
    await expect(row(t, "Gift ideas for Greta")).toHaveAttribute("data-open", "true");
    await expect(p.getByTestId("item-pane")).toHaveCount(0);
    await expect(pomadeTabs()).toHaveCount(tabs);
    await shot(page, "e009-pomade-panel-to-tab");

    // Another row, the tab already showing: the view changes item.
    await row(p, "Call the dentist").getByTestId("task-open").click();
    await expect(pane).toHaveAttribute("data-path", `${TODOS}/${DENTIST}`);
    // Closed, and the same row asked again.
    await pane.getByTestId("item-close").click();
    await expect(pane).toHaveCount(0);
    await row(p, "Call the dentist").getByTestId("task-open").click();
    await expect(pane).toHaveAttribute("data-path", `${TODOS}/${DENTIST}`);
    await row(p, "Gift ideas for Greta").getByTestId("task-open").click();
    await expect(pane).toHaveAttribute("data-path", `${TODOS}/${GIFTS}`);
    await expect(pomadeTabs()).toHaveCount(tabs);

    await pane.getByTestId("item-open-tab").click();
    await expect(page.getByTestId("tabstrip").getByRole("tab", { name: /2026-11-12-gift-ideas/, selected: true })).toBeVisible();
    await expect(pomadeTabs()).toHaveCount(tabs + 1);
    expect(await read(GIFTS)).toBe(GIFTS_TEXT);
  });

  test("⇧⌘↵ in the overlay adds the item and opens it in Pomade's editor", async () => {
    await page.keyboard.press("Meta+Shift+A");
    const o = page.frameLocator(`[data-testid="${OVERLAY_FRAME}"]`);
    await expect(o.getByTestId("qa-title")).toBeFocused();
    await page.keyboard.type("Post the parcel");
    await page.keyboard.press("Shift+Meta+Enter");
    await expect(page.getByTestId("tabstrip").getByRole("tab", { name: /2026-11-17-post-the-parcel/, selected: true })).toBeVisible();
    await expect(page.getByTestId("app-overlay")).toHaveCount(0);
  });

  test("from a project's view an item's editor tab opens in the Workspace that holds its file, with no “Outside this project” mark", async () => {
    const ALPHA_TASK = "Alpha/2026-11-16-ship-the-beta.md";
    await mkdir(todo("Alpha"), { recursive: true });
    await writeFile(todo(ALPHA_TASK), "---\ntype: task\ntitle: Ship the beta\nstatus: open\ndo-on: 2026-11-17\ncreated: 2026-11-16\n---\n");
    await page.getByTestId("project-proj-alpha").click();
    await expect(page.getByTestId("project-proj-alpha")).toHaveAttribute("data-active", "true");
    const p = await openPanel();
    await expect(p.getByTestId("view-planner-panel")).toHaveAttribute("data-context", "proj-alpha");
    await view(p, "all");
    await row(p, "Ship the beta").getByTestId("task-open").click({ modifiers: ["Meta"] });
    const editor = page.getByTestId("tabstrip").getByRole("tab", { name: /2026-11-16-ship-the-beta/, selected: true });
    await expect(editor).toBeVisible();
    await expect(page.getByTestId("project-__workspace__")).toHaveAttribute("data-active", "true");
    await expect(editor.locator('[data-testid^="tab-scope-"]')).toHaveCount(0);
  });
});
