// "Needs you" at Workspace in a real Pomade ($POMADE_DIR, e2e/fixtures/pomade.ts) with the app
// dev-linked, on real files: Alpha (the sample backlog) and Delta (two tickets in review) hold
// something that waits, Beta has no backlog. The list of projects, a project and "All projects" a
// click in, the row back, live reads, and Pomade switching to a ticket's project.

import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { expect, test, type ElectronApplication, type FrameLocator, type Locator, type Page } from "@playwright/test";

import { DELTA_TICKETS, deltaBacklog, sampleBacklog, ticketFile, ticketPath, under } from "../test/fixtures/backlog";
import { createPomadeFixture, launchPomade, panelShown, type PomadeFixture } from "./fixtures/pomade";
import { shot } from "./fixtures/screens";

const DIST = resolve(import.meta.dirname, "../dist/board");
const ICON = "strip-app-pomade-board-board";
const PANEL = "panel-frame-app-pomade-board-board";
const WORKSPACE = "project-__workspace__";

test.describe("“Needs you” at Workspace in a real Pomade", () => {
  test.describe.configure({ mode: "serial" });
  let fixture: PomadeFixture;
  let app: ElectronApplication | undefined;
  let page: Page;
  let p: FrameLocator;
  const abs = (rel: string) => join(fixture.workspaceRoot, rel);
  const id = (key: string) => fixture.projects[key] ?? "";
  const deltaFile = (ticket: string) => {
    const spec = DELTA_TICKETS.find((t) => t.id === ticket);
    if (!spec) throw new Error(ticket);
    return ticketPath(spec);
  };
  const view = () => p.getByTestId("view-needs-you-panel");
  const listRow = (key: string) => p.locator(`[data-testid="needs-you-list-project"][data-project="${id(key)}"]`);
  const counts = (row: Locator) => row.getByTestId("needs-you-list-count");
  const listed = () => p.getByTestId("needs-you-list-project").evaluateAll((els) => els.map((e) => e.getAttribute("data-project")));
  const rowIds = (scope: FrameLocator | Locator = p) => scope.getByTestId("needs-you-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")));
  const section = (key: string) => p.locator(`[data-testid="needs-you-project"][data-project="${id(key)}"]`);

  /** Workspace in front with the Board icon's panel shown. */
  async function atWorkspace(): Promise<void> {
    await page.getByTestId(WORKSPACE).click();
    if ((await page.getByTestId(ICON).getAttribute("aria-pressed")) !== "true") await page.getByTestId(ICON).click();
    await panelShown(page, ICON);
    await expect(view()).toHaveAttribute("data-project", "__workspace__");
    await expect(view()).toHaveAttribute("aria-busy", "false");
  }

  test.beforeAll(async () => {
    fixture = await createPomadeFixture([
      { key: "alpha", name: "Alpha", root: "Projects/alpha", files: { "README.md": "# Alpha\n", ...under("docs/roadmap", sampleBacklog()) } },
      { key: "beta", name: "Beta", root: "Projects/beta", files: { "README.md": "# Beta\n" } },
      { key: "delta", name: "Delta", root: "Projects/delta", files: { "README.md": "# Delta\n", ...under("docs/roadmap", deltaBacklog()) } },
    ]);
    ({ app, page } = await launchPomade(fixture, { POMADE_DEV_APPS: DIST }));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1400, 900));
    p = page.frameLocator(`[data-testid="${PANEL}"]`);
  });

  test.afterAll(async () => {
    await app?.close();
    await fixture.cleanup();
  });

  test("the panel shows “All projects” and the two projects with their counts, and no ticket; a click on one shows only its tickets; back returns; “All projects” shows both projects' sections", async () => {
    await atWorkspace();
    await expect(view()).toHaveAttribute("data-level", "list");
    expect(await listed()).toEqual([id("alpha"), id("delta")]);
    const buttons = p.getByTestId("needs-you-list").getByRole("button");
    await expect(buttons).toHaveCount(3);
    await expect(buttons.first()).toHaveAttribute("data-testid", "needs-you-all");
    await expect(buttons.first()).toContainText("All projects");
    await expect(counts(p.getByTestId("needs-you-all"))).toHaveText(["4 in review", "1 new signal"]);
    await expect(listRow("alpha")).toContainText("Alpha");
    await expect(counts(listRow("alpha"))).toHaveText(["2 in review", "1 new signal"]);
    await expect(listRow("delta")).toContainText("Delta");
    await expect(counts(listRow("delta"))).toHaveText(["2 in review"]);
    await expect(p.getByTestId("needs-you-row")).toHaveCount(0);
    await page.mouse.move(1000, 700);
    await shot(page, "t003-pomade-list");

    await listRow("delta").click();
    await expect(view()).toHaveAttribute("data-level-project", id("delta"));
    expect(await rowIds()).toEqual(["E-018", "P-013"]);
    await expect(p.getByTestId("needs-you-back")).toContainText("Delta");
    await expect(p.getByTestId("needs-you-list")).toHaveCount(0);
    await page.mouse.move(1000, 700);
    await shot(page, "t003-pomade-project");

    await p.getByTestId("needs-you-back").click();
    await expect(view()).toHaveAttribute("data-level", "list");
    expect(await listed()).toEqual([id("alpha"), id("delta")]);
    await expect(p.getByTestId("needs-you-row")).toHaveCount(0);

    await p.getByTestId("needs-you-all").click();
    await expect(p.getByTestId("needs-you-back")).toContainText("All projects");
    expect(await p.getByTestId("needs-you-project").evaluateAll((els) => els.map((e) => e.getAttribute("data-project")))).toEqual([id("alpha"), id("delta")]);
    expect(await rowIds(section("alpha"))).toEqual(["E-017", "P-005", "S-001"]);
    expect(await rowIds(section("delta"))).toEqual(["E-018", "P-013"]);
    await page.mouse.move(1000, 700);
    await shot(page, "t003-pomade-all");
    await p.getByTestId("needs-you-back").click();
    await expect(view()).toHaveAttribute("data-level", "list");
  });

  test("the list and an opened project follow the files within ~1 s; a project that empties while open says “Nothing needs you” and keeps the back row", async () => {
    await writeFile(abs("Projects/alpha/docs/roadmap/S-002-seen-at-workspace.md"), ticketFile({ id: "S-002", kind: "signal", title: "Seen at Workspace", status: "new", priority: "P0" }));
    await expect(counts(listRow("alpha"))).toHaveText(["2 in review", "2 new signals"], { timeout: 1_500 });
    await expect(counts(p.getByTestId("needs-you-all"))).toHaveText(["4 in review", "2 new signals"], { timeout: 1_500 });

    await listRow("delta").click();
    expect(await rowIds()).toEqual(["E-018", "P-013"]);
    const e018 = abs(`Projects/delta/docs/roadmap/${deltaFile("E-018")}`);
    await writeFile(e018, (await readFile(e018, "utf8")).replace("status: review", "status: in-progress"));
    await expect.poll(() => rowIds(), { timeout: 1_500 }).toEqual(["P-013"]);
    const p013 = abs(`Projects/delta/docs/roadmap/${deltaFile("P-013")}`);
    await writeFile(p013, (await readFile(p013, "utf8")).replace("status: review", "status: delivering"));
    await expect(p.getByTestId("needs-you-empty")).toContainText("No tickets in review and no new signals in Delta.", { timeout: 1_500 });
    await expect(p.getByTestId("needs-you-back")).toContainText("Delta");
    await shot(page, "t003-pomade-project-empty");

    await p.getByTestId("needs-you-back").click();
    expect(await listed()).toEqual([id("alpha")]);
    await expect(counts(p.getByTestId("needs-you-all"))).toHaveText(["2 in review", "2 new signals"]);
  });

  test("a ticket opens in its project's editor and Pomade switches there; back at Workspace the panel is on the list", async () => {
    await listRow("alpha").click();
    await p.locator('[data-testid="needs-you-row"][data-id="P-005"]').click();
    await expect(page.getByTestId("tabstrip").getByRole("tab", { name: /^P-005-/, selected: true })).toBeVisible();
    // Inside the project the panel is the project's: its groups, no list, no back row.
    await expect(view()).toHaveAttribute("data-project", id("alpha"));
    await expect.poll(() => rowIds()).toEqual(["E-017", "P-005", "S-002", "S-001"]);
    await expect(p.getByTestId("needs-you-back")).toHaveCount(0);
    await expect(p.getByTestId("needs-you-list")).toHaveCount(0);

    await atWorkspace();
    await expect(view()).toHaveAttribute("data-level", "list");
    expect(await listed()).toEqual([id("alpha")]);
    await expect(p.getByTestId("needs-you-row")).toHaveCount(0);
  });
});
