// E-002 on pomade-kit's fake host (fixture test/fixtures/workspace.ts): creating tickets from the
// columns, the card popover, the Signals area with its triage picker, the "Needs you" panel inside
// a project, live, and the Workspace chooser's counts. Screenshots of every new state.

import { expect, test, type FrameLocator, type Page } from "@playwright/test";

import { BOARD_URL, HARNESS_PORT } from "../playwright.config";
import { DELTA_TICKETS, SAMPLE_TICKETS, ticketFile, ticketPath } from "../test/fixtures/backlog";
import { boxOf, card, cardsIn, column, createdTicket, drag, idsIn, withFields, withStatus } from "./fixtures/board";
import { shot } from "./fixtures/screens";

const APP = BOARD_URL;
const ALPHA = "Projects/alpha/docs/roadmap";
const DELTA = "Projects/delta/docs/roadmap";

function harness(project: string, surface: "tab" | "panel" = "tab"): string {
  const params = new URLSearchParams({ app: APP, surface, icon: "board", project });
  return `http://localhost:${HARNESS_PORT}/index.html?${params.toString()}`;
}

const frame = (page: Page): FrameLocator => page.frameLocator("#stage iframe");
const pathOf = (folder: string, id: string): string => {
  const spec = (folder === DELTA ? DELTA_TICKETS : SAMPLE_TICKETS).find((t) => t.id === id);
  if (!spec) throw new Error(id);
  return `${folder}/${ticketPath(spec)}`;
};

test.use({ viewport: { width: 1680, height: 900 } });

let pageErrors: Error[] = [];

test.beforeEach(({ page }) => {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e));
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

async function openBoard(page: Page, project: string, area?: string): Promise<FrameLocator> {
  await page.goto(harness(project));
  const app = frame(page);
  await expect(app.getByTestId("board")).toBeVisible();
  if (area !== undefined) {
    await app.getByTestId(`area-${area}`).click();
    await expect(app.getByTestId("board")).toHaveAttribute("data-area", area);
  }
  return app;
}

async function openPanel(page: Page, project: string): Promise<FrameLocator> {
  await page.goto(harness(project, "panel"));
  const app = frame(page);
  await expect(app.getByTestId("view-needs-you-panel")).toBeVisible();
  await expect(app.getByTestId("view-needs-you-panel")).toHaveAttribute("aria-busy", "false");
  return app;
}

const readFile = (page: Page, path: string) => page.evaluate((p) => window.fakeHost.readFile(p), path);
const readOrNull = (page: Page, path: string) =>
  page.evaluate((p) => {
    try {
      return window.fakeHost.readFile(p);
    } catch {
      return null;
    }
  }, path);
const writeFile = (page: Page, path: string, content: string) => page.evaluate(([p, c]) => window.fakeHost.writeFile(p, c), [path, content] as const);
const lastTab = (page: Page) => page.evaluate(() => window.fakeHost.openedTabs.at(-1));
const focusedTestId = (app: FrameLocator) => app.locator(":root").evaluate(() => document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.tagName ?? null);

/** The popover's box lies fully inside the frame's viewport. */
async function expectInside(page: Page, app: FrameLocator, testId: string): Promise<void> {
  const box = await boxOf(app.getByTestId(testId));
  const frameBox = await boxOf(page.locator("#stage iframe"));
  expect(box.x).toBeGreaterThanOrEqual(frameBox.x + 8);
  expect(box.y).toBeGreaterThanOrEqual(frameBox.y + 8);
  expect(box.x + box.width).toBeLessThanOrEqual(frameBox.x + frameBox.width - 8 + 0.5);
  expect(box.y + box.height).toBeLessThanOrEqual(frameBox.y + frameBox.height - 8 + 0.5);
}

test.describe("create", () => {
  test("+ on Planned: task “Verify T-199” under E-017 gets the next task ID counting done/, is written whole, opens in the editor, and shows its chip", async ({ page }) => {
    const app = await openBoard(page, "delta", "solutions");
    await column(app, "planned").getByTestId("column-add").click();
    const form = app.getByTestId("create-form");
    await expect(form).toBeVisible();
    await expect(form.getByTestId("kind-epic")).toBeChecked();
    await expect(form.getByTestId("create-title")).toBeFocused();
    await expectInside(page, app, "create-form");
    await shot(page, "e002-fake-create-form-solutions");

    await form.getByTestId("kind-task").check();
    await expect(form.getByTestId("create-preview")).toHaveText("T-042 · Planned");
    await form.getByTestId("create-title").fill("Verify T-199");
    await expect(form.getByTestId("priority-P2")).toBeChecked();
    // Type-to-filter: only E-017 matches, and it becomes the parent.
    await form.getByTestId("parent-filter").fill("icon");
    await expect(form.getByTestId("parent-option")).toHaveCount(2);
    await expect(form.locator('[data-testid="parent-option"][aria-selected="true"]')).toHaveAttribute("data-id", "E-017");
    await shot(page, "e002-fake-create-parent-filter");
    await page.keyboard.press("Enter");

    const path = `${DELTA}/T-042-verify-t-199.md`;
    await expect.poll(() => readOrNull(page, path)).toBe(createdTicket({ id: "T-042", kind: "task", title: "Verify T-199", status: "planned", parent: "E-017" }));
    await expect.poll(() => lastTab(page)).toEqual({ kind: "file", projectId: "delta", path });
    await expect(form).toHaveCount(0);
    await expect(column(app, "planned").locator('[data-id="T-042"]').getByTestId("card-parent")).toHaveText("E-017");
  });

  test("the ID is re-checked when the file is written: a ticket made meanwhile bumps it", async ({ page }) => {
    const app = await openBoard(page, "delta", "solutions");
    await column(app, "in-progress").getByTestId("column-add").click();
    await app.getByTestId("kind-task").check();
    await expect(app.getByTestId("create-preview")).toHaveText("T-042 · In progress");
    // Another writer takes T-042 and T-043 (in done/) while the form is open.
    await writeFile(page, `${DELTA}/T-042-someone-else.md`, ticketFile({ id: "T-042", kind: "task", title: "Someone else", status: "planned" }));
    await writeFile(page, `${DELTA}/done/T-043-done-meanwhile.md`, ticketFile({ id: "T-043", kind: "task", title: "Done meanwhile", status: "done" }));
    await app.getByTestId("create-title").fill("Mine");
    await app.getByTestId("create-submit").click();
    await expect.poll(() => readOrNull(page, `${DELTA}/T-044-mine.md`)).toBe(createdTicket({ id: "T-044", kind: "task", title: "Mine", status: "in-progress" }));
    expect(await readFile(page, `${DELTA}/T-042-someone-else.md`)).toContain("Someone else");
  });

  test("T-999 → T-1000; a column that takes one kind fixes it", async ({ page }) => {
    const app = await openBoard(page, "alpha", "solutions");
    await column(app, "backlog").getByTestId("column-add").click();
    await expect(app.getByTestId("kind-select")).toHaveCount(0);
    await expect(app.getByTestId("create-preview")).toHaveText("T-1000 · Backlog");
    await app.getByTestId("create-title").fill("Big number");
    await app.getByTestId("create-title").press("Enter");
    await expect.poll(() => readOrNull(page, `${ALPHA}/T-1000-big-number.md`)).toBe(createdTicket({ id: "T-1000", kind: "task", title: "Big number", status: "backlog" }));
  });

  test("a problem has no parent field; P0 and a title with a colon are written so they read back", async ({ page }) => {
    const app = await openBoard(page, "delta");
    await column(app, "grooming").getByTestId("column-add").click();
    await expect(app.getByTestId("create-parent")).toHaveCount(0);
    await expect(app.getByTestId("create-preview")).toHaveText("P-014 · Grooming");
    await shot(page, "e002-fake-create-form-problem");
    await app.getByTestId("create-title").fill("Sync: conflicts lose edits");
    await app.getByTestId("priority-P0").check();
    await app.getByTestId("create-submit").click();
    await expect
      .poll(() => readOrNull(page, `${DELTA}/P-014-sync-conflicts-lose-edits.md`))
      .toBe(createdTicket({ id: "P-014", kind: "problem", title: "Sync: conflicts lose edits", titleYaml: '"Sync: conflicts lose edits"', status: "grooming", priority: "P0" }));
    await expect(column(app, "grooming").locator('[data-id="P-014"]').getByTestId("card-title")).toHaveText("Sync: conflicts lose edits");
  });

  test("an empty title is refused in the form; nothing is written", async ({ page }) => {
    const app = await openBoard(page, "delta");
    await column(app, "backlog").getByTestId("column-add").click();
    await app.getByTestId("create-title").fill("   ");
    await page.keyboard.press("Enter");
    await expect(app.getByTestId("create-error")).toHaveText("Give it a title.");
    await expect(app.getByTestId("create-title")).toBeFocused();
    expect(await readOrNull(page, `${DELTA}/P-014.md`)).toBeNull();
    await shot(page, "e002-fake-create-error");
  });

  test("keyboard: Tab walks the fields and wraps inside the form; Esc closes it and gives focus back to the +", async ({ page }) => {
    const app = await openBoard(page, "delta", "solutions");
    const add = column(app, "planned").getByTestId("column-add");
    await add.focus();
    await page.keyboard.press("Enter");
    await expect(app.getByTestId("create-title")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(app.getByTestId("kind-epic")).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(app.getByTestId("parent-filter")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(app.getByTestId("priority-P2")).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(app.getByTestId("priority-P1")).toBeChecked();
    await page.keyboard.press("Tab");
    await expect(app.getByTestId("create-cancel")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(app.getByTestId("create-submit")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(app.getByTestId("kind-epic")).toBeFocused();
    // Esc from the parent filter closes the whole form.
    await app.getByTestId("parent-filter").focus();
    await page.keyboard.press("Escape");
    await expect(app.getByTestId("create-form")).toHaveCount(0);
    expect(await focusedTestId(app)).toBe("column-add");
    await expect(add).toBeFocused();
  });

  test("↑ ↓ in the parent list move the choice; the chosen parent is written", async ({ page }) => {
    const app = await openBoard(page, "delta", "solutions");
    await column(app, "planned").getByTestId("column-add").click();
    await app.getByTestId("create-title").fill("Epic under P-011");
    await app.getByTestId("parent-filter").focus();
    // Open problems first, newest first: none, P-013, P-012, P-011.
    expect(await app.getByTestId("parent-option").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")))).toEqual(["", "P-013", "P-012", "P-011"]);
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowDown");
    await expect(app.locator('[data-testid="parent-option"][aria-selected="true"]')).toHaveAttribute("data-id", "P-011");
    await page.keyboard.press("Enter");
    await expect.poll(() => readOrNull(page, `${DELTA}/E-019-epic-under-p-011.md`)).toBe(createdTicket({ id: "E-019", kind: "epic", title: "Epic under P-011", status: "planned", parent: "P-011" }));
  });

  test("the form stays inside the frame next to the right edge and in a narrow tab", async ({ page }) => {
    const app = await openBoard(page, "delta", "solutions");
    await column(app, "done").getByTestId("column-expand").click();
    await column(app, "done").getByTestId("column-add").click();
    await expectInside(page, app, "create-form");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 480, height: 640 });
    await app.getByTestId("board-columns").evaluate((el) => el.scrollTo({ left: 300 }));
    await column(app, "planned").getByTestId("column-add").click();
    await expectInside(page, app, "create-form");
    expect((await boxOf(app.getByTestId("create-form"))).width).toBeLessThanOrEqual(480 - 16);
    await shot(page, "e002-fake-create-narrow");
  });
});

test.describe("card popover", () => {
  test("right-click → P1 writes only priority: and updated:; the popover stays inside the frame by the right edge", async ({ page }) => {
    const app = await openBoard(page, "delta", "solutions");
    const path = pathOf(DELTA, "T-004");
    const before = await readFile(page, path);
    await card(app, "T-004").click({ button: "right" });
    await expect(app.getByTestId("card-popover")).toBeVisible();
    await expect(app.getByTestId("priority-P2")).toBeChecked();
    await app.getByTestId("priority-P1").check();
    await expect.poll(() => readFile(page, path)).toBe(withFields(before, { priority: "P1" }));
    await expect(card(app, "T-004").getByTestId("card-priority")).toHaveText("P1");
    await page.keyboard.press("Escape");
    await expect(app.getByTestId("card-popover")).toHaveCount(0);
    await expect(card(app, "T-004")).toBeFocused();

    // By the frame's right edge it shifts left to stay inside.
    await page.setViewportSize({ width: 1000, height: 800 });
    await column(app, "done").getByTestId("column-expand").click();
    await app.getByTestId("board-columns").evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    const doneCard = column(app, "done").getByTestId("card").first();
    const doneBox = await boxOf(doneCard);
    const frameBox = await boxOf(page.locator("#stage iframe"));
    expect(frameBox.x + frameBox.width - (doneBox.x + doneBox.width)).toBeLessThan(320);
    await doneCard.click({ button: "right", position: { x: doneBox.width - 6, y: 10 } });
    await expectInside(page, app, "card-popover");
    await shot(page, "e002-fake-popover-right-edge");
  });

  test("the parent: filter and Enter writes epic:; “No epic” removes the key; each change only that key and updated:", async ({ page }) => {
    const app = await openBoard(page, "delta", "solutions");
    const path = pathOf(DELTA, "T-004");
    const before = await readFile(page, path);
    await card(app, "T-004").focus();
    await page.keyboard.press("Shift+F10");
    await expect(app.getByTestId("card-popover")).toBeVisible();
    await expect(app.locator('[data-testid="parent-option"][data-chosen="true"]')).toHaveAttribute("data-id", "E-017");
    await app.getByTestId("parent-filter").fill("faster");
    await page.keyboard.press("Enter");
    const moved = withFields(before, { epic: "E-018" });
    await expect.poll(() => readFile(page, path)).toBe(moved);
    await expect(card(app, "T-004").getByTestId("card-parent")).toHaveText("E-018");
    await shot(page, "e002-fake-popover-parent");

    await app.getByTestId("parent-filter").fill("");
    await app.locator('[data-testid="parent-option"][data-id=""]').click();
    await expect.poll(() => readFile(page, path)).toBe(withFields(moved, { epic: null }));
    await expect(card(app, "T-004").getByTestId("card-parent")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(card(app, "T-004")).toBeFocused();
  });

  test("a problem's popover has priority only; a click outside closes it", async ({ page }) => {
    const app = await openBoard(page, "delta");
    await card(app, "P-012").click({ button: "right" });
    await expect(app.getByTestId("card-popover")).toBeVisible();
    await expect(app.getByTestId("card-popover").getByTestId("parent-list")).toHaveCount(0);
    await shot(page, "e002-fake-popover-problem");
    await app.getByTestId("card-popover-scrim").click({ position: { x: 5, y: 5 } });
    await expect(app.getByTestId("card-popover")).toHaveCount(0);
    expect(await page.evaluate(() => window.fakeHost.openedTabs.length)).toBe(0);
  });

  test("the popover edits the file as it is now: a change made while it is open is kept", async ({ page }) => {
    const app = await openBoard(page, "delta");
    const path = pathOf(DELTA, "P-012");
    await card(app, "P-012").click({ button: "right" });
    const changed = (await readFile(page, path)).replace("Board edits are slow", "Board edits are slow (edited)");
    await writeFile(page, path, changed);
    await expect(card(app, "P-012").getByTestId("card-title")).toHaveText("Board edits are slow (edited)");
    await app.getByTestId("priority-P0").check();
    await expect.poll(() => readFile(page, path)).toBe(withFields(changed, { priority: "P0" }));
  });
});

test.describe("Signals", () => {
  test("Signals is the first area: New · Triaged · Dismissed; a card shows ID, title, source and its problem chip", async ({ page }) => {
    const app = await openBoard(page, "alpha");
    expect(await app.getByTestId("area-switcher").getByRole("tab").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")))).toEqual(["area-signals", "area-problems", "area-solutions"]);
    await expect(app.getByTestId("area-problems")).toHaveAttribute("aria-selected", "true");
    await writeFile(page, `${ALPHA}/S-002-linked.md`, "---\nid: S-002\nkind: signal\ntitle: Linked signal\nstatus: triaged\nsource: review\nproblem: P-002\ncreated: 2026-11-09\nupdated: 2026-11-09\n---\n");
    await app.getByTestId("area-signals").click();
    expect(await app.getByTestId("column").evaluateAll((els) => els.map((e) => [e.getAttribute("data-status"), e.getAttribute("data-collapsed")]))).toEqual([
      ["new", "false"],
      ["triaged", "false"],
      ["dismissed", "true"],
    ]);
    await expect(app.getByTestId("area-signals")).toContainText("2");
    await expect(card(app, "S-001").getByTestId("card-title")).toHaveText("Cmd+click opened random files");
    await expect(card(app, "S-001").getByTestId("card-source")).toHaveText("session-2026-11-09");
    await expect(card(app, "S-001").getByTestId("card-parent")).toHaveCount(0);
    await expect(column(app, "triaged").locator('[data-id="S-002"]').getByTestId("card-parent")).toHaveText("P-002");
    await expect(card(app, "S-002").getByTestId("card-source")).toHaveText("review");
    await shot(page, "e002-fake-signals-board");
  });

  test("a project with no signals shows an empty Signals board with “+ New signal”; it creates S-001 as new, from daniil", async ({ page }) => {
    const app = await openBoard(page, "delta", "signals");
    await expect(app.getByTestId("area-empty")).toBeVisible();
    await expect(app.getByTestId("area-create")).toHaveText("+ New signal");
    await shot(page, "e002-fake-signals-empty");
    await app.getByTestId("area-create").click();
    await expect(app.getByTestId("create-preview")).toHaveText("S-001 · New");
    await expect(app.getByTestId("create-source")).toHaveValue("daniil");
    await app.getByTestId("create-title").fill("Board missed a rename");
    await shot(page, "e002-fake-create-form-signal");
    await app.getByTestId("create-submit").click();
    const path = `${DELTA}/S-001-board-missed-a-rename.md`;
    await expect.poll(() => readOrNull(page, path)).toBe(createdTicket({ id: "S-001", kind: "signal", title: "Board missed a rename", status: "new" }));
    await expect(column(app, "new").locator('[data-id="S-001"]')).toBeVisible();
    await expect(card(app, "S-001").getByTestId("card-source")).toHaveText("daniil");
    await expect.poll(() => lastTab(page)).toEqual({ kind: "file", projectId: "delta", path });
  });

  test("dragging a signal without a problem to Triaged asks for its problem first; the pick is written with the status", async ({ page }) => {
    const app = await openBoard(page, "alpha", "signals");
    const path = pathOf(ALPHA, "S-001");
    const before = await readFile(page, path);
    await drag(page, card(app, "S-001"), column(app, "triaged"));
    const picker = app.getByTestId("triage-picker");
    await expect(picker).toBeVisible();
    await expect(app.getByTestId("parent-filter")).toBeFocused();
    expect(await readFile(page, path)).toBe(before);
    await page.keyboard.type("sync");
    await expect(picker.locator('[data-testid="parent-option"][aria-selected="true"]')).toHaveAttribute("data-id", "P-002");
    await expectInside(page, app, "triage-picker");
    await shot(page, "e002-fake-triage-picker");
    await page.keyboard.press("Enter");
    await expect(picker).toHaveCount(0);
    await expect(column(app, "triaged").locator('[data-id="S-001"]').getByTestId("card-parent")).toHaveText("P-002");
    // status: and updated: change in place; the missing problem: is added at the end of the block.
    await expect.poll(() => readFile(page, path)).toBe(withStatus(before, "triaged").replace(/\n---\n\n#/, "\nproblem: P-002\n---\n\n#"));
  });

  test("the triage question is skippable, and Esc cancels the drop", async ({ page }) => {
    const app = await openBoard(page, "alpha", "signals");
    const path = pathOf(ALPHA, "S-001");
    const before = await readFile(page, path);
    await drag(page, card(app, "S-001"), column(app, "triaged"));
    await expect(app.getByTestId("triage-picker")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(app.getByTestId("triage-picker")).toHaveCount(0);
    await expect(column(app, "new").locator('[data-id="S-001"]')).toBeVisible();
    expect(await readFile(page, path)).toBe(before);

    // Keyboard drag this time: Space, →, Space.
    await card(app, "S-001").focus();
    await page.keyboard.press("Space");
    await expect(app.getByTestId("card-overlay")).toBeVisible();
    await app.locator("html").evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    await page.keyboard.press("ArrowRight");
    await expect(column(app, "triaged")).toHaveAttribute("data-over", "true");
    await page.keyboard.press("Space");
    await expect(app.getByTestId("triage-picker")).toBeVisible();
    await app.getByTestId("triage-skip").click();
    await expect(column(app, "triaged").locator('[data-id="S-001"]')).toBeVisible();
    await expect.poll(() => readFile(page, path)).toBe(withStatus(before, "triaged"));
  });

  test("a signal that has a problem is triaged without asking; to Dismissed never asks", async ({ page }) => {
    const app = await openBoard(page, "alpha", "signals");
    const linked = `${ALPHA}/S-003-linked.md`;
    await writeFile(page, linked, "---\nid: S-003\nkind: signal\ntitle: Linked\nstatus: new\nproblem: P-001\nupdated: 2026-11-09\n---\n");
    await drag(page, card(app, "S-003"), column(app, "triaged"));
    await expect.poll(() => readFile(page, linked)).toContain("status: triaged");
    await expect(app.getByTestId("triage-picker")).toHaveCount(0);
  });
});

test.describe("Needs you", () => {
  test("inside a project: review tickets and new signals, each by priority then ID; a click opens the ticket", async ({ page }) => {
    const app = await openPanel(page, "alpha");
    const ids = (group: string) => app.getByTestId(`needs-you-${group}`).getByTestId("needs-you-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")));
    expect(await ids("review")).toEqual(["E-017", "P-005"]);
    expect(await ids("signals")).toEqual(["S-001"]);
    await shot(page, "e002-fake-needs-you-project");
    await app.locator('[data-testid="needs-you-row"][data-id="P-005"]').click();
    await expect.poll(() => lastTab(page)).toEqual({ kind: "file", projectId: "alpha", path: pathOf(ALPHA, "P-005") });
  });

  test("live: a ticket leaving review or a new signal appearing updates the panel within ~1 s; nothing left shows “Nothing needs you”", async ({ page }) => {
    const app = await openPanel(page, "alpha");
    const e017 = pathOf(ALPHA, "E-017");
    await writeFile(page, e017, (await readFile(page, e017)).replace("status: review", "status: done"));
    await expect(app.locator('[data-testid="needs-you-row"][data-id="E-017"]')).toHaveCount(0, { timeout: 1_000 });
    await writeFile(page, `${ALPHA}/S-004-fresh.md`, "---\nid: S-004\nkind: signal\ntitle: Fresh\nstatus: new\npriority: P0\n---\n");
    await expect(app.getByTestId("needs-you-signals").getByTestId("needs-you-row").first()).toHaveAttribute("data-id", "S-004", { timeout: 1_000 });
    for (const [path, from, to] of [
      [pathOf(ALPHA, "P-005"), "review", "done"],
      [pathOf(ALPHA, "S-001"), "new", "dismissed"],
      [`${ALPHA}/S-004-fresh.md`, "new", "triaged"],
    ] as const) {
      await writeFile(page, path, (await readFile(page, path)).replace(`status: ${from}`, `status: ${to}`));
    }
    await expect(app.getByTestId("needs-you-empty")).toBeVisible({ timeout: 1_000 });
    await expect(app.getByTestId("needs-you-empty")).toContainText("No tickets in review and no new signals in Alpha.");
    await shot(page, "e002-fake-needs-you-empty");
  });

  test("the panel follows the active project; a project without a backlog says so", async ({ page }) => {
    const app = await openPanel(page, "alpha");
    await page.evaluate(() => window.fakeHost.setActiveProject("beta"));
    await expect(app.getByTestId("needs-you-no-backlog")).toBeVisible();
    await page.evaluate(() => window.fakeHost.setActiveProject("gamma"));
    await expect(app.locator('[data-testid="needs-you-row"][data-id="P-001"]')).toBeVisible();
  });

  test("the Workspace chooser shows each project's counts, live", async ({ page }) => {
    await page.goto(harness("workspace"));
    const chooser = frame(page);
    const row = (id: string) => chooser.locator(`[data-testid="chooser-project"][data-project="${id}"]`);
    await expect(row("alpha").getByTestId("chooser-needs-you")).toHaveText("2 in review · 1 new signal");
    await expect(row("delta").getByTestId("chooser-needs-you")).toHaveText("2 in review");
    await expect(row("gamma").getByTestId("chooser-needs-you")).toHaveText("1 in review");
    await shot(page, "e002-fake-chooser-counts");
    await writeFile(page, `${ALPHA}/S-009-one-more.md`, "---\nid: S-009\nkind: signal\ntitle: One more\nstatus: new\n---\n");
    await expect(row("alpha").getByTestId("chooser-needs-you")).toHaveText("2 in review · 2 new signals", { timeout: 1_000 });
  });
});

test("a narrow tab: Signals and Solutions keep their layout", async ({ page }) => {
  await page.setViewportSize({ width: 560, height: 700 });
  const app = await openBoard(page, "alpha", "signals");
  await shot(page, "e002-fake-signals-narrow");
  await app.getByTestId("area-solutions").click();
  expect(await idsIn(app, "backlog")).toEqual(["T-003"]);
  await expect(cardsIn(app, "planned")).toHaveCount(3);
});
