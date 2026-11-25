// E-003's trimming on the fake host ([[trimming]]): select mode in All — clicks,
// Shift-click ranges, select all within the filters, the keyboard — the delete confirmation listing
// the files, `files.delete` with exactly the chosen paths, a file Pomade can't trash left selected
// with its reason, and bulk Archive for notes. The fixture is the planner workspace with notes
// (test/fixtures/workspace.ts) at Workspace on Tue 2026-11-17.

import { expect, test, type FrameLocator, type Page } from "@playwright/test";

import { APP_PORT, HARNESS_PORT } from "../playwright.config";
import { row } from "./fixtures/planner";
import { shot } from "./fixtures/screens";

const APP = `http://localhost:${APP_PORT}/`;

interface Open {
  surface: "tab" | "panel";
  panelWidth?: number;
}

function harness(open: Open): string {
  const params = new URLSearchParams({ app: APP, surface: open.surface, tasks: "Tasks", now: "2026-11-17T10:00", fixture: "planner", extra: "notes", project: "workspace" });
  if (open.surface === "panel") params.set("icon", "planner");
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

/**
 * Record every `files.delete` the app makes, and answer `io-error` for the paths in `refuse` as a
 * Mac whose Trash refuses them would (the fake host deletes every file it can) — the rest go.
 */
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
        results: paths.map(
          (p) => done.results.find((r) => r.path === p) ?? { path: p, ok: false, error: { code: "io-error", message: `${JSON.stringify(p)} could not be moved to the Trash: the volume has no Trash` } },
        ),
      };
    };
  }, refuse);
}

const deleteCalls = (page: Page) => page.evaluate(() => window.deleteCalls);

async function openAll(page: Page, open: Open = { surface: "panel" }): Promise<FrameLocator> {
  await page.goto(harness(open));
  const a = app(page);
  await expect(a.locator('main[data-daily]:not([data-daily="pending"])')).toHaveCount(1);
  await a.getByTestId("view-all").click();
  await expect(a.getByTestId("list-all")).toBeVisible();
  return a;
}

/** Start select mode: the panel's ⋯ → Select items…, the tab's Select button. */
async function startSelect(a: FrameLocator, surface: Open["surface"] = "panel"): Promise<void> {
  if (surface === "tab") return a.getByTestId("select-start").click();
  await a.getByTestId("planner-menu-button").click();
  await a.getByTestId("menu-select").click();
}

const selected = (a: FrameLocator) => a.locator('[data-selected="true"] [data-testid="task-title"], [data-testid="unreadable-row"][data-selected="true"] .task-row__title').allTextContents();
const allTitles = (a: FrameLocator) => a.locator('[data-testid="list-all"] > li .task-row__title').allTextContents();

test.describe("All's select mode", () => {
  test("Select: a row click toggles it, Shift-click selects the range; select all takes what the filters show; a filter drops hidden rows; Done leaves", async ({ page }) => {
    const a = await openAll(page);
    await shot(page, "e003-fake-all-select-button");
    await startSelect(a);
    await expect(a.getByTestId("select-bar")).toBeVisible();
    await expect(a.getByTestId("select-all")).toBeFocused();
    await expect(a.getByTestId("select-count")).toHaveText("None selected");
    await expect(a.getByTestId("select-delete")).toBeDisabled();
    // The rows select instead of ticking, opening or showing their actions.
    await expect(a.locator('[data-testid="list-all"] [data-testid="task-check"]')).toHaveCount(0);
    await expect(a.locator('[data-testid="list-all"] [data-testid="task-pin"]')).toHaveCount(0);

    const titles = await allTitles(a);
    await row(a, titles[1] as string).getByTestId("task-open").click();
    await row(a, titles[3] as string).getByTestId("task-open").click({ modifiers: ["Shift"] });
    expect(await selected(a)).toEqual(titles.slice(1, 4));
    await expect(a.getByTestId("select-count")).toHaveText("3 selected");
    await expect(a.getByTestId("select-delete")).toHaveText("Delete 3…");
    expect(await page.evaluate(() => window.fakeHost.openedTabs)).toEqual([]);
    await row(a, titles[2] as string).getByTestId("select-row").click();
    expect(await selected(a)).toEqual([titles[1], titles[3]]);
    await shot(page, "e003-fake-select-range");

    // Select all = every row shown, the unreadable one too; the box is mixed while only some are.
    await expect(a.getByTestId("select-all")).toHaveJSProperty("indeterminate", true);
    await a.getByTestId("select-all").click();
    expect(await selected(a)).toHaveLength(titles.length);
    await expect(a.getByTestId("select-all")).toBeChecked();
    await a.getByTestId("select-all").click();
    await expect(a.getByTestId("select-count")).toHaveText("None selected");

    // Within the type filter: only notes.
    await a.getByTestId("select-all").click();
    await a.getByTestId("filter-types").click();
    await a.locator('[data-testid="filter-option"][data-key="note"]').click();
    await page.keyboard.press("Escape");
    const notes = await allTitles(a);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.length).toBeLessThan(titles.length);
    await expect(a.getByTestId("select-count")).toHaveText(`${String(notes.length)} selected`);
    expect(await selected(a)).toEqual(notes);

    await a.getByTestId("select-done").click();
    await expect(a.getByTestId("select-bar")).toHaveCount(0);
    await expect(a.getByTestId("planner-menu-button")).toBeFocused();
    await expect(a.locator('[data-selected]')).toHaveCount(0);
  });

  test("Delete: the confirmation lists every file and says they go to the Trash; Cancel keeps them; Move to Trash deletes exactly those, the rows leave, select mode ends", async ({ page }) => {
    const a = await openAll(page);
    await watchDeletes(page);
    await startSelect(a);
    await row(a, "Buy printer ink").getByTestId("select-row").click();
    await row(a, "Gift ideas for Greta").getByTestId("select-row").click();
    await a.getByTestId("select-delete").click();
    const dialog = a.getByTestId("delete-confirm");
    await expect(dialog).toBeVisible();
    await expect(a.getByTestId("delete-confirm-title")).toHaveText("Delete 2 files?");
    await expect(dialog).toContainText("They go to the macOS Trash — Finder can put them back.");
    await expect(a.getByTestId("delete-file")).toHaveText([/^Buy printer ink\s*Tasks\/2026-11-09-buy-printer-ink\.md$/, /^Gift ideas for Greta\s*Tasks\/2026-11-12-gift-ideas\.md$/]);
    await expect(a.getByTestId("delete-cancel")).toBeFocused();
    await shot(page, "e003-fake-delete-confirm-two");
    await a.getByTestId("delete-cancel").click();
    await expect(dialog).toHaveCount(0);
    await expect(a.getByTestId("select-delete")).toBeFocused();
    expect(await deleteCalls(page)).toEqual([]);

    await a.getByTestId("select-delete").click();
    await a.getByTestId("delete-confirm-button").click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => deleteCalls(page)).toEqual([["Tasks/2026-11-09-buy-printer-ink.md", "Tasks/2026-11-12-gift-ideas.md"]]);
    await expect(row(a, "Buy printer ink")).toHaveCount(0);
    await expect(row(a, "Gift ideas for Greta")).toHaveCount(0);
    expect(await exists(page, "Tasks/2026-11-09-buy-printer-ink.md")).toBe(false);
    expect(await exists(page, "Tasks/2026-11-12-gift-ideas.md")).toBe(false);
    await expect(a.getByTestId("select-bar")).toHaveCount(0);
    await expect(a.getByTestId("planner-menu-button")).toBeFocused();
    await expect(a.getByTestId("planner-error")).toHaveCount(0);
  });

  test("one file is one confirmation by its title; a file Pomade can't trash stays, selected, its reason under it; the others go", async ({ page }) => {
    const a = await openAll(page);
    await watchDeletes(page, ["Tasks/2026-11-12-sleep.md"]);
    await startSelect(a);
    await row(a, "Learn a piano piece").getByTestId("select-row").click();
    await a.getByTestId("select-delete").click();
    await expect(a.getByTestId("delete-confirm-title")).toHaveText("Delete “Learn a piano piece”?");
    await expect(a.getByTestId("delete-confirm")).toContainText("It goes to the macOS Trash — Finder can put it back.");
    await a.getByTestId("delete-cancel").click();

    await row(a, "Why do I sleep badly on Sundays?").getByTestId("select-row").click();
    const broken = a.locator('[data-testid="unreadable-row"][data-path="Tasks/2026-11-13-broken.md"]');
    await broken.getByTestId("select-row").click();
    await a.getByTestId("select-delete").click();
    await expect(a.getByTestId("delete-file")).toHaveCount(3);
    await a.getByTestId("delete-confirm-button").click();
    await expect.poll(() => deleteCalls(page)).toEqual([["Tasks/2026-11-12-learn-piano.md", "Tasks/2026-11-12-sleep.md", "Tasks/2026-11-13-broken.md"]]);
    await expect(row(a, "Learn a piano piece")).toHaveCount(0);
    await expect(broken).toHaveCount(0);
    const kept = row(a, "Why do I sleep badly on Sundays?");
    await expect(kept).toHaveAttribute("data-selected", "true");
    await expect(kept.getByTestId("row-failure")).toHaveText("Couldn't move it to the Trash.");
    await expect(kept.getByTestId("row-failure")).toHaveAttribute("title", '"Tasks/2026-11-12-sleep.md" could not be moved to the Trash: the volume has no Trash');
    await expect(a.getByTestId("select-count")).toHaveText("1 selected");
    await expect(a.getByTestId("select-delete")).toBeFocused();
    expect(await exists(page, "Tasks/2026-11-12-sleep.md")).toBe(true);
    await shot(page, "e003-fake-delete-failure-panel");

    // Asking again clears the old reason.
    await a.getByTestId("select-delete").click();
    await expect(kept.getByTestId("row-failure")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(a.getByTestId("delete-confirm")).toHaveCount(0);
    await expect(a.getByTestId("select-bar")).toBeVisible();
  });

  test("keyboard only: Space and Shift+Space on the rows, ↓ ↑ between them, ⌘A, Backspace asks, Esc closes the question then select mode", async ({ page }) => {
    const a = await openAll(page);
    await watchDeletes(page);
    const titles = await allTitles(a);
    await a.getByTestId("planner-menu-button").focus();
    await page.keyboard.press("Enter");
    await expect(a.getByTestId("menu-select")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(a.getByTestId("select-all")).toBeFocused();
    // Delete… is off while nothing is selected.
    await page.keyboard.press("Tab");
    await expect(a.getByTestId("select-done")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(row(a, titles[0] as string).getByTestId("select-row")).toBeFocused();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(row(a, titles[2] as string).getByTestId("select-row")).toBeFocused();
    await page.keyboard.press("Shift+Space");
    expect(await selected(a)).toEqual(titles.slice(0, 3));
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Space");
    expect(await selected(a)).toEqual([titles[0], titles[2]]);

    await page.keyboard.press("Meta+a");
    expect(await selected(a)).toHaveLength(titles.length);
    await page.keyboard.press("Space");
    await page.keyboard.press("Backspace");
    await expect(a.getByTestId("delete-confirm")).toBeVisible();
    await expect(a.getByTestId("delete-file")).toHaveCount(titles.length - 1);
    await expect(a.getByTestId("delete-cancel")).toBeFocused();
    // Tab stays inside the question: Cancel, Move to Trash, the list, round again.
    await page.keyboard.press("Shift+Tab");
    await expect(a.getByTestId("delete-files")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(a.getByTestId("delete-cancel")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(a.getByTestId("delete-confirm")).toHaveCount(0);
    expect(await deleteCalls(page)).toEqual([]);
    await expect(a.getByTestId("select-delete")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(a.getByTestId("select-bar")).toHaveCount(0);
    await expect(a.getByTestId("planner-menu-button")).toBeFocused();
  });

  test("Archive: offered when every selected row is a note; archives them into _archive/ and ends select mode", async ({ page }) => {
    const a = await openAll(page);
    await startSelect(a);
    await row(a, "Quiz timer idea").getByTestId("select-row").click();
    await row(a, "Sound effects").getByTestId("select-row").click();
    await expect(a.getByTestId("select-archive")).toBeVisible();
    await row(a, "Pay the tax").getByTestId("select-row").click();
    await expect(a.getByTestId("select-archive")).toHaveCount(0);
    await row(a, "Pay the tax").getByTestId("select-row").click();
    await a.getByTestId("select-archive").click();
    await expect(a.getByTestId("select-bar")).toHaveCount(0);
    await expect(row(a, "Quiz timer idea")).toHaveCount(0);
    expect(await exists(page, "Tasks/_archive/2026-11-12-quiz-timer-idea.md")).toBe(true);
    expect(await exists(page, "Tasks/_archive/QuizLab/2026-11-12-sound-effects.md")).toBe(true);
    expect(await exists(page, "Tasks/2026-11-12-quiz-timer-idea.md")).toBe(false);
  });

  test("the panel: ⋯ holds Select items… on every view, Stop selecting while on; leaving the view or the context ends select mode", async ({ page }) => {
    const a = await openAll(page);
    await expect(a.getByTestId("select-start")).toHaveCount(0);
    await a.getByTestId("planner-menu-button").click();
    await expect(a.getByTestId("planner-menu").getByRole("menuitem")).toHaveText(["Select items…", "Settings…"]);
    await shot(page, "t002-fake-panel-menu-all");
    await a.getByTestId("menu-select").click();
    await expect(a.getByTestId("select-bar")).toBeVisible();
    await a.getByTestId("planner-menu-button").click();
    await expect(a.getByTestId("menu-select")).toHaveText("Stop selecting");
    await a.getByTestId("menu-select").click();
    await expect(a.getByTestId("select-bar")).toHaveCount(0);
    await expect(a.getByTestId("planner-menu-button")).toBeFocused();
    await startSelect(a);
    await row(a, "Pay the tax").getByTestId("select-row").click();
    await a.getByTestId("view-today").click();
    await expect(a.getByTestId("select-bar")).toHaveCount(0);
    await a.getByTestId("planner-menu-button").click();
    await expect(a.getByTestId("planner-menu").getByRole("menuitem")).toHaveText(["Select items…", "Settings…"]);
    await page.keyboard.press("Escape");
    await expect(a.getByTestId("planner-menu")).toHaveCount(0);
    await expect(a.getByTestId("planner-menu-button")).toBeFocused();
    await a.getByTestId("view-all").click();
    await expect(a.getByTestId("select-bar")).toHaveCount(0);
    await expect(a.locator('[data-testid="list-all"] [data-testid="task-check"]').first()).toBeVisible();
    await startSelect(a);
    await page.evaluate(() => window.fakeHost.setActiveProject("quiz"));
    await expect(a.getByTestId("select-bar")).toHaveCount(0);
  });

  test("the tab: Select is a header button on every view, pressed while selecting; pressing it again ends select mode", async ({ page }) => {
    const a = await openAll(page, { surface: "tab" });
    await a.getByTestId("select-start").click();
    await expect(a.getByTestId("select-start")).toHaveAttribute("aria-pressed", "true");
    await a.getByTestId("select-start").click();
    await expect(a.getByTestId("select-bar")).toHaveCount(0);
    await expect(a.getByTestId("select-start")).toHaveAttribute("aria-pressed", "false");
    await expect(a.getByTestId("select-start")).toBeFocused();
    await a.getByTestId("select-start").click();
    // Recurring has nothing to select in this workspace: off there.
    for (const [id, enabled] of [
      ["today", true],
      ["project", true],
      ["recurring", false],
    ] as const) {
      await a.getByTestId(`view-${id}`).click();
      await expect(a.getByTestId("select-bar")).toHaveCount(0);
      await expect(a.getByTestId("select-start")).toHaveAttribute("aria-pressed", "false");
      await expect(a.getByTestId("select-start")).toBeEnabled({ enabled });
    }
  });

  for (const [name, open] of [
    ["narrow-panel", { surface: "panel", panelWidth: 180 }],
    ["panel", { surface: "panel" }],
    ["wide-panel", { surface: "panel", panelWidth: 380 }],
    ["tab", { surface: "tab" }],
  ] as const) {
    test(`select mode and the confirmation fit the ${name}: nothing spills sideways`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      const a = await openAll(page, open);
      await startSelect(a, open.surface);
      await row(a, "Book flights for the Christmas trip to see the grandparents in Valencia").getByTestId("select-row").click();
      await row(a, "Gift ideas for Greta").getByTestId("select-row").click();
      const sideways = () => a.locator("html").evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(await sideways()).toBe(0);
      // The header's buttons still leave every view whole in the switcher.
      expect(await a.getByRole("tablist", { name: "Planner views" }).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      const bar = await a.getByTestId("select-bar").boundingBox();
      const done = await a.getByTestId("select-done").boundingBox();
      expect((done?.x ?? 0) + (done?.width ?? 0)).toBeLessThanOrEqual((bar?.x ?? 0) + (bar?.width ?? 0));
      await shot(page, `e003-fake-select-${name}`);
      await a.getByTestId("select-delete").click();
      const dialog = await a.getByTestId("delete-confirm").boundingBox();
      const confirm = await a.getByTestId("delete-confirm-button").boundingBox();
      expect((confirm?.x ?? 0) + (confirm?.width ?? 0)).toBeLessThanOrEqual((dialog?.x ?? 0) + (dialog?.width ?? 0));
      expect(await sideways()).toBe(0);
      await shot(page, `e003-fake-delete-confirm-${name}`);
    });
  }
});
