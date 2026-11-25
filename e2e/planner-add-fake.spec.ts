// E-008 and E-013 on the fake host: adding from the Planner — in the tab the header's + and the
// list's Add button open the add form in place at the foot of the list (never the overlay); in the
// panel, too narrow for the form, both open the overlay with the view's pre-fills in its route;
// after an add, in place or in the overlay, the Planner goes to a view that lists the item and
// shows its row marked (focused after an add in place) — the panel brought forward at it, the tabs
// told by `item.added`; Details as the file's body; the type walked with ⌥Tab; Tab kept inside the
// form; ⌘↵ and ⇧⌘↵. The fixture is dated around Tue 2026-11-17.

import { expect, test, type FrameLocator, type Locator, type Page } from "@playwright/test";

import { APP_PORT, HARNESS_PORT } from "../playwright.config";
import { QUICK_ADD_HEIGHT } from "../src/core/views";
import { openAddForm, openQuickAdd, overlay, quickAdded, row, settled, titles } from "./fixtures/planner";
import { shot } from "./fixtures/screens";

const APP = `http://localhost:${APP_PORT}/`;

interface Open {
  surface: "tab" | "panel" | "overlay";
  project?: string;
  panelWidth?: number;
  /** `planner`: the projects workspace; default the plain one (no project folders, no recurring items). */
  fixture?: string;
  extra?: string;
  /** The tasks root and the clock: default Tasks on Tue 2026-11-17; Chores (the recurring items) is dated around Wed 2026-12-02. */
  tasks?: string;
  now?: string;
}

function harness(open: Open): string {
  const params = new URLSearchParams({ app: APP, surface: open.surface, tasks: open.tasks ?? "Tasks", now: open.now ?? "2026-11-17T10:00", project: open.project ?? "workspace" });
  if (open.surface === "panel") params.set("icon", "planner");
  else params.set("route", open.surface === "tab" ? "planner" : "quick-add");
  for (const key of ["panelWidth", "fixture", "extra"] as const) {
    const value = open[key];
    if (value !== undefined) params.set(key, String(value));
  }
  return `http://localhost:${HARNESS_PORT}/index.html?${params.toString()}`;
}

const app = (page: Page): FrameLocator => page.frameLocator("#stage iframe >> nth=0");
const fileText = (page: Page, path: string) => page.evaluate((p) => window.fakeHost.readFile(p), path);
const overlaysOpened = (page: Page) => page.evaluate(() => window.fakeHost.overlays.length);
const overlaysAsked = (page: Page) => page.evaluate(() => window.fakeHost.overlays);
const openedTabs = (page: Page) => page.evaluate(() => window.fakeHost.openedTabs);

async function openPlanner(page: Page, open: Open): Promise<FrameLocator> {
  await page.goto(harness(open));
  const a = app(page);
  await expect(a.getByTestId(open.surface === "panel" ? "view-planner-panel" : "view-planner-tab")).toBeVisible();
  await settled(a);
  return a;
}

/** The add form on `open`'s surface: the overlay's own, or the one the tab's + opens in place. */
async function openForm(page: Page, open: Open): Promise<FrameLocator> {
  if (open.surface === "overlay") {
    await page.goto(harness(open));
    return app(page);
  }
  const a = await openPlanner(page, open);
  await openAddForm(a);
  return a;
}

/** Whether `el` lies inside its frame's viewport, edge to edge (to the half pixel a fractional row height leaves). */
const insideFrame = (el: Locator) =>
  el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    return r.left >= 0 && r.top >= -0.5 && r.right <= window.innerWidth && r.bottom <= window.innerHeight + 0.5;
  });

/** The test id of the focused element of the frame `el` lives in. */
const focusedIn = (el: Locator) => el.evaluate((node) => (node.ownerDocument.activeElement as HTMLElement | null)?.dataset.testid ?? null);

test.describe("the add form in place, in the tab", () => {
  test("the tab's + opens the form at the foot of the tab's list, do-on today from Today; Enter adds and the new row is shown, focused and marked", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    const form = await openAddForm(a);
    await expect(a.getByTestId("add-item")).toHaveCount(0);
    expect(await form.evaluate((f) => f.closest(".planner__body") !== null && f.closest('[data-testid="add-foot"]')?.previousElementSibling?.matches('[data-testid="list-today"]'))).toBe(true);
    expect(await insideFrame(form)).toBe(true);
    await expect(a.getByTestId("qa-type-task")).toBeChecked();
    await expect(a.getByTestId("qa-do-on")).toHaveValue("today");
    await expect(a.getByTestId("qa-do-on-resolved")).toHaveText("Tue, Nov 17");
    await expect(a.getByTestId("qa-where")).toHaveText("in Tasks/");
    await page.keyboard.type("Call the bank");
    await a.getByTestId("qa-deadline").fill("+3d");
    await shot(page, "e008-fake-tab-form");
    await a.getByTestId("qa-deadline").press("Enter");
    await expect(form).toHaveCount(0);
    const added = row(a, "Call the bank");
    await expect(added.getByTestId("task-open")).toBeFocused();
    await expect(added).toHaveAttribute("data-added", "");
    expect(await insideFrame(added)).toBe(true);
    await shot(page, "e008-fake-tab-added");
    await expect(added).not.toHaveAttribute("data-added");
    await expect(a.getByTestId("add-item")).toHaveText("Add task");
    expect(await fileText(page, "Tasks/2026-11-17-call-the-bank.md")).toBe(quickAdded({ title: "Call the bank", doOn: "2026-11-17", deadline: "2026-11-20", created: "2026-11-17" }));
    expect(await overlaysOpened(page)).toBe(0);
    await expect(page.locator('iframe[data-surface="overlay"]')).toHaveCount(0);
  });

  test("from All the form starts without a do-on; Escape closes it and gives the focus back to +; a second + keeps the one form", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    await a.getByTestId("view-all").click();
    await openAddForm(a);
    await expect(a.getByTestId("qa-do-on")).toHaveValue("");
    await a.getByTestId("qa-title").fill("Half typed");
    await a.getByTestId("planner-add").click();
    await expect(a.getByTestId("add-form")).toHaveCount(1);
    await expect(a.getByTestId("qa-title")).toHaveValue("Half typed");
    await a.getByTestId("qa-title").press("Escape");
    await expect(a.getByTestId("add-form")).toHaveCount(0);
    await expect(a.getByTestId("planner-add")).toBeFocused();
    expect(await overlaysOpened(page)).toBe(0);
    expect(await titles(a)).not.toContain("Half typed");
  });

  test("⇧⌘↵ adds and opens the new item's compact view, ⌘↵ only adds — neither opens an editor tab", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    await openAddForm(a);
    await page.keyboard.type("Post the parcel");
    await page.keyboard.press("Shift+Meta+Enter");
    const pane = a.getByTestId("item-pane");
    await expect(pane).toBeFocused();
    await expect(pane).toHaveAttribute("data-path", "Tasks/2026-11-17-post-the-parcel.md");
    await expect(a.getByTestId("add-form")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(row(a, "Post the parcel").getByTestId("task-open")).toBeFocused();

    await openAddForm(a);
    await page.keyboard.type("Buy stamps");
    await page.keyboard.press("Meta+Enter");
    await expect(row(a, "Buy stamps").getByTestId("task-open")).toBeFocused();
    await expect(pane).toHaveCount(0);
    expect(await openedTabs(page)).toEqual([]);
    expect(await overlaysOpened(page)).toBe(0);
  });

  test("an Add button stands at the foot of every list, named for what the view adds; it opens the form and takes the focus back on Escape", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab", fixture: "planner", project: "pomade" });
    for (const [view, label, kind, doOn] of [
      ["today", "Add task", "task", "today"],
      ["project", "Add task", "task", ""],
      ["all", "Add task", "task", ""],
    ] as const) {
      await a.getByTestId(`view-${view}`).click();
      const button = a.getByTestId("add-item");
      await expect(button).toHaveText(label);
      expect(await button.evaluate((b) => b.closest('[data-testid="add-foot"]')?.previousElementSibling?.getAttribute("data-testid"))).toBe(`list-${view}`);
      await button.click();
      await expect(a.getByTestId("qa-title")).toBeFocused();
      await expect(a.getByTestId(`qa-type-${kind}`)).toBeChecked();
      await expect(a.getByTestId("qa-do-on")).toHaveValue(doOn);
      await expect(a.getByTestId("qa-project")).toHaveAttribute("data-project", "pomade");
      await expect(a.getByTestId("qa-where")).toHaveText("in Tasks/Pomade/");
      await page.keyboard.press("Escape");
      await expect(a.getByTestId("add-form")).toHaveCount(0);
      await expect(a.getByTestId("add-item")).toBeFocused();
    }
    await shot(page, "e008-fake-tab-add-button");

    const chores = await openPlanner(page, { surface: "tab", fixture: "planner", tasks: "Chores", now: "2026-12-02T10:00" });
    await chores.getByTestId("view-recurring").click();
    await expect(chores.getByTestId("add-item")).toHaveText("Add recurring task");
    expect(await chores.getByTestId("add-item").evaluate((b) => b.closest('[data-testid="add-foot"]')?.previousElementSibling?.getAttribute("data-testid"))).toBe("list-recurring");
    await chores.getByTestId("add-item").click();
    await expect(chores.getByTestId("qa-type-recurring")).toBeChecked();
    await expect(chores.getByTestId("qa-repeat")).toBeVisible();
    await shot(page, "e008-fake-tab-recurring-form");
  });

  test("an empty Recurring view in the tab: Add recurring task under the empty text opens the form in place with Recurring chosen; Enter shows the new row", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    await a.getByTestId("view-recurring").click();
    const empty = a.getByTestId("recurring-empty");
    await expect(empty.getByTestId("view-title")).toHaveText("No recurring tasks");
    const button = empty.getByTestId("add-item");
    await expect(button).toHaveText("Add recurring task");
    expect(await button.evaluate((b) => b.getBoundingClientRect().top > (b.ownerDocument.querySelector(".empty-state__text")?.getBoundingClientRect().bottom ?? Infinity))).toBe(true);
    await shot(page, "e008-fake-tab-recurring-empty");
    await button.click();
    await expect(a.getByTestId("qa-title")).toBeFocused();
    await expect(a.getByTestId("qa-type-recurring")).toBeChecked();
    await expect(empty.getByTestId("add-form")).toHaveCount(1);
    await page.keyboard.type("Upload invoices");
    await a.getByTestId("qa-repeat-on").fill("5");
    await expect(a.getByTestId("qa-repeat-description")).toHaveText("monthly on the 5th\u00a0· first Sat, Dec 5");
    await shot(page, "e008-fake-tab-recurring-empty-form");
    await a.getByTestId("qa-repeat-on").press("Enter");
    await expect(a.getByTestId("add-form")).toHaveCount(0);
    const added = row(a, "Upload invoices");
    await expect(added.getByTestId("task-open")).toBeFocused();
    await expect(added).toHaveAttribute("data-added", "");
    await expect(a.getByTestId("list-recurring")).toBeVisible();
    await expect(a.getByTestId("add-item")).toHaveText("Add recurring task");
    expect(await fileText(page, "Tasks/2026-11-17-upload-invoices.md")).toBe(
      "---\ntype: recurring\ntitle: Upload invoices\nstatus: open\ndo-on: 2026-12-05\nrepeat:\n  monthly: { days: [5] }\ncreated: 2026-11-17\n---\n",
    );
    expect(await overlaysOpened(page)).toBe(0);
    await expect(page.locator('iframe[data-surface="overlay"]')).toHaveCount(0);
  });

  test("an item the view doesn't list: the Planner goes to Project, which does, unfolds its group, and the row is focused and marked — nothing at the list's foot; ⇧⌘↵ marks it beside its compact view", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab", fixture: "planner", extra: "notes" });
    await a.getByTestId("view-project").click();
    await a.locator('[data-testid="task-section"][data-group="none/notes"]').getByTestId("task-section-toggle").click();
    await expect(a.locator('[data-testid="task-section"][data-group="none/notes"]')).toHaveAttribute("data-folded", "true");
    await a.getByTestId("view-today").click();
    await openAddForm(a);
    await page.keyboard.type("Lamp for the desk");
    await page.keyboard.press("Alt+Tab");
    await page.keyboard.press("Alt+Tab");
    await expect(a.getByTestId("qa-type-note")).toBeChecked();
    // A note with no day stands in Project, under "Notes and thoughts" — folded until now.
    await a.getByTestId("qa-do-on").fill("");
    await a.getByTestId("qa-title").press("Enter");
    await expect(a.getByTestId("add-form")).toHaveCount(0);
    await expect(a.getByTestId("view-project")).toHaveAttribute("aria-selected", "true");
    const note = row(a, "Lamp for the desk");
    await expect(note.getByTestId("task-open")).toBeFocused();
    await expect(note).toHaveAttribute("data-added", "");
    await expect(a.locator('[data-testid="task-section"][data-group="none/notes"]')).toHaveAttribute("data-folded", "false");
    expect(await insideFrame(note)).toBe(true);
    await shot(page, "e013-fake-tab-added-unfolded");
    await expect(a.getByTestId("add-foot").locator('[role="status"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window.fakeHost.state["planner.folds.__workspace__"] as Record<string, string[]>).project)).not.toContain("none/notes");

    // A task with no date added from Today with ⇧⌘↵: Project, its compact view open and focused, its row marked.
    await a.getByTestId("view-today").click();
    await openAddForm(a);
    await page.keyboard.type("Someday maybe");
    await a.getByTestId("qa-do-on").fill("");
    await page.keyboard.press("Shift+Meta+Enter");
    await expect(a.getByTestId("view-project")).toHaveAttribute("aria-selected", "true");
    const pane = a.getByTestId("item-pane");
    await expect(pane).toBeFocused();
    await expect(pane).toHaveAttribute("data-path", "Tasks/2026-11-17-someday-maybe.md");
    const task = row(a, "Someday maybe");
    await expect(task).toHaveAttribute("data-added", "");
    await expect(task).toHaveAttribute("data-open", "true");
    await shot(page, "e013-fake-tab-added-open");
    expect(await openedTabs(page)).toEqual([]);
  });

  test("an item neither the view nor Project lists: the Planner goes to All, its filters widened just enough, the row focused and marked", async ({ page }) => {
    // Inside Pomade, a thought of pomade-kit: Project doesn't list it (not mixed in), All's type filter hides it.
    const a = await openPlanner(page, { surface: "tab", fixture: "planner", project: "pomade" });
    await a.getByTestId("view-all").click();
    await a.getByTestId("filter-types").click();
    await a.locator('[data-testid="filter-option"][data-key="task"] input').check();
    await page.keyboard.press("Escape");
    await a.getByTestId("view-project").click();
    await openAddForm(a);
    await page.keyboard.type("Is it time for a new bike?");
    await a.getByTestId("qa-type-thought").check();
    await a.getByTestId("qa-project").click();
    await a.getByTestId("picker-filter").pressSequentially("pomade-kit");
    await a.getByTestId("picker-filter").press("Enter");
    await expect(a.getByTestId("qa-project")).toHaveAttribute("data-project", "kit");
    await a.getByTestId("qa-title").press("Enter");
    await expect(a.getByTestId("view-all")).toHaveAttribute("aria-selected", "true");
    const thought = row(a, "Is it time for a new bike?");
    await expect(thought.getByTestId("task-open")).toBeFocused();
    await expect(thought).toHaveAttribute("data-added", "");
    await expect(a.getByTestId("filter-types")).toHaveAccessibleName("Types: 2 types");
    expect(await page.evaluate(() => (window.fakeHost.state["planner.view.pomade"] as { types: string[] }).types)).toEqual(["task", "thought"]);
    await shot(page, "e013-fake-tab-added-all");
  });

  test("Daily in place opens today's note in an editor tab — made first, the tab itself makes none — and closes the form, focus back on +", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    await openAddForm(a);
    for (let i = 0; i < 4; i++) await page.keyboard.press("Alt+Tab");
    await expect(a.getByTestId("qa-type-daily-note")).toBeChecked();
    await expect(a.getByTestId("qa-details")).toHaveCount(0);
    await expect(a.getByTestId("qa-keys")).toHaveText("↵ open today's note⌥⇥ typeesc cancel");
    await page.keyboard.press("Enter");
    await expect(a.getByTestId("add-form")).toHaveCount(0);
    await expect(a.getByTestId("planner-add")).toBeFocused();
    expect(await openedTabs(page)).toEqual([{ kind: "file", projectId: "__workspace__", path: "Tasks/Daily/2026-11-17.md" }]);
  });

  test("in a project the editor tabs the add flows open — the daily note, the overlay's ⇧⌘↵ — are that project's, and Pomade stays in it", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab", fixture: "planner", project: "pomade" });
    await openAddForm(a);
    for (let i = 0; i < 4; i++) await page.keyboard.press("Alt+Tab");
    await expect(a.getByTestId("qa-type-daily-note")).toBeChecked();
    await page.keyboard.press("Enter");
    await expect(a.getByTestId("add-form")).toHaveCount(0);
    expect(await openedTabs(page)).toEqual([{ kind: "file", projectId: "pomade", path: "Tasks/Daily/2026-11-17.md" }]);

    await page.goto(harness({ surface: "overlay", fixture: "planner", project: "pomade" }));
    await app(page).getByTestId("qa-title").fill("Post the parcel");
    await page.keyboard.press("Shift+Meta+Enter");
    await expect(page.locator("#stage iframe")).toHaveCount(0);
    expect(await openedTabs(page)).toEqual([{ kind: "file", projectId: "pomade", path: "Tasks/Pomade/2026-11-17-post-the-parcel.md" }]);
  });
});

test.describe("the panel adds in the overlay", () => {
  test("the panel's + and its Add button open the overlay beside the panel at its form's height, the view's pre-fills in the route — never a form in the panel; Escape gives the focus back to the button that opened it", async ({ page }) => {
    const a = await openPlanner(page, { surface: "panel", fixture: "planner", tasks: "Chores", now: "2026-12-02T10:00" });
    const o = overlay(page);
    const asked: { route: string; height: number; anchor: string }[] = [];
    for (const [view, label, route, kind, doOn] of [
      ["today", "Add task", "quick-add?do-on=today", "task", ["today"]],
      ["project", "Add task", "quick-add", "task", [""]],
      ["recurring", "Add recurring task", "quick-add?type=recurring", "recurring", []],
      ["all", "Add task", "quick-add", "task", [""]],
    ] as const) {
      await a.getByTestId(`view-${view}`).click();
      const button = a.getByTestId("add-item");
      await expect(button).toHaveText(label);
      expect(await button.evaluate((b) => b.closest('[data-testid="add-foot"]')?.previousElementSibling?.getAttribute("data-testid"))).toBe(`list-${view}`);
      for (const opener of [button, a.getByTestId("planner-add")]) {
        await opener.click();
        asked.push({ route, height: QUICK_ADD_HEIGHT[kind], anchor: "panel" });
        await expect.poll(() => overlaysAsked(page)).toEqual(asked);
        await expect(o.getByTestId("qa-title")).toBeFocused();
        // It opened at its form's height: the form never resizes it.
        expect(await o.getByTestId("quick-add-form").evaluate((f) => [window.innerHeight, f.getBoundingClientRect().height])).toEqual([QUICK_ADD_HEIGHT[kind], QUICK_ADD_HEIGHT[kind]]);
        expect(await page.evaluate(() => window.fakeHost.overlayResizes)).toEqual([]);
        await expect(o.getByTestId(`qa-type-${kind}`)).toBeChecked();
        expect(await o.getByTestId("qa-do-on").evaluateAll((fields) => fields.map((f) => (f as HTMLInputElement).value))).toEqual(doOn);
        await expect(a.getByTestId("add-form")).toHaveCount(0);
        await expect(button).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator('iframe[data-surface="overlay"]')).toHaveCount(0);
        await expect(opener).toBeFocused();
      }
    }
    await shot(page, "e008-fake-panel-add-button");
  });

  test("an empty view in the panel: the Add button under its text opens the overlay with the view's type; the added row comes through the watch", async ({ page }) => {
    const a = await openPlanner(page, { surface: "panel" });
    await a.getByTestId("view-recurring").click();
    const button = a.getByTestId("recurring-empty").getByTestId("add-item");
    await expect(button).toHaveText("Add recurring task");
    await shot(page, "e008-fake-panel-recurring-empty");
    await button.click();
    const o = overlay(page);
    await expect(o.getByTestId("qa-title")).toBeFocused();
    await expect(o.getByTestId("qa-type-recurring")).toBeChecked();
    await expect(a.getByTestId("add-form")).toHaveCount(0);
    await shot(page, "e008-fake-panel-recurring-overlay");
    await page.keyboard.type("Upload invoices");
    await page.keyboard.press("Enter");
    await expect(page.locator('iframe[data-surface="overlay"]')).toHaveCount(0);
    await expect(row(a, "Upload invoices")).toHaveCount(1);
    await expect(a.getByTestId("add-item")).toBeFocused();
  });

  for (const width of [240, 160]) {
    test(`at ${width}px the Add button fits the panel`, async ({ page }) => {
      const a = await openPlanner(page, { surface: "panel", panelWidth: width });
      for (const view of ["today", "recurring"]) {
        await a.getByTestId(`view-${view}`).click();
        expect(await a.getByTestId("add-item").evaluate((b) => b.getBoundingClientRect().left >= 0 && b.getBoundingClientRect().right <= window.innerWidth && b.scrollWidth <= b.clientWidth)).toBe(true);
        expect(await a.locator("html").evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
        await shot(page, `e008-fake-panel-${width}-${view}`);
      }
    });
  }
});

test.describe("after an add in the overlay, the Planner shows the item", () => {
  const panelShows = (page: Page) => page.evaluate(() => window.fakeHost.panelShows);
  const published = (page: Page) => page.evaluate(() => window.fakeHost.published);

  test("the panel on Today, a task with no date from its +: the panel goes to Project with the row marked; the focus goes back to + and the route back to planner", async ({ page }) => {
    const a = await openPlanner(page, { surface: "panel" });
    await expect(a.getByTestId("view-today")).toHaveAttribute("aria-selected", "true");
    const o = await openQuickAdd(page, a);
    await page.keyboard.type("Someday maybe");
    await o.getByTestId("qa-do-on").fill("");
    await o.getByTestId("qa-do-on").press("Enter");
    await expect(page.locator('iframe[data-surface="overlay"]')).toHaveCount(0);
    await expect(a.getByTestId("view-project")).toHaveAttribute("aria-selected", "true");
    const added = row(a, "Someday maybe");
    await expect(added).toHaveAttribute("data-added", "");
    expect(await insideFrame(added)).toBe(true);
    await expect(a.getByTestId("planner-add")).toBeFocused();
    const path = "Tasks/2026-11-17-someday-maybe.md";
    expect(await published(page)).toEqual([{ name: "item.added", payload: { path, contextId: "__workspace__" } }]);
    // Brought forward at the item's route, which the panel then leaves: the next add of any path reaches it again.
    await expect.poll(() => panelShows(page)).toEqual([
      { icon: "planner", route: `added?path=${encodeURIComponent(path)}` },
      { icon: "planner", route: "planner" },
    ]);
    await shot(page, "e013-fake-panel-added-project");

    // An item the view lists: the panel stays on it, the row marked.
    await openQuickAdd(page, a);
    await page.keyboard.type("Oil the bike chain");
    await page.keyboard.press("Meta+Enter");
    await expect(page.locator('iframe[data-surface="overlay"]')).toHaveCount(0);
    await expect(row(a, "Oil the bike chain")).toHaveAttribute("data-added", "");
    await expect(a.getByTestId("view-project")).toHaveAttribute("aria-selected", "true");
  });

  for (const width of [240, 160]) {
    test(`at ${width}px the marked row fits the panel`, async ({ page }) => {
      const a = await openPlanner(page, { surface: "panel", panelWidth: width, fixture: "planner", extra: "notes" });
      const o = await openQuickAdd(page, a);
      await page.keyboard.type("A lamp for the desk by the window");
      await o.getByTestId("qa-type-note").check();
      await o.getByTestId("qa-title").press("Enter");
      const added = row(a, "A lamp for the desk by the window");
      await expect(added).toHaveAttribute("data-added", "");
      expect(await insideFrame(added)).toBe(true);
      expect(await a.locator("html").evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
      await shot(page, `e013-fake-panel-${width}-added`);
    });
  }

  test("the tab on Today, ⌘⇧A: a task with no date — the tab goes to Project with the row marked, the focus not taken; ⇧⌘↵ opens the editor tab and the row is marked too", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    await page.evaluate(() => window.pressShortcut("quick-add"));
    const o = overlay(page);
    await expect(o.getByTestId("qa-title")).toBeFocused();
    await page.keyboard.type("Someday maybe");
    await page.keyboard.press("Enter");
    await expect(page.locator('iframe[data-surface="overlay"]')).toHaveCount(0);
    await expect(a.getByTestId("view-project")).toHaveAttribute("aria-selected", "true");
    const added = row(a, "Someday maybe");
    await expect(added).toHaveAttribute("data-added", "");
    await expect(added.getByTestId("task-open")).not.toBeFocused();
    await shot(page, "e013-fake-tab-overlay-added");

    await page.evaluate(() => window.pressShortcut("quick-add"));
    await expect(o.getByTestId("qa-title")).toBeFocused();
    await page.keyboard.type("Post the parcel");
    await page.keyboard.press("Shift+Meta+Enter");
    await expect(page.locator('iframe[data-surface="overlay"]')).toHaveCount(0);
    await expect(row(a, "Post the parcel")).toHaveAttribute("data-added", "");
    expect(await openedTabs(page)).toEqual([{ kind: "file", projectId: "__workspace__", path: "Tasks/2026-11-17-post-the-parcel.md" }]);
    await expect(a.getByTestId("item-pane")).toHaveCount(0);
  });

  test("a tab follows only an item added in its own context", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab", fixture: "planner", project: "quiz" });
    await expect(a.getByTestId("view-today")).toHaveAttribute("aria-selected", "true");
    // A note of QuizLab with no day, as an overlay in another context would announce it: Project would list it.
    await page.evaluate(() => window.fakeHost.writeFile("Tasks/QuizLab/2026-11-17-a-note.md", "---\ntype: note\ntitle: A note\nstatus: open\ncreated: 2026-11-17\n---\n"));
    await page.evaluate(() => window.fakeHost.emitEvent("pomade-planner:item.added", { path: "Tasks/QuizLab/2026-11-17-a-note.md", contextId: "pomade" }));
    await expect(row(a, "A note")).toHaveCount(0);
    await expect(a.getByTestId("view-today")).toHaveAttribute("aria-selected", "true");
    await page.evaluate(() => window.fakeHost.emitEvent("pomade-planner:item.added", { path: "Tasks/QuizLab/2026-11-17-a-note.md", contextId: "quiz" }));
    await expect(a.getByTestId("view-project")).toHaveAttribute("aria-selected", "true");
    await expect(row(a, "A note")).toHaveAttribute("data-added", "");
  });
});

test.describe("Details", () => {
  const MARKDOWN = "**Why:** the old one flickers\n### Options\n- the brass one from the market";

  test("three lines of markdown are the file's body, byte for byte, under the same frontmatter; Enter is a new line, ⌘↵ adds", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    await openAddForm(a);
    await page.keyboard.type("Buy a lamp");
    await a.getByTestId("qa-details").click();
    await page.keyboard.type("**Why:** the old one flickers");
    await page.keyboard.press("Enter");
    await page.keyboard.type("### Options");
    await page.keyboard.press("Enter");
    await page.keyboard.type("- the brass one from the market");
    await expect(a.getByTestId("add-form")).toHaveCount(1);
    await expect(a.getByTestId("qa-details")).toHaveValue(MARKDOWN);
    await expect(a.getByTestId("qa-keys")).toHaveText("⌘↵ add⇧⌘↵ add and open⌥⇥ typeesc cancel");
    await shot(page, "e008-fake-tab-details");
    await page.keyboard.press("Meta+Enter");
    await expect(row(a, "Buy a lamp").getByTestId("task-open")).toBeFocused();
    expect(await fileText(page, "Tasks/2026-11-17-buy-a-lamp.md")).toBe(quickAdded({ title: "Buy a lamp", doOn: "2026-11-17", created: "2026-11-17", body: `${MARKDOWN}\n` }));
    expect(await openedTabs(page)).toEqual([]);
  });

  test("a note and a thought take Details; white space alone writes no body", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    await a.getByTestId("view-all").click();
    for (const [type, title, details, body] of [
      ["note", "Gift ideas", "- a scarf\n\n- opera tickets\n", "- a scarf\n\n- opera tickets\n"],
      ["thought", "Why test at all", "  \n ", ""],
    ] as const) {
      await openAddForm(a);
      await a.getByTestId("qa-title").fill(title);
      await a.getByTestId(`qa-type-${type}`).check();
      await a.getByTestId("qa-details").fill(details);
      await a.getByTestId("qa-title").press("Enter");
      await expect(row(a, title).getByTestId("task-open")).toBeFocused();
      const slug = title.toLowerCase().replaceAll(" ", "-");
      expect(await fileText(page, `Tasks/2026-11-17-${slug}.md`)).toBe(`---\ntype: ${type}\ntitle: ${title}\nstatus: open\ncreated: 2026-11-17\n---\n${body}`);
    }
  });

  test("a recurring item's Details are its body, and done puts ## Log after them", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    await a.getByTestId("view-recurring").click();
    await a.getByTestId("add-item").click();
    await page.keyboard.type("Water the ficus");
    await a.getByTestId("qa-repeat-unit").selectOption("day");
    await a.getByTestId("qa-details").fill("Half a glass.\n*Not* on the leaves.");
    await a.getByTestId("qa-details").press("Meta+Enter");
    const item = row(a, "Water the ficus");
    await expect(item.getByTestId("task-open")).toBeFocused();
    const before = "---\ntype: recurring\ntitle: Water the ficus\nstatus: open\ndo-on: 2026-11-17\nrepeat:\n  daily: {}\ncreated: 2026-11-17\n---\nHalf a glass.\n*Not* on the leaves.\n";
    expect(await fileText(page, "Tasks/2026-11-17-water-the-ficus.md")).toBe(before);
    await item.getByTestId("task-check").check();
    await expect.poll(() => fileText(page, "Tasks/2026-11-17-water-the-ficus.md")).toBe(`${before.replace("do-on: 2026-11-17", "do-on: 2026-11-18")}\n## Log\n- 2026-11-17 done\n`);
  });

  for (const [name, width, tall] of [
    ["the tab", 1280, 720],
    ["a 340px tab", 340, 1100],
  ] as const) {
    test(`in ${name} Details is one line, grows a line at a time to 40% of the surface, then scrolls inside; the form stays in the surface`, async ({ page }) => {
      await page.setViewportSize({ width, height: tall });
      const a = await openPlanner(page, { surface: "tab" });
      const form = await openAddForm(a);
      const details = a.getByTestId("qa-details");
      const height = () => details.evaluate((el) => el.getBoundingClientRect().height);
      expect(await height()).toBe(28);
      await details.click();
      await page.keyboard.type("one");
      expect(await height()).toBe(28);
      await page.keyboard.press("Enter");
      await page.keyboard.type("two");
      expect(await height()).toBe(44);
      await page.keyboard.press("Enter");
      await page.keyboard.type("three");
      expect(await height()).toBe(60);
      expect(await details.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
      expect(await insideFrame(form)).toBe(true);
      await shot(page, `e008-fake-details-three-lines-${name.replaceAll(" ", "-")}`);

      await details.fill(Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join("\n"));
      const cap = await details.evaluate(() => Math.max(0.4 * window.innerHeight, 92));
      expect(await height()).toBeCloseTo(cap, 0);
      expect(await details.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
      // The form now outgrows the list's own height: the list scrolls, Details and the keys stay in view.
      await details.press("End");
      expect(await insideFrame(details)).toBe(true);
      expect(await insideFrame(a.getByTestId("qa-keys"))).toBe(true);
      expect(await form.evaluate((f) => f.getBoundingClientRect().left >= 0 && f.getBoundingClientRect().right <= window.innerWidth)).toBe(true);
      expect(await form.evaluate((f) => f.scrollWidth <= f.clientWidth && document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await shot(page, `e008-fake-details-cap-${name.replaceAll(" ", "-")}`);

      await details.fill("");
      expect(await height()).toBe(28);
    });
  }

  test("in a short surface the cap never goes under five lines", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 260 });
    const a = await openPlanner(page, { surface: "tab" });
    await openAddForm(a);
    const details = a.getByTestId("qa-details");
    await details.fill(Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n"));
    expect(await details.evaluate((el) => el.getBoundingClientRect().height)).toBe(92);
    expect(await details.evaluate((el) => el.clientHeight - 10)).toBe(5 * 16);
  });
});

test.describe("keyboard", () => {
  const KINDS = ["task", "recurring", "note", "thought", "daily-note"] as const;

  for (const [name, open] of [
    ["in place", { surface: "tab" }],
    ["in the overlay", { surface: "overlay" }],
  ] as const) {
    test(`${name}: ⌥Tab and ⌥⇧Tab walk the five types round while the caret stays in the title`, async ({ page }) => {
      const a = await openForm(page, open);
      const title = a.getByTestId("qa-title");
      await expect(title).toBeFocused();
      await page.keyboard.type("Call the bank");
      await page.keyboard.press("ArrowLeft");
      for (const kind of [...KINDS.slice(1), "task"] as const) {
        await page.keyboard.press("Alt+Tab");
        await expect(a.getByTestId(`qa-type-${kind}`)).toBeChecked();
        await expect(title).toBeFocused();
      }
      for (const kind of [...KINDS].reverse()) {
        await page.keyboard.press("Alt+Shift+Tab");
        await expect(a.getByTestId(`qa-type-${kind}`)).toBeChecked();
        await expect(title).toBeFocused();
      }
      await page.keyboard.press("Alt+Shift+Tab");
      await expect(a.getByTestId("qa-type-daily-note")).toBeChecked();
      await page.keyboard.press("Alt+Tab");
      await expect(a.getByTestId("qa-type-task")).toBeChecked();
      // The caret is where it was: one character before the end.
      await page.keyboard.type("!");
      await expect(title).toHaveValue("Call the ban!k");
      await expect(a.getByTestId("qa-keys")).toHaveText("↵ add⇧⌘↵ add and open⌥⇥ typeesc cancel");
    });

    test(`${name}: Tab and Shift+Tab go round the form's fields and never leave it`, async ({ page }) => {
      const a = await openForm(page, open);
      const form = a.locator("form.qa");
      await expect(a.getByTestId("qa-title")).toBeFocused();
      const order = ["qa-title", "qa-project", "qa-type-task", "qa-do-on", "qa-deadline", "qa-importance", "qa-details"];
      for (const id of [...order.slice(1), ...order, "qa-title"]) {
        await page.keyboard.press("Tab");
        expect(await focusedIn(form)).toBe(id);
        expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("IFRAME");
      }
      for (const id of [...order].reverse()) {
        await page.keyboard.press("Shift+Tab");
        expect(await focusedIn(form)).toBe(id);
        expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("IFRAME");
      }
      // Tab in Details moves on: it types no tab character.
      await a.getByTestId("qa-details").focus();
      await page.keyboard.press("Tab");
      await expect(a.getByTestId("qa-title")).toBeFocused();
      await expect(a.getByTestId("qa-details")).toHaveValue("");
      // The project picker in the fields' place keeps Tab too.
      await a.getByTestId("qa-project").press("ArrowDown");
      await expect(a.getByTestId("project-picker")).toBeVisible();
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press("Tab");
        expect(await form.evaluate((f) => f.contains(f.ownerDocument.activeElement))).toBe(true);
        expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("IFRAME");
      }
    });
  }

  test("⌥Tab from a field its type owns: the type changes and the focus lands on the title; from the switch it follows the chosen type", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    await openAddForm(a);
    await a.getByTestId("qa-deadline").focus();
    await page.keyboard.press("Alt+Tab");
    await expect(a.getByTestId("qa-type-recurring")).toBeChecked();
    await expect(a.getByTestId("qa-title")).toBeFocused();
    await a.getByTestId("qa-details").focus();
    await page.keyboard.press("Alt+Tab");
    await expect(a.getByTestId("qa-type-note")).toBeChecked();
    await expect(a.getByTestId("qa-details")).toBeFocused();
    await a.getByTestId("qa-type-note").focus();
    await page.keyboard.press("Alt+Tab");
    await expect(a.getByTestId("qa-type-thought")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(a.getByTestId("qa-type-daily-note")).toBeChecked();
    await page.keyboard.press("ArrowLeft");
    await expect(a.getByTestId("qa-type-thought")).toBeChecked();
  });
});

test.describe("the overlay", () => {
  /** The overlay frame's height and the form's, in the stage's frame (the ⌘⇧A overlay). */
  const heights = (a: FrameLocator) => a.getByTestId("quick-add-form").evaluate((f) => ({ frame: window.innerHeight, form: f.getBoundingClientRect().height }));
  const resizes = (page: Page) => page.evaluate(() => window.fakeHost.overlayResizes);
  const fits = (el: Locator) => el.evaluate((node) => node.scrollHeight <= node.clientHeight && node.scrollWidth <= node.clientWidth);

  test("each type sizes the frame to its form: ⌘⇧A's 220 px is a task's, the others resize it; nothing scrolls inside", async ({ page }) => {
    await page.goto(harness({ surface: "overlay" }));
    const a = app(page);
    await expect(a.getByTestId("qa-title")).toBeFocused();
    const form = a.getByTestId("quick-add-form");
    expect(await heights(a)).toEqual({ frame: 220, form: 220 });
    expect(await resizes(page)).toEqual([]);
    for (const kind of ["recurring", "note", "thought", "daily-note", "task"] as const) {
      await a.getByTestId(`qa-type-${kind}`).check();
      await expect.poll(() => heights(a)).toEqual({ frame: QUICK_ADD_HEIGHT[kind], form: QUICK_ADD_HEIGHT[kind] });
      expect(await fits(form)).toBe(true);
      expect(await fits(a.locator(".qa__body"))).toBe(true);
      expect(await a.locator("html").evaluate((h) => h.scrollHeight <= h.clientHeight)).toBe(true);
      await expect(form).not.toHaveAttribute("data-fill");
      await shot(page, `e008-fake-overlay-${kind}`);
    }
    expect(await resizes(page)).toEqual([235, 220, 171, 220]);
  });

  test("Details grows the frame a line at a time and never scrolls; clearing it shrinks the frame; at Pomade's cap Details scrolls inside, the keys in view; ⌘↵ adds with the body", async ({ page }) => {
    await page.goto(harness({ surface: "overlay" }));
    const a = app(page);
    await a.getByTestId("qa-title").fill("Buy a lamp");
    await a.getByTestId("qa-type-note").check();
    await expect.poll(() => heights(a)).toEqual({ frame: 220, form: 220 });
    const details = a.getByTestId("qa-details");
    const form = a.getByTestId("quick-add-form");
    // Any scroll of Details while the frame catches up would be a jump of its text.
    await details.evaluate((el) => el.addEventListener("scroll", () => el.setAttribute("data-scrolled", "")));
    await details.click();
    await page.keyboard.type("one");
    for (const [n, word] of [[2, "two"], [3, "three"], [4, "four"]] as const) {
      await page.keyboard.press("Enter");
      await page.keyboard.type(word);
      await expect.poll(() => heights(a)).toEqual({ frame: 220 + 16 * (n - 1), form: 220 + 16 * (n - 1) });
      expect(await fits(details)).toBe(true);
    }
    await expect(details).not.toHaveAttribute("data-scrolled");
    await expect(form).not.toHaveAttribute("data-fill");
    expect(await insideFrame(a.getByTestId("qa-keys"))).toBe(true);
    await shot(page, "e008-fake-overlay-details");
    await details.fill("");
    await expect.poll(() => heights(a)).toEqual({ frame: 220, form: 220 });
    expect(await resizes(page)).toEqual([236, 252, 268, 220]);

    // Past the cap (60% of the 720 px window: 432): the form fills the frame, Details gives way and scrolls inside.
    await details.fill(Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n"));
    await expect(form).toHaveAttribute("data-fill");
    expect(await heights(a)).toEqual({ frame: 432, form: 432 });
    expect(await details.evaluate((el) => el.getBoundingClientRect().height >= 28 && el.scrollHeight > el.clientHeight)).toBe(true);
    expect(await fits(a.locator(".qa__body"))).toBe(true);
    await details.press("End");
    expect(await insideFrame(details)).toBe(true);
    expect(await insideFrame(a.getByTestId("qa-keys"))).toBe(true);
    await shot(page, "e008-fake-overlay-details-capped");
    await details.fill("one\ntwo");
    await expect(form).not.toHaveAttribute("data-fill");
    await expect.poll(() => heights(a)).toEqual({ frame: 236, form: 236 });
    await details.press("Meta+Enter");
    await expect(page.locator("#stage iframe")).toHaveCount(0);
    expect(await fileText(page, "Tasks/2026-11-17-buy-a-lamp.md")).toBe("---\ntype: note\ntitle: Buy a lamp\nstatus: open\ncreated: 2026-11-17\n---\none\ntwo\n");
  });

  test("the project picker takes the form's place in the frame as it is: no resize while it is open", async ({ page }) => {
    await page.goto(harness({ surface: "overlay", fixture: "planner" }));
    const a = app(page);
    await a.getByTestId("qa-type-recurring").check();
    await expect.poll(() => heights(a)).toEqual({ frame: 235, form: 235 });
    await a.getByTestId("qa-project").click();
    await expect(a.locator(".project-picker")).toBeVisible();
    await page.keyboard.type("o");
    expect(await heights(a)).toEqual({ frame: 235, form: 235 });
    expect(await a.locator(".project-picker").evaluate((el) => el.getBoundingClientRect().bottom <= window.innerHeight)).toBe(true);
    await shot(page, "e008-fake-overlay-picker");
    await page.keyboard.press("Escape");
    await expect(a.getByTestId("qa-title")).toBeVisible();
    await expect.poll(() => heights(a)).toEqual({ frame: 235, form: 235 });
    expect(await resizes(page)).toEqual([235]);
  });
});
