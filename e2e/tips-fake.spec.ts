// T-002 on the fake host: the Planner's header (the tab's gear; the panel's first level — views,
// +, Open in tab, ⋯ — down to the 160px minimum), and the tooltips of the app's own controls
// (src/core/Tips.tsx): on hover after a short rest, at once on keyboard focus, inside the frame's
// edges, gone on a press, Escape and the pointer leaving — in the Planner and on the Board.

import { expect, test, type FrameLocator, type Locator, type Page } from "@playwright/test";

import { APP_PORT, BOARD_URL, HARNESS_PORT } from "../playwright.config";
import { row } from "./fixtures/planner";
import { shot } from "./fixtures/screens";

const APP = `http://localhost:${APP_PORT}/`;

function planner(surface: "tab" | "panel", panelWidth?: number): string {
  const params = new URLSearchParams({ app: APP, surface, tasks: "Tasks", now: "2026-11-17T10:00", fixture: "planner", extra: "notes", project: "workspace" });
  if (surface === "panel") params.set("icon", "planner");
  else params.set("route", "planner");
  if (panelWidth !== undefined) params.set("panelWidth", String(panelWidth));
  return `http://localhost:${HARNESS_PORT}/index.html?${params.toString()}`;
}

const board = `http://localhost:${HARNESS_PORT}/index.html?${new URLSearchParams({ app: BOARD_URL, surface: "tab", icon: "board" }).toString()}`;

const app = (page: Page): FrameLocator => page.frameLocator("#stage iframe >> nth=0");
const tip = (a: FrameLocator): Locator => a.getByTestId("tip");

async function openPlanner(page: Page, surface: "tab" | "panel", panelWidth?: number): Promise<FrameLocator> {
  await page.goto(planner(surface, panelWidth));
  const a = app(page);
  await expect(a.locator('main[data-daily]:not([data-daily="pending"])')).toHaveCount(1);
  return a;
}

/** Take the pointer off every control: the frame's bottom-right corner. */
async function pointerAway(page: Page): Promise<void> {
  const stage = await page.locator("#stage iframe").boundingBox();
  if (!stage) throw new Error("no app frame");
  await page.mouse.move(stage.x + stage.width - 2, stage.y + stage.height - 2);
}

/** The tip is whole inside the frame, a margin from its edges, and clear of the control it names. */
async function tipInsideFrame(a: FrameLocator, control: Locator): Promise<void> {
  const box = await tip(a).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: window.innerWidth, height: window.innerHeight };
  });
  expect(box.left).toBeGreaterThanOrEqual(8);
  expect(box.top).toBeGreaterThanOrEqual(8);
  expect(box.right).toBeLessThanOrEqual(box.width - 8);
  expect(box.bottom).toBeLessThanOrEqual(box.height - 8);
  const anchor = await control.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  });
  expect(box.top >= anchor.bottom || box.bottom <= anchor.top).toBe(true);
}

/** Hover `control`: its tip shows `text` within half a second, inside the frame. */
async function hoverShows(a: FrameLocator, control: Locator, text: string): Promise<void> {
  await control.hover();
  await expect(tip(a)).toHaveText(text, { timeout: 600 });
  await expect(tip(a)).toBeVisible();
  await tipInsideFrame(a, control);
}

test.describe("the Planner's header", () => {
  test("the panel's first level is the views, +, Open in tab and ⋯ — on every view; Open in tab opens the Planner tab", async ({ page }) => {
    const a = await openPlanner(page, "panel");
    const firstLevel = () => a.locator(".planner__header button:visible").evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
    const level = ["view-today", "view-project", "view-recurring", "view-all", "planner-add", "planner-open-tab", "planner-menu-button"];
    expect(await firstLevel()).toEqual(level);
    await a.getByTestId("view-all").click();
    expect(await firstLevel()).toEqual(level);
    await a.getByTestId("planner-open-tab").click();
    await expect.poll(() => page.evaluate(() => window.fakeHost.openedTabs.at(-1))).toMatchObject({ kind: "app", route: "planner" });
  });

  test("the tab's Settings is Pomade's gear, and opens the settings page", async ({ page }) => {
    const a = await openPlanner(page, "tab");
    const settings = a.getByTestId("planner-settings");
    await expect(settings).toHaveText("⚙");
    await expect(settings.locator("svg")).toHaveCount(0);
    await expect(a.getByTestId("planner-open-tab")).toHaveCount(0);
    await hoverShows(a, settings, "Settings");
    await shot(page, "t002-fake-tab-gear");
    await settings.click();
    await expect(a.getByTestId("planner-settings-page")).toBeVisible();
  });

  for (const width of [160, 200, 240, 320]) {
    test(`a ${String(width)}px panel fits the first level: every view whole, the three buttons inside, nothing sideways`, async ({ page }) => {
      const a = await openPlanner(page, "panel", width);
      for (const view of ["today", "all"] as const) {
        await a.getByTestId(`view-${view}`).click();
        await expect(a.getByTestId(`view-${view}`)).toHaveAttribute("aria-selected", "true");
        const fit = await a.locator(".planner__header").evaluate((header) => {
          const switcher = header.querySelector<HTMLElement>("[role=tablist]");
          const last = header.querySelector<HTMLElement>('[data-testid="planner-menu-button"]');
          if (!switcher || !last) throw new Error("no header");
          const buttons = [...header.querySelectorAll<HTMLElement>(".planner__actions button")].map((b) => Math.round(b.getBoundingClientRect().width));
          return {
            switcher: switcher.scrollWidth <= switcher.clientWidth,
            right: last.getBoundingClientRect().right <= header.getBoundingClientRect().right,
            buttons,
            gap: Math.round(header.querySelector<HTMLElement>(".planner__actions")!.getBoundingClientRect().left - switcher.getBoundingClientRect().right),
            sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
        });
        expect(fit.switcher).toBe(true);
        expect(fit.right).toBe(true);
        expect(fit.buttons).toEqual([24, 24, 24]);
        expect(fit.gap).toBeGreaterThanOrEqual(0);
        expect(fit.sideways).toBe(0);
      }
      await shot(page, `t002-fake-panel-${String(width)}`);
    });
  }
});

test.describe("tooltips", () => {
  for (const width of [160, 240]) {
    test(`a ${String(width)}px panel: +, Open in tab, ⋯, a row's pin and a row's action each show their name on hover, inside the frame`, async ({ page }) => {
      const a = await openPlanner(page, "panel", width);
      await expect(tip(a)).toHaveCount(0);
      await hoverShows(a, a.getByTestId("planner-add"), "New task (⌘⇧A)");
      await shot(page, `t002-fake-tip-add-${String(width)}`);
      await hoverShows(a, a.getByTestId("planner-open-tab"), "Open in tab");
      await shot(page, `t002-fake-tip-open-tab-${String(width)}`);
      await hoverShows(a, a.getByTestId("planner-menu-button"), "More");
      await shot(page, `t002-fake-tip-more-${String(width)}`);

      await a.getByTestId("view-all").click();
      const note = row(a, "Quiz timer idea");
      await note.hover();
      await hoverShows(a, note.getByTestId("task-pin"), "Pin to the top of this view");
      await shot(page, `t002-fake-tip-pin-${String(width)}`);
      await hoverShows(a, note.getByTestId("task-archive"), "Move it into _archive/ — All shows it with “Show archived”");
      await shot(page, `t002-fake-tip-action-${String(width)}`);
    });
  }

  test("a tip waits for the pointer to rest, then the next control's shows at once; a press, Escape and the pointer leaving hide it", async ({ page }) => {
    const a = await openPlanner(page, "panel");
    const add = a.getByTestId("planner-add");
    await add.hover();
    // Not yet: a pointer passing over shows nothing.
    await expect(tip(a)).toHaveCount(0);
    await pointerAway(page);
    await page.waitForTimeout(500); // eslint-disable-line playwright/no-wait-for-timeout -- the tip's delay has passed and it still must not show
    await expect(tip(a)).toHaveCount(0);

    await hoverShows(a, add, "New task (⌘⇧A)");
    await a.getByTestId("planner-open-tab").hover();
    await expect(tip(a)).toHaveText("Open in tab", { timeout: 100 });

    await pointerAway(page);
    await expect(tip(a)).toHaveCount(0);

    // The pointer leaving the frame for the host's own UI takes the tip away too.
    await hoverShows(a, add, "New task (⌘⇧A)");
    await page.mouse.move(640, 10);
    await expect(tip(a)).toHaveCount(0);

    // Escape (the frame has the keyboard: the selected view is focused).
    await a.getByTestId("view-today").focus();
    await hoverShows(a, add, "New task (⌘⇧A)");
    await page.keyboard.press("Escape");
    await expect(tip(a)).toHaveCount(0);

    // A press puts the tip away, and it stays away while the pointer rests on the pressed control.
    await pointerAway(page);
    const more = a.getByTestId("planner-menu-button");
    await hoverShows(a, more, "More");
    await page.mouse.down();
    await expect(tip(a)).toHaveCount(0);
    await page.mouse.up();
    await expect(a.getByTestId("planner-menu")).toBeVisible();
    await page.waitForTimeout(500); // eslint-disable-line playwright/no-wait-for-timeout -- see above
    await expect(tip(a)).toHaveCount(0);
  });

  test("keyboard focus shows the tip at once and it follows the focus", async ({ page }) => {
    const a = await openPlanner(page, "panel");
    await a.getByTestId("view-all").focus();
    await page.keyboard.press("Tab");
    await expect(a.getByTestId("planner-add")).toBeFocused();
    await expect(tip(a)).toHaveText("New task (⌘⇧A)", { timeout: 100 });
    await tipInsideFrame(a, a.getByTestId("planner-add"));
    await page.keyboard.press("Tab");
    await expect(tip(a)).toHaveText("Open in tab", { timeout: 100 });
    await page.keyboard.press("Tab");
    await expect(tip(a)).toHaveText("More", { timeout: 100 });
    await shot(page, "t002-fake-tip-focus");
    await page.keyboard.press("Tab");
    await expect(a.getByTestId("planner-menu-button")).not.toBeFocused();
    await expect(tip(a).filter({ hasText: "More" })).toHaveCount(0);
  });

  test("a tip that says more than the control's name describes it while it shows; one that repeats the name does not", async ({ page }) => {
    const a = await openPlanner(page, "panel");
    await hoverShows(a, a.getByTestId("planner-open-tab"), "Open in tab");
    await expect(a.getByTestId("planner-open-tab")).not.toHaveAttribute("aria-describedby");
    await a.getByTestId("view-all").click();
    const note = row(a, "Quiz timer idea");
    await note.hover();
    const pin = note.getByTestId("task-pin");
    await hoverShows(a, pin, "Pin to the top of this view");
    await expect(tip(a)).toHaveRole("tooltip");
    await expect(pin).toHaveAccessibleDescription("Pin to the top of this view");
    await pointerAway(page);
    await expect(tip(a)).toHaveCount(0);
    await expect(pin).not.toHaveAttribute("aria-describedby");
  });

  test("a row's pin reached with the keyboard shows its tip while the list scrolls it into view; pinned, the row moves up and the tip leaves", async ({ page }) => {
    const a = await openPlanner(page, "tab");
    await a.getByTestId("view-all").click();
    const note = row(a, "Quiz timer idea");
    await note.getByTestId("task-open").focus();
    await page.keyboard.press("Tab");
    await expect(note.getByTestId("task-archive")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(note.getByTestId("task-pin")).toBeFocused();
    await expect(tip(a)).toHaveText("Pin to the top of this view");
    await tipInsideFrame(a, note.getByTestId("task-pin"));
    await shot(page, "t002-fake-tip-row-tab");
    await page.keyboard.press("Enter");
    await expect(a.getByTestId("pinned-list").getByText("Quiz timer idea")).toBeVisible();
    await expect(tip(a)).toHaveCount(0);
  });

  test("a view shows its name as a tip only while it shows as a glyph", async ({ page }) => {
    const narrow = await openPlanner(page, "panel", 160);
    await hoverShows(narrow, narrow.getByTestId("view-recurring"), "Recurring");
    await narrow.getByTestId("view-today").hover();
    await expect(tip(narrow)).toHaveText("Today");
    await shot(page, "t002-fake-tip-view-160");

    const wide = await openPlanner(page, "panel", 420);
    await wide.getByTestId("view-recurring").hover();
    await wide.getByTestId("planner-add").hover();
    await expect(tip(wide)).toHaveText("New task (⌘⇧A)");
    await wide.getByTestId("view-recurring").hover();
    await expect(tip(wide)).toHaveCount(0);
  });

  test("a control at the frame's bottom edge shows its tip above it", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 400 });
    const a = await openPlanner(page, "panel");
    await a.getByTestId("view-all").click();
    const low = a.locator('[data-testid="list-all"] [data-testid="task-row"]').filter({ has: a.getByTestId("task-pin") }).nth(4);
    await low.evaluate((el) => el.scrollIntoView({ block: "end" }));
    await low.hover();
    await hoverShows(a, low.getByTestId("task-pin"), "Pin to the top of this view");
    await expect(tip(a)).toHaveAttribute("data-side", "above");
    await shot(page, "t002-fake-tip-above");
  });

  test("the Board: ⋯, a column's + and its collapse show their names; the tip leaves when the column collapses", async ({ page }) => {
    await page.setViewportSize({ width: 1680, height: 900 });
    await page.goto(board);
    const b = app(page);
    await expect(b.getByTestId("board")).toBeVisible();
    await hoverShows(b, b.getByTestId("board-menu-button"), "Board settings");
    await shot(page, "t002-fake-tip-board-menu");
    const add = b.getByTestId("column-add").first();
    await add.hover();
    await expect(tip(b)).toHaveText(/^New .+ in .+$/);
    await tipInsideFrame(b, add);
    await shot(page, "t002-fake-tip-board-add");
    const expand = b.getByTestId("column-expand").first();
    await expand.hover();
    await expect(tip(b)).toHaveText(/^Show /);
    await expand.click();
    const collapse = b.getByTestId("column-collapse").first();
    await pointerAway(page);
    await collapse.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(collapse).toBeFocused();
    await expect(tip(b)).toHaveText(/^Collapse /);
    await page.keyboard.press("Enter");
    await expect(tip(b)).toHaveCount(0);
  });
});
