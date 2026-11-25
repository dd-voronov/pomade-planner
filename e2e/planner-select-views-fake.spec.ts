// E-012 on the fake host ([[trimming]]): select mode in Today, Project and Recurring as in All —
// started from the panel's ⋯, the tab's Select button, or a row menu's Select… with that row
// selected; select all and a Shift-range take only the rows shown (a folded group's are not); the
// daily note's card selects; Delete N… and Archive; switching the view or the context ends it.
// Fixtures: the planner workspace with notes at Workspace on Tue 2026-11-17, and its Chores/ on Wed
// 2026-12-02 for Recurring.

import { expect, test, type FrameLocator, type Locator, type Page } from "@playwright/test";

import { APP_PORT, HARNESS_PORT } from "../playwright.config";
import { row } from "./fixtures/planner";
import { shot } from "./fixtures/screens";

const APP = `http://localhost:${APP_PORT}/`;

interface Open {
  surface?: "tab" | "panel";
  panelWidth?: number;
  tasks?: string;
  now?: string;
  project?: string;
}

function harness(open: Open): string {
  const surface = open.surface ?? "panel";
  const params = new URLSearchParams({ app: APP, surface, tasks: open.tasks ?? "Tasks", now: open.now ?? "2026-11-17T10:00", fixture: "planner", extra: "notes", project: open.project ?? "workspace" });
  if (surface === "panel") params.set("icon", "planner");
  else params.set("route", "planner");
  if (open.panelWidth !== undefined) params.set("panelWidth", String(open.panelWidth));
  return `http://localhost:${HARNESS_PORT}/index.html?${params.toString()}`;
}

const app = (page: Page): FrameLocator => page.frameLocator("#stage iframe >> nth=0");
const exists = (page: Page, path: string) =>
  page.evaluate((p) => {
    try {
      window.fakeHost.readFile(p);
      return true;
    } catch {
      return false;
    }
  }, path);

interface Dispatching {
  dispatch(frame: unknown, call: { method: string; params: { paths?: string[] } }): unknown;
}
declare global {
  interface Window {
    deleteCalls: string[][];
  }
}

/** Record every `files.delete` the app makes (the fake host deletes the files). */
async function watchDeletes(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.deleteCalls = [];
    const host = window.fakeHost as unknown as Dispatching;
    const original = host.dispatch.bind(host);
    host.dispatch = (frame, call) => {
      if (call.method === "files.delete") window.deleteCalls.push(call.params.paths ?? []);
      return original(frame, call);
    };
  });
}
const deleteCalls = (page: Page) => page.evaluate(() => window.deleteCalls);

async function openPlanner(page: Page, open: Open = {}): Promise<FrameLocator> {
  await page.goto(harness(open));
  const a = app(page);
  await expect(a.locator('main[data-daily]:not([data-daily="pending"])')).toHaveCount(1);
  return a;
}

/** The day's daily note with a checklist — the tab alone makes none (the panel does) — and its card shown. */
async function withCard(page: Page, a: FrameLocator): Promise<void> {
  await page.evaluate(() => window.fakeHost.writeFile("Tasks/Daily/2026-11-17.md", "---\ntype: daily-note\ndate: 2026-11-17\n---\n- [x] Stretch\n- [ ] Inbox to zero\n- [ ] Read with Nora\n"));
  await expect(a.getByTestId("daily-card")).toBeVisible();
}

async function showView(a: FrameLocator, id: "today" | "project" | "recurring" | "all"): Promise<void> {
  await a.getByTestId(`view-${id}`).click();
  await expect(a.getByTestId(`view-${id}`)).toHaveAttribute("aria-selected", "true");
}

/** Start select mode from the header: the panel's ⋯ → Select items…, the tab's Select button. */
async function startSelect(a: FrameLocator, surface: Open["surface"] = "panel"): Promise<void> {
  if (surface === "tab") await a.getByTestId("select-start").click();
  else {
    await a.getByTestId("planner-menu-button").click();
    await a.getByTestId("menu-select").click();
  }
  await expect(a.getByTestId("select-bar")).toBeVisible();
}

/** Start select mode from a row's menu: right-click ▸ Select…. */
async function selectFromMenu(a: FrameLocator, target: Locator): Promise<void> {
  await target.click({ button: "right" });
  await a.getByTestId("row-menu-select").click();
  await expect(a.getByTestId("row-menu")).toHaveCount(0);
  await expect(a.getByTestId("select-bar")).toBeVisible();
}

/** The selected rows' paths, top to bottom (the daily note's card included). */
const selectedPaths = (a: FrameLocator) => a.locator('.planner__body [data-selected="true"]').evaluateAll((els) => els.map((el) => el.getAttribute("data-path")));
const heading = (a: FrameLocator, key: string) => a.locator(`[data-testid="task-section"][data-group="${key}"]`);

const RENEW = "Tasks/2026-11-10-renew-swimming-class.md";
const DENTIST = "Tasks/2026-11-15-call-the-dentist.md";
const INK = "Tasks/2026-11-09-buy-printer-ink.md";
const CARD = "Tasks/Daily/2026-11-17.md";

test.describe("select mode in every view", () => {
  test("Today: right-click a task ▸ Select… — 1 selected, its box focused; Shift-click further down selects the range; Delete 3… ▸ Move to Trash calls files.delete with those paths", async ({ page }) => {
    const a = await openPlanner(page);
    await watchDeletes(page);
    const renew = row(a, "Renew Nora's swimming class");
    await selectFromMenu(a, renew);
    await expect(a.getByTestId("select-count")).toHaveText("1 selected");
    await expect(renew).toHaveAttribute("data-selected", "true");
    await expect(renew.getByTestId("select-row")).toBeFocused();
    await expect(a.getByTestId("view-today")).toHaveAttribute("aria-selected", "true");

    await row(a, "Buy printer ink").getByTestId("task-open").click({ modifiers: ["Shift"] });
    expect(await selectedPaths(a)).toEqual([RENEW, DENTIST, INK]);
    await expect(a.getByTestId("select-delete")).toHaveText("Delete 3…");
    expect(await page.evaluate(() => window.fakeHost.openedTabs)).toEqual([]);
    await shot(page, "e012-fake-today-range-panel");

    await a.getByTestId("select-delete").click();
    await expect(a.getByTestId("delete-confirm-title")).toHaveText("Delete 3 files?");
    await a.getByTestId("delete-confirm-button").click();
    await expect.poll(() => deleteCalls(page)).toEqual([[RENEW, DENTIST, INK]]);
    await expect(renew).toHaveCount(0);
    await expect(row(a, "Buy printer ink")).toHaveCount(0);
    for (const path of [RENEW, DENTIST, INK]) expect(await exists(page, path)).toBe(false);
    await expect(a.getByTestId("select-bar")).toHaveCount(0);
    await expect(a.getByTestId("planner-error")).toHaveCount(0);
  });

  test("Project: two notes selected offer Archive, which archives them; a task among them takes it away; switching the view ends select mode", async ({ page }) => {
    const a = await openPlanner(page);
    await showView(a, "project");
    await selectFromMenu(a, row(a, "Gift ideas for Greta"));
    await row(a, "Quiz timer idea").getByTestId("select-row").click();
    await expect(a.getByTestId("select-count")).toHaveText("2 selected");
    await expect(a.getByTestId("select-archive")).toBeVisible();
    await row(a, "Learn a piano piece").getByTestId("select-row").click();
    await expect(a.getByTestId("select-archive")).toHaveCount(0);
    await row(a, "Learn a piano piece").getByTestId("select-row").click();
    await shot(page, "e012-fake-project-two-notes-panel");
    await a.getByTestId("select-archive").click();
    await expect(a.getByTestId("select-bar")).toHaveCount(0);
    await expect(row(a, "Gift ideas for Greta")).toHaveCount(0);
    expect(await exists(page, "Tasks/_archive/2026-11-12-gift-ideas.md")).toBe(true);
    expect(await exists(page, "Tasks/_archive/2026-11-12-quiz-timer-idea.md")).toBe(true);

    await startSelect(a);
    await row(a, "Learn a piano piece").getByTestId("select-row").click();
    await showView(a, "recurring");
    await expect(a.getByTestId("select-bar")).toHaveCount(0);
    await showView(a, "project");
    await expect(a.getByTestId("select-bar")).toHaveCount(0);
    await expect(a.locator("[data-selected]")).toHaveCount(0);
    await expect(row(a, "Learn a piano piece").getByTestId("task-check")).toBeVisible();
  });

  test("select all and ⌘A take the rows shown: the card and the unreadable files, none of a folded group's; folding a group drops its rows from the selection", async ({ page }) => {
    const a = await openPlanner(page);
    await heading(a, "none").getByTestId("task-section-toggle").click();
    await expect(heading(a, "none")).toHaveAttribute("data-folded", "true");
    await startSelect(a);
    await a.getByTestId("select-all").click();
    const shown = [CARD, "Tasks/Old stuff/2026-11-01-sort-the-attic.md", "Tasks/Pomade/2026-11-15-review-the-host-api.md", "Tasks/Pomade/2026-11-16-ship-the-planner.md", "Tasks/QuizLab/2026-11-14-fix-the-score-screen.md", "Tasks/2026-11-13-broken.md", "Tasks/QuizLab/2026-11-14-broken.md"];
    expect(await selectedPaths(a)).toEqual(shown);
    await expect(a.getByTestId("select-count")).toHaveText("7 selected");
    await expect(a.getByTestId("select-all")).toBeChecked();
    await shot(page, "e012-fake-today-folded-select-all-panel");

    // Unfolded, the group's rows show unselected: the box is mixed.
    await heading(a, "none").getByTestId("task-section-toggle").click();
    await expect(row(a, "Pay the tax")).toHaveAttribute("data-selected", "false");
    await expect(a.getByTestId("select-all")).toHaveJSProperty("indeterminate", true);
    await page.keyboard.press("Meta+a");
    await expect(a.getByTestId("select-count")).toHaveText("13 selected");

    // Folding a group drops its rows from the selection.
    await heading(a, "pomade").getByTestId("task-section-toggle").click();
    await expect(a.getByTestId("select-count")).toHaveText("11 selected");
    await heading(a, "pomade").getByTestId("task-section-toggle").click();
    await expect(row(a, "Ship the planner")).toHaveAttribute("data-selected", "false");
    await expect(a.getByTestId("select-count")).toHaveText("11 selected");
  });

  test("the daily note's card selects as a row does — its box, no unpin, ↓ from it to the rows — and its menu's Select… starts select mode with it", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    await withCard(page, a);
    const card = a.getByTestId("daily-card");
    await selectFromMenu(a, card);
    await expect(card).toHaveAttribute("data-selected", "true");
    await expect(card.getByTestId("select-row")).toBeFocused();
    await expect(card.getByTestId("daily-card-unpin")).toHaveCount(0);
    await expect(a.getByTestId("select-count")).toHaveText("1 selected");
    await expect(a.getByTestId("select-archive")).toHaveCount(0);
    await shot(page, "e012-fake-today-card-selected-tab");
    await page.keyboard.press("ArrowDown");
    await expect(row(a, "Pay the tax").getByTestId("select-row")).toBeFocused();
    await page.keyboard.press("Space");
    await card.getByTestId("daily-card-open").click();
    expect(await selectedPaths(a)).toEqual(["Tasks/2026-11-01-pay-the-tax.md"]);
    expect(await page.evaluate(() => window.fakeHost.openedTabs)).toEqual([]);
    await expect(a.getByTestId("item-pane")).toHaveCount(0);
    await card.getByTestId("daily-card-open").click();
    await row(a, "Renew Nora's swimming class").getByTestId("task-open").click({ modifiers: ["Shift"] });
    expect(await selectedPaths(a)).toEqual([CARD, "Tasks/2026-11-01-pay-the-tax.md", RENEW]);
    await page.keyboard.press("Escape");
    await expect(a.getByTestId("select-bar")).toHaveCount(0);
    await expect(a.getByTestId("select-start")).toBeFocused();
    await expect(card.getByTestId("daily-card-unpin")).toBeVisible();
  });

  test("Recurring: Select… on a recurring row; its Skip and pin go while selecting; select all; Archive is not offered; Done leaves", async ({ page }) => {
    const a = await openPlanner(page, { tasks: "Chores", now: "2026-12-02T10:00" });
    await showView(a, "recurring");
    const plants = row(a, "Water the plants");
    await selectFromMenu(a, plants);
    await expect(plants).toHaveAttribute("data-selected", "true");
    await expect(a.locator('[data-testid="list-recurring"] [data-testid="task-skip"]')).toHaveCount(0);
    await expect(a.locator('[data-testid="list-recurring"] [data-testid="task-check"]')).toHaveCount(0);
    await a.getByTestId("select-all").click();
    const rows = await a.locator('[data-testid="list-recurring"] > [data-testid="task-row"]').count();
    expect(rows).toBeGreaterThan(1);
    await expect(a.getByTestId("select-count")).toHaveText(`${String(rows)} selected`);
    await expect(a.getByTestId("select-archive")).toHaveCount(0);
    await shot(page, "e012-fake-recurring-select-all-panel");
    await a.getByTestId("select-done").click();
    await expect(a.getByTestId("select-bar")).toHaveCount(0);
    await expect(a.getByTestId("planner-menu-button")).toBeFocused();
  });

  test("the context changing ends select mode; a click on a view already shown keeps it", async ({ page }) => {
    const a = await openPlanner(page);
    await startSelect(a);
    await row(a, "Pay the tax").getByTestId("select-row").click();
    await a.getByTestId("view-today").click();
    await expect(a.getByTestId("select-count")).toHaveText("1 selected");
    await page.evaluate(() => window.fakeHost.setActiveProject("quiz"));
    await expect(a.getByTestId("planner-context")).toHaveText("All projects");
    await expect(a.getByTestId("select-bar")).toHaveCount(0);
    await expect(a.locator("[data-selected]")).toHaveCount(0);
  });

  test("the row menu: Select… after the row's own actions, before the separator and Delete…", async ({ page }) => {
    const a = await openPlanner(page, { panelWidth: 160 });
    await showView(a, "project");
    await row(a, "Quiz timer idea").click({ button: "right" });
    await expect(a.getByTestId("row-menu").getByRole("menuitem")).toHaveText(["Open in tab", "Pin", "Archive", "Select…", "Delete…"]);
    await shot(page, "e012-fake-row-menu-select-panel-160");
  });

  for (const [name, open] of [
    ["panel-160", { surface: "panel", panelWidth: 160 }],
    ["panel-240", { surface: "panel", panelWidth: 240 }],
    ["tab", { surface: "tab" }],
  ] as const) {
    test(`select mode fits the ${name} in Today, Project and Recurring: nothing spills sideways, Done inside the bar`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      const sideways = (f: FrameLocator) => f.locator("html").evaluate((el) => el.scrollWidth - el.clientWidth);
      const fits = async (f: FrameLocator) => {
        expect(await sideways(f)).toBe(0);
        const bar = await f.getByTestId("select-bar").boundingBox();
        const done = await f.getByTestId("select-done").boundingBox();
        expect((done?.x ?? 0) + (done?.width ?? 0)).toBeLessThanOrEqual((bar?.x ?? 0) + (bar?.width ?? 0));
      };

      let a = await openPlanner(page, open);
      await withCard(page, a);
      await heading(a, "pomade").getByTestId("task-section-toggle").click();
      await startSelect(a, open.surface);
      await a.getByTestId("daily-card").getByTestId("select-row").click();
      await row(a, "Book flights for the Christmas trip to see the grandparents in Valencia").getByTestId("select-row").click();
      await fits(a);
      await shot(page, `e012-fake-today-${name}`);

      await showView(a, "project");
      await startSelect(a, open.surface);
      await row(a, "Gift ideas for Greta").getByTestId("select-row").click();
      await row(a, "Quiz timer idea").getByTestId("select-row").click();
      await expect(a.getByTestId("select-archive")).toBeVisible();
      await fits(a);
      await shot(page, `e012-fake-project-${name}`);

      a = await openPlanner(page, { ...open, tasks: "Chores", now: "2026-12-02T10:00" });
      await showView(a, "recurring");
      await startSelect(a, open.surface);
      await a.getByTestId("select-all").click();
      await fits(a);
      await shot(page, `e012-fake-recurring-${name}`);
    });
  }
});
