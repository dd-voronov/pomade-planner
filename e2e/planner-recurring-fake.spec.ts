// E-005 on the fake host (fake-host/, test/fixtures/workspace.ts `RECURRING_TASKS`): recurring
// items in Today (lead time, due, overdue, missed N×, an unreadable rule), done and skip with their
// exact bytes and the row's acknowledgement, the Recurring view (order, ended, errors), `repeat:`
// edited by hand, and quick add's repeat editor in the overlay and the panel. The tasks root is
// Chores/, dated around Wed 2026-12-02; the clock is the app's `test.clock` hook.

import { expect, test, type FrameLocator, type Page } from "@playwright/test";

import { APP_PORT, HARNESS_PORT } from "../playwright.config";
import { RECURRING_TASKS } from "../test/fixtures/workspace";
import { addFrom, logged, openQuickAdd, row, setClock, settled, titles } from "./fixtures/planner";
import { shot } from "./fixtures/screens";

const APP = `http://localhost:${APP_PORT}/`;
const NOW = "2026-12-02T10:00";

interface Open {
  surface: "tab" | "panel" | "overlay";
  icon?: string;
  route?: string;
  /** The active project's id, or `workspace`. */
  project?: string;
  panelWidth?: number;
  now?: string;
}

function harness(open: Open): string {
  const params = new URLSearchParams({ app: APP, surface: open.surface, tasks: "Chores", now: open.now ?? NOW, fixture: "planner", project: open.project ?? "workspace" });
  for (const key of ["icon", "route", "panelWidth"] as const) {
    const value = open[key];
    if (value !== undefined) params.set(key, String(value));
  }
  return `http://localhost:${HARNESS_PORT}/index.html?${params.toString()}`;
}

const app = (page: Page): FrameLocator => page.frameLocator("#stage iframe >> nth=0");
const fileText = (page: Page, path: string) => page.evaluate((p) => window.fakeHost.readFile(p), path);
const original = (name: string): string => RECURRING_TASKS[name] ?? "";

async function openPanel(page: Page, extra: Partial<Open> = {}): Promise<FrameLocator> {
  await page.goto(harness({ surface: "panel", icon: "planner", ...extra }));
  const a = app(page);
  await expect(a.getByTestId("view-planner-panel")).toBeVisible();
  await settled(a);
  return a;
}

/** The switcher's give-way classes in `className`, in order. */
const SWITCHER_STEPS_IN = (className: string): string[] => className.split(" ").filter((c) => c.startsWith("area-switcher--"));

const TODAY = ["Pay the rent", "Change toothbrush", "Take vitamins", "Water the plants", "Upload invoices", "Plan the week", "Renew the certificate"];

test.describe("Today", () => {
  test("lead time, due today, overdue, missed N× and an unreadable rule, each labelled; between occurrences and ended stay out — Project lists them all", async ({ page }) => {
    const a = await openPanel(page);
    await expect(a.getByTestId("planner-day")).toHaveText("Wed, Dec 2");
    expect(await titles(a)).toEqual(TODAY);
    const hints = async (title: string) => row(a, title).locator('[data-testid^="hint-"]').allTextContents();
    expect(await hints("Pay the rent")).toEqual(["Missed 2×", "since Nov 1", "monthly on the 1st"]);
    expect(await hints("Change toothbrush")).toEqual(["Overdue", "due Nov 9", "3 months after completion"]);
    expect(await hints("Water the plants")).toEqual(["Due today", "every Wed"]);
    expect(await hints("Upload invoices")).toEqual(["Due in 3 days", "monthly on the 5th, shows 3 days early"]);
    expect(await hints("Plan the week")).toEqual(["Due in 5 days", "every Mon, shows 7 days early"]);
    expect(await hints("Take vitamins")).toEqual(["Due today", 'repeat.weekly.days[0]: "fry" is not a weekday — use mon, tue, wed, thu, fri, sat or sun']);
    await expect(row(a, "Pay the rent")).toHaveAttribute("data-reason", "recurring-due");
    await expect(row(a, "Upload invoices")).toHaveAttribute("data-reason", "lead-time");
    await expect(row(a, "Renew the certificate").getByTestId("hint-reason")).toHaveText("Due in 1 day");
    // A rule that can't be read: no done, no skip.
    await expect(row(a, "Take vitamins").getByTestId("task-check")).toBeDisabled();
    await expect(row(a, "Take vitamins").getByTestId("task-skip")).toHaveCount(0);
    for (const title of ["Check the smoke alarms", "Pay the gym"]) await expect(row(a, title)).toHaveCount(0);
    await expect(a.getByTestId("count-today")).toHaveText("7");
    await shot(page, "e005-fake-today-panel");
    // The Project view holds every one, each with where it stands; it counts the ones due.
    await a.getByTestId("view-project").click();
    expect((await titles(a)).sort()).toEqual([...TODAY, "Check the smoke alarms", "Pay the gym"].sort());
    await expect(row(a, "Check the smoke alarms").getByTestId("hint-next")).toHaveText("next Dec 15");
    await expect(row(a, "Pay the gym").getByTestId("hint-reason")).toHaveText("Ended");
    await expect(a.getByTestId("count-project")).toHaveText("7");
  });

  test("ticking inside the lead time logs done and moves do-on to the 5th of next month; the row says so, then leaves Today", async ({ page }) => {
    const a = await openPanel(page);
    const name = "2026-01-01-upload-invoices.md";
    await row(a, "Upload invoices").getByTestId("task-check").check();
    await expect(row(a, "Upload invoices").getByTestId("hint-ack")).toHaveText("Done · next Jan 5, 2027");
    await expect(row(a, "Upload invoices").getByTestId("task-check")).toBeChecked();
    await expect(row(a, "Upload invoices")).not.toHaveClass(/task-row--done/);
    await shot(page, "e005-fake-tick-ack");
    expect(await fileText(page, `Chores/${name}`)).toBe(logged(original(name), { doOn: ["2026-12-05", "2027-01-05"], entry: "- 2026-12-02 done" }));
    await expect(row(a, "Upload invoices")).toHaveCount(0);
    expect(await titles(a)).toEqual(TODAY.filter((t) => t !== "Upload invoices"));
  });

  test("missed twice: one row; ticking it logs once and jumps to the next future occurrence", async ({ page }) => {
    const a = await openPanel(page);
    const name = "2026-01-01-pay-the-rent.md";
    await row(a, "Pay the rent").getByTestId("task-check").check();
    await expect(row(a, "Pay the rent").getByTestId("hint-ack")).toHaveText("Done · next Jan 1, 2027");
    expect(await fileText(page, `Chores/${name}`)).toBe(logged(original(name), { doOn: ["2026-11-01", "2027-01-01"], entry: "- 2026-12-02 done" }));
    await expect(row(a, "Pay the rent")).toHaveCount(0);
  });

  test("after completion: done today (due Nov 9) → next do-on three months from today", async ({ page }) => {
    const a = await openPanel(page);
    const name = "2026-01-01-change-toothbrush.md";
    await row(a, "Change toothbrush").getByTestId("task-check").check();
    await expect(row(a, "Change toothbrush").getByTestId("hint-ack")).toHaveText("Done · next Mar 2, 2027");
    expect(await fileText(page, `Chores/${name}`)).toBe(logged(original(name), { doOn: ["2026-11-09", "2027-03-02"], entry: "- 2026-12-02 done" }));
  });

  test("lead-days ≥ the period: done, it stays in Today for the next week", async ({ page }) => {
    const a = await openPanel(page, { now: "2026-12-07T10:00" });
    await expect(row(a, "Plan the week").getByTestId("hint-reason")).toHaveText("Due today");
    await row(a, "Plan the week").getByTestId("task-check").check();
    await expect(row(a, "Plan the week").getByTestId("hint-ack")).toHaveText("Done · next Dec 14");
    await expect(row(a, "Plan the week").getByTestId("hint-reason")).toHaveText("Due in 7 days");
    await expect(row(a, "Plan the week").getByTestId("task-check")).not.toBeChecked();
  });

  test("“Skip this time” on hover logs skipped and advances; the Recurring view shows the new date", async ({ page }) => {
    const a = await openPanel(page);
    const name = "2026-01-01-water-the-plants.md";
    await expect(row(a, "Water the plants").getByTestId("task-skip")).toHaveCSS("opacity", "0");
    await row(a, "Water the plants").hover();
    await expect(row(a, "Water the plants").getByTestId("task-skip")).toHaveCSS("opacity", "1");
    await shot(page, "e005-fake-skip-hover");
    await row(a, "Water the plants").getByTestId("task-skip").click();
    await expect(row(a, "Water the plants").getByTestId("hint-ack")).toHaveText("Skipped · next Dec 9");
    await expect(row(a, "Water the plants").getByTestId("task-check")).not.toBeChecked();
    expect(await fileText(page, `Chores/${name}`)).toBe(logged(original(name), { doOn: ["2026-12-02", "2026-12-09"], entry: "- 2026-12-02 skipped" }));
    await expect(row(a, "Water the plants")).toHaveCount(0);
    await a.getByTestId("view-recurring").click();
    await expect(row(a, "Water the plants").locator('[data-testid^="hint-"]')).toHaveText(["next Dec 9", "every Wed", "skipped today"]);
  });

  test("keyboard: Tab reaches Skip, Enter skips", async ({ page }) => {
    const a = await openPanel(page);
    await row(a, "Water the plants").getByTestId("task-open").focus();
    await page.keyboard.press("Tab");
    await expect(row(a, "Water the plants").getByTestId("task-skip")).toBeFocused();
    await expect(row(a, "Water the plants").getByTestId("task-skip")).toHaveCSS("opacity", "1");
    await page.keyboard.press("Enter");
    await expect(row(a, "Water the plants").getByTestId("hint-ack")).toHaveText("Skipped · next Dec 9");
  });
});

test.describe("the Recurring view", () => {
  test("every recurring item by next occurrence — the rule in words, the next date, the newest log entry; ended and unreadable rules last", async ({ page }) => {
    const a = await openPanel(page);
    await a.getByTestId("view-recurring").click();
    expect(await titles(a)).toEqual([
      "Pay the rent",
      "Change toothbrush",
      "Take vitamins",
      "Water the plants",
      "Upload invoices",
      "Plan the week",
      "Check the smoke alarms",
      "Pay the gym",
      "Renew the certificate",
    ]);
    const hints = async (title: string) => row(a, title).locator('[data-testid^="hint-"]').allTextContents();
    expect(await hints("Upload invoices")).toEqual(["Due in 3 days", "monthly on the 5th, shows 3 days early", "next Dec 5", "done Nov 4"]);
    expect(await hints("Check the smoke alarms")).toEqual(["next Dec 15", "monthly on the 15th", "done Nov 15"]);
    expect(await hints("Change toothbrush")).toEqual(["Overdue", "due Nov 9", "3 months after completion", "done Aug 9"]);
    expect(await hints("Pay the gym")).toEqual(["Ended", "monthly on the 10th, until Nov 30, 2026"]);
    await expect(row(a, "Pay the gym")).toHaveAttribute("data-reason", "ended");
    await expect(row(a, "Pay the gym").getByTestId("task-check")).toBeDisabled();
    await expect(row(a, "Pay the gym").getByTestId("task-skip")).toHaveCount(0);
    await expect(a.getByTestId("count-recurring")).toHaveText("8");
    await shot(page, "e005-fake-recurring-view");
    await a.getByTestId("view-all").click();
    await expect(row(a, "Check the smoke alarms").getByTestId("hint-next")).toHaveText("next Dec 15");
  });

  test("in the full tab", async ({ page }) => {
    await page.goto(harness({ surface: "tab", route: "planner" }));
    const a = app(page);
    await a.getByTestId("view-recurring").click();
    await expect(a.getByTestId("list-recurring")).toBeVisible();
    await shot(page, "e005-fake-recurring-tab");
  });

  test("inside a project: its recurring items only; + Add from… ▸ No project adds theirs", async ({ page }) => {
    const a = await openPanel(page, { project: "pomade" });
    await a.getByTestId("view-recurring").click();
    expect(await titles(a)).toEqual(["Renew the certificate"]);
    await addFrom(a, "No project");
    await expect(row(a, "Pay the rent").getByTestId("hint-source")).toHaveText("No project");
  });

  test("the switcher in a narrow panel: the counts go, the tabs tighten, Recurring shows as its glyph, then every view, then the glyphs join — all four stay whole", async ({ page }) => {
    for (const [width, steps] of [
      [420, []],
      [300, ["area-switcher--compact", "area-switcher--tight"]],
      [240, ["area-switcher--compact", "area-switcher--tight", "area-switcher--glyphs"]],
      [200, ["area-switcher--compact", "area-switcher--tight", "area-switcher--glyphs", "area-switcher--icons"]],
      [160, ["area-switcher--compact", "area-switcher--tight", "area-switcher--glyphs", "area-switcher--icons", "area-switcher--joined"]],
    ] as const) {
      const a = await openPanel(page, { panelWidth: width });
      const switcher = a.getByRole("tablist", { name: "Planner views" });
      await expect.poll(async () => SWITCHER_STEPS_IN(await switcher.evaluate((el) => el.className))).toEqual(steps);
      expect(await switcher.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await expect(a.getByRole("tab", { name: /^Recurring/ })).toBeVisible();
      await shot(page, `e005-fake-switcher-${width}`);
    }
  });

  test("a narrow panel: rules cut with an ellipsis, chips and hints wrap, nothing sideways", async ({ page }) => {
    const a = await openPanel(page, { panelWidth: 200 });
    await a.getByTestId("view-recurring").click();
    const overflow = await a.locator("html").evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
    await shot(page, "e005-fake-recurring-narrow");
    await a.getByTestId("view-today").click();
    await shot(page, "e005-fake-today-narrow");
  });
});

test.describe("repeat: edited by hand", () => {
  test("a new rule is re-computed within ~1 s; an invalid one shows the kit's error on the row — no crash, no write", async ({ page }) => {
    const a = await openPanel(page);
    const path = "Chores/2026-01-01-check-smoke-alarms.md";
    await page.evaluate((p) => window.fakeHost.writeFile(p, window.fakeHost.readFile(p).replace("monthly: { days: [15] }", "monthly: { days: [15] }\n  lead-days: 20")), path);
    await expect(row(a, "Check the smoke alarms").getByTestId("hint-reason")).toHaveText("Due in 13 days", { timeout: 1_000 });
    const broken = (await fileText(page, path)).replace("lead-days: 20", "lead-days: soon");
    await page.evaluate(([p, t]) => window.fakeHost.writeFile(p, t), [path, broken] as const);
    await a.getByTestId("view-recurring").click();
    await expect(row(a, "Check the smoke alarms").getByTestId("hint-problem")).toHaveText('repeat.lead-days: "soon" is not allowed — use a whole number of days, 0 or more (0 = only on the day)', {
      timeout: 1_000,
    });
    await expect(row(a, "Check the smoke alarms").getByTestId("task-check")).toBeDisabled();
    await shot(page, "e005-fake-recurring-error");
    expect(await fileText(page, path)).toBe(broken);
  });
});

test.describe("quick add", () => {
  test("the overlay: Recurring by keyboard, the repeat editor, the kit's words, Enter writes the file", async ({ page }) => {
    await page.goto(harness({ surface: "overlay", route: "quick-add" }));
    const a = app(page);
    await expect(a.getByTestId("qa-title")).toBeFocused();
    await page.keyboard.type("Upload the invoices");
    // Title, Tab: the project (title, Tab, qui still picks a project), Tab: the type.
    await page.keyboard.press("Tab");
    await expect(a.getByTestId("qa-project")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(a.getByTestId("qa-type-task")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(a.getByTestId("qa-type-recurring")).toBeChecked();
    await expect(a.getByTestId("qa-repeat")).toBeVisible();
    await expect(a.getByTestId("qa-repeat-description")).toHaveText("monthly on the 2nd · first Wed, Dec 2");
    // Mode, count, unit, on.
    for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
    await expect(a.getByTestId("qa-repeat-on")).toBeFocused();
    await page.keyboard.type("5");
    await page.keyboard.press("Tab");
    await expect(a.getByTestId("qa-repeat-lead")).toBeFocused();
    await page.keyboard.type("3");
    await expect(a.getByTestId("qa-repeat-description")).toHaveText("monthly on the 5th, shows 3 days early · first Sat, Dec 5");
    await shot(page, "e005-fake-quick-add-recurring-overlay");
    // The frame is the recurring form's 420×235: nothing scrolls or spills.
    expect(await a.locator("html").evaluate(() => [document.documentElement.scrollHeight, document.documentElement.clientHeight, document.documentElement.scrollWidth, document.documentElement.clientWidth])).toEqual([235, 235, 420, 420]);
    expect(await a.getByTestId("quick-add-form").evaluate((f) => f.scrollHeight <= f.clientHeight)).toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.locator("#stage iframe")).toHaveCount(0);
    expect(await fileText(page, "Chores/2026-12-02-upload-the-invoices.md")).toBe(
      "---\ntype: recurring\ntitle: Upload the invoices\nstatus: open\ndo-on: 2026-12-05\nrepeat:\n  monthly: { days: [5] }\n  lead-days: 3\ncreated: 2026-12-02\n---\n",
    );
  });

  test("after done, start and end phrases; a wrong value is the kit's error in the foot and Enter refuses", async ({ page }) => {
    await page.goto(harness({ surface: "overlay", route: "quick-add" }));
    const a = app(page);
    await a.getByTestId("qa-title").fill("Change toothbrush");
    await a.getByTestId("qa-type-recurring").check();
    await a.getByTestId("qa-repeat-mode").selectOption("after");
    await a.getByTestId("qa-repeat-count").fill("3");
    await expect(a.getByTestId("qa-repeat-unit")).toHaveValue("month");
    await expect(a.getByTestId("qa-repeat-on")).toHaveCount(0);
    await expect(a.getByTestId("qa-repeat-description")).toHaveText("3 months after completion · first Tue, Mar 2, 2027");
    await a.getByTestId("qa-repeat-lead").fill("soon");
    await expect(a.getByTestId("qa-repeat-error")).toHaveText('"soon" is not allowed — use a whole number of days, 0 or more (0 = only on the day)');
    await expect(a.getByTestId("qa-repeat-lead")).toHaveAttribute("aria-invalid", "true");
    await shot(page, "e005-fake-quick-add-recurring-error");
    await a.getByTestId("qa-repeat-lead").press("Enter");
    await expect(a.getByTestId("qa-repeat-error")).toBeVisible();
    await a.getByTestId("qa-repeat-lead").fill("");
    await a.getByTestId("qa-repeat-start").fill("dec 20");
    await a.getByTestId("qa-repeat-end").fill("dec 31 2027");
    await expect(a.getByTestId("qa-repeat-description")).toHaveText("3 months after completion, from Dec 20, 2026 until Dec 31, 2027 · first Sun, Dec 20");
    await a.getByTestId("qa-repeat-end").press("Enter");
    await expect(page.locator("#stage iframe")).toHaveCount(0);
    expect(await fileText(page, "Chores/2026-12-02-change-toothbrush.md")).toBe(
      "---\ntype: recurring\ntitle: Change toothbrush\nstatus: open\ndo-on: 2026-12-20\nrepeat:\n  after-completion: { months: 3 }\n  start: 2026-12-20\n  end: 2027-12-31\ncreated: 2026-12-02\n---\n",
    );
  });

  test("the panel's +: a weekly rule in quick add; the new item shows in Recurring", async ({ page }) => {
    const a = await openPanel(page);
    await a.getByTestId("view-recurring").click();
    const o = await openQuickAdd(page, a);
    await o.getByTestId("qa-title").fill("Take out the bins");
    await o.getByTestId("qa-type-recurring").check();
    await o.getByTestId("qa-repeat-unit").selectOption("week");
    await expect(o.getByTestId("qa-repeat-on")).toHaveAttribute("placeholder", "wed");
    await o.getByTestId("qa-repeat-on").fill("mon, thu");
    await expect(o.getByTestId("qa-repeat-description")).toHaveText("every Mon and Thu · first Thu, Dec 3");
    await shot(page, "e005-fake-quick-add-recurring-from-panel");
    await o.getByTestId("qa-repeat-on").press("Enter");
    await expect(page.locator('iframe[data-surface="overlay"]')).toHaveCount(0);
    await expect(row(a, "Take out the bins").getByTestId("hint-repeat")).toHaveText("every Mon and Thu");
    await expect(row(a, "Take out the bins").getByTestId("hint-next")).toHaveText("next Dec 3");
  });

  test("every 2 weeks on Mon and every 10 days from a start date: written in the kit's format, in Today on their runs only", async ({ page }) => {
    const a = await openPanel(page);
    let o = await openQuickAdd(page, a);
    await o.getByTestId("qa-title").fill("Pay the cleaner");
    await o.getByTestId("qa-type-recurring").check();
    await o.getByTestId("qa-repeat-count").fill("2");
    await o.getByTestId("qa-repeat-unit").selectOption("week");
    await expect(o.getByTestId("qa-repeat-unit").locator("option:checked")).toHaveText("weeks");
    await o.getByTestId("qa-repeat-on").fill("mon");
    await o.getByTestId("qa-repeat-start").fill("2026-11-30");
    await expect(o.getByTestId("qa-repeat-description")).toHaveText("every other Mon, from Nov 30, 2026 · first Mon, Dec 14");
    await shot(page, "t011-fake-quick-add-every-2-weeks");
    await o.getByTestId("qa-repeat-start").press("Enter");
    await expect(page.locator('iframe[data-surface="overlay"]')).toHaveCount(0);
    expect(await fileText(page, "Chores/2026-12-02-pay-the-cleaner.md")).toBe(
      "---\ntype: recurring\ntitle: Pay the cleaner\nstatus: open\ndo-on: 2026-12-14\nrepeat:\n  weekly: { every: 2, days: [mon] }\n  start: 2026-11-30\ncreated: 2026-12-02\n---\n",
    );

    o = await openQuickAdd(page, a);
    await o.getByTestId("qa-title").fill("Water the ficus");
    await o.getByTestId("qa-type-recurring").check();
    await o.getByTestId("qa-repeat-count").fill("10");
    await o.getByTestId("qa-repeat-unit").selectOption("day");
    await expect(o.getByTestId("qa-repeat-on")).toHaveCount(0);
    await o.getByTestId("qa-repeat-start").fill("2026-12-01");
    await expect(o.getByTestId("qa-repeat-description")).toHaveText("every 10 days, from Dec 1, 2026 · first Fri, Dec 11");
    await shot(page, "t011-fake-quick-add-every-10-days");
    await o.getByTestId("qa-repeat-start").press("Enter");
    await expect(page.locator('iframe[data-surface="overlay"]')).toHaveCount(0);
    expect(await fileText(page, "Chores/2026-12-02-water-the-ficus.md")).toBe(
      "---\ntype: recurring\ntitle: Water the ficus\nstatus: open\ndo-on: 2026-12-11\nrepeat:\n  daily: { every: 10 }\n  start: 2026-12-01\ncreated: 2026-12-02\n---\n",
    );

    // Today on Dec 2 holds neither; each shows on its own runs.
    for (const title of ["Pay the cleaner", "Water the ficus"]) await expect(row(a, title)).toHaveCount(0);
    await setClock(a, "2026-12-11T10:00");
    await expect(row(a, "Water the ficus").locator('[data-testid^="hint-"]')).toHaveText(["Due today", "every 10 days, from Dec 1, 2026"]);
    await expect(row(a, "Pay the cleaner")).toHaveCount(0);
    await row(a, "Water the ficus").getByTestId("task-check").click();
    await expect.poll(() => fileText(page, "Chores/2026-12-02-water-the-ficus.md")).toContain("do-on: 2026-12-21\n");
    await setClock(a, "2026-12-14T10:00");
    await expect(row(a, "Pay the cleaner").locator('[data-testid^="hint-"]')).toHaveText(["Due today", "every other Mon, from Nov 30, 2026"]);
    await expect(row(a, "Water the ficus")).toHaveCount(0);
    await shot(page, "t011-fake-today-every-2-weeks");
    await row(a, "Pay the cleaner").hover();
    await row(a, "Pay the cleaner").getByTestId("task-skip").click();
    await expect.poll(() => fileText(page, "Chores/2026-12-02-pay-the-cleaner.md")).toContain("do-on: 2026-12-28\n");
    await setClock(a, "2026-12-21T10:00");
    await expect(row(a, "Water the ficus").getByTestId("hint-reason")).toHaveText("Due today");
    await expect(row(a, "Pay the cleaner")).toHaveCount(0);
    await setClock(a, "2026-12-28T10:00");
    await expect(row(a, "Pay the cleaner").getByTestId("hint-reason")).toHaveText("Due today");
  });

  test("from a 160px panel the + still opens the full 420-wide form: the repeat rows fit, nothing spills", async ({ page }) => {
    const a = await openPanel(page, { panelWidth: 160 });
    const o = await openQuickAdd(page, a);
    await o.getByTestId("qa-type-recurring").check();
    const fits = await o.locator("form").evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1);
    expect(fits).toBe(true);
    const card = await page.locator('iframe[data-surface="overlay"]').boundingBox();
    expect(card?.width).toBe(420);
    for (const testId of ["qa-repeat-mode", "qa-repeat-unit", "qa-repeat-on", "qa-repeat-end", "qa-project"]) {
      const field = await o.getByTestId(testId).boundingBox();
      expect((field?.x ?? 0) + (field?.width ?? 0), testId).toBeLessThanOrEqual((card?.x ?? 0) + (card?.width ?? 0));
    }
    await shot(page, "e005-fake-quick-add-recurring-from-narrow-panel");
  });
});
