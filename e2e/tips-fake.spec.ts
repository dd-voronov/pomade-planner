// T-002 on the fake host: the Planner's header (the tab's gear; the panel's first level — views,
// +, Open in tab, ⋯ — down to the 160px minimum), and the tooltips of the app's own controls
// (src/core/Tips.tsx): on hover after a short rest, at once on keyboard focus, inside the frame's
// edges, gone on a press, Escape and the pointer leaving — in the Planner and on the Board. T-018:
// every explaining control of the Planner uses that tooltip instead of a `title`, and a row's
// title says what a click and a ⌘-click do after a second.

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

/** The Planner on `tasks` (default Tasks) at `now`, in the context `project` (default Workspace); the notes fixture only with `Tasks`. */
function plannerOn(surface: "tab" | "panel", open: { panelWidth?: number; tasks?: string; now?: string; project?: string | null } = {}): string {
  const params = new URLSearchParams({ app: APP, surface, tasks: open.tasks ?? "Tasks", now: open.now ?? "2026-11-17T10:00", fixture: "planner", extra: "notes" });
  if (open.project !== null) params.set("project", open.project ?? "workspace");
  if (surface === "panel") params.set("icon", "planner");
  else params.set("route", "planner");
  if (open.panelWidth !== undefined) params.set("panelWidth", String(open.panelWidth));
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

const ROW_HINT_PANEL = "Click: open in the Planner tab · ⌘-click: open the file in the editor";
const ROW_HINT_TAB = "Click: open here · ⌘-click: open the file in the editor";

/** Every button, field, switch and label of the frame that still explains itself through a `title`. */
const titled = (a: FrameLocator): Promise<string[]> =>
  a.locator("html").evaluate((html) => [...html.querySelectorAll("button[title], input[title], textarea[title], select[title], label[title], [role=switch][title], [role=radio][title]")].map((el) => `${el.tagName.toLowerCase()}[${el.getAttribute("data-testid") ?? el.className}]`));

/** Rest the pointer on `control`: nothing shows for the first 600 ms, then `text` does within the next second, whole inside the frame. */
async function hoverShowsSlowly(page: Page, a: FrameLocator, control: Locator, text: string): Promise<void> {
  await control.hover({ position: { x: 10, y: 8 } });
  await page.waitForTimeout(600); // eslint-disable-line playwright/no-wait-for-timeout -- the row's hint must not show before its second is up
  await expect(tip(a)).toHaveCount(0);
  await expect(tip(a)).toHaveText(text, { timeout: 1000 });
  await tipInsideFrame(a, control);
}

test.describe("the controls' hints are the Planner's tooltip (T-018)", () => {
  test("the add form: Details, the project field and each type of the switch show their hint as a tooltip and carry no title", async ({ page }) => {
    await page.goto(plannerOn("tab"));
    const a = app(page);
    await expect(a.locator('main[data-daily]:not([data-daily="pending"])')).toHaveCount(1);
    await a.getByTestId("planner-add").click();
    await expect(a.getByTestId("qa-title")).toBeFocused();
    await expect(a.getByTestId("qa-details")).not.toHaveAttribute("title");
    await hoverShows(a, a.getByTestId("qa-details"), "Details — the file's text under its fields, markdown as typed");
    await shot(page, "t018-fake-tip-details");
    await hoverShows(a, a.getByTestId("qa-project"), "Change the project: type its name, or press ↓");
    await pointerAway(page);
    const note = a.getByTestId("qa-type-note");
    await hoverShows(a, a.locator("label.qa-kind__option").filter({ has: note }), "Note — a quick drop, not a task");
    await shot(page, "t018-fake-tip-type");
    expect(await titled(a)).toEqual([]);
  });

  test("a click into Details shows no tip over the text being typed; Tab onto it does", async ({ page }) => {
    await page.goto(plannerOn("tab"));
    const a = app(page);
    await expect(a.locator('main[data-daily]:not([data-daily="pending"])')).toHaveCount(1);
    await a.getByTestId("planner-add").click();
    await pointerAway(page);
    await a.getByTestId("qa-details").click();
    await page.waitForTimeout(500); // eslint-disable-line playwright/no-wait-for-timeout -- a tip would have shown at once
    await expect(tip(a)).toHaveCount(0);
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(a.getByTestId("qa-details")).toBeFocused();
    await expect(tip(a)).toHaveText(/^Details — /, { timeout: 100 });
  });

  test("the item pane's Details, and a locked tick's reason, are tooltips too", async ({ page }) => {
    await page.goto(plannerOn("tab", { tasks: "Chores", now: "2026-12-02T10:00" }));
    const a = app(page);
    await expect(a.locator('main[data-daily]:not([data-daily="pending"])')).toHaveCount(1);
    await a.getByTestId("view-recurring").click();
    const ended = row(a, "Pay the gym");
    const tick = ended.locator("label.task-check");
    await expect(tick).not.toHaveAttribute("title");
    await hoverShows(a, tick, "Ended — change end or do-on in the file to bring it back");
    await shot(page, "t018-fake-tip-locked-tick");
    await ended.getByTestId("task-open").click();
    const pane = a.getByTestId("item-pane");
    await expect(pane).toBeFocused();
    await hoverShows(a, pane.locator("label.task-check"), "Ended — change end or do-on in the file to bring it back");
    await hoverShows(a, pane.getByTestId("qa-details"), "Details — the file's text under its fields, markdown as typed");
    await shot(page, "t018-fake-tip-item-pane");
    expect(await titled(a)).toEqual([]);
  });

  test("the select bar: select all, Archive, Delete and Done show their hints as tooltips", async ({ page }) => {
    await page.goto(plannerOn("tab"));
    const a = app(page);
    await expect(a.locator('main[data-daily]:not([data-daily="pending"])')).toHaveCount(1);
    await a.getByTestId("view-all").click();
    await a.getByTestId("select-start").click();
    await row(a, "Quiz timer idea").getByTestId("task-open").click();
    await hoverShows(a, a.getByTestId("select-archive"), "Move the selected notes into _archive/ — All shows them with “Show archived”");
    await shot(page, "t018-fake-tip-select-archive");
    await hoverShows(a, a.getByTestId("select-delete"), "Move the selected files to the Trash (⌫)");
    await hoverShows(a, a.getByTestId("select-done"), "Leave select mode (Esc)");
    await hoverShows(a, a.locator("label.select-bar__all"), "Select every row shown (⌘A)");
    expect(await titled(a)).toEqual([]);
  });

  test("the mix-in chips of a project are tooltips too; no list, bar or form of the Planner keeps a title on a control", async ({ page }) => {
    await page.goto(plannerOn("panel", { project: null }));
    const a = app(page);
    await expect(a.locator('main[data-daily]:not([data-daily="pending"])')).toHaveCount(1);
    await a.getByTestId("view-project").click();
    await a.getByTestId("mix-no-project").click();
    await pointerAway(page);
    await hoverShows(a, a.getByTestId("mix-no-project"), "Stop mixing in the no-project items");
    for (const view of ["today", "project", "recurring", "all"]) {
      await a.getByTestId(`view-${view}`).click();
      expect(await titled(a), view).toEqual([]);
    }
  });

  test("a row's title says what a click and a ⌘-click do after a second — the panel's and the tab's; the element has no title", async ({ page }) => {
    for (const width of [160, 240]) {
      await page.goto(plannerOn("panel", { panelWidth: width }));
      const a = app(page);
      await expect(a.locator('main[data-daily]:not([data-daily="pending"])')).toHaveCount(1);
      await a.getByTestId("view-all").click();
      const open = row(a, "Quiz timer idea").getByTestId("task-open");
      await expect(open).not.toHaveAttribute("title");
      await hoverShowsSlowly(page, a, open, ROW_HINT_PANEL);
      await shot(page, `t018-fake-tip-row-panel-${String(width)}`);
    }
    await page.goto(plannerOn("tab"));
    const a = app(page);
    await expect(a.locator('main[data-daily]:not([data-daily="pending"])')).toHaveCount(1);
    await a.getByTestId("view-all").click();
    await hoverShowsSlowly(page, a, row(a, "Quiz timer idea").getByTestId("task-open"), ROW_HINT_TAB);
    await shot(page, "t018-fake-tip-row-tab");
  });

  test("the daily note's card carries the row hint; a row's own actions still show theirs at once, and a press puts the hint away", async ({ page }) => {
    await page.goto(plannerOn("panel"));
    const a = app(page);
    await expect(a.getByTestId("daily-card")).toBeVisible();
    const card = a.getByTestId("daily-card-open");
    await expect(card).not.toHaveAttribute("title");
    await hoverShowsSlowly(page, a, card, ROW_HINT_PANEL);
    await shot(page, "t018-fake-tip-daily-card");
    await page.mouse.down();
    await expect(tip(a)).toHaveCount(0);
    await page.mouse.up();
    await a.getByTestId("view-all").click();
    const note = row(a, "Quiz timer idea");
    await hoverShowsSlowly(page, a, note.getByTestId("task-open"), ROW_HINT_PANEL);
    await hoverShows(a, note.getByTestId("task-pin"), "Pin to the top of this view");
  });

  test("a row shows no hint while its menu is open, nor in select mode", async ({ page }) => {
    await page.goto(plannerOn("panel"));
    const a = app(page);
    await expect(a.locator('main[data-daily]:not([data-daily="pending"])')).toHaveCount(1);
    await a.getByTestId("view-all").click();
    const open = row(a, "Quiz timer idea").getByTestId("task-open");
    await open.click({ button: "right" });
    await expect(a.getByRole("menu")).toBeVisible();
    await expect(open).not.toHaveAttribute("data-tip");
    await page.waitForTimeout(1300); // eslint-disable-line playwright/no-wait-for-timeout -- past the hint's second
    await expect(tip(a)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(a.getByRole("menu")).toHaveCount(0);
    await expect(open).toHaveAttribute("data-tip", ROW_HINT_PANEL);

    await pointerAway(page);
    await a.getByTestId("planner-menu-button").click();
    await a.getByTestId("menu-select").click();
    const selecting = row(a, "Gift ideas for Greta").getByTestId("task-open");
    await expect(selecting).not.toHaveAttribute("data-tip");
    await selecting.hover();
    await page.waitForTimeout(1300); // eslint-disable-line playwright/no-wait-for-timeout -- past the hint's second
    await expect(tip(a)).toHaveCount(0);
  });
});
