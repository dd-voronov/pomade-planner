// T-016's row menu on the fake host ([[views]] "Rows"): a right-click (or Shift+F10) on any Planner
// row opens Open in tab, the row's pin and its own actions, Select…, then Delete… — which asks select mode's
// question for the one file and moves it to the Trash through `files.delete`; a failed delete says
// so on the row. The menu stays inside the frame, ↑ ↓ move, Esc closes it and gives the focus back
// to the row; select mode has none. Fixture: the planner workspace with notes at Workspace on Tue
// 2026-11-17, and its Chores/ on Wed 2026-12-02 for a recurring row.

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
}

function harness(open: Open): string {
  const surface = open.surface ?? "panel";
  const params = new URLSearchParams({ app: APP, surface, tasks: open.tasks ?? "Tasks", now: open.now ?? "2026-11-17T10:00", fixture: "planner", extra: "notes", project: "workspace" });
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
const readFile = (page: Page, path: string) => page.evaluate((p) => window.fakeHost.readFile(p), path);

interface Dispatching {
  dispatch(frame: unknown, call: { method: string; params: { paths?: string[] } }): unknown;
}
declare global {
  interface Window {
    deleteCalls: string[][];
  }
}

/** Record every `files.delete` the app makes; the paths in `refuse` answer `io-error`, as a Trash that refuses them would. */
async function watchDeletes(page: Page, refuse: string[] = []): Promise<void> {
  await page.evaluate((refused) => {
    window.deleteCalls = [];
    const host = window.fakeHost as unknown as Dispatching;
    const original = host.dispatch.bind(host);
    host.dispatch = (frame, call) => {
      if (call.method !== "files.delete") return original(frame, call);
      const paths = call.params.paths ?? [];
      window.deleteCalls.push(paths);
      const go = paths.filter((p) => !refused.includes(p));
      const done = original(frame, { ...call, params: { ...call.params, paths: go } }) as { results: { path: string; ok: boolean }[] };
      return {
        results: paths.map((p) => done.results.find((r) => r.path === p) ?? { path: p, ok: false, error: { code: "io-error", message: `${JSON.stringify(p)} could not be moved to the Trash` } }),
      };
    };
  }, refuse);
}
const deleteCalls = (page: Page) => page.evaluate(() => window.deleteCalls);

async function openPlanner(page: Page, open: Open = {}): Promise<FrameLocator> {
  await page.goto(harness(open));
  const a = app(page);
  await expect(a.locator('main[data-daily]:not([data-daily="pending"])')).toHaveCount(1);
  return a;
}

const menu = (a: FrameLocator) => a.getByTestId("row-menu");
const items = (a: FrameLocator) => menu(a).getByRole("menuitem");
const focusedTestId = (a: FrameLocator) => a.locator(":root").evaluate(() => document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.tagName ?? null);

async function rightClick(target: Locator): Promise<void> {
  await target.click({ button: "right" });
}

/** The menu's box lies fully inside the frame, 8px from its edges. */
async function expectInside(page: Page, a: FrameLocator): Promise<void> {
  const box = await menu(a).boundingBox();
  const frame = await page.locator("#stage iframe").first().boundingBox();
  if (box === null || frame === null) throw new Error("no box");
  expect(box.x).toBeGreaterThanOrEqual(frame.x + 8);
  expect(box.y).toBeGreaterThanOrEqual(frame.y + 8);
  expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width - 8 + 0.5);
  expect(box.y + box.height).toBeLessThanOrEqual(frame.y + frame.height - 8 + 0.5);
}

test.describe("a row's menu", () => {
  test("Today: right-click a task ▸ Delete… asks select mode's question; Cancel calls nothing; Move to Trash calls files.delete with that path and the row leaves", async ({ page }) => {
    const a = await openPlanner(page);
    await watchDeletes(page);
    const ink = row(a, "Buy printer ink");
    await rightClick(ink);
    await expect(items(a)).toHaveText(["Open in tab", "Pin", "Select…", "Delete…"]);
    await expect(menu(a).getByRole("separator")).toHaveCount(1);
    await expect(ink).toHaveClass(/task-row--menu/);
    await expectInside(page, a);
    await shot(page, "t016-fake-row-menu-panel");

    await a.getByTestId("row-menu-delete").click();
    await expect(menu(a)).toHaveCount(0);
    const dialog = a.getByTestId("delete-confirm");
    await expect(dialog).toBeVisible();
    await expect(a.getByTestId("delete-confirm-title")).toHaveText("Delete “Buy printer ink”?");
    await expect(dialog).toContainText("It goes to the macOS Trash — Finder can put it back.");
    await expect(a.getByTestId("delete-file")).toHaveText([/^Buy printer ink\s*Tasks\/2026-11-09-buy-printer-ink\.md$/]);
    await expect(a.getByTestId("delete-confirm-button")).toHaveText("Move to Trash");
    await expect(a.getByTestId("delete-cancel")).toBeFocused();
    await shot(page, "t016-fake-row-menu-delete-panel");
    await a.getByTestId("delete-cancel").click();
    await expect(dialog).toHaveCount(0);
    await expect(ink.getByTestId("task-open")).toBeFocused();
    expect(await deleteCalls(page)).toEqual([]);

    await rightClick(ink);
    await a.getByTestId("row-menu-delete").click();
    await a.getByTestId("delete-confirm-button").click();
    await expect(dialog).toHaveCount(0);
    expect(await deleteCalls(page)).toEqual([["Tasks/2026-11-09-buy-printer-ink.md"]]);
    await expect(ink).toHaveCount(0);
    expect(await exists(page, "Tasks/2026-11-09-buy-printer-ink.md")).toBe(false);
    await expect(a.getByTestId("planner-error")).toHaveCount(0);
  });

  test("All: the menu lists each row's own actions — a task, a thought, a note, an archived note, an unreadable file — and a pick runs it", async ({ page }) => {
    const a = await openPlanner(page);
    await a.getByTestId("view-all").click();
    await a.getByTestId("show-archived").check();
    const cases: [Locator, string[]][] = [
      [row(a, "Learn a piano piece"), ["Open in tab", "Pin", "Select…", "Delete…"]],
      [row(a, "Why do I sleep badly on Sundays?"), ["Open in tab", "Pin", "Resolve", "Select…", "Delete…"]],
      [row(a, "Quiz timer idea"), ["Open in tab", "Pin", "Archive", "Select…", "Delete…"]],
      [row(a, "Old idea: a podcast"), ["Open in tab", "Pin", "Restore", "Select…", "Delete…"]],
      [a.locator('[data-testid="unreadable-row"][data-path="Tasks/2026-11-13-broken.md"]'), ["Open in tab", "Select…", "Delete…"]],
    ];
    for (const [target, expected] of cases) {
      await rightClick(target);
      await expect(items(a)).toHaveText(expected);
      await page.keyboard.press("Escape");
      await expect(menu(a)).toHaveCount(0);
    }

    // Pin from the menu pins it on All; the menu then offers Unpin.
    await rightClick(row(a, "Learn a piano piece"));
    await a.getByTestId("row-menu-pin").click();
    await expect(row(a, "Learn a piano piece")).toHaveAttribute("data-pinned", "true");
    await rightClick(row(a, "Learn a piano piece"));
    await expect(items(a)).toHaveText(["Open in tab", "Unpin", "Select…", "Delete…"]);
    await page.keyboard.press("Escape");

    // Resolve and Archive from the menu do what the row's buttons do.
    await rightClick(row(a, "Why do I sleep badly on Sundays?"));
    await a.getByTestId("row-menu-resolve").click();
    await expect.poll(() => readFile(page, "Tasks/2026-11-12-sleep.md")).toContain("status: resolved");
    await rightClick(row(a, "Quiz timer idea"));
    await a.getByTestId("row-menu-archive").click();
    await expect.poll(() => exists(page, "Tasks/_archive/2026-11-12-quiz-timer-idea.md")).toBe(true);
  });

  test("a recurring item: Skip after the pin, and Skip from the menu logs “skipped”", async ({ page }) => {
    const a = await openPlanner(page, { tasks: "Chores", now: "2026-12-02T10:00" });
    const plants = row(a, "Water the plants");
    await rightClick(plants);
    await expect(items(a)).toHaveText(["Open in tab", "Pin", "Skip", "Select…", "Delete…"]);
    await a.getByTestId("row-menu-skip").click();
    await expect.poll(() => readFile(page, "Chores/2026-01-01-water-the-plants.md")).toContain("- 2026-12-02 skipped");
  });

  test("the daily note's card: Open in tab, Unpin for today, Select…, Delete…", async ({ page }) => {
    const a = await openPlanner(page);
    const card = a.getByTestId("daily-card");
    await rightClick(card);
    await expect(items(a)).toHaveText(["Open in tab", "Unpin for today", "Select…", "Delete…"]);
    await a.getByTestId("row-menu-unpin-today").click();
    await expect(card).toHaveCount(0);
  });

  test("keyboard: Shift+F10 opens it on the focused row with the first item focused; ↑ ↓ move round; Esc gives the focus back; Enter picks Open in tab", async ({ page }) => {
    const a = await openPlanner(page);
    const open = row(a, "Pay the tax").getByTestId("task-open");
    await open.focus();
    await page.keyboard.press("Shift+F10");
    await expect(menu(a)).toBeVisible();
    await expect(a.getByTestId("row-menu-open-tab")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(a.getByTestId("row-menu-pin")).toBeFocused();
    await shot(page, "t016-fake-row-menu-keyboard-panel");
    await page.keyboard.press("ArrowDown");
    await expect(a.getByTestId("row-menu-select")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(a.getByTestId("row-menu-delete")).toBeFocused();
    await shot(page, "t016-fake-row-menu-delete-focus-panel");
    await page.keyboard.press("ArrowDown");
    await expect(a.getByTestId("row-menu-open-tab")).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(a.getByTestId("row-menu-delete")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu(a)).toHaveCount(0);
    await expect(open).toBeFocused();

    await page.keyboard.press("Shift+F10");
    await expect(a.getByTestId("row-menu-open-tab")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(menu(a)).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.fakeHost.openedTabs.at(-1))).toMatchObject({ kind: "file", path: "Tasks/2026-11-01-pay-the-tax.md" });
    expect(await focusedTestId(a)).toBe("task-open");
  });

  test("a file Pomade can't trash stays, its reason on the row, which gets the focus back", async ({ page }) => {
    const a = await openPlanner(page);
    await a.getByTestId("view-all").click();
    await watchDeletes(page, ["Tasks/2026-11-12-gift-ideas.md"]);
    const gift = row(a, "Gift ideas for Greta");
    await rightClick(gift);
    await a.getByTestId("row-menu-delete").click();
    await a.getByTestId("delete-confirm-button").click();
    await expect(a.getByTestId("delete-confirm")).toHaveCount(0);
    await expect(gift.getByTestId("row-failure")).toHaveText("Couldn't move it to the Trash.");
    await expect(gift.getByTestId("row-failure")).toHaveAttribute("title", '"Tasks/2026-11-12-gift-ideas.md" could not be moved to the Trash');
    await expect(gift.getByTestId("task-open")).toBeFocused();
    expect(await exists(page, "Tasks/2026-11-12-gift-ideas.md")).toBe(true);
    await shot(page, "t016-fake-row-menu-delete-failed-panel");
    // Asking again clears the reason.
    await rightClick(gift);
    await a.getByTestId("row-menu-delete").click();
    await expect(gift.getByTestId("row-failure")).toHaveCount(0);
  });

  test("a click in another frame — the host page around the app's frame — closes the menu and leaves the focus where it went", async ({ page }) => {
    const a = await openPlanner(page);
    const ink = row(a, "Buy printer ink");
    await rightClick(ink);
    await expect(menu(a)).toBeVisible();
    await page.getByTestId("harness-nav").click({ position: { x: 2, y: 2 } });
    await expect(menu(a)).toHaveCount(0);
    await expect(ink).not.toHaveClass(/task-row--menu/);
    expect(await focusedTestId(a)).not.toBe("task-open");
    expect(await a.locator(":root").evaluate(() => document.hasFocus())).toBe(false);

    // The menu opens again in the frame, and Escape still gives the focus to the row.
    await rightClick(ink);
    await expect(menu(a)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu(a)).toHaveCount(0);
    await expect(ink.getByTestId("task-open")).toBeFocused();
  });

  test("select mode: a right-click opens no menu", async ({ page }) => {
    const a = await openPlanner(page);
    await a.getByTestId("view-all").click();
    await a.getByTestId("planner-menu-button").click();
    await a.getByTestId("menu-select").click();
    await expect(a.getByTestId("select-bar")).toBeVisible();
    await rightClick(row(a, "Learn a piano piece"));
    await rightClick(a.locator('[data-testid="unreadable-row"]').first());
    await expect(menu(a)).toHaveCount(0);
    await a.getByTestId("select-done").click();
    await rightClick(row(a, "Learn a piano piece"));
    await expect(menu(a)).toBeVisible();
  });

  for (const [name, open] of [
    ["narrowest-panel", { surface: "panel", panelWidth: 160 }],
    ["tab", { surface: "tab" }],
  ] as const) {
    test(`the menu stays inside the ${name}, opened at the row's far edge`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      const a = await openPlanner(page, open);
      const target = row(a, "Book flights for the Christmas trip to see the grandparents in Valencia");
      const box = await target.evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
      await target.click({ button: "right", position: { x: box.width - 4, y: box.height - 4 } });
      await expect(menu(a)).toBeVisible();
      await expectInside(page, a);
      expect(await a.locator("html").evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
      // Every item shows its whole label.
      for (const item of await items(a).all()) expect(await item.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await menu(a).getByTestId("row-menu-delete").hover();
      await shot(page, `t016-fake-row-menu-${name}`);
      await a.getByTestId("row-menu-delete").click();
      await expect(a.getByTestId("delete-cancel")).toBeFocused();
      await shot(page, `t016-fake-row-menu-delete-${name}`);
    });
  }
});
