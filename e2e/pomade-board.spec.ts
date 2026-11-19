// E-001's acceptance in a real Pomade ($POMADE_DIR, e2e/fixtures/pomade.ts) with the app
// dev-linked: a synthetic workspace with Alpha (the sample backlog, a git repo), Beta (no
// docs/roadmap/, its tickets in tickets/) and Scale (300 tickets). Real files, real watcher, real
// editor, real restarts.

import { execFileSync } from "node:child_process";
import { chmod, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { expect, test, type ElectronApplication, type FrameLocator, type Page } from "@playwright/test";

import { BROKEN_TICKET, SAMPLE_TICKETS, sampleBacklog, scaleBacklog, ticketFile, ticketPath, under } from "../test/fixtures/backlog";
import { card, column, drag, idsIn, today, withStatus } from "./fixtures/board";
import { createPomadeFixture, launchPomade, queuePickerAnswers, type PomadeFixture } from "./fixtures/pomade";
import { shot } from "./fixtures/screens";

const DIST = resolve(import.meta.dirname, "../dist/board");
const ICON = "strip-app-pomade-board-board";
const WORKSPACE = "project-__workspace__";

function spec(id: string) {
  const s = SAMPLE_TICKETS.find((t) => t.id === id);
  if (!s) throw new Error(id);
  return s;
}

/** The visible Board tab's frame (hidden Board tabs of other projects stay loaded). */
const board = (page: Page): FrameLocator => page.frameLocator('[data-testid="app-frame-pomade-board"]:visible');
const vis = (page: Page, selector: string) => page.locator(`${selector}:visible`);

/** The visible editor in raw mode (the toggle flips raw ↔ live). */
async function rawEditor(page: Page) {
  const toggle = vis(page, '[data-testid="mode-toggle"]');
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("data-mode")) !== "raw") await toggle.click();
  await expect(toggle).toHaveAttribute("data-mode", "raw");
  return vis(page, '[data-testid="raw-editor"] .cm-content');
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=e2e", "-c", "user.email=e2e@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });
}

test.describe("the Board in a real Pomade", () => {
  test.describe.configure({ mode: "serial" });
  let fixture: PomadeFixture;
  let app: ElectronApplication | undefined;
  let page: Page;
  const abs = (rel: string) => join(fixture.workspaceRoot, rel);
  const ALPHA = "Projects/alpha";
  const roadmap = (rel: string) => abs(`${ALPHA}/docs/roadmap/${rel}`);

  async function launch(): Promise<void> {
    ({ app, page } = await launchPomade(fixture, { POMADE_DEV_APPS: DIST }));
    // Room for every column next to the sidebar and the Needs-you panel.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1800, 1000));
  }

  async function openBoard(projectKey: string): Promise<FrameLocator> {
    await page.getByTestId(`project-${fixture.projects[projectKey]}`).click();
    await page.getByTestId(ICON).click();
    await expect(page.getByTestId("tabstrip").getByRole("tab", { name: "Board", selected: true })).toBeVisible();
    const app = board(page);
    await expect(app.getByTestId("board").or(app.getByTestId("choose-backlog-state")).or(app.getByTestId("project-chooser"))).toBeVisible();
    return app;
  }

  /** Scroll the board's columns to the right end, so done / dropped / parked are on screen. */
  const revealRight = (app: FrameLocator) => app.getByTestId("board-columns").evaluate((el) => el.scrollTo({ left: el.scrollWidth }));

  test.beforeAll(async () => {
    fixture = await createPomadeFixture([
      { key: "alpha", name: "Alpha", root: "Projects/alpha", files: { "README.md": "# Alpha\n", ...under("docs/roadmap", sampleBacklog()) } },
      {
        key: "beta",
        name: "Beta",
        root: "Projects/beta",
        files: { "README.md": "# Beta\n", "tickets/E-010-beta-epic.md": ticketFile({ id: "E-010", kind: "epic", title: "Beta epic", status: "planned", priority: "P1" }) },
      },
      { key: "scale", name: "Scale", root: "Projects/scale", files: under("docs/roadmap", scaleBacklog(300)) },
    ]);
    git(abs(ALPHA), "init", "-q");
    git(abs(ALPHA), "add", "-A");
    git(abs(ALPHA), "commit", "-qm", "backlog");
    await launch();
  });

  test.afterAll(async () => {
    await app?.close();
    // A failed permission test must not leave a folder the cleanup can't remove.
    await chmod(roadmap(""), 0o755).catch(() => undefined);
    await fixture.cleanup();
  });

  test("the Board icon opens the project's backlog: every ticket of docs/roadmap/ and done/ in its status column; BACKLOG.md and non-tickets don't appear", async () => {
    const b = await openBoard("alpha");
    expect(await idsIn(b, "backlog")).toEqual(["P-003"]);
    expect(await idsIn(b, "grooming")).toEqual(["P-002"]);
    expect(await idsIn(b, "planned")).toEqual(["P-001"]);
    expect(await idsIn(b, "delivering")).toEqual(["P-004"]);
    expect(await idsIn(b, "review")).toEqual(["P-005"]);
    await expect(column(b, "done").getByTestId("column-count")).toHaveText("1");
    await shot(page, "pomade-board-problems");

    await b.getByTestId("area-solutions").click();
    expect(await idsIn(b, "backlog")).toEqual(["T-003"]);
    expect(await idsIn(b, "planned")).toEqual(["E-002", "T-004", "T-002"]);
    expect(await idsIn(b, "in-progress")).toEqual(["E-001", "T-001"]);
    expect(await idsIn(b, "review")).toEqual(["E-017"]);
    await revealRight(b);
    await column(b, "done").getByTestId("column-expand").click();
    expect(await idsIn(b, "done")).toEqual(["E-000", "T-000"]);
    await shot(page, "pomade-board-solutions-done-expanded");
    await column(b, "done").getByTestId("column-collapse").click();

    const paths = await b.locator('[data-testid="card"], [data-testid="unreadable-card"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-path") ?? ""));
    expect(paths.filter((p) => /BACKLOG\.md|PLAN\.md|S-001/.test(p))).toEqual([]);
  });

  test("T-999-broken.md with invalid YAML is a greyed “can't read” card that opens in the editor", async () => {
    const b = board(page);
    const broken = b.getByTestId("unreadable-strip").locator(`[data-path="${ALPHA}/docs/roadmap/${BROKEN_TICKET.path}"]`);
    await expect(broken).toContainText("can't read — open to fix");
    await expect(broken).toHaveCSS("border-style", "dashed");
    await broken.click();
    await expect(page.getByTestId("tabstrip").getByRole("tab", { name: "T-999-broken.md", selected: true })).toBeVisible();
    await expect(vis(page, '[data-testid="editor-pane"]')).toBeVisible();
    await shot(page, "pomade-board-unreadable-opened");
    await page.getByTestId("tabstrip").getByRole("tab", { name: "Board" }).click();
  });

  test("dragging E-017 review → done writes status: done and today's updated: and moves it into done/ — git shows two lines and the rename", async () => {
    const b = board(page);
    await b.getByTestId("area-solutions").click();
    const before = await readFile(roadmap(ticketPath(spec("E-017"))), "utf8");
    await revealRight(b);
    await drag(page, card(b, "E-017"), column(b, "done"), async () => {
      await expect(column(b, "done")).toHaveAttribute("data-over", "true");
      await shot(page, "pomade-board-dragging");
    });
    const moved = roadmap(ticketPath({ ...spec("E-017"), inDone: true }));
    await expect.poll(() => readFile(moved, "utf8").catch(() => null)).toBe(withStatus(before, "done"));

    git(abs(ALPHA), "add", "-A");
    expect(git(abs(ALPHA), "diff", "--cached", "-M", "--name-status").trim()).toMatch(/^R\d+\tdocs\/roadmap\/E-017-icon-picker-redesign\.md\tdocs\/roadmap\/done\/E-017-icon-picker-redesign\.md$/);
    const changed = git(abs(ALPHA), "diff", "--cached", "-M", "--unified=0")
      .split("\n")
      .filter((l) => /^[-+](?![-+])/.test(l));
    expect(changed).toEqual(["-status: review", "+status: done", "-updated: 2026-11-10", `+updated: ${today()}`]);
    git(abs(ALPHA), "commit", "-qm", "E-017 done");
    await expect(b.getByTestId("card-error")).toHaveCount(0);
  });

  test("editing a ticket's status: in the editor and saving moves its card within ~1 s; a file made in Finder adds a card, deleting it removes it", async () => {
    let b = board(page);
    await b.getByTestId("area-solutions").click();
    await card(b, "E-002").click();
    const tab = ticketPath(spec("E-002"));
    await expect(page.getByTestId("tabstrip").getByRole("tab", { name: tab, selected: true })).toBeVisible();
    const cm = await rawEditor(page);
    await cm.getByText("status: planned").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Shift+Home");
    await page.keyboard.type("status: in-progress");
    const saved = Date.now();
    await page.keyboard.press("Meta+s");
    await expect(vis(page, '[data-testid="doc-save"]')).toHaveAttribute("data-saved", "true");

    // The Board tab is hidden behind the editor; its frame follows the file all the same.
    const hidden = page.frameLocator('[data-testid="app-frame-pomade-board"]');
    await expect(column(hidden, "in-progress").locator('[data-id="E-002"]')).toHaveCount(1, { timeout: 3_000 });
    const latency = Date.now() - saved;
    test.info().annotations.push({ type: "editor save → card moved (ms)", description: String(latency) });
    expect(latency).toBeLessThan(2_000);

    await page.getByTestId("tabstrip").getByRole("tab", { name: "Board" }).click();
    b = board(page);
    await expect(column(b, "in-progress").locator('[data-id="E-002"]')).toBeVisible();

    const created = roadmap("T-050-made-in-finder.md");
    await writeFile(created, ticketFile({ id: "T-050", kind: "task", title: "Made in Finder", status: "planned", priority: "P0", parent: "E-002" }));
    await expect(column(b, "planned").locator('[data-id="T-050"]')).toBeVisible({ timeout: 3_000 });
    await expect(card(b, "T-050").getByTestId("card-parent")).toHaveText("E-002");
    await unlink(created);
    await expect(card(b, "T-050")).toHaveCount(0, { timeout: 3_000 });
  });

  test("dragging a ticket open in the editor with unsaved edits brings Pomade's changed-on-disk banner; nothing is overwritten", async () => {
    let b = board(page);
    await b.getByTestId("area-problems").click();
    await card(b, "P-001").click();
    const path = roadmap(ticketPath(spec("P-001")));
    const before = await readFile(path, "utf8");
    const cm = await rawEditor(page);
    await cm.click();
    await page.keyboard.press("Meta+ArrowUp");
    await page.keyboard.type("MINE ");
    await expect(vis(page, '[data-testid="doc-save"]')).toHaveAttribute("data-saved", "false");

    await page.getByTestId("tabstrip").getByRole("tab", { name: "Board" }).click();
    b = board(page);
    await drag(page, card(b, "P-001"), column(b, "delivering"));
    await expect.poll(() => readFile(path, "utf8")).toBe(withStatus(before, "delivering"));

    await page.getByTestId("tabstrip").getByRole("tab", { name: ticketPath(spec("P-001")) }).click();
    await expect(vis(page, '[data-testid="editor-changed-dirty"]')).toContainText("File changed since your edits");
    const buffer = await vis(page, '[data-testid="raw-editor"] .cm-content').innerText();
    expect(buffer.startsWith("MINE ---")).toBe(true);
    expect(buffer).toContain("status: planned");
    expect(await readFile(path, "utf8")).toBe(withStatus(before, "delivering"));
    await shot(page, "pomade-board-dirty-banner");
    await page.getByTestId("tabstrip").getByRole("tab", { name: "Board" }).click();
  });

  test("a refused drop writes nothing; a write the disk refuses shows an inline error and the card reloads", async () => {
    const b = board(page);
    await b.getByTestId("area-solutions").click();
    const epicPath = roadmap(ticketPath(spec("E-001")));
    const epic = await readFile(epicPath, "utf8");
    await drag(page, card(b, "E-001"), column(b, "backlog"), async () => {
      await expect(column(b, "backlog")).toHaveAttribute("data-refused", "true");
      await expect(b.getByTestId("drop-refusal")).toHaveText("Epics can't be in Backlog");
      await shot(page, "pomade-board-refused-drop");
    });
    await expect(column(b, "in-progress").locator('[data-id="E-001"]')).toBeVisible();
    expect(await readFile(epicPath, "utf8")).toBe(epic);

    await b.getByTestId("area-problems").click();
    const problemPath = roadmap(ticketPath(spec("P-003")));
    const problem = await readFile(problemPath, "utf8");
    await chmod(roadmap(""), 0o555);
    try {
      await drag(page, card(b, "P-003"), column(b, "grooming"));
      await expect(card(b, "P-003").getByTestId("card-error")).toContainText("Couldn't save");
      await expect(column(b, "backlog").locator('[data-id="P-003"]')).toBeVisible();
      await shot(page, "pomade-board-write-error");
    } finally {
      await chmod(roadmap(""), 0o755);
    }
    expect(await readFile(problemPath, "utf8")).toBe(problem);
  });

  test("a project without docs/roadmap/ shows “Choose backlog folder”; the chosen folder loads its board and survives a restart", async () => {
    const b = await openBoard("beta");
    await expect(b.getByTestId("choose-backlog-state")).toContainText("Beta has no docs/roadmap/ folder.");
    await shot(page, "pomade-board-choose-backlog");
    await queuePickerAnswers(app, [abs("Projects/beta/tickets")]);
    await b.getByTestId("choose-backlog").click();
    await b.getByTestId("area-solutions").click();
    await expect(card(b, "E-010")).toBeVisible();

    await app?.close();
    await launch();
    const again = await openBoard("beta");
    await expect(again.getByTestId("board")).toHaveAttribute("data-area", "solutions");
    await expect(card(again, "E-010")).toBeVisible();
    await expect(again.getByTestId("backlog-location")).toHaveText("tickets");
  });

  test("each project's Board tab shows that project's board", async () => {
    const alpha = await openBoard("alpha");
    await expect(alpha.getByTestId("board")).toHaveAttribute("data-project", fixture.projects.alpha ?? "");
    const beta = await openBoard("beta");
    await expect(beta.getByTestId("board")).toHaveAttribute("data-project", fixture.projects.beta ?? "");
  });

  test("at Workspace the Board tab lists the projects with a backlog and their open counts; clicking one opens its board", async () => {
    await page.getByTestId(WORKSPACE).click();
    await page.getByTestId(ICON).click();
    const chooser = board(page);
    const rows = chooser.getByTestId("chooser-project");
    await expect(rows).toHaveCount(3);
    expect(await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-project")))).toEqual(Object.values(fixture.projects));
    await expect(rows.first().getByTestId("chooser-count")).toHaveText(/^\d+ open$/);
    await shot(page, "pomade-board-workspace-chooser");

    const t0 = Date.now();
    await rows.nth(2).click();
    const scale = board(page);
    await expect(scale.getByTestId("board")).toHaveAttribute("data-project", fixture.projects.scale ?? "");
    await expect(scale.getByTestId("area-problems")).toContainText("75");
    test.info().annotations.push({ type: "chooser click → 300-ticket board shown (ms)", description: String(Date.now() - t0) });
  });

  test("300 tickets: the board renders, a drop lands at once and is written, the columns scroll", async () => {
    const b = board(page);
    await b.getByTestId("area-solutions").click();
    await expect(b.getByTestId("area-solutions")).toContainText("225");
    await shot(page, "pomade-board-300");
    const moving = column(b, "planned").getByTestId("card").first();
    const id = (await moving.getAttribute("data-id")) ?? "";
    const path = (await moving.getAttribute("data-path")) ?? "";
    const t0 = Date.now();
    await drag(page, moving, column(b, "in-progress"));
    await expect(column(b, "in-progress").locator(`[data-id="${id}"]`)).toBeVisible();
    const shown = Date.now() - t0;
    await expect.poll(() => readFile(abs(path), "utf8")).toContain("status: in-progress");
    test.info().annotations.push({ type: "300-ticket drop → card in target column (ms)", description: String(shown) });
    expect(shown).toBeLessThan(1_500);
    const cards = column(b, "planned").getByTestId("column-cards");
    await cards.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await expect.poll(() => cards.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  });
});
