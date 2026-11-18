// "Needs you" at Workspace on pomade-kit's fake host (fixture test/fixtures/workspace.ts): the list
// of projects under "All projects", one project's groups and every project's sections a click in,
// the row that leads back, all of it live, at the panel's default and minimum widths.

import { expect, test, type FrameLocator, type Page } from "@playwright/test";

import { BOARD_URL, HARNESS_PORT } from "../playwright.config";
import { DELTA_TICKETS, SAMPLE_TICKETS, scaleBacklog, ticketFile, ticketPath } from "../test/fixtures/backlog";
import { boxOf } from "./fixtures/board";
import { shot } from "./fixtures/screens";

const APP = BOARD_URL;
const ALPHA = "Projects/alpha/docs/roadmap";
const DELTA = "Projects/delta/docs/roadmap";
const GAMMA = "Projects/gamma/plans";
const SCALE_REVIEW = Object.values(scaleBacklog(300)).filter((text) => text.includes("\nstatus: review\n")).length;

const frame = (page: Page): FrameLocator => page.frameLocator("#stage iframe");
const pathOf = (folder: string, id: string): string => {
  const spec = (folder === DELTA ? DELTA_TICKETS : SAMPLE_TICKETS).find((t) => t.id === id);
  if (!spec) throw new Error(id);
  return `${folder}/${ticketPath(spec)}`;
};

test.use({ viewport: { width: 900, height: 700 } });

let pageErrors: Error[] = [];

test.beforeEach(({ page }) => {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e));
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

async function openPanel(page: Page, project = "workspace", panelWidth?: number): Promise<FrameLocator> {
  const params = new URLSearchParams({ app: APP, surface: "panel", icon: "board", project });
  if (panelWidth !== undefined) params.set("panelWidth", String(panelWidth));
  await page.goto(`http://localhost:${HARNESS_PORT}/index.html?${params.toString()}`);
  const app = frame(page);
  await expect(app.getByTestId("view-needs-you-panel")).toHaveAttribute("aria-busy", "false");
  return app;
}

const readFile = (page: Page, path: string) => page.evaluate((p) => window.fakeHost.readFile(p), path);
const writeFile = (page: Page, path: string, content: string) => page.evaluate(([p, c]) => window.fakeHost.writeFile(p, c), [path, content] as const);
const setStatus = async (page: Page, path: string, from: string, to: string) => writeFile(page, path, (await readFile(page, path)).replace(`status: ${from}`, `status: ${to}`));
const lastTab = (page: Page) => page.evaluate(() => window.fakeHost.openedTabs.at(-1));

const view = (app: FrameLocator) => app.getByTestId("view-needs-you-panel");
const rows = (app: FrameLocator) => app.getByTestId("needs-you-row");
const listRow = (app: FrameLocator, id: string) => app.locator(`[data-testid="needs-you-list-project"][data-project="${id}"]`);
const counts = (row: ReturnType<typeof listRow>) => row.getByTestId("needs-you-list-count");
const listed = (app: FrameLocator) => app.getByTestId("needs-you-list-project").evaluateAll((els) => els.map((e) => e.getAttribute("data-project")));
const rowIds = (scope: FrameLocator | ReturnType<typeof listRow>) => scope.getByTestId("needs-you-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")));
const section = (app: FrameLocator, id: string) => app.locator(`[data-testid="needs-you-project"][data-project="${id}"]`);

test("the panel opens on the list: “All projects” with the total, then each project with something waiting, in sidebar order, and no ticket", async ({ page }) => {
  const app = await openPanel(page);
  await expect(view(app)).toHaveAttribute("data-level", "list");
  // Beta has no backlog: it is left out.
  expect(await listed(app)).toEqual(["alpha", "gamma", "delta", "scale"]);
  const buttons = app.getByTestId("needs-you-list").getByRole("button");
  await expect(buttons).toHaveCount(5);
  await expect(buttons.first()).toHaveAttribute("data-testid", "needs-you-all");
  await expect(buttons.first()).toContainText("All projects");
  await expect(counts(app.getByTestId("needs-you-all"))).toHaveText([`${5 + SCALE_REVIEW} in review`, "1 new signal"]);
  await expect(counts(listRow(app, "alpha"))).toHaveText(["2 in review", "1 new signal"]);
  await expect(counts(listRow(app, "gamma"))).toHaveText(["1 in review"]);
  await expect(counts(listRow(app, "delta"))).toHaveText(["2 in review"]);
  await expect(counts(listRow(app, "scale"))).toHaveText([`${SCALE_REVIEW} in review`]);
  await expect(listRow(app, "alpha")).toContainText("Alpha");
  await expect(listRow(app, "alpha")).toContainText("Building tools");
  await expect(rows(app)).toHaveCount(0);
  await expect(app.getByTestId("needs-you-project")).toHaveCount(0);
  await expect(app.getByTestId("needs-you-back")).toHaveCount(0);
  await shot(page, "t003-fake-list-240");
});

test("a click on a project shows only its two groups; the back row names it and returns to the list, on the row that was open", async ({ page }) => {
  const app = await openPanel(page);
  await listRow(app, "alpha").click();
  await expect(view(app)).toHaveAttribute("data-level", "project");
  await expect(view(app)).toHaveAttribute("data-level-project", "alpha");
  expect(await app.getByTestId("needs-you-review").getByTestId("needs-you-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")))).toEqual(["E-017", "P-005"]);
  expect(await app.getByTestId("needs-you-signals").getByTestId("needs-you-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")))).toEqual(["S-001"]);
  expect(await rowIds(app)).toEqual(["E-017", "P-005", "S-001"]);
  await expect(app.getByTestId("needs-you-list")).toHaveCount(0);
  const back = app.getByTestId("needs-you-back");
  await expect(back).toContainText("Alpha");
  await expect(back).toBeFocused();
  await shot(page, "t003-fake-project-240");

  await back.click();
  await expect(view(app)).toHaveAttribute("data-level", "list");
  await expect(rows(app)).toHaveCount(0);
  expect(await listed(app)).toEqual(["alpha", "gamma", "delta", "scale"]);
  await expect(listRow(app, "alpha")).toBeFocused();

  await listRow(app, "delta").click();
  await expect(app.getByTestId("needs-you-back")).toContainText("Delta");
  expect(await rowIds(app)).toEqual(["E-018", "P-013"]);

  // A ticket opens in an editor tab of its project; Pomade switches to that project and the panel follows.
  await app.locator('[data-testid="needs-you-row"][data-id="P-013"]').click();
  await expect.poll(() => lastTab(page)).toEqual({ kind: "file", projectId: "delta", path: pathOf(DELTA, "P-013") });
  await expect(view(app)).toHaveAttribute("data-project", "delta");
});

test("“All projects” shows every project's sections as one list; the back row stays in view while it scrolls", async ({ page }) => {
  const app = await openPanel(page);
  await app.getByTestId("needs-you-all").click();
  await expect(view(app)).toHaveAttribute("data-level", "all");
  expect(await app.getByTestId("needs-you-project").evaluateAll((els) => els.map((e) => e.getAttribute("data-project")))).toEqual(["alpha", "gamma", "delta", "scale"]);
  expect(await rowIds(section(app, "alpha"))).toEqual(["E-017", "P-005", "S-001"]);
  expect(await rowIds(section(app, "gamma"))).toEqual(["P-001"]);
  expect(await rowIds(section(app, "delta"))).toEqual(["E-018", "P-013"]);
  await expect(section(app, "scale").getByTestId("needs-you-row")).toHaveCount(SCALE_REVIEW);
  const back = app.getByTestId("needs-you-back");
  await expect(back).toContainText("All projects");
  await shot(page, "t003-fake-all-240");

  const top = (await boxOf(back)).y;
  await rows(app).last().scrollIntoViewIfNeeded();
  await expect(rows(app).last()).toBeInViewport();
  await expect(back).toBeInViewport({ ratio: 1 });
  expect((await boxOf(back)).y).toBe(top);
  await shot(page, "t003-fake-all-scrolled-240");
  await back.click();
  await expect(app.getByTestId("needs-you-all")).toBeFocused();

  await app.getByTestId("needs-you-all").click();
  await section(app, "alpha").locator('[data-id="P-005"]').click();
  await expect.poll(() => lastTab(page)).toEqual({ kind: "file", projectId: "alpha", path: pathOf(ALPHA, "P-005") });
});

test("the list is live: counts follow the files, a project with something new joins, an emptied one leaves", async ({ page }) => {
  const app = await openPanel(page);
  await writeFile(page, `${ALPHA}/S-009-one-more.md`, ticketFile({ id: "S-009", kind: "signal", title: "One more", status: "new" }));
  await expect(counts(listRow(app, "alpha"))).toHaveText(["2 in review", "2 new signals"], { timeout: 1_000 });
  await expect(counts(app.getByTestId("needs-you-all"))).toHaveText([`${5 + SCALE_REVIEW} in review`, "2 new signals"], { timeout: 1_000 });

  await setStatus(page, `${GAMMA}/P-001-gamma.md`, "review", "done");
  await expect(listRow(app, "gamma")).toHaveCount(0, { timeout: 1_000 });
  await expect(counts(app.getByTestId("needs-you-all"))).toHaveText([`${4 + SCALE_REVIEW} in review`, "2 new signals"]);

  // Beta gets a backlog with a ticket in review: it joins between Alpha and Delta's group, in sidebar order.
  await writeFile(page, "Projects/beta/docs/roadmap/E-001-beta.md", ticketFile({ id: "E-001", kind: "epic", title: "Beta epic", status: "review" }));
  await expect(counts(listRow(app, "beta"))).toHaveText(["1 in review"], { timeout: 1_000 });
  expect(await listed(app)).toEqual(["alpha", "delta", "beta", "scale"]);
  await expect(rows(app)).toHaveCount(0);
});

test("an opened project is live; emptied while open it says “Nothing needs you” and keeps the back row", async ({ page }) => {
  const app = await openPanel(page);
  await listRow(app, "delta").click();
  expect(await rowIds(app)).toEqual(["E-018", "P-013"]);
  await writeFile(page, `${DELTA}/S-001-fresh.md`, ticketFile({ id: "S-001", kind: "signal", title: "Fresh", status: "new", priority: "P0" }));
  await expect.poll(() => rowIds(app), { timeout: 1_000 }).toEqual(["E-018", "P-013", "S-001"]);
  // Another project's change does not show here.
  await writeFile(page, `${ALPHA}/S-009-one-more.md`, ticketFile({ id: "S-009", kind: "signal", title: "One more", status: "new" }));

  await setStatus(page, pathOf(DELTA, "E-018"), "review", "done");
  await setStatus(page, pathOf(DELTA, "P-013"), "review", "done");
  await setStatus(page, `${DELTA}/S-001-fresh.md`, "new", "dismissed");
  await expect(app.getByTestId("needs-you-empty")).toContainText("No tickets in review and no new signals in Delta.", { timeout: 1_000 });
  await expect(rows(app)).toHaveCount(0);
  await expect(view(app)).toHaveAttribute("data-level", "project");
  await expect(app.getByTestId("needs-you-back")).toContainText("Delta");
  await shot(page, "t003-fake-project-empty-240");

  await app.getByTestId("needs-you-back").click();
  expect(await listed(app)).toEqual(["alpha", "gamma", "scale"]);
  await expect(counts(listRow(app, "alpha"))).toHaveText(["2 in review", "2 new signals"]);
});

test("“All projects” is live: a ticket leaving review goes, a project that empties loses its section", async ({ page }) => {
  const app = await openPanel(page);
  await app.getByTestId("needs-you-all").click();
  await setStatus(page, pathOf(ALPHA, "E-017"), "review", "done");
  await expect.poll(() => rowIds(section(app, "alpha")), { timeout: 1_000 }).toEqual(["P-005", "S-001"]);
  await setStatus(page, `${GAMMA}/P-001-gamma.md`, "review", "done");
  await expect(section(app, "gamma")).toHaveCount(0, { timeout: 1_000 });
  await expect(app.getByTestId("needs-you-back")).toBeVisible();
});

test("with nothing waiting anywhere the panel says “Nothing needs you”, on the list and in “All projects”", async ({ page }) => {
  const app = await openPanel(page);
  await app.getByTestId("needs-you-all").click();
  await expect(app.getByTestId("needs-you-project")).toHaveCount(4);
  // Every backlog moves away: nothing is left to wait on.
  await page.evaluate(() => {
    for (const folder of ["Projects/alpha/docs/roadmap", "Projects/delta/docs/roadmap", "Projects/scale/docs/roadmap", "Projects/gamma/plans"]) window.fakeHost.rename(folder, `${folder}-old`);
  });
  await expect(app.getByTestId("needs-you-empty")).toContainText("No tickets in review and no new signals in any project.");
  await expect(app.getByTestId("needs-you-project")).toHaveCount(0);
  await expect(app.getByTestId("needs-you-back")).toContainText("All projects");

  await app.getByTestId("needs-you-back").click();
  await expect(view(app)).toHaveAttribute("data-level", "list");
  await expect(app.getByTestId("needs-you-empty")).toContainText("No tickets in review and no new signals in any project.");
  await expect(app.getByTestId("needs-you-list")).toHaveCount(0);
  await expect(app.getByTestId("needs-you-back")).toHaveCount(0);
  await shot(page, "t003-fake-list-empty-240");
});

test("coming back to Workspace from a project starts on the list; inside a project there is no list and no back row", async ({ page }) => {
  const app = await openPanel(page);
  await listRow(app, "delta").click();
  await expect(app.getByTestId("needs-you-back")).toBeVisible();

  await page.evaluate(() => window.fakeHost.setActiveProject("alpha"));
  await expect(view(app)).toHaveAttribute("data-project", "alpha");
  expect(await rowIds(app)).toEqual(["E-017", "P-005", "S-001"]);
  await expect(app.getByTestId("needs-you-back")).toHaveCount(0);
  await expect(app.getByTestId("needs-you-list")).toHaveCount(0);

  await page.evaluate(() => window.fakeHost.setActiveProject(null));
  await expect(view(app)).toHaveAttribute("data-level", "list");
  expect(await listed(app)).toEqual(["alpha", "gamma", "delta", "scale"]);
  await expect(rows(app)).toHaveCount(0);
});

test("the keyboard walks it: Enter opens a row, Enter on the back row returns", async ({ page }) => {
  const app = await openPanel(page);
  await app.getByTestId("needs-you-all").focus();
  await page.keyboard.press("Tab");
  await expect(listRow(app, "alpha")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(app.getByTestId("needs-you-back")).toBeFocused();
  expect(await rowIds(app)).toEqual(["E-017", "P-005", "S-001"]);
  await page.keyboard.press("Enter");
  await expect(listRow(app, "alpha")).toBeFocused();
  await shot(page, "t003-fake-list-focus-240");
});

test("at the panel's minimum width nothing is clipped: names shorten, the counts wrap part by part", async ({ page }) => {
  const app = await openPanel(page, "workspace", 160);
  const fits = () => app.locator(":root").evaluate((root) => root.scrollWidth <= root.clientWidth);
  expect(await fits()).toBe(true);
  const parts = counts(listRow(app, "alpha"));
  const [review, signal] = [await boxOf(parts.nth(0)), await boxOf(parts.nth(1))];
  // The second part sits whole on its own line, starting where the first does.
  expect(signal.y).toBeGreaterThan(review.y);
  const row = await boxOf(listRow(app, "alpha"));
  expect(signal.x + signal.width).toBeLessThanOrEqual(row.x + row.width);
  await shot(page, "t003-fake-list-160");
  await listRow(app, "alpha").click();
  expect(await fits()).toBe(true);
  await shot(page, "t003-fake-project-160");
  await app.getByTestId("needs-you-back").click();
  await app.getByTestId("needs-you-all").click();
  expect(await fits()).toBe(true);
  await shot(page, "t003-fake-all-160");
});
