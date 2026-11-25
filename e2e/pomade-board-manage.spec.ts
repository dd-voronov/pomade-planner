// E-002's acceptance in a real Pomade ($POMADE_DIR, e2e/fixtures/pomade.ts) with the app dev-linked,
// on real files: a project named "Pomade" with E-002's acceptance backlog (a git repo, so byte
// changes are read from `git diff`), Alpha with the sample backlog (a signal, review tickets), and
// Beta without a backlog folder. Creating from a column, the card popover, the Signals area and its
// triage picker, "Needs you" in the side panel of a project, and the counts at Workspace.

import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { expect, test, type ElectronApplication, type FrameLocator, type Page } from "@playwright/test";

import { DELTA_TICKETS, SAMPLE_TICKETS, deltaBacklog, sampleBacklog, ticketFile, ticketPath, under } from "../test/fixtures/backlog";
import { boxOf, card, column, createdTicket, drag, today, withFields, withStatus } from "./fixtures/board";
import { createPomadeFixture, launchPomade, type PomadeFixture } from "./fixtures/pomade";
import { shot } from "./fixtures/screens";

const DIST = resolve(import.meta.dirname, "../dist/board");
const ICON = "strip-app-pomade-board-board";
const PANEL = "panel-frame-app-pomade-board-board";
const WORKSPACE = "project-__workspace__";
/** The Board tab ("Board", then its close button) — not a file tab whose name holds "board". */
const BOARD_TAB = /^Board\b/;

const board = (page: Page): FrameLocator => page.frameLocator('[data-testid="app-frame-pomade-board"]:visible');
const panel = (page: Page): FrameLocator => page.frameLocator(`[data-testid="${PANEL}"]`);

function sampleName(id: string): string {
  const spec = SAMPLE_TICKETS.find((t) => t.id === id);
  if (!spec) throw new Error(id);
  return ticketPath(spec);
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=e2e", "-c", "user.email=e2e@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });
}

/** The changed lines of the working tree against HEAD (`-`/`+`, no headers). */
function changedLines(cwd: string): string[] {
  git(cwd, "add", "-A");
  return git(cwd, "diff", "--cached", "--unified=0")
    .split("\n")
    .filter((l) => /^[-+](?![-+])/.test(l));
}

test.describe("E-002 in a real Pomade", () => {
  test.describe.configure({ mode: "serial" });
  let fixture: PomadeFixture;
  let app: ElectronApplication | undefined;
  let page: Page;
  const abs = (rel: string) => join(fixture.workspaceRoot, rel);
  const POMADE = "Projects/pomade";
  const roadmap = (rel: string) => abs(`${POMADE}/docs/roadmap/${rel}`);
  const deltaName = (id: string) => {
    const spec = DELTA_TICKETS.find((t) => t.id === id);
    if (!spec) throw new Error(id);
    return ticketPath(spec);
  };
  const deltaPath = (id: string) => roadmap(deltaName(id));

  async function openBoard(projectKey: string, area?: string): Promise<FrameLocator> {
    await page.getByTestId(`project-${fixture.projects[projectKey]}`).click();
    await page.getByTestId(ICON).click();
    await expect(page.getByTestId("tabstrip").getByRole("tab", { name: BOARD_TAB, selected: true })).toBeVisible();
    const b = board(page);
    await expect(b.getByTestId("board").or(b.getByTestId("choose-backlog-state"))).toBeVisible();
    // The tab's frame follows the switch to this project a moment later: wait for this project's board, settled.
    await expect(b.locator(`[data-testid="board"][data-project="${fixture.projects[projectKey] ?? ""}"]`).or(b.getByTestId("choose-backlog-state"))).toBeVisible();
    if (area !== undefined) {
      // A click sent in a frame Pomade has just shown can be lost: sent until it took.
      await expect(async () => {
        await b.getByTestId(`area-${area}`).click();
        await expect(b.getByTestId("board")).toHaveAttribute("data-area", area, { timeout: 1_000 });
      }).toPass();
    }
    return b;
  }

  /** The popover's box lies inside the visible Board frame. */
  async function expectInsideBoard(b: FrameLocator, testId: string): Promise<void> {
    const box = await boxOf(b.getByTestId(testId));
    const frame = await boxOf(page.locator('[data-testid="app-frame-pomade-board"]:visible'));
    expect(box.x).toBeGreaterThanOrEqual(frame.x);
    expect(box.y).toBeGreaterThanOrEqual(frame.y);
    expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(frame.y + frame.height + 0.5);
  }

  test.beforeAll(async () => {
    fixture = await createPomadeFixture([
      { key: "pomade", name: "Pomade", root: "Projects/pomade", files: { "README.md": "# Pomade\n", ...under("docs/roadmap", deltaBacklog()) } },
      { key: "alpha", name: "Alpha", root: "Projects/alpha", files: { "README.md": "# Alpha\n", ...under("docs/roadmap", sampleBacklog()) } },
      { key: "beta", name: "Beta", root: "Projects/beta", files: { "README.md": "# Beta\n" } },
    ]);
    git(abs(POMADE), "init", "-q");
    git(abs(POMADE), "add", "-A");
    git(abs(POMADE), "commit", "-qm", "backlog");
    ({ app, page } = await launchPomade(fixture, { POMADE_DEV_APPS: DIST }));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1800, 1000));
  });

  test.afterAll(async () => {
    await app?.close();
    await fixture.cleanup();
  });

  test("+ on Planned: task “Verify T-199” under E-017 → T-042-verify-t-199.md (the next task ID, counting done/), written whole, opened in the editor, its card with the E-017 chip", async () => {
    const b = await openBoard("pomade", "solutions");
    await column(b, "planned").getByTestId("column-add").click();
    const form = b.getByTestId("create-form");
    await expect(form).toBeVisible();
    await form.getByTestId("kind-task").check();
    await expect(form.getByTestId("create-preview")).toHaveText("T-042 · Planned");
    await form.getByTestId("create-title").fill("Verify T-199");
    await form.getByTestId("parent-filter").fill("E-017");
    await expect(form.locator('[data-testid="parent-option"][aria-selected="true"]')).toHaveAttribute("data-id", "E-017");
    await expectInsideBoard(b, "create-form");
    await shot(page, "e002-pomade-create-form");
    await page.keyboard.press("Enter");

    const created = roadmap("T-042-verify-t-199.md");
    await expect.poll(() => readFile(created, "utf8").catch(() => null)).toBe(createdTicket({ id: "T-042", kind: "task", title: "Verify T-199", status: "planned", parent: "E-017" }));
    await expect(page.getByTestId("tabstrip").getByRole("tab", { name: "T-042-verify-t-199.md", selected: true })).toBeVisible();
    await shot(page, "e002-pomade-created-opened");
    await page.getByTestId("tabstrip").getByRole("tab", { name: BOARD_TAB }).click();
    await expect(column(board(page), "planned").locator('[data-id="T-042"]').getByTestId("card-parent")).toHaveText("E-017");
    git(abs(POMADE), "add", "-A");
    git(abs(POMADE), "commit", "-qm", "T-042");
  });

  test("right-click → P1 changes only priority: and updated: in the file", async () => {
    const b = board(page);
    const path = deltaPath("T-004");
    const before = await readFile(path, "utf8");
    await card(b, "T-004").click({ button: "right" });
    await expect(b.getByTestId("card-popover")).toBeVisible();
    await b.getByTestId("priority-P1").check();
    await expect.poll(() => readFile(path, "utf8")).toBe(withFields(before, { priority: "P1" }));
    expect(changedLines(abs(POMADE))).toEqual(["-priority: P2", "+priority: P1", "-updated: 2026-11-10", `+updated: ${today()}`]);
    await shot(page, "e002-pomade-popover");
    await page.keyboard.press("Escape");
    await expect(b.getByTestId("card-popover")).toHaveCount(0);
    await expect(card(b, "T-004")).toBeFocused();
    git(abs(POMADE), "commit", "-qm", "T-004 P1");
  });

  test("a project with no signals shows an empty Signals board with “+ New signal”; it creates S-001 with kind: signal, status: new, reporter: d.voronov and no source", async () => {
    const b = board(page);
    await b.getByTestId("area-signals").click();
    await expect(b.getByTestId("area-empty")).toBeVisible();
    await shot(page, "e002-pomade-signals-empty");
    await b.getByTestId("area-create").click();
    await b.getByTestId("create-title").fill("Board missed a rename");
    await b.getByTestId("create-submit").click();
    const path = roadmap("S-001-board-missed-a-rename.md");
    await expect.poll(() => readFile(path, "utf8").catch(() => null)).toBe(createdTicket({ id: "S-001", kind: "signal", title: "Board missed a rename", status: "new" }));
    const text = await readFile(path, "utf8");
    expect(text).toContain("\nkind: signal\n");
    expect(text).toContain("\nstatus: new\n");
    expect(text).toContain("\nreporter: d.voronov\n");
    expect(text).not.toContain("\nsource:");
    await expect(page.getByTestId("tabstrip").getByRole("tab", { name: "S-001-board-missed-a-rename.md", selected: true })).toBeVisible();
    await page.getByTestId("tabstrip").getByRole("tab", { name: BOARD_TAB }).click();
    const created = column(board(page), "new").locator('[data-id="S-001"]');
    await expect(created.getByTestId("card-reporter")).toHaveText("d.voronov");
    await expect(created.getByTestId("card-source")).toHaveCount(0);
    await shot(page, "e002-pomade-signals-board");
  });

  test("with the Board icon selected the side panel lists the review tickets and new signals; dragging a card out of review removes it within ~1 s", async () => {
    const b = await openBoard("pomade", "solutions");
    const p = panel(page);
    await expect(p.getByTestId("view-needs-you-panel")).toHaveAttribute("data-project", fixture.projects.pomade ?? "");
    const ids = (group: string) => p.getByTestId(`needs-you-${group}`).getByTestId("needs-you-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")));
    await expect.poll(() => ids("review")).toEqual(["E-018", "P-013"]);
    expect(await ids("signals")).toEqual(["S-001"]);
    await shot(page, "e002-pomade-needs-you-project");

    await drag(page, card(b, "E-018"), column(b, "in-progress"));
    const dropped = Date.now();
    await expect(p.locator('[data-testid="needs-you-row"][data-id="E-018"]')).toHaveCount(0, { timeout: 1_500 });
    test.info().annotations.push({ type: "drop out of review → row gone from Needs you (ms)", description: String(Date.now() - dropped) });
    await expect.poll(() => readFile(deltaPath("E-018"), "utf8")).toContain("status: in-progress");

    // A task dropped into Review needs you too; dragged back out, it leaves.
    await drag(page, card(b, "T-004"), column(b, "review"));
    await expect.poll(() => readFile(deltaPath("T-004"), "utf8")).toContain("status: review");
    await expect(p.locator('[data-testid="needs-you-row"][data-id="T-004"]')).toBeVisible({ timeout: 1_500 });
    await shot(page, "t014-pomade-task-in-review");
    await drag(page, card(b, "T-004"), column(b, "planned"));
    await expect(p.locator('[data-testid="needs-you-row"][data-id="T-004"]')).toHaveCount(0, { timeout: 1_500 });

    // A click opens the ticket in the editor.
    await p.locator('[data-testid="needs-you-row"][data-id="P-013"]').click();
    await expect(page.getByTestId("tabstrip").getByRole("tab", { name: deltaName("P-013"), selected: true })).toBeVisible();
  });

  test("at Workspace the chooser and the “Needs you” list show the same counts, live", async () => {
    await page.getByTestId(WORKSPACE).click();
    await page.getByTestId(ICON).click();
    const p = panel(page);
    await expect(p.getByTestId("view-needs-you-panel")).toHaveAttribute("data-project", "__workspace__");
    const listed = (key: string) => p.locator(`[data-testid="needs-you-list-project"][data-project="${fixture.projects[key]}"]`).getByTestId("needs-you-list-count");
    await expect(listed("pomade")).toHaveText(["1 in review", "1 new signal"]);
    await expect(listed("alpha")).toHaveText(["2 in review", "1 new signal"]);

    const chooser = board(page);
    const row = (key: string) => chooser.locator(`[data-testid="chooser-project"][data-project="${fixture.projects[key]}"]`);
    await expect(row("pomade").getByTestId("chooser-needs-you")).toHaveText("1 in review · 1 new signal");
    await expect(row("alpha").getByTestId("chooser-needs-you")).toHaveText("2 in review · 1 new signal");
    await expect(row("pomade")).toContainText("Pomade");
    await page.mouse.move(1200, 600);
    await shot(page, "e002-pomade-workspace");

    // Live at Workspace too: a new signal in Alpha shows in both within ~1 s.
    await writeFile(abs("Projects/alpha/docs/roadmap/S-002-seen-at-workspace.md"), ticketFile({ id: "S-002", kind: "signal", title: "Seen at Workspace", status: "new", priority: "P0" }));
    await expect(row("alpha").getByTestId("chooser-needs-you")).toHaveText("2 in review · 2 new signals", { timeout: 1_500 });
    await expect(listed("alpha")).toHaveText(["2 in review", "2 new signals"], { timeout: 1_500 });
  });

  test("dragging a signal without a problem to Triaged asks for its problem first; the pick is written with the status", async () => {
    const b = await openBoard("alpha", "signals");
    const path = abs(`Projects/alpha/docs/roadmap/${sampleName("S-001")}`);
    const before = await readFile(path, "utf8");
    await drag(page, card(b, "S-001"), column(b, "triaged"));
    await expect(b.getByTestId("triage-picker")).toBeVisible();
    await page.keyboard.type("flaky");
    await shot(page, "e002-pomade-triage-picker");
    await page.keyboard.press("Enter");
    await expect.poll(() => readFile(path, "utf8")).toBe(withStatus(before, "triaged").replace(/\n---\n\n#/, "\nproblem: P-002\n---\n\n#"));
    await expect(column(b, "triaged").locator('[data-id="S-001"]').getByTestId("card-parent")).toHaveText("P-002");
  });

  test("a backlog folder made after “No backlog found” loads the board without a refresh", async () => {
    const b = await openBoard("beta");
    await expect(b.getByTestId("choose-backlog-state")).toBeVisible();
    await mkdir(abs("Projects/beta/docs/roadmap"), { recursive: true });
    await writeFile(abs("Projects/beta/docs/roadmap/P-001-late.md"), ticketFile({ id: "P-001", kind: "problem", title: "Late backlog", status: "backlog" }));
    await expect(card(b, "P-001")).toBeVisible({ timeout: 3_000 });
  });

  test("in a narrow Board tab the create form and the popover stay inside it", async () => {
    await app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(860, 760));
    const b = await openBoard("pomade", "solutions");
    await b.getByTestId("board-columns").evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    await column(b, "review").getByTestId("column-add").click();
    await expectInsideBoard(b, "create-form");
    await shot(page, "e002-pomade-create-narrow");
    await page.keyboard.press("Escape");
    await expect(b.getByTestId("create-form")).toHaveCount(0);
    const target = column(b, "in-progress").getByTestId("card").first();
    const box = await boxOf(target);
    await target.click({ button: "right", position: { x: box.width - 4, y: 8 } });
    await expectInsideBoard(b, "card-popover");
    await shot(page, "e002-pomade-popover-narrow");
    await page.keyboard.press("Escape");
    await app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1800, 1000));
  });
});
