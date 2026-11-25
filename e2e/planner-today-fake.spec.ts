// E-010 on the fake host (fake-host/, test/fixtures/workspace.ts `PLANNER_WORKSPACE` with
// `NOTES_FILES`): Today is one list for the whole workspace — the same rows at Workspace and inside
// every project, the daily note's card on top; inside a project the "Only <project>" filter,
// remembered per project; one pin list; a note or thought with a day; the line under the header
// naming the context; every group heading folding, remembered across a reload, and unfolding for the
// item asked for. The fixture's Tasks/ is dated around Tue 2026-11-17.

import { expect, test, type FrameLocator, type Page } from "@playwright/test";

import { APP_PORT, HARNESS_PORT } from "../playwright.config";
import { row, setClock, settled, titles } from "./fixtures/planner";
import { shot } from "./fixtures/screens";

const APP = `http://localhost:${APP_PORT}/`;

interface Open {
  surface: "tab" | "panel";
  project?: string;
  route?: string;
  panelWidth?: number;
  theme?: "light" | "dark";
}

function harness(open: Open): string {
  const params = new URLSearchParams({ app: APP, surface: open.surface, tasks: "Tasks", now: "2026-11-17T10:00", fixture: "planner", extra: "notes", template: "Templates/Daily.md", project: open.project ?? "workspace", mount: "manual" });
  if (open.surface === "panel") params.set("icon", "planner");
  params.set("route", open.route ?? "planner");
  if (open.panelWidth !== undefined) params.set("panelWidth", String(open.panelWidth));
  if (open.theme !== undefined) params.set("theme", open.theme);
  return `http://localhost:${HARNESS_PORT}/index.html?${params.toString()}`;
}

const app = (page: Page): FrameLocator => page.frameLocator("#stage iframe >> nth=0");

/** "Gift ideas for Greta" planned for the fixture's day; "Does QuizLab need a leaderboard?" for the next. */
const GIFTS = "Tasks/2026-11-12-gift-ideas.md";
const GIFTS_PLANNED = "---\ntype: note\ntitle: Gift ideas for Greta\nstatus: open\ndo-on: 2026-11-17\ncreated: 2026-11-12\n---\n- the blue scarf from the market\n";
const LEADERBOARD = "Tasks/QuizLab/2026-11-12-leaderboard.md";
const LEADERBOARD_PLANNED = "---\ntype: thought\ntitle: Does QuizLab need a leaderboard?\nstatus: open\ndo-on: 2026-11-18\ncreated: 2026-11-12\n---\n";

/** The whole day, top to bottom, under the headings No project · Old stuff · Pomade · QuizLab. */
const WHOLE_DAY = [
  "Pay the tax",
  "Renew Nora's swimming class",
  "Call the dentist",
  "Buy printer ink",
  "Book flights for the Christmas trip to see the grandparents in Valencia",
  "Water the plants",
  "Gift ideas for Greta",
  "Sort the attic",
  "Review the Host API",
  "Ship the planner",
  "Fix the score screen",
];

async function openPlanner(page: Page, open: Open): Promise<FrameLocator> {
  await page.goto(harness(open));
  await page.evaluate(([p, c]) => window.fakeHost.writeFile(p, c), [GIFTS, GIFTS_PLANNED] as const);
  await page.evaluate(([p, c]) => window.fakeHost.writeFile(p, c), [LEADERBOARD, LEADERBOARD_PLANNED] as const);
  await page.evaluate(() => window.mountNow());
  const a = app(page);
  await expect(a.getByTestId(open.surface === "panel" ? "view-planner-panel" : "view-planner-tab")).toBeVisible();
  await settled(a);
  return a;
}

const sections = (a: FrameLocator) => a.locator('[data-testid="task-section"]').evaluateAll((els) => els.map((el) => el.getAttribute("data-source")));
const heading = (a: FrameLocator, source: string) => a.locator(`[data-testid="task-section"][data-source="${source}"]`);

test.describe("one Today", () => {
  test("the same rows at Workspace and inside either project, the daily note's card on top, the same count; a note planned for the day among its group's tasks", async ({ page }) => {
    const a = await openPlanner(page, { surface: "panel" });
    await expect(a.getByTestId("pinned-list").locator(":scope > li").first()).toHaveAttribute("data-testid", "daily-card");
    await expect.poll(() => titles(a)).toEqual(WHOLE_DAY);
    expect(await sections(a)).toEqual(["none", "folder:old stuff", "pomade", "quiz"]);
    await expect(a.getByTestId("count-today")).toHaveText("10");
    await expect(row(a, "Gift ideas for Greta")).toHaveAttribute("data-type", "note");
    await expect(row(a, "Gift ideas for Greta").getByTestId("task-archive")).toHaveCount(1);
    await expect(a.getByTestId("planner-context")).toHaveText("All projects");
    await expect(a.getByTestId("today-bar")).toHaveCount(0);

    for (const project of ["quiz", "pomade"]) {
      await page.evaluate((id) => window.fakeHost.setActiveProject(id), project);
      await expect(a.getByTestId("view-planner-panel")).toHaveAttribute("data-context", project);
      await expect.poll(() => titles(a)).toEqual(WHOLE_DAY);
      expect(await sections(a)).toEqual(["none", "folder:old stuff", "pomade", "quiz"]);
      await expect(a.getByTestId("daily-card")).toBeVisible();
      await expect(a.getByTestId("count-today")).toHaveText("10");
      await expect(a.getByTestId("planner-context")).toHaveText("All projects");
      await expect(a.getByTestId("mix-bar")).toHaveCount(0);
    }
    await shot(page, "e010-fake-panel-today-in-project");
  });

  test("Only <project>: that project's rows alone, no card, no headings; remembered per project across a switch away and back; Project and Recurring keep their mix-ins", async ({ page }) => {
    const a = await openPlanner(page, { surface: "panel", project: "quiz" });
    const only = a.getByTestId("only-project");
    await expect(only).toHaveText("Only QuizLab");
    await expect(only).toHaveAttribute("aria-pressed", "false");
    await only.click();
    await expect(only).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => titles(a)).toEqual(["Fix the score screen"]);
    await expect(a.getByTestId("daily-card")).toHaveCount(0);
    await expect(a.getByTestId("task-section")).toHaveCount(0);
    expect(await a.getByTestId("unreadable-row").evaluateAll((els) => els.map((el) => el.getAttribute("data-path")))).toEqual(["Tasks/QuizLab/2026-11-14-broken.md"]);
    await expect(a.getByTestId("count-today")).toHaveText("10");
    await expect(a.getByTestId("planner-context")).toHaveText("QuizLab");
    await expect(a.getByTestId("planner-context")).toHaveAttribute("data-tip", "Tasks/QuizLab/");
    await shot(page, "e010-fake-panel-today-only");

    await page.evaluate(() => window.fakeHost.setActiveProject("pomade"));
    await expect(a.getByTestId("view-planner-panel")).toHaveAttribute("data-context", "pomade");
    await expect(a.getByTestId("only-project")).toHaveText("Only Pomade");
    await expect(a.getByTestId("only-project")).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => titles(a)).toEqual(WHOLE_DAY);

    await page.evaluate(() => window.fakeHost.setActiveProject("quiz"));
    await expect(a.getByTestId("only-project")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => titles(a)).toEqual(["Fix the score screen"]);

    await a.getByTestId("view-project").click();
    await expect(a.getByTestId("today-bar")).toHaveCount(0);
    await expect(a.getByTestId("mix-add")).toBeVisible();
    await expect(a.getByTestId("planner-context")).toHaveText("QuizLab");
  });

  test("a note planned for the day is in Today; the next day it is not, and the thought planned for that day is", async ({ page }) => {
    const a = await openPlanner(page, { surface: "panel" });
    await expect(row(a, "Gift ideas for Greta")).toBeVisible();
    await expect(row(a, "Does QuizLab need a leaderboard?")).toHaveCount(0);
    await setClock(a, "2026-11-18T10:00");
    await expect(a.getByTestId("planner-day")).toHaveText("Wed, Nov 18");
    await expect(row(a, "Gift ideas for Greta")).toHaveCount(0);
    await expect(row(a, "Does QuizLab need a leaderboard?")).toHaveAttribute("data-type", "thought");
    await expect(row(a, "Does QuizLab need a leaderboard?").getByTestId("task-resolve")).toHaveCount(1);
  });

  test("one pin list: a row pinned on the Workspace Today stands pinned inside a project; unpinned there, it is unpinned at Workspace", async ({ page }) => {
    const a = await openPlanner(page, { surface: "panel" });
    await row(a, "Ship the planner").hover();
    await row(a, "Ship the planner").getByTestId("task-pin").click();
    await expect(a.getByTestId("pinned-list").getByTestId("task-title")).toHaveText(["Ship the planner"]);
    await page.evaluate(() => window.fakeHost.setActiveProject("quiz"));
    await expect(a.getByTestId("view-planner-panel")).toHaveAttribute("data-context", "quiz");
    await expect(a.getByTestId("pinned-list").getByTestId("task-title")).toHaveText(["Ship the planner"]);
    await expect(a.getByTestId("pinned-list").getByTestId("hint-source")).toHaveText("Pomade");
    const pinned = a.getByTestId("pinned-list").locator('[data-testid="task-row"]');
    await pinned.hover();
    await pinned.getByTestId("task-pin").click();
    await expect(a.getByTestId("pinned-list").locator('[data-testid="task-row"]')).toHaveCount(0);
    await page.evaluate(() => window.fakeHost.setActiveProject(null));
    await expect(a.getByTestId("view-planner-panel")).toHaveAttribute("data-context", "__workspace__");
    await expect(a.getByTestId("pinned-list").locator('[data-testid="task-row"]')).toHaveCount(0);
  });
});

test.describe("adding from Today", () => {
  test("pre-fills the context's project and do-on today; a note added there stands in Today under its project's heading, unfolded", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab", project: "quiz" });
    await heading(a, "quiz").getByTestId("task-section-toggle").click();
    await expect(heading(a, "quiz")).toHaveAttribute("data-folded", "true");
    await a.getByTestId("planner-add").click();
    await expect(a.getByTestId("qa-title")).toBeFocused();
    await expect(a.getByTestId("qa-project-name")).toHaveText("QuizLab");
    await expect(a.getByTestId("qa-do-on")).toHaveValue("today");
    await page.keyboard.type("Question bank sources");
    await page.keyboard.press("Alt+Tab");
    await page.keyboard.press("Alt+Tab");
    await expect(a.getByTestId("qa-type-note")).toBeChecked();
    await expect(a.getByTestId("qa-do-on")).toHaveValue("today");
    await shot(page, "e010-fake-tab-add-note-from-today");
    await page.keyboard.press("Enter");
    const added = row(a, "Question bank sources");
    await expect(heading(a, "quiz")).toHaveAttribute("data-folded", "false");
    await expect(added).toHaveAttribute("data-type", "note");
    await expect(added.getByTestId("task-open")).toBeFocused();
    await expect(a.locator('[data-testid="task-section"][data-source="quiz"] ~ [data-testid="task-row"]').filter({ hasText: "Question bank sources" })).toBeVisible();
    expect(await page.evaluate(() => window.fakeHost.readFile("Tasks/QuizLab/2026-11-17-question-bank-sources.md"))).toBe("---\ntype: note\ntitle: Question bank sources\nstatus: open\ndo-on: 2026-11-17\ncreated: 2026-11-17\n---\n");
    await expect(a.getByTestId("view-today")).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("folding groups", () => {
  test("a folded heading hides its rows and keeps its count; still folded in a frame mounted anew; ← folds and → unfolds the focused heading", async ({ page }) => {
    const a = await openPlanner(page, { surface: "panel", project: "quiz" });
    const pomade = heading(a, "pomade");
    await expect(pomade.getByTestId("task-section-count")).toHaveText("2");
    await pomade.getByTestId("task-section-toggle").click();
    await expect(pomade).toHaveAttribute("data-folded", "true");
    await expect(pomade.getByTestId("task-section-toggle")).toHaveAttribute("aria-expanded", "false");
    await expect.poll(() => titles(a)).toEqual(WHOLE_DAY.filter((t) => t !== "Review the Host API" && t !== "Ship the planner"));
    await expect(pomade.getByTestId("task-section-count")).toHaveText("2");
    await shot(page, "e010-fake-panel-today-folded");

    // A frame mounted anew on the same host reads the fold back.
    await page.evaluate(() => window.mounted?.close());
    await page.evaluate(() => window.mountNow({ surface: "panel", icon: "planner", route: "planner" }));
    await settled(a);
    await expect(heading(a, "pomade")).toHaveAttribute("data-folded", "true");
    await expect(row(a, "Ship the planner")).toHaveCount(0);

    const toggle = heading(a, "pomade").getByTestId("task-section-toggle");
    await toggle.focus();
    await page.keyboard.press("ArrowRight");
    await expect(row(a, "Ship the planner")).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(row(a, "Ship the planner")).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(row(a, "Ship the planner")).toBeVisible();
    await page.keyboard.press(" ");
    await expect(row(a, "Ship the planner")).toHaveCount(0);

    // Fold state is per view: Project at Workspace folds on its own.
    await page.evaluate(() => window.fakeHost.setActiveProject(null));
    await expect(heading(a, "pomade")).toHaveAttribute("data-folded", "false");
    await a.getByTestId("view-project").click();
    await heading(a, "quiz").getByTestId("task-section-toggle").click();
    await expect(row(a, "Add dark mode")).toHaveCount(0);
    await a.getByTestId("view-today").click();
    await expect(heading(a, "quiz")).toHaveAttribute("data-folded", "false");
  });

  test("an item asked for from the panel unfolds its group in the tab", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    await heading(a, "pomade").getByTestId("task-section-toggle").click();
    await expect(row(a, "Ship the planner")).toHaveCount(0);
    await page.evaluate((r) => window.mounted?.navigate(r), `item?${new URLSearchParams({ path: "Tasks/Pomade/2026-11-16-ship-the-planner.md" }).toString()}`);
    await expect(a.getByTestId("item-pane")).toBeVisible();
    await expect(heading(a, "pomade")).toHaveAttribute("data-folded", "false");
    await expect(row(a, "Ship the planner")).toHaveAttribute("data-open", "true");
    // Folded again by hand, it stays folded with the item open.
    await heading(a, "pomade").getByTestId("task-section-toggle").click();
    await expect(heading(a, "pomade")).toHaveAttribute("data-folded", "true");
    await expect(row(a, "Ship the planner")).toHaveCount(0);
    await expect(a.getByTestId("item-pane")).toBeVisible();
  });
});
