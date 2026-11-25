// E-006 on the fake host (fake-host/, test/fixtures/workspace.ts `NOTES_FILES`): the day's daily
// note made from the template and pinned on Today with its progress, made once a day
// and never back-filled, unpinned for one day; pins per view and context; notes and thoughts in All
// (in Today only on their do-on day — planner-today-fake.spec.ts) with Resolve, Archive, Show archived and Restore; quick add's five types in the
// overlay and the panel; a type changed on disk; the full tab's excerpts; the template setting.
// The clock is the app's `test.clock` hook; the fixture is dated around Tue 2026-11-17.

import { expect, test, type FrameLocator, type Page } from "@playwright/test";

import { APP_PORT, HARNESS_PORT } from "../playwright.config";
import { DAILY_TEMPLATE, NOTES_FILES } from "../test/fixtures/workspace";
import { openQuickAdd, row, setClock, settled, titles } from "./fixtures/planner";
import { shot } from "./fixtures/screens";

const APP = `http://localhost:${APP_PORT}/`;
const SETTINGS = "Apps/pomade-planner/settings.json";
const NOW = "2026-11-17T10:00";

interface Open {
  surface: "tab" | "panel" | "overlay";
  icon?: string;
  route?: string;
  project?: string;
  panelWidth?: number;
  now?: string;
  /** The daily-note template's path; `null`: none set. */
  template?: string | null;
  manual?: boolean;
}

function harness(open: Open): string {
  const params = new URLSearchParams({ app: APP, surface: open.surface, tasks: "Tasks", now: open.now ?? NOW, fixture: "planner", extra: "notes", project: open.project ?? "workspace" });
  const template = open.template === undefined ? "Templates/Daily.md" : open.template;
  if (template !== null) params.set("template", template);
  for (const key of ["icon", "route", "panelWidth"] as const) {
    const value = open[key];
    if (value !== undefined) params.set(key, String(value));
  }
  if (open.manual) params.set("mount", "manual");
  return `http://localhost:${HARNESS_PORT}/index.html?${params.toString()}`;
}

const app = (page: Page): FrameLocator => page.frameLocator("#stage iframe >> nth=0");
const fileText = (page: Page, path: string) => page.evaluate((p) => window.fakeHost.readFile(p), path);
const exists = (page: Page, path: string) =>
  page.evaluate((p) => {
    try {
      window.fakeHost.readFile(p);
      return true;
    } catch {
      return false;
    }
  }, path);
const state = (page: Page, key: string) => page.evaluate((k) => window.fakeHost.state[k] ?? null, key);
const opened = (page: Page) => page.evaluate(() => window.fakeHost.openedTabs.at(-1) ?? null);

async function openPanel(page: Page, extra: Partial<Open> = {}): Promise<FrameLocator> {
  await page.goto(harness({ surface: "panel", icon: "planner", ...extra }));
  const a = app(page);
  await expect(a.getByTestId("view-planner-panel")).toBeVisible();
  await settled(a);
  return a;
}

/** The note the template makes on `day` — spelled out, not computed by the app's code. */
const fromTemplate = (day: string): string => DAILY_TEMPLATE.replace("---\ntags: [daily]\ntype: journal\n---\n", `---\ntype: daily-note\ndate: ${day}\ntags: [daily]\n---\n`);

test.describe("daily notes", () => {
  test("the first open of the day makes Daily/<day>.md from the template and pins it on the Workspace Today: title, date, 0/8; ticking lines shows 2/8; a click brings up the tab with it open", async ({ page }) => {
    const a = await openPanel(page);
    expect(await fileText(page, "Tasks/Daily/2026-11-17.md")).toBe(fromTemplate("2026-11-17"));
    expect(await state(page, "planner.dailyNoteDay")).toBe("2026-11-17");
    const card = a.getByTestId("daily-card");
    await expect(card).toBeVisible();
    await expect(a.getByTestId("pinned-list").locator(":scope > li").first()).toHaveAttribute("data-testid", "daily-card");
    await expect(a.getByTestId("daily-card-title")).toHaveText("Tue, Nov 17");
    await expect(a.getByTestId("daily-card-progress")).toHaveText("0/8");
    await shot(page, "e006-fake-today-daily-card");
    // Ticking two lines in the editor (a write on disk) shows within ~1 s.
    await page.evaluate((p) => window.fakeHost.writeFile(p, window.fakeHost.readFile(p).replace("- [ ] Review Today", "- [x] Review Today").replace("- [ ] Stretch", "- [X] Stretch")), "Tasks/Daily/2026-11-17.md");
    await expect(a.getByTestId("daily-card-progress")).toHaveText("2/8");
    await shot(page, "e006-fake-today-daily-card-progress");
    await a.getByTestId("daily-card-open").click();
    await expect.poll(() => opened(page)).toMatchObject({ kind: "app", route: "item?path=Tasks%2FDaily%2F2026-11-17.md" });
    // The note is never a Today row, nor in the Workspace count.
    expect(await titles(a)).not.toContain("Tue, Nov 17");
    await expect(a.getByTestId("count-today")).toHaveText("9");
  });

  test("without a template: the built-in note — date heading, empty checklist — and no progress yet", async ({ page }) => {
    const a = await openPanel(page, { template: null });
    expect(await fileText(page, "Tasks/Daily/2026-11-17.md")).toBe("---\ntype: daily-note\ndate: 2026-11-17\n---\n# Tuesday, November 17, 2026\n\n- [ ]\n");
    await expect(a.getByTestId("daily-card-title")).toHaveText("Tue, Nov 17");
    await expect(a.getByTestId("daily-card-progress")).toHaveCount(0);
  });

  test("made once a day: at 02:30 it is still Nov 16 (its note is there); 03:00 makes Nov 17's; a note deleted that day isn't made again by another open; days not opened get none", async ({ page }) => {
    const a = await openPanel(page, { now: "2026-11-17T02:30" });
    await expect(a.getByTestId("planner-day")).toHaveText("Mon, Nov 16");
    expect(await state(page, "planner.dailyNoteDay")).toBe("2026-11-16");
    await expect(a.getByTestId("daily-card-title")).toHaveText("Trip planning day");
    await expect(a.getByTestId("daily-card-progress")).toHaveText("1/2");
    expect(await exists(page, "Tasks/Daily/2026-11-17.md")).toBe(false);
    expect(await fileText(page, "Tasks/Daily/2026-11-16.md")).toBe(NOTES_FILES["Tasks/Daily/2026-11-16.md"]);

    // The boundary passes while the panel is open (the clock set just before it, the timer fires).
    await setClock(a, "2026-11-17T02:59:58");
    await expect(a.getByTestId("planner-day")).toHaveText("Tue, Nov 17", { timeout: 6_000 });
    await settled(a, "2026-11-17");
    expect(await fileText(page, "Tasks/Daily/2026-11-17.md")).toBe(fromTemplate("2026-11-17"));
    await expect(a.getByTestId("daily-card-title")).toHaveText("Tue, Nov 17");

    // Deleted, then the Planner opens again the same day: nothing new.
    await page.evaluate(() => window.fakeHost.deleteFile("Tasks/Daily/2026-11-17.md"));
    await expect(a.getByTestId("daily-card")).toHaveCount(0);
    await page.evaluate(() => {
      window.mounted?.close();
      window.mountNow();
    });
    await expect(app(page).getByTestId("view-planner-panel")).toBeVisible();
    await settled(app(page), "2026-11-17");
    expect(await exists(page, "Tasks/Daily/2026-11-17.md")).toBe(false);

    // Three days later: only that day's note — none for the days between.
    await setClock(app(page), "2026-11-20T09:00");
    expect(await exists(page, "Tasks/Daily/2026-11-20.md")).toBe(true);
    expect(await exists(page, "Tasks/Daily/2026-11-18.md")).toBe(false);
    expect(await exists(page, "Tasks/Daily/2026-11-19.md")).toBe(false);
  });

  test("a note already there is kept as it is; the overlay never makes one", async ({ page }) => {
    await page.goto(harness({ surface: "overlay", route: "quick-add", manual: true }));
    await page.evaluate(() => window.mountNow());
    await expect(app(page).getByTestId("qa-title")).toBeFocused();
    expect(await exists(page, "Tasks/Daily/2026-11-17.md")).toBe(false);
    await page.goto(harness({ surface: "panel", icon: "planner", manual: true }));
    await page.evaluate(() => window.fakeHost.writeFile("Tasks/Daily/2026-11-17.md", "---\ntype: daily-note\ndate: 2026-11-17\n---\nMine.\n- [x] done\n"));
    await page.evaluate(() => window.mountNow());
    await settled(app(page), "2026-11-17");
    expect(await fileText(page, "Tasks/Daily/2026-11-17.md")).toBe("---\ntype: daily-note\ndate: 2026-11-17\n---\nMine.\n- [x] done\n");
    await expect(app(page).getByTestId("daily-card-progress")).toHaveText("1/1");
  });

  test("unpinning holds for the day; the next day's note is pinned again", async ({ page }) => {
    const a = await openPanel(page);
    await a.getByTestId("daily-card-unpin").click();
    await expect(a.getByTestId("daily-card")).toHaveCount(0);
    expect(await state(page, "planner.dailyNoteUnpinned")).toBe("2026-11-17");
    await setClock(a, "2026-11-17T23:00");
    await expect(a.getByTestId("daily-card")).toHaveCount(0);
    await setClock(a, "2026-11-18T08:00");
    await expect(a.getByTestId("daily-card-title")).toHaveText("Wed, Nov 18");
  });

  test("All with the Daily notes type: every daily note, newest first, with its progress", async ({ page }) => {
    const a = await openPanel(page);
    await a.getByTestId("view-all").click();
    expect(await titles(a)).not.toContain("Tue, Nov 17");
    await a.getByTestId("filter-types").click();
    await a.locator('[data-testid="filter-option"][data-key="daily-note"]').click();
    await page.keyboard.press("Escape");
    expect(await titles(a)).toEqual(["Tue, Nov 17", "Trip planning day", "Sun, Nov 15"]);
    await expect(row(a, "Sun, Nov 15").getByTestId("hint-progress")).toHaveText("2/3");
    await expect(row(a, "Tue, Nov 17").getByTestId("hint-reason")).toHaveText("Today");
    await expect(row(a, "Tue, Nov 17").getByTestId("task-kind")).toBeVisible();
    await expect(row(a, "Tue, Nov 17").getByTestId("task-check")).toHaveCount(0);
    await shot(page, "e006-fake-all-daily-notes");
  });
});

test.describe("notes and thoughts", () => {
  test("with no do-on, never in Today; in Project under Notes and thoughts; in All with the type filter, each with its glyph and no checkbox", async ({ page }) => {
    const a = await openPanel(page);
    for (const title of ["Quiz timer idea", "Why do I sleep badly on Sundays?", "Does QuizLab need a leaderboard?"]) await expect(row(a, title)).toHaveCount(0);
    await a.getByTestId("view-project").click();
    await expect(row(a, "Quiz timer idea")).toHaveAttribute("data-type", "note");
    await expect(row(a, "Is a standing desk worth it?")).toHaveCount(0);
    await a.getByTestId("view-all").click();
    await expect(row(a, "Quiz timer idea")).toHaveAttribute("data-type", "note");
    await expect(row(a, "Why do I sleep badly on Sundays?")).toHaveAttribute("data-type", "thought");
    await expect(row(a, "Quiz timer idea").getByTestId("task-check")).toHaveCount(0);
    await expect(row(a, "Quiz timer idea").getByTestId("hint-created")).toHaveText("added Nov 12");
    await expect(row(a, "Is a standing desk worth it?")).toHaveCount(0);
    await expect(row(a, "Old idea: a podcast")).toHaveCount(0);
    await shot(page, "e006-fake-all-notes-thoughts");
    await a.getByTestId("filter-types").click();
    await a.locator('[data-testid="filter-option"][data-key="thought"]').click();
    await page.keyboard.press("Escape");
    expect(await titles(a)).toEqual(["Does QuizLab need a leaderboard?", "Why do I sleep badly on Sundays?"]);
    await shot(page, "e006-fake-all-thoughts-filter");
  });

  test("Resolve writes status: resolved and done-on, field-only; the thought leaves All unless Show done; Reopen undoes it byte for byte", async ({ page }) => {
    const a = await openPanel(page);
    await a.getByTestId("view-all").click();
    const path = "Tasks/2026-11-12-sleep.md";
    const before = await fileText(page, path);
    await row(a, "Why do I sleep badly on Sundays?").hover();
    await expect(row(a, "Why do I sleep badly on Sundays?").getByTestId("task-resolve")).toHaveCSS("opacity", "1");
    await shot(page, "e006-fake-thought-resolve-hover");
    await row(a, "Why do I sleep badly on Sundays?").getByTestId("task-resolve").click();
    await expect.poll(() => fileText(page, path)).toBe(before.replace("status: open", "status: resolved").replace("created: 2026-11-12\n", "created: 2026-11-12\ndone-on: 2026-11-17\n"));
    await expect(row(a, "Why do I sleep badly on Sundays?")).toHaveCount(0);
    await a.getByTestId("show-done").check();
    await expect(row(a, "Why do I sleep badly on Sundays?").getByTestId("hint-done")).toHaveText("resolved today");
    await shot(page, "e006-fake-thought-resolved");
    await row(a, "Why do I sleep badly on Sundays?").hover();
    await row(a, "Why do I sleep badly on Sundays?").getByTestId("task-reopen").click();
    await expect.poll(() => fileText(page, path)).toBe(before);
  });

  test("Archive moves a note into _archive/ (its sub-folder kept), out of All; Show archived brings it back greyed; Restore moves it back", async ({ page }) => {
    const a = await openPanel(page);
    await a.getByTestId("view-all").click();
    const from = "Tasks/QuizLab/2026-11-12-sound-effects.md";
    const text = await fileText(page, from);
    await row(a, "Sound effects").hover();
    await row(a, "Sound effects").getByTestId("task-archive").click();
    await expect.poll(() => exists(page, from)).toBe(false);
    expect(await fileText(page, "Tasks/_archive/QuizLab/2026-11-12-sound-effects.md")).toBe(text);
    await expect(row(a, "Sound effects")).toHaveCount(0);
    await a.getByTestId("show-archived").check();
    await expect(row(a, "Sound effects")).toHaveClass(/task-row--archived/);
    await expect(row(a, "Sound effects").getByTestId("hint-archived")).toHaveText("archived");
    await expect(row(a, "Old idea: a podcast")).toBeVisible();
    await shot(page, "e006-fake-show-archived");
    await row(a, "Sound effects").hover();
    await row(a, "Sound effects").getByTestId("task-restore").click();
    await expect.poll(() => exists(page, from)).toBe(true);
    expect(await fileText(page, from)).toBe(text);
  });

  test("changing type: in the file re-renders the item as the new type within ~1 s", async ({ page }) => {
    const a = await openPanel(page);
    await expect(row(a, "Call the dentist")).toBeVisible();
    await page.evaluate((p) => window.fakeHost.writeFile(p, window.fakeHost.readFile(p).replace("type: task", "type: thought")), "Tasks/2026-11-15-call-the-dentist.md");
    await expect(row(a, "Call the dentist")).toHaveCount(0, { timeout: 1_500 });
    await a.getByTestId("view-all").click();
    await expect(row(a, "Call the dentist")).toHaveAttribute("data-type", "thought");
    await page.evaluate((p) => window.fakeHost.writeFile(p, window.fakeHost.readFile(p).replace("type: thought", "type: task")), "Tasks/2026-11-15-call-the-dentist.md");
    await expect(row(a, "Call the dentist")).toHaveAttribute("data-type", "task", { timeout: 1_500 });
  });
});

test.describe("pins", () => {
  test("a task pinned in QuizLab's Project view stays on top there only — not in Today, not in Pomade, not at Workspace; several in pin order", async ({ page }) => {
    const a = await openPanel(page, { project: "quiz" });
    await a.getByTestId("view-project").click();
    const notes = ["Does QuizLab need a leaderboard?", "Sound effects"];
    expect(await titles(a)).toEqual(["Fix the score screen", "Add dark mode", ...notes]);
    await row(a, "Add dark mode").hover();
    await row(a, "Add dark mode").getByTestId("task-pin").click();
    await expect(a.getByTestId("pinned-list").getByTestId("task-title")).toHaveText(["Add dark mode"]);
    await expect(row(a, "Add dark mode").getByTestId("pinned-mark")).toBeVisible();
    expect(await titles(a)).toEqual(["Add dark mode", "Fix the score screen", ...notes]);
    await row(a, "Fix the score screen").hover();
    await row(a, "Fix the score screen").getByTestId("task-pin").click();
    await expect(a.getByTestId("pinned-list").getByTestId("task-title")).toHaveText(["Add dark mode", "Fix the score screen"]);
    await page.mouse.move(0, 0);
    await shot(page, "e006-fake-pins-project");
    expect(await state(page, "planner.pins.quiz")).toEqual({ today: [], project: ["Tasks/QuizLab/2026-11-14-add-dark-mode.md", "Tasks/QuizLab/2026-11-14-fix-the-score-screen.md"], recurring: [], all: [] });

    await a.getByTestId("view-today").click();
    await expect(a.getByTestId("daily-card")).toBeVisible();
    await expect(a.getByTestId("pinned-list").getByTestId("task-row")).toHaveCount(0);
    await page.evaluate(() => window.fakeHost.setActiveProject("pomade"));
    await a.getByTestId("view-project").click();
    await expect(a.getByTestId("pinned-list")).toHaveCount(0);
    await page.evaluate(() => window.fakeHost.setActiveProject(null));
    await expect(a.getByTestId("planner-context")).toHaveAttribute("data-tip", "Tasks/");
    await a.getByTestId("view-project").click();
    await expect(row(a, "Add dark mode")).not.toHaveAttribute("data-pinned", "true");
    await expect(a.getByTestId("pinned-list")).toHaveCount(0);

    // Back in QuizLab: still pinned; unpinning puts it back in list order.
    await page.evaluate(() => window.fakeHost.setActiveProject("quiz"));
    await expect(a.getByTestId("view-today")).toHaveAttribute("aria-selected", "true");
    await a.getByTestId("view-project").click();
    await expect(a.getByTestId("pinned-list").getByTestId("task-title")).toHaveText(["Add dark mode", "Fix the score screen"]);
    await row(a, "Add dark mode").hover();
    await row(a, "Add dark mode").getByTestId("task-pin").click();
    await expect(a.getByTestId("pinned-list").getByTestId("task-title")).toHaveText(["Fix the score screen"]);
  });

  test("a pinned row on the grouped Workspace Today stands above the headings with its project", async ({ page }) => {
    const a = await openPanel(page);
    await row(a, "Fix the score screen").hover();
    await row(a, "Fix the score screen").getByTestId("task-pin").click();
    await expect(a.getByTestId("pinned-list").locator(":scope > li")).toHaveCount(2);
    await expect(a.getByTestId("pinned-list").getByTestId("hint-source")).toHaveText("QuizLab");
    await page.mouse.move(0, 0);
    await shot(page, "e006-fake-pins-workspace-today");
  });

  test("a narrow panel (160px and 240px) fits the daily card, pinned rows and the actions without overflow", async ({ page }) => {
    for (const width of [160, 240]) {
      const a = await openPanel(page, { panelWidth: width });
      await row(a, "Pay the tax").hover();
      await row(a, "Pay the tax").getByTestId("task-pin").click();
      await expect(a.getByTestId("pinned-list").getByTestId("task-title")).toHaveText(["Pay the tax"]);
      await row(a, "Pay the tax").hover();
      const overflow = await a.locator("main").evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await shot(page, `e006-fake-narrow-${width}`);
    }
  });
});

test.describe("quick add's five types", () => {
  const OVERLAY: Open = { surface: "overlay", route: "quick-add" };

  test("the overlay: a note and a thought are written with their type's frontmatter — a do-on when one is given, no other date", async ({ page }) => {
    for (const [type, title, doOn] of [
      ["note", "Buy a new lamp for the desk", "tomorrow"],
      ["thought", "Should Nora start piano?", ""],
    ] as const) {
      await page.goto(harness(OVERLAY));
      const a = app(page);
      await expect(a.getByTestId("qa-title")).toBeFocused();
      await page.keyboard.type(title);
      await a.getByTestId(`qa-type-${type}`).check();
      await expect(a.getByTestId("qa-do-on")).toBeVisible();
      await expect(a.getByTestId("qa-deadline")).toHaveCount(0);
      await expect(a.getByTestId("qa-importance")).toHaveCount(0);
      await a.getByTestId("qa-do-on").fill(doOn);
      await shot(page, `e006-fake-quick-add-${type}-overlay`);
      await a.getByTestId("qa-title").press("Enter");
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "");
      await expect
        .poll(() => fileText(page, `Tasks/2026-11-17-${slug}.md`).catch(() => null))
        .toBe(`---\ntype: ${type}\ntitle: ${title}\nstatus: open\n${doOn === "" ? "" : "do-on: 2026-11-18\n"}created: 2026-11-17\n---\n`);
    }
  });

  test("the overlay's Daily: opens today's note, making it from the template when it isn't there", async ({ page }) => {
    await page.goto(harness(OVERLAY));
    const a = app(page);
    await a.getByTestId("qa-type-daily-note").check();
    await expect(a.getByTestId("qa-title")).toBeDisabled();
    await expect(a.getByTestId("qa-where")).toHaveText("Tasks/Daily/2026-11-17.md");
    await shot(page, "e006-fake-quick-add-daily-overlay");
    await a.getByTestId("qa-type-daily-note").press("Enter");
    await expect.poll(() => fileText(page, "Tasks/Daily/2026-11-17.md").catch(() => null)).toBe(fromTemplate("2026-11-17"));
    await expect.poll(() => opened(page)).toMatchObject({ kind: "file", path: "Tasks/Daily/2026-11-17.md" });
  });

  test("the overlay: the frame takes every type's form, nothing scrolls; Tab, then arrows walk the five types", async ({ page }) => {
    await page.goto(harness(OVERLAY));
    const a = app(page);
    await expect(a.getByTestId("qa-title")).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(a.getByTestId("qa-type-task")).toBeFocused();
    for (const type of ["recurring", "note", "thought", "daily-note"]) {
      await page.keyboard.press("ArrowRight");
      await expect(a.getByTestId(`qa-type-${type}`)).toBeChecked();
      await expect.poll(() => a.locator("form").evaluate((el) => el.getBoundingClientRect().height === window.innerHeight && el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    await shot(page, "e006-fake-quick-add-type-switch");
  });

  test("the panel's +: a thought from quick add over the active tab", async ({ page }) => {
    const a = await openPanel(page);
    const o = await openQuickAdd(page, a);
    await page.keyboard.type("Is it time for a new bike?");
    await o.getByTestId("qa-type-thought").check();
    await shot(page, "e006-fake-quick-add-thought-from-panel");
    await o.getByTestId("qa-title").press("Enter");
    await expect(page.locator('iframe[data-surface="overlay"]')).toHaveCount(0);
    await expect(a.getByTestId("planner-add")).toBeFocused();
    await expect.poll(() => exists(page, "Tasks/2026-11-17-is-it-time-for-a-new-bike.md")).toBe(true);
  });
});

test.describe("full tab and settings", () => {
  test("the tab shows the same views with each row's description excerpt; it makes no daily note itself", async ({ page }) => {
    await page.goto(harness({ surface: "tab", route: "planner" }));
    const a = app(page);
    await expect(a.getByTestId("view-planner-tab")).toBeVisible();
    await settled(a);
    await a.getByTestId("view-all").click();
    await expect(row(a, "Quiz timer idea").getByTestId("task-excerpt")).toHaveText("A countdown on every question — red in the last five seconds, then the answer slides in.");
    await expect(row(a, "Gift ideas for Greta").getByTestId("task-excerpt")).toHaveText("the blue scarf from the market · tickets to the opera");
    await expect(row(a, "Pay the tax").getByTestId("task-excerpt")).toHaveCount(0);
    await a.getByTestId("filter-types").click();
    await a.locator('[data-testid="filter-option"][data-key="note"]').click();
    await a.locator('[data-testid="filter-option"][data-key="thought"]').click();
    await page.keyboard.press("Escape");
    await expect(row(a, "Pay the tax")).toHaveCount(0);
    await shot(page, "e006-fake-tab-excerpts");
    await a.getByTestId("view-today").click();
    // The tab makes no daily note — the launch panel frame does; the note it made shows here.
    expect(await exists(page, "Tasks/Daily/2026-11-17.md")).toBe(false);
    await expect(a.getByTestId("daily-card")).toHaveCount(0);
    await page.evaluate((note) => window.fakeHost.writeFile("Tasks/Daily/2026-11-17.md", note), fromTemplate("2026-11-17"));
    await expect(a.getByTestId("daily-card")).toBeVisible();
    await shot(page, "e006-fake-tab-today");
  });

  test("the panel's Open in tab opens the Planner tab", async ({ page }) => {
    const a = await openPanel(page);
    await a.getByTestId("planner-open-tab").click();
    await expect.poll(() => opened(page)).toMatchObject({ kind: "app", route: "planner" });
  });

  test("settings: the template field refuses a path that isn't a readable .md file, saves one that is; a template gone later is named, and notes use the built-in one", async ({ page }) => {
    await page.goto(harness({ surface: "tab", route: "settings", template: null }));
    const a = app(page);
    await expect(a.getByTestId("planner-settings-page")).toBeVisible();
    const field = a.getByTestId("settings-template");
    await expect(field).toHaveValue("");
    await field.fill("/etc/daily.md");
    await field.press("Enter");
    await expect(a.getByTestId("settings-template-error")).toHaveText("A path inside the workspace, like Templates/Daily.md.");
    await field.fill("Templates/Daily");
    await field.press("Enter");
    await expect(a.getByTestId("settings-template-error")).toHaveText("A Markdown file — its name ends in .md.");
    await field.fill("Templates/Nope.md");
    await field.press("Enter");
    await expect(a.getByTestId("settings-template-error")).toHaveText("No file can be read at Templates/Nope.md — it isn't there.");
    await shot(page, "e006-fake-settings-template-error");
    await field.fill("Templates/Daily.md");
    await field.press("Enter");
    await expect(a.getByTestId("settings-saved")).toHaveText("Daily note template saved.");
    expect(JSON.parse(await fileText(page, SETTINGS))).toEqual({ tasksRoot: "Tasks", dailyNoteTemplate: "Templates/Daily.md" });
    await shot(page, "e006-fake-settings-template");

    await page.goto(harness({ surface: "tab", route: "settings", manual: true }));
    await page.evaluate(() => window.fakeHost.deleteFile("Templates/Daily.md"));
    await page.evaluate(() => window.mountNow());
    await expect(app(page).getByTestId("settings-template-problem")).toHaveText("Can't use Templates/Daily.md: it isn't there. New daily notes use the built-in template until it can be read.");
    await shot(page, "e006-fake-settings-template-missing");
    // Emptied, the setting goes and the built-in template stands.
    await app(page).getByTestId("settings-template").fill("");
    await app(page).getByTestId("settings-template").press("Enter");
    await expect(app(page).getByTestId("settings-saved")).toHaveText("Daily notes use the built-in template.");
    expect(JSON.parse(await fileText(page, SETTINGS))).toEqual({ tasksRoot: "Tasks" });
  });

  test("settings: Choose… offers .md files of the whole workspace and saves the pick; Cancel changes nothing; Clear returns to none", async ({ page }) => {
    await page.goto(harness({ surface: "tab", route: "settings", template: null, manual: true }));
    await page.evaluate((t) => window.fakeHost.writeFile("Templates/Morning.md", t), DAILY_TEMPLATE);
    await page.evaluate(() => window.mountNow());
    const a = app(page);
    await expect(a.getByTestId("settings-template")).toHaveValue("");
    await expect(a.getByTestId("settings-template-clear")).toHaveCount(0);
    await shot(page, "t020-fake-settings-template-none");

    // Cancel: nothing changes, nothing is written. The picker is bound to no folder — not the tasks folder.
    const before = await fileText(page, SETTINGS);
    await page.evaluate(() => window.fakeHost.answerPick(null));
    await a.getByTestId("settings-template-choose").click();
    await expect.poll(() => page.evaluate(() => window.fakeHost.pickRequests.length)).toBe(1);
    expect(await page.evaluate(() => window.fakeHost.pickRequests[0])).toEqual({ kind: "file", root: "", initial: "", extensions: ["md"] });
    await expect(a.getByTestId("settings-template")).toHaveValue("");
    await expect(a.getByTestId("settings-saved")).toHaveCount(0);
    expect(await fileText(page, SETTINGS)).toBe(before);

    // A pick outside the tasks folder fills the field and saves — over what was typed and not yet saved.
    await a.getByTestId("settings-template").fill("Templates/Typed.md");
    await page.evaluate(() => window.fakeHost.answerPick("Templates/Morning.md"));
    await a.getByTestId("settings-template-choose").click();
    await expect(a.getByTestId("settings-template")).toHaveValue("Templates/Morning.md");
    await expect(a.getByTestId("settings-saved")).toHaveText("Daily note template saved.");
    expect(JSON.parse(await fileText(page, SETTINGS))).toEqual({ tasksRoot: "Tasks", dailyNoteTemplate: "Templates/Morning.md" });
    await expect(a.getByTestId("settings-template-error")).toHaveCount(0);
    await shot(page, "t020-fake-settings-template-chosen");

    // Clear: no template; the built-in one stands.
    await a.getByTestId("settings-template-clear").click();
    await expect(a.getByTestId("settings-saved")).toHaveText("Daily notes use the built-in template.");
    await expect(a.getByTestId("settings-template")).toHaveValue("");
    await expect(a.getByTestId("settings-template-clear")).toHaveCount(0);
    expect(JSON.parse(await fileText(page, SETTINGS))).toEqual({ tasksRoot: "Tasks" });
  });

  test("settings: a template picked outside the tasks folder makes the next daily note", async ({ page }) => {
    await page.goto(harness({ surface: "tab", route: "settings", template: null }));
    await page.evaluate((t) => window.fakeHost.writeFile("Templates/Morning.md", t), DAILY_TEMPLATE);
    const a = app(page);
    await page.evaluate(() => window.fakeHost.answerPick("Templates/Morning.md"));
    await a.getByTestId("settings-template-choose").click();
    await expect(a.getByTestId("settings-saved")).toHaveText("Daily note template saved.");
    expect(await exists(page, "Tasks/Daily/2026-11-17.md")).toBe(false);

    // The launch frame opens that day: its note is the picked file's text.
    await page.evaluate(() => {
      window.mounted?.close();
      window.mountNow({ surface: "panel", icon: "planner" });
    });
    await expect(app(page).getByTestId("view-planner-panel")).toBeVisible();
    await settled(app(page), "2026-11-17");
    expect(await fileText(page, "Tasks/Daily/2026-11-17.md")).toBe(fromTemplate("2026-11-17"));
    await expect(app(page).getByTestId("daily-card-progress")).toHaveText("0/8");
    await shot(page, "t020-fake-daily-from-picked-template");
  });

  test("settings: a file picker that fails says so under the field; a typed path still saves", async ({ page }) => {
    await page.goto(harness({ surface: "tab", route: "settings", template: null }));
    await page.evaluate(() => {
      type Frame = { post(message: unknown): void };
      const fake = window.fakeHost as unknown as { answer(frame: Frame, call: { id: string; method: string }): void };
      const answer = fake.answer.bind(fake);
      fake.answer = (frame, call) => {
        if (call.method !== "files.pickFile") return answer(frame, call);
        frame.post({ channel: "pomade", type: "result", id: call.id, ok: false, error: { code: "io-error", message: "the dialog didn't open" } });
      };
    });
    const a = app(page);
    await a.getByTestId("settings-template-choose").click();
    await expect(a.getByTestId("settings-template-error")).toHaveText("Couldn't open the file picker: the dialog didn't open");
    await expect(a.getByTestId("settings-template-choose")).toBeVisible();
    await a.getByTestId("settings-template").fill("Templates/Daily.md");
    await a.getByTestId("settings-template").press("Enter");
    await expect(a.getByTestId("settings-saved")).toHaveText("Daily note template saved.");
    await expect(a.getByTestId("settings-template-error")).toHaveCount(0);
    expect(JSON.parse(await fileText(page, SETTINGS))).toEqual({ tasksRoot: "Tasks", dailyNoteTemplate: "Templates/Daily.md" });
  });
});
