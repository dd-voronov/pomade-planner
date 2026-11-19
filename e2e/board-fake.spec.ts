// The Board tab on pomade-kit's fake host (fake-host/, fixture test/fixtures/workspace.ts): what it
// reads and shows, live updates, the Workspace chooser, choosing a backlog folder, and drag —
// field-only writes, refused drops, done/ moves, write failures. Screenshots of every state.

import { expect, test, type FrameLocator, type Page } from "@playwright/test";

import { BOARD_URL, HARNESS_PORT } from "../playwright.config";
import { BROKEN_TICKET, SAMPLE_TICKETS, ticketFile, ticketPath } from "../test/fixtures/backlog";
import { card, cardsIn, column, drag, idsIn, withStatus } from "./fixtures/board";
import { shot } from "./fixtures/screens";

const APP = BOARD_URL;
const ALPHA = "Projects/alpha/docs/roadmap";

function harness(project?: string): string {
  const params = new URLSearchParams({ app: APP, surface: "tab", icon: "board" });
  if (project !== undefined) params.set("project", project);
  return `http://localhost:${HARNESS_PORT}/index.html?${params.toString()}`;
}

const frame = (page: Page): FrameLocator => page.frameLocator("#stage iframe >> nth=0");

function spec(id: string) {
  const s = SAMPLE_TICKETS.find((t) => t.id === id);
  if (!s) throw new Error(id);
  return s;
}
const alphaPath = (id: string, inDone = spec(id).inDone ?? false): string => `${ALPHA}/${ticketPath({ ...spec(id), inDone })}`;

// Wide enough for every Problems column, so a drag never has to scroll the board.
test.use({ viewport: { width: 1680, height: 900 } });

let pageErrors: Error[] = [];

test.beforeEach(({ page }) => {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e));
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

async function openBoard(page: Page, project?: string): Promise<FrameLocator> {
  await page.goto(harness(project));
  const app = frame(page);
  await expect(app.getByTestId("board").or(app.getByTestId("choose-backlog-state")).or(app.getByTestId("project-chooser"))).toBeVisible();
  return app;
}

const readFile = (page: Page, path: string) => page.evaluate((p) => window.fakeHost.readFile(p), path);
const exists = (page: Page, path: string) =>
  page.evaluate((p) => {
    try {
      window.fakeHost.readFile(p);
      return true;
    } catch {
      return false;
    }
  }, path);
const writeFile = (page: Page, path: string, content: string) => page.evaluate(([p, c]) => window.fakeHost.writeFile(p, c), [path, content] as const);
const reloadFrame = (page: Page) =>
  page.evaluate(() => {
    const f = window.mounted?.iframe;
    if (f) f.src = f.src;
  });

test.describe("reading and showing", () => {
  test("Problems: every problem in its status column; done collapsed with its count; dropped and parked narrow on the right", async ({ page }) => {
    const app = await openBoard(page);
    await expect(app.getByTestId("area-problems")).toHaveAttribute("aria-selected", "true");
    await expect(app.getByTestId("column")).toHaveCount(8);
    const statuses = await app.getByTestId("column").evaluateAll((els) => els.map((e) => [e.getAttribute("data-status"), e.getAttribute("data-collapsed")]));
    expect(statuses).toEqual([
      ["backlog", "false"],
      ["grooming", "false"],
      ["planned", "false"],
      ["delivering", "false"],
      ["review", "false"],
      ["done", "true"],
      ["dropped", "true"],
      ["parked", "true"],
    ]);
    expect(await idsIn(app, "backlog")).toEqual(["P-003"]);
    expect(await idsIn(app, "grooming")).toEqual(["P-002"]);
    expect(await idsIn(app, "planned")).toEqual(["P-001"]);
    expect(await idsIn(app, "delivering")).toEqual(["P-004"]);
    expect(await idsIn(app, "review")).toEqual(["P-005"]);
    await expect(column(app, "done").getByTestId("column-count")).toHaveText("1");
    await expect(column(app, "dropped").getByTestId("column-count")).toHaveText("1");
    await expect(column(app, "parked").getByTestId("column-count")).toHaveText("1");

    // Narrow, after the main columns; every collapsed column the same 8px from the next.
    const parked = await column(app, "parked").boundingBox();
    const dropped = await column(app, "dropped").boundingBox();
    const done = await column(app, "done").boundingBox();
    const review = await column(app, "review").boundingBox();
    expect([parked?.width, dropped?.width, done?.width, review?.width]).toEqual([40, 40, 40, 264]);
    expect((review?.x ?? 0) + 264 + 8).toBe(done?.x);
    expect((done?.x ?? 0) + 40 + 8).toBe(dropped?.x);
    expect((dropped?.x ?? 0) + 40 + 8).toBe(parked?.x);

    // A card: ID, title, kind badge, priority.
    const p2 = card(app, "P-002");
    await expect(p2.getByTestId("card-id")).toHaveText("P-002");
    await expect(p2.getByTestId("card-title")).toHaveText("Flaky sync");
    await expect(p2.getByTestId("card-kind")).toHaveText("P");
    await expect(p2.getByTestId("card-priority")).toHaveText("P0");
    await shot(page, "board-fake-problems");
  });

  test("Solutions: epics and tasks from the folder and done/; wide tinted epics, tasks with their parent epic; ordered by priority then ID", async ({ page }) => {
    const app = await openBoard(page);
    await app.getByTestId("area-solutions").click();
    await expect(app.getByTestId("column")).toHaveCount(7);
    expect(await idsIn(app, "backlog")).toEqual(["T-003"]);
    expect(await idsIn(app, "planned")).toEqual(["E-002", "T-004", "T-002"]);
    expect(await idsIn(app, "in-progress")).toEqual(["E-001", "T-001"]);
    expect(await idsIn(app, "review")).toEqual(["E-017"]);
    await expect(column(app, "done").getByTestId("column-count")).toHaveText("2");

    const epic = await card(app, "E-002").boundingBox();
    const task = await card(app, "T-004").boundingBox();
    expect((epic?.width ?? 0) - (task?.width ?? 0)).toBe(12);
    await expect(card(app, "E-002")).toHaveClass(/card--epic/);
    await expect(card(app, "T-004").getByTestId("card-parent")).toHaveText("E-002");
    await expect(card(app, "T-003").getByTestId("card-parent")).toHaveCount(0);
    await expect(card(app, "E-002").getByTestId("card-kind")).toHaveText("E");
    await expect(card(app, "T-004").getByTestId("card-kind")).toHaveText("T");

    // done/ expands on click and shows the tickets read from done/.
    await column(app, "done").getByTestId("column-expand").click();
    await expect(column(app, "done")).toHaveAttribute("data-collapsed", "false");
    expect(await idsIn(app, "done")).toEqual(["E-000", "T-000"]);
    await shot(page, "board-fake-solutions-done-expanded");
    await column(app, "done").getByTestId("column-collapse").click();
    await expect(column(app, "done")).toHaveAttribute("data-collapsed", "true");
  });

  test("BACKLOG.md, other non-ticket files and signals don't appear; the area counts say so", async ({ page }) => {
    const app = await openBoard(page);
    await expect(app.getByTestId("area-problems")).toContainText("8");
    await expect(app.getByTestId("area-solutions")).toContainText("12");
    await expect(app.locator('[data-testid="card"][data-id="S-001"]')).toHaveCount(0);
    await app.getByTestId("area-solutions").click();
    await expect(app.locator('[data-testid="card"][data-id="S-001"]')).toHaveCount(0);
    const shown = async () => [
      ...(await app.getByTestId("card").evaluateAll((els) => els.map((e) => e.getAttribute("data-path") ?? ""))),
      ...(await app.getByTestId("unreadable-card").evaluateAll((els) => els.map((e) => e.getAttribute("data-path") ?? ""))),
    ];
    for (const area of ["problems", "solutions"]) {
      await app.getByTestId(`area-${area}`).click();
      const paths = await shown();
      expect(paths.length).toBeGreaterThan(0);
      expect(paths.filter((p) => /BACKLOG\.md|PLAN\.md|S-001/.test(p))).toEqual([]);
    }
  });

  test("an unreadable ticket and one with an unknown status are greyed cards in the Unreadable strip that open the file", async ({ page }) => {
    const app = await openBoard(page);
    const strip = app.getByTestId("unreadable-strip");
    await expect(strip.getByTestId("unreadable-card")).toHaveCount(1);
    await expect(strip.getByTestId("unreadable-card").first()).toContainText("T-999");
    await expect(strip.getByTestId("unreadable-card").first()).toContainText("can't read — open to fix");
    await shot(page, "board-fake-unreadable-strip");

    await app.getByTestId("area-solutions").click();
    await expect(strip.getByTestId("unreadable-card")).toHaveCount(2);
    await expect(strip.getByTestId("unreadable-card").nth(1)).toContainText("status “wip” has no column — open to fix");

    await strip.getByTestId("unreadable-card").first().click();
    await expect.poll(() => page.evaluate(() => window.fakeHost.openedTabs.at(-1))).toEqual({ kind: "file", projectId: "alpha", path: `${ALPHA}/${BROKEN_TICKET.path}` });
  });

  test("a card click opens its file in an editor tab; Enter does too", async ({ page }) => {
    const app = await openBoard(page);
    await card(app, "P-004").click();
    await expect.poll(() => page.evaluate(() => window.fakeHost.openedTabs.at(-1))).toEqual({ kind: "file", projectId: "alpha", path: alphaPath("P-004") });
    await card(app, "P-001").focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => window.fakeHost.openedTabs.at(-1))).toEqual({ kind: "file", projectId: "alpha", path: alphaPath("P-001") });
  });

  test("the last area is remembered per project", async ({ page }) => {
    const app = await openBoard(page);
    await app.getByTestId("area-solutions").click();
    await expect.poll(() => page.evaluate(() => window.fakeHost.state["board.view.alpha"])).toEqual({ area: "solutions", toggled: {} });
    await reloadFrame(page);
    await expect(app.getByTestId("board")).toHaveAttribute("data-area", "solutions");
    // Another project keeps its own.
    await page.goto(harness("gamma"));
    await expect(frame(page).getByTestId("board")).toHaveAttribute("data-area", "problems");
  });

  test("a narrow tab scrolls the columns sideways without clipping the header", async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 720 });
    const app = await openBoard(page);
    const header = await app.locator(".board__header").boundingBox();
    expect(header?.width).toBe(640);
    const scroll = await app.getByTestId("board-columns").evaluate((el) => [el.scrollWidth > el.clientWidth, el.scrollHeight <= el.clientHeight]);
    expect(scroll).toEqual([true, true]);
    await shot(page, "board-fake-narrow");
    await page.setViewportSize({ width: 1920, height: 1000 });
    await app.getByTestId("area-solutions").click();
    await shot(page, "board-fake-wide");
  });
});

test.describe("live from disk", () => {
  test("a status edit moves the card, a new file adds one, a delete removes it — keeping the area and the scroll", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    const app = await openBoard(page, "scale");
    await app.getByTestId("area-solutions").click();
    const cards = column(app, "planned").getByTestId("column-cards");
    await cards.evaluate((el) => (el.scrollTop = 400));
    const top = await cards.evaluate((el) => el.scrollTop);
    expect(top).toBe(400);

    // An editor saves a new status into a ticket of another column.
    const moving = cardsIn(app, "in-progress").first();
    const id = (await moving.getAttribute("data-id")) ?? "";
    const path = (await moving.getAttribute("data-path")) ?? "";
    const before = await readFile(page, path);
    await writeFile(page, path, before.replace("status: in-progress", "status: review"));
    await expect(column(app, "review").locator(`[data-id="${id}"]`)).toBeVisible();
    await expect(column(app, "in-progress").locator(`[data-id="${id}"]`)).toHaveCount(0);

    await writeFile(page, "Projects/scale/docs/roadmap/T-900-new.md", ticketFile({ id: "T-900", kind: "task", title: "New from Finder", status: "in-progress", priority: "P0" }));
    await expect(column(app, "in-progress").locator('[data-id="T-900"]')).toBeVisible();
    await page.evaluate(() => window.fakeHost.deleteFile("Projects/scale/docs/roadmap/T-900-new.md"));
    await expect(card(app, "T-900")).toHaveCount(0);

    await expect(app.getByTestId("board")).toHaveAttribute("data-area", "solutions");
    expect(await cards.evaluate((el) => el.scrollTop)).toBe(top);
  });

  test("a file renamed into done/ stays on the board; a broken edit turns it unreadable and back", async ({ page }) => {
    const app = await openBoard(page);
    await page.evaluate(([from, to]) => window.fakeHost.rename(from, to), [alphaPath("P-005"), `${ALPHA}/done/x.md`] as const);
    await expect(column(app, "review").getByTestId("column-count")).toHaveText("1");
    const p1 = alphaPath("P-001");
    const good = await readFile(page, p1);
    await writeFile(page, p1, good.replace('title: "Slow start"', "title: [oops"));
    await expect(card(app, "P-001")).toHaveCount(0);
    await expect(app.getByTestId("unreadable-strip")).toContainText("P-001");
    await writeFile(page, p1, good);
    await expect(card(app, "P-001")).toBeVisible();
  });

  test("switching projects in Pomade switches the tab's project; Workspace shows the chooser", async ({ page }) => {
    const app = await openBoard(page);
    await expect(app.getByTestId("board")).toHaveAttribute("data-project", "alpha");
    await page.evaluate(() => window.fakeHost.setActiveProject("gamma"));
    await expect(app.getByTestId("board")).toHaveAttribute("data-project", "gamma");
    await expect(card(app, "P-001")).toHaveAttribute("data-path", "Projects/gamma/plans/P-001-gamma.md");
    await page.evaluate(() => window.fakeHost.setActiveProject(null));
    await expect(app.getByTestId("project-chooser")).toBeVisible();
    await page.evaluate(() => window.fakeHost.setActiveProject("beta"));
    await expect(app.getByTestId("choose-backlog-state")).toBeVisible();
  });

  test("the project's folder moving keeps the board on the project", async ({ page }) => {
    const app = await openBoard(page, "gamma");
    await expect(card(app, "P-001")).toBeVisible();
    await page.evaluate(() => {
      window.fakeHost.rename("Projects/gamma", "Projects/gamma-2");
      window.fakeHost.updateProject("gamma", { root: "Projects/gamma-2" });
    });
    await expect(card(app, "P-001")).toHaveAttribute("data-path", "Projects/gamma-2/plans/P-001-gamma.md");
  });
});

test.describe("backlog location", () => {
  test("a project without docs/roadmap/ asks for its backlog folder; the choice is stored and loads the board", async ({ page }) => {
    const app = await openBoard(page, "beta");
    await expect(app.getByTestId("choose-backlog-state")).toContainText("Beta has no docs/roadmap/ folder.");
    await shot(page, "board-fake-choose-backlog");

    // Cancelling changes nothing; a folder outside the project is refused by the picker.
    await page.evaluate(() => window.fakeHost.answerPick("Projects/alpha/docs"));
    await app.getByTestId("choose-backlog").click();
    await expect.poll(() => page.evaluate(() => window.fakeHost.pickRequests.at(-1))).toEqual({ kind: "folder", root: "Projects/beta", initial: "Projects/beta" });
    await expect(app.getByTestId("choose-backlog-state")).toBeVisible();

    await page.evaluate(() => window.fakeHost.answerPick("Projects/beta/tickets"));
    await app.getByTestId("choose-backlog").click();
    await app.getByTestId("area-solutions").click();
    await expect(card(app, "E-010")).toBeVisible();
    await expect(app.getByTestId("backlog-location")).toHaveText("tickets");

    await reloadFrame(page);
    await expect(frame(page).locator('[data-testid="card"][data-id="E-010"]')).toBeVisible();
  });

  test("a backlog folder made after “No backlog found” loads the board by itself; removed again, the board asks again", async ({ page }) => {
    const app = await openBoard(page, "beta");
    await expect(app.getByTestId("choose-backlog-state")).toBeVisible();
    await writeFile(page, "Projects/beta/docs/notes.md", "# Not the backlog\n");
    await expect(app.getByTestId("choose-backlog-state")).toBeVisible();
    await writeFile(page, "Projects/beta/docs/roadmap/E-020-late.md", ticketFile({ id: "E-020", kind: "epic", title: "Late", status: "planned" }));
    await app.getByTestId("area-solutions").click();
    await expect(card(app, "E-020")).toBeVisible();
    // The folder is watched now: a second ticket shows up too.
    await writeFile(page, "Projects/beta/docs/roadmap/E-021-later.md", ticketFile({ id: "E-021", kind: "epic", title: "Later", status: "planned" }));
    await expect(card(app, "E-021")).toBeVisible();
    await page.evaluate(() => window.fakeHost.rename("Projects/beta/docs/roadmap", "Projects/beta/docs/old-roadmap"));
    await expect(app.getByTestId("choose-backlog-state")).toBeVisible();
    await page.evaluate(() => window.fakeHost.rename("Projects/beta/docs/old-roadmap", "Projects/beta/docs/roadmap"));
    await expect(card(app, "E-021")).toBeVisible();
  });

  test("the synced settings' backlogPathPattern picks the folder in every project; a broken file falls back and says so", async ({ page }) => {
    const app = await openBoard(page, "beta");
    await writeFile(page, "Apps/pomade-board/settings.json", '{ "backlogPathPattern": "tickets/" }\n');
    await reloadFrame(page);
    await app.getByTestId("area-solutions").click();
    await expect(card(app, "E-010")).toBeVisible();

    await writeFile(page, "Apps/pomade-board/settings.json", "{ not json");
    await reloadFrame(page);
    await expect(app.getByTestId("choose-backlog-state")).toBeVisible();
    await expect(app.getByTestId("empty-state-error")).toContainText("Apps/pomade-board/settings.json is not valid JSON");
    await shot(page, "board-fake-settings-problem");
  });

  test("Change backlog folder… in the settings menu re-points the board", async ({ page }) => {
    const app = await openBoard(page);
    await app.getByTestId("board-menu-button").click();
    await shot(page, "board-fake-settings-menu");
    await page.evaluate(() => window.fakeHost.answerPick("Projects/alpha"));
    await app.getByTestId("menu-change-folder").click();
    await expect(app.getByTestId("backlog-location")).toHaveText("Alpha");
    await expect(app.getByTestId("card")).toHaveCount(0);
  });
});

test.describe("Workspace", () => {
  test("lists the projects whose backlog resolves, with open counts; a click opens that project's board", async ({ page }) => {
    const app = await openBoard(page, "workspace");
    const rows = app.getByTestId("chooser-project");
    await expect(rows).toHaveCount(4);
    expect(await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-project")))).toEqual(["alpha", "gamma", "delta", "scale"]);
    await expect(rows.nth(0)).toContainText("Alpha");
    await expect(rows.nth(0)).toContainText("Building tools");
    // Open = shown tickets not done, dropped, parked, triaged or dismissed: 5 problems + 9 epics and tasks + 1 new signal of the sample.
    await expect(rows.nth(0).getByTestId("chooser-count")).toHaveText("14 open");
    await expect(rows.nth(1).getByTestId("chooser-count")).toHaveText("1 open");

    await writeFile(page, `${ALPHA}/E-050-live.md`, ticketFile({ id: "E-050", kind: "epic", title: "Live", status: "planned" }));
    await expect(rows.nth(0).getByTestId("chooser-count")).toHaveText("15 open");

    await rows.nth(1).click();
    await expect.poll(() => page.evaluate(() => window.fakeHost.openedTabs.at(-1))).toEqual({ kind: "app", projectId: "gamma", route: "board" });
  });
});

test.describe("drag", () => {
  test("E-017 review → done writes only status and updated, and moves the file into done/", async ({ page }) => {
    const app = await openBoard(page);
    await app.getByTestId("area-solutions").click();
    const from = alphaPath("E-017");
    const before = await readFile(page, from);
    await drag(page, card(app, "E-017"), column(app, "done"), async () => {
      await expect(column(app, "done")).toHaveAttribute("data-over", "true");
      await shot(page, "board-fake-dragging");
    });
    await expect(column(app, "done").getByTestId("column-count")).toHaveText("3");
    const to = alphaPath("E-017", true);
    await expect.poll(() => exists(page, from)).toBe(false);
    await expect.poll(() => readFile(page, to)).toBe(withStatus(before, "done"));
    await expect(app.getByTestId("card-error")).toHaveCount(0);
  });

  test("a drag between open columns writes status and updated in place", async ({ page }) => {
    const app = await openBoard(page);
    const path = alphaPath("P-003");
    const before = await readFile(page, path);
    await drag(page, card(app, "P-003"), column(app, "grooming"));
    await expect(column(app, "grooming").locator('[data-id="P-003"]')).toBeVisible();
    await expect.poll(() => readFile(page, path)).toBe(withStatus(before, "grooming"));
  });

  test("out of done moves the file back to the backlog folder; problems never move", async ({ page }) => {
    const app = await openBoard(page);
    await app.getByTestId("area-solutions").click();
    await column(app, "done").getByTestId("column-expand").click();
    await drag(page, card(app, "E-000"), column(app, "review"));
    await expect(column(app, "review").locator('[data-id="E-000"]')).toBeVisible();
    await expect.poll(() => exists(page, alphaPath("E-000", false))).toBe(true);
    expect(await exists(page, alphaPath("E-000", true))).toBe(false);

    await app.getByTestId("area-problems").click();
    await drag(page, card(app, "P-005"), column(app, "done"));
    await expect(column(app, "done").getByTestId("column-count")).toHaveText("2");
    await expect.poll(() => readFile(page, alphaPath("P-005"))).toContain("status: done");
  });

  test("with “Move done epics and tasks to done/” off, files stay where they are", async ({ page }) => {
    const app = await openBoard(page);
    await app.getByTestId("area-solutions").click();
    await app.getByTestId("board-menu-button").click();
    await expect(app.getByTestId("menu-move-done")).toHaveAttribute("aria-checked", "true");
    await app.getByTestId("menu-move-done").click();
    await app.getByTestId("board-menu-button").click();
    await expect(app.getByTestId("menu-move-done")).toHaveAttribute("aria-checked", "false");
    await page.keyboard.press("Escape");
    await expect(app.getByTestId("board-menu")).toHaveCount(0);

    await drag(page, card(app, "E-017"), column(app, "done"));
    await expect(column(app, "done").getByTestId("column-count")).toHaveText("3");
    await expect.poll(() => readFile(page, alphaPath("E-017"))).toContain("status: done");
    expect(await exists(page, alphaPath("E-017", true))).toBe(false);
  });

  test("a drop on a column the kind can't take is refused: the column is dimmed during the drag and nothing is written", async ({ page }) => {
    const app = await openBoard(page);
    await app.getByTestId("area-solutions").click();
    const path = alphaPath("T-001");
    const before = await readFile(page, path);
    await drag(page, card(app, "T-001"), column(app, "review"), async () => {
      await expect(column(app, "review")).toHaveAttribute("data-refused", "true");
      await expect(column(app, "backlog")).toHaveAttribute("data-refused", "false");
      await expect(column(app, "parked")).toHaveAttribute("data-refused", "true");
      await expect(app.getByTestId("drop-refusal")).toHaveText("Tasks can't be in Review");
      await expect(column(app, "review")).toHaveCSS("opacity", "0.4");
      await shot(page, "board-fake-refused-drop");
    });
    await expect(column(app, "in-progress").locator('[data-id="T-001"]')).toBeVisible();
    await expect(column(app, "review")).toHaveAttribute("data-refused", "false");
    expect(await readFile(page, path)).toBe(before);
  });

  test("a file changed during the drag is not written: the card shows an inline error and the file as it is now", async ({ page }) => {
    const app = await openBoard(page);
    const path = alphaPath("P-001");
    const changed = (await readFile(page, path)).replace('title: "Slow start"', 'title: "Slow start, edited elsewhere"');
    await drag(page, card(app, "P-001"), column(app, "review"), async () => {
      await writeFile(page, path, changed);
      await expect(card(app, "P-001").getByTestId("card-title")).toHaveText("Slow start, edited elsewhere");
    });
    await expect(card(app, "P-001").getByTestId("card-error")).toContainText("Changed on disk since the board read it");
    await expect(column(app, "planned").locator('[data-id="P-001"]')).toBeVisible();
    expect(await readFile(page, path)).toBe(changed);
    await shot(page, "board-fake-write-error");

    // Dismissed, then the next drag works.
    await card(app, "P-001").getByTestId("card-error-dismiss").click();
    await expect(app.getByTestId("card-error")).toHaveCount(0);
    await drag(page, card(app, "P-001"), column(app, "review"));
    await expect(column(app, "review").locator('[data-id="P-001"]')).toBeVisible();
    await expect.poll(() => readFile(page, path)).toBe(withStatus(changed, "review"));
  });

  test("a move that fails keeps the written status, shows the error in the opened done column, and never retries", async ({ page }) => {
    const app = await openBoard(page);
    await app.getByTestId("area-solutions").click();
    const taken = alphaPath("E-017", true);
    await writeFile(page, taken, "---\nid: E-017\nkind: epic\ntitle: Old copy\nstatus: done\n---\n");
    await expect(column(app, "done").getByTestId("column-count")).toHaveText("3");
    await drag(page, card(app, "E-017"), column(app, "done"));
    await expect(column(app, "done")).toHaveAttribute("data-collapsed", "false");
    const errored = column(app, "done").locator(`[data-path="${alphaPath("E-017")}"]`);
    await expect(errored.getByTestId("card-error")).toContainText(`Status saved, but not moved: done/${ticketPath(spec("E-017"))} already exists.`);
    await expect.poll(() => readFile(page, alphaPath("E-017"))).toContain("status: done");
    expect(await readFile(page, taken)).toContain("Old copy");
    await shot(page, "board-fake-move-error");
  });

  test("keyboard: Space picks a card up, → moves it a column, Space drops it", async ({ page }) => {
    const app = await openBoard(page);
    await card(app, "P-003").focus();
    await page.keyboard.press("Space");
    await expect(app.getByTestId("card-overlay")).toBeVisible();
    // dnd-kit measures the lifted card on the next frames; a key pressed before that has nothing to move.
    await app.locator("html").evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    await page.keyboard.press("ArrowRight");
    await expect(column(app, "grooming")).toHaveAttribute("data-over", "true");
    await page.keyboard.press("Space");
    await expect(column(app, "grooming").locator('[data-id="P-003"]')).toBeVisible();
    await expect.poll(() => readFile(page, alphaPath("P-003"))).toContain("status: grooming");
  });
});

test.describe("300 tickets", () => {
  test("the board renders every ticket and a drop lands at once", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    const start = Date.now();
    const app = await openBoard(page, "scale");
    await expect(app.getByTestId("area-problems")).toContainText("75");
    await expect(app.getByTestId("area-solutions")).toContainText("225");
    const loaded = Date.now() - start;
    expect(loaded).toBeLessThan(5_000);
    await app.getByTestId("area-solutions").click();
    await shot(page, "board-fake-300");

    const moving = cardsIn(app, "planned").first();
    const id = (await moving.getAttribute("data-id")) ?? "";
    const t0 = Date.now();
    await drag(page, moving, column(app, "in-progress"));
    await expect(column(app, "in-progress").locator(`[data-id="${id}"]`)).toBeVisible();
    expect(Date.now() - t0).toBeLessThan(2_000);
  });
});
