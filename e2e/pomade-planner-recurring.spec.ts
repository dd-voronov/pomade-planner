// E-005's acceptance in a real Pomade ($POMADE_DIR, e2e/fixtures/pomade.ts) with the app installed
// into the fixture's user data, on real files in To-dos/: recurring items made in quick add (the
// overlay ⌘⇧A opens) and by hand, ticked and skipped with their exact bytes, missed months
// collapsing into one row, a lead time as long as the period, `repeat:` edited in Pomade's editor,
// and the `pomade-planner today` command. The Planner's clock is its `test.clock` hook.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { expect, test, type ElectronApplication, type FrameLocator, type Page } from "@playwright/test";

import { logged, row, setClock, titles } from "./fixtures/planner";
import { POMADE_BIN, createPomadeFixture, launchPomade, panelShown, pomadeEnv, type PomadeFixture } from "./fixtures/pomade";
import { shot } from "./fixtures/screens";

const DIST = resolve(import.meta.dirname, "../dist/planner");
const INSTALL_SCRIPT = resolve(import.meta.dirname, "../scripts/install-app.mjs");
const ICON = "strip-app-pomade-planner-planner";
const PANEL = '[data-testid="panel-frame-app-pomade-planner-planner"]';
const OVERLAY = '[data-testid="overlay-frame-pomade-planner"]';
const TODOS = "To-dos";
const SETTINGS = "Apps/pomade-planner/settings.json";

/** A hand-made recurring item, the way someone writes one in an editor. */
const chore = (title: string, doOn: string, repeat: string, body = ""): string =>
  `---\ntype: recurring\ntitle: ${title}\nstatus: open\ndo-on: ${doOn}\nrepeat:\n${repeat}created: 2026-08-01\n---\n${body}`;

const FILES: Record<string, string> = {
  "change-toothbrush.md": chore("Change toothbrush", "2026-11-09", "  after-completion: { months: 3 }\n", "The soft one.\n"),
  "send-the-invoices.md": chore("Send the invoices", "2026-10-05", "  monthly: { days: [5] }\n", "To the accountant.\n\n## Log\n- 2026-09-05 done\n"),
  "water-the-plants.md": chore("Water the plants", "2026-12-02", "  weekly: { days: [wed] }\n"),
  "plan-the-week.md": chore("Plan the week", "2026-11-23", "  weekly: { days: [mon] }\n  lead-days: 7\n"),
  "check-smoke-alarms.md": chore("Check the smoke alarms", "2026-12-15", "  monthly: { days: [15] }\n"),
};

/** A shell's environment outside Pomade: nothing of Pomade's — the shim sets its own POMADE_HOME. */
function shellEnv(): Record<string, string> {
  return Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined && !e[0].startsWith("POMADE_") && e[0] !== "ELECTRON_RUN_AS_NODE"));
}

test.describe("recurring tasks in a real Pomade", () => {
  test.describe.configure({ mode: "serial" });
  let fixture: PomadeFixture;
  let app: ElectronApplication | undefined;
  let page: Page;
  const abs = (rel: string) => join(fixture.workspaceRoot, rel);
  const todo = (name: string) => abs(`${TODOS}/${name}`);
  const text = (name: string) => readFile(todo(name), "utf8");
  const panel = (): FrameLocator => page.frameLocator(PANEL);

  async function openPanel(): Promise<FrameLocator> {
    if ((await page.getByTestId(ICON).getAttribute("aria-pressed")) !== "true") await page.getByTestId(ICON).click();
    await panelShown(page, ICON);
    await expect(panel().getByTestId("view-planner-panel")).toBeVisible();
    await expect(panel().getByTestId("planner-day")).toBeVisible();
    return panel();
  }

  /** The panel on `view` at the local time `at`. */
  async function at(when: string, view: "today" | "recurring" = "today"): Promise<FrameLocator> {
    const p = await openPanel();
    await setClock(p, when);
    await p.getByTestId(`view-${view}`).click();
    await expect(p.getByTestId(`view-${view}`)).toHaveAttribute("aria-selected", "true");
    return p;
  }

  /** The visible editor in raw mode (its toggle flips raw ↔ live). */
  async function rawMode(): Promise<void> {
    const toggle = page.locator('[data-testid="mode-toggle"]:visible');
    await expect(toggle).toBeVisible();
    if ((await toggle.getAttribute("data-mode")) !== "raw") await toggle.click();
    await expect(toggle).toHaveAttribute("data-mode", "raw");
  }

  test.beforeAll(async () => {
    fixture = await createPomadeFixture([{ key: "alpha", name: "Alpha", root: "Projects/alpha", files: { "README.md": "# Alpha\n" } }]);
    await mkdir(abs("Apps/pomade-planner"), { recursive: true });
    await writeFile(abs(SETTINGS), `${JSON.stringify({ tasksRoot: TODOS }, null, 2)}\n`);
    await mkdir(abs(TODOS), { recursive: true });
    for (const [name, content] of Object.entries(FILES)) await writeFile(todo(name), content);
    const out = execFileSync(process.execPath, [INSTALL_SCRIPT, DIST], { env: pomadeEnv(fixture, { POMADE_BIN }), encoding: "utf8" });
    expect(out).toContain("Planner 0.1.0 (pomade-planner)");
    ({ app, page } = await launchPomade(fixture));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1400, 900));
    await page.getByTestId("project-__workspace__").click();
  });

  test.afterAll(async () => {
    await app?.close();
    await fixture.cleanup();
  });

  test("⌘⇧A → Recurring: “Upload invoices”, every month on the 5th, 3 days early — the kit's words in the form; Enter writes do-on the first 5th", async () => {
    await at("2026-11-18T10:00");
    await page.keyboard.press("Meta+Shift+A");
    await expect(page.getByTestId("app-overlay")).toBeVisible();
    const overlay = page.frameLocator(OVERLAY);
    await expect(overlay.getByTestId("qa-title")).toBeFocused();
    await page.keyboard.type("Upload invoices");
    await page.keyboard.press("Tab");
    await expect(overlay.getByTestId("qa-project")).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowRight");
    await expect(overlay.getByTestId("qa-type-recurring")).toBeChecked();
    for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
    await expect(overlay.getByTestId("qa-repeat-on")).toBeFocused();
    await page.keyboard.type("5");
    await page.keyboard.press("Tab");
    await page.keyboard.type("3");
    await expect(overlay.getByTestId("qa-repeat-description")).toHaveText("monthly on the 5th, shows 3 days early · first Sat, Dec 5");
    await shot(page, "e005-pomade-quick-add-recurring-overlay");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app-overlay")).toHaveCount(0);
    await expect
      .poll(() => text("2026-11-18-upload-invoices.md").catch(() => null))
      .toBe("---\ntype: recurring\ntitle: Upload invoices\nstatus: open\ndo-on: 2026-12-05\nrepeat:\n  monthly: { days: [5] }\n  lead-days: 3\ncreated: 2026-11-18\n---\n");
  });

  test("“Upload invoices” is only in Recurring on Dec 1; on Dec 2 Today shows “Due in 3 days”; ticking it logs done and moves do-on to Jan 5", async () => {
    let p = await at("2026-12-01T10:00");
    await expect(row(p, "Upload invoices")).toHaveCount(0);
    await p.getByTestId("view-recurring").click();
    await expect(row(p, "Upload invoices").getByTestId("hint-next")).toHaveText("next Dec 5");
    p = await at("2026-12-02T10:00");
    await expect(row(p, "Upload invoices")).toHaveAttribute("data-reason", "lead-time");
    await expect(row(p, "Upload invoices").getByTestId("hint-reason")).toHaveText("Due in 3 days");
    await shot(page, "e005-pomade-today-lead-due-missed");
    const name = "2026-11-18-upload-invoices.md";
    const before = await text(name);
    await row(p, "Upload invoices").getByTestId("task-check").check();
    await expect(row(p, "Upload invoices").getByTestId("hint-ack")).toHaveText("Done · next Jan 5, 2027");
    await shot(page, "e005-pomade-tick-ack");
    await expect.poll(() => text(name)).toBe(logged(before, { doOn: ["2026-12-05", "2027-01-05"], entry: "- 2026-12-02 done" }));
    expect(await text(name)).toBe(before.replace("do-on: 2026-12-05", "do-on: 2027-01-05") + "\n## Log\n- 2026-12-02 done\n");
    await expect(row(p, "Upload invoices")).toHaveCount(0, { timeout: 4_000 });
  });

  test("“Change toothbrush”, 3 months after completion, due Nov 9: ticked Nov 20 → do-on Feb 20", async () => {
    const p = await at("2026-11-20T10:00");
    await expect(row(p, "Change toothbrush").getByTestId("hint-reason")).toHaveText("Overdue");
    await expect(row(p, "Change toothbrush").getByTestId("hint-next")).toHaveText("due Nov 9");
    await row(p, "Change toothbrush").getByTestId("task-check").check();
    await expect(row(p, "Change toothbrush").getByTestId("hint-ack")).toHaveText("Done · next Feb 20, 2027");
    await expect.poll(() => text("change-toothbrush.md")).toBe(chore("Change toothbrush", "2027-02-20", "  after-completion: { months: 3 }\n", "The soft one.\n\n## Log\n- 2026-11-20 done\n"));
  });

  test("invoices untouched in October and November: one Today row “Missed 2×”; ticking it logs once and jumps to Dec 5", async () => {
    const p = await at("2026-11-18T10:00");
    await expect(row(p, "Send the invoices")).toHaveCount(1);
    await expect(row(p, "Send the invoices").getByTestId("hint-reason")).toHaveText("Missed 2×");
    await expect(row(p, "Send the invoices").getByTestId("hint-next")).toHaveText("since Oct 5");
    await row(p, "Send the invoices").getByTestId("task-check").check();
    await expect(row(p, "Send the invoices").getByTestId("hint-ack")).toHaveText("Done · next Dec 5");
    await expect
      .poll(() => text("send-the-invoices.md"))
      .toBe(chore("Send the invoices", "2026-12-05", "  monthly: { days: [5] }\n", "To the accountant.\n\n## Log\n- 2026-11-18 done\n- 2026-09-05 done\n"));
    await expect(row(p, "Send the invoices")).toHaveCount(0, { timeout: 4_000 });
  });

  test("“Skip this time” logs skipped and advances; the Recurring view shows the new date and the entry", async () => {
    const p = await at("2026-12-02T10:00");
    await row(p, "Water the plants").hover();
    await expect(row(p, "Water the plants").getByTestId("task-skip")).toBeVisible();
    await shot(page, "e005-pomade-skip-hover");
    await row(p, "Water the plants").getByTestId("task-skip").click();
    await expect(row(p, "Water the plants").getByTestId("hint-ack")).toHaveText("Skipped · next Dec 9");
    await expect.poll(() => text("water-the-plants.md")).toBe(chore("Water the plants", "2026-12-09", "  weekly: { days: [wed] }\n", "\n## Log\n- 2026-12-02 skipped\n"));
    await p.getByTestId("view-recurring").click();
    await expect(row(p, "Water the plants").locator('[data-testid^="hint-"]')).toHaveText(["next Dec 9", "every Wed", "skipped today"]);
    await shot(page, "e005-pomade-recurring-view");
  });

  test("a lead time as long as the period: “Plan the week” is in Today every day, and done it stays for the next Monday", async () => {
    for (const [day, label] of [
      ["2026-11-16", "Due in 7 days"],
      ["2026-11-19", "Due in 4 days"],
      ["2026-11-22", "Due in 1 day"],
      ["2026-11-23", "Due today"],
    ] as const) {
      const p = await at(`${day}T10:00`);
      await expect(row(p, "Plan the week").getByTestId("hint-reason")).toHaveText(label);
    }
    const p = panel();
    await row(p, "Plan the week").getByTestId("task-check").check();
    await expect(row(p, "Plan the week").getByTestId("hint-ack")).toHaveText("Done · next Nov 30");
    await expect.poll(() => text("plan-the-week.md")).toBe(chore("Plan the week", "2026-11-30", "  weekly: { days: [mon] }\n  lead-days: 7\n", "\n## Log\n- 2026-11-23 done\n"));
    await expect(row(p, "Plan the week").getByTestId("hint-reason")).toHaveText("Due in 7 days", { timeout: 4_000 });
    await expect(row(p, "Plan the week").getByTestId("task-check")).not.toBeChecked();
  });

  test("`repeat:` edited in Pomade's editor is re-computed within ~1 s; an invalid rule shows the kit's error on the row, and nothing is written", async () => {
    const p = await at("2026-12-02T10:00", "recurring");
    await expect(row(p, "Check the smoke alarms").getByTestId("hint-repeat")).toHaveText("monthly on the 15th");
    await row(p, "Check the smoke alarms").getByTestId("task-open").click({ modifiers: ["Meta"] });
    await expect(page.getByTestId("tabstrip").getByRole("tab", { name: "check-smoke-alarms.md", selected: true })).toBeVisible();
    await rawMode();
    const line = page.locator('[data-testid="raw-editor"]:visible .cm-line').filter({ hasText: "monthly: { days: [15] }" });
    await line.click();
    await page.keyboard.press("End");
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowLeft");
    await page.keyboard.type(", 30");
    await page.keyboard.press("Meta+s");
    await expect.poll(() => text("check-smoke-alarms.md")).toContain("monthly: { days: [15, 30] }");
    const saved = Date.now();
    await expect(row(p, "Check the smoke alarms").getByTestId("hint-repeat")).toHaveText("monthly on the 15th and 30th", { timeout: 1_500 });
    expect(Date.now() - saved).toBeLessThan(1_500);

    await page.keyboard.type("x");
    await page.keyboard.press("Meta+s");
    await expect.poll(() => text("check-smoke-alarms.md")).toContain("days: [15, 30x]");
    const broken = await text("check-smoke-alarms.md");
    await expect(row(p, "Check the smoke alarms").getByTestId("hint-problem")).toContainText("repeat.monthly.days[1]", { timeout: 1_500 });
    await expect(row(p, "Check the smoke alarms").getByTestId("task-check")).toBeDisabled();
    await expect(row(p, "Check the smoke alarms").getByTestId("task-skip")).toHaveCount(0);
    await shot(page, "e005-pomade-recurring-error");
    expect(await text("check-smoke-alarms.md")).toBe(broken);
  });

  test("the panel's + opens the same overlay with Recurring; a narrow panel keeps every view and still opens the full form", async () => {
    const p = await at("2026-12-02T10:00");
    const o = page.frameLocator(OVERLAY);
    await p.getByTestId("planner-add").click();
    await expect(o.getByTestId("qa-title")).toBeFocused();
    await o.getByTestId("qa-type-recurring").check();
    await o.getByTestId("qa-title").fill("Take out the bins");
    await o.getByTestId("qa-repeat-unit").selectOption("week");
    await o.getByTestId("qa-repeat-on").fill("mon, thu");
    await expect(o.getByTestId("qa-repeat-description")).toHaveText("every Mon and Thu · first Thu, Dec 3");
    await shot(page, "e005-pomade-quick-add-recurring-from-panel");
    await o.getByTestId("qa-repeat-on").press("Escape");
    await expect(page.getByTestId("app-overlay")).toHaveCount(0);
    await expect(p.getByTestId("planner-add")).toBeFocused();

    // As narrow as the side panel goes.
    const divider = page.getByTestId("divider-filetree");
    await divider.focus();
    for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowLeft");
    const switcher = p.getByRole("tablist", { name: "Planner views" });
    await expect.poll(() => switcher.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await p.locator("html").evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
    await shot(page, "e005-pomade-today-narrow");
    await p.getByTestId("view-recurring").click();
    await shot(page, "e005-pomade-recurring-narrow");
    await p.getByTestId("planner-add").click();
    await expect(o.getByTestId("qa-title")).toBeFocused();
    await o.getByTestId("qa-type-recurring").check();
    await shot(page, "e005-pomade-quick-add-recurring-from-narrow-panel");
    expect(await o.locator("form").evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await o.getByTestId("qa-title").press("Escape");
    await expect(page.getByTestId("app-overlay")).toHaveCount(0);
    for (let i = 0; i < 40; i++) await divider.press("ArrowRight");
  });

  test("`pomade-planner today --json` has the recurring items with reasons recurring-due and lead-time and their missed count — the same rows as Today", async () => {
    await writeFile(todo("pay-the-rent.md"), chore("Pay the rent", "2026-10-01", "  monthly: { days: [1] }\n"));
    await writeFile(todo("renew-the-permit.md"), chore("Renew the parking permit", "2026-12-04", "  monthly: { days: [4] }\n  lead-days: 3\n"));
    const p = await at("2026-12-02T10:00");
    await expect(row(p, "Pay the rent").getByTestId("hint-reason")).toHaveText("Missed 3×");
    await expect(row(p, "Renew the parking permit").getByTestId("hint-reason")).toHaveText("Due in 2 days");
    const shown = await p.locator('[data-testid="task-row"]').evaluateAll((els) => els.map((el) => ({ title: el.querySelector('[data-testid="task-title"]')?.textContent ?? "", reason: el.getAttribute("data-reason") ?? "" })));
    expect(shown.map((r) => r.title)).toEqual(await titles(p));

    const shim = join(fixture.homeDir, "bin/pomade-planner");
    const r = spawnSync(shim, ["today", "--json", "--date", "2026-12-02"], { env: shellEnv(), encoding: "utf8" });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    const report = JSON.parse(r.stdout) as { items: { title: string; type: string; reason: string; missed: number; "do-on": string }[] };
    expect(report.items.map((i) => ({ title: i.title, reason: i.reason }))).toEqual(shown);
    expect(report.items.find((i) => i.title === "Pay the rent")).toMatchObject({ type: "recurring", reason: "recurring-due", missed: 3, "do-on": "2026-10-01" });
    expect(report.items.find((i) => i.title === "Renew the parking permit")).toMatchObject({ type: "recurring", reason: "lead-time", missed: 0, "do-on": "2026-12-04" });
    const plain = spawnSync(shim, ["today", "--date", "2026-12-02"], { env: shellEnv(), encoding: "utf8" });
    expect(plain.stdout).toContain("  [ ] Pay the rent — missed 3×, since Oct 1, monthly on the 1st\n");
    expect(plain.stdout).toContain("  [ ] Renew the parking permit — due in 2 days, monthly on the 4th, shows 3 days early\n");
  });
});
