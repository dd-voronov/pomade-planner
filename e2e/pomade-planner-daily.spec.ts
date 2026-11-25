// E-006's acceptance in a real Pomade ($POMADE_DIR, e2e/fixtures/pomade.ts) with the app installed
// into the fixture's user data, on real files in To-dos/: the daily note made from the template at
// the first Pomade start after 03:00 (the Planner's hidden launch frame) and pinned with its progress, ticked in Pomade's editor,
// nothing new on a relaunch the same day, no note for the days Pomade wasn't opened; a thought from
// the overlay, resolved; a note archived; a task pinned in QuizLab's Project view; the daily note
// unpinned for a day; `type:` changed in Pomade's editor; "Open in tab" on the same view; the
// template setting; `pomade-planner today` naming the note. The Planner's clock is its
// `test.clock` hook, seeded into the app state before the first launch so the Planner never runs
// on the Mac's own day.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { expect, test, type ElectronApplication, type FrameLocator, type Page } from "@playwright/test";

import { DAILY_TEMPLATE } from "../test/fixtures/workspace";
import { frameShown } from "./fixtures/frames";
import { row, setClock, settled, titles } from "./fixtures/planner";
import { APP_VERSION, POMADE_BIN, createPomadeFixture, launchPomade, panelShown, pomadeEnv, type PomadeFixture } from "./fixtures/pomade";
import { shot } from "./fixtures/screens";

const DIST = resolve(import.meta.dirname, "../dist/planner");
const INSTALL_SCRIPT = resolve(import.meta.dirname, "../scripts/install-app.mjs");
const ICON = "strip-app-pomade-planner-planner";
const PANEL = '[data-testid="panel-frame-app-pomade-planner-planner"]';
const OVERLAY = '[data-testid="overlay-frame-pomade-planner"]';
const TAB = '[data-testid="app-frame-pomade-planner"]:visible';
const TODOS = "To-dos";
const SETTINGS = "Apps/pomade-planner/settings.json";

const task = (title: string, extra = ""): string => `---\ntype: task\ntitle: ${title}\nstatus: open\n${extra}created: 2026-11-07\n---\n`;

const FILES: Record<string, string> = {
  "2026-11-07-pay-the-tax.md": task("Pay the tax", "deadline: 2026-11-14\n"),
  "2026-11-07-call-the-dentist.md": task("Call the dentist", "do-on: 2026-11-10\n"),
  "2026-11-07-quiz-timer-idea.md": "---\ntype: note\ntitle: Quiz timer idea\nstatus: open\ncreated: 2026-11-07\n---\nA countdown on every question.\n",
  "QuizLab/2026-11-07-fix-login-bug.md": task("Fix login bug", "do-on: 2026-11-09\n"),
  "QuizLab/2026-11-07-add-dark-mode.md": task("Add dark mode"),
  "QuizLab/2026-11-07-sound-effects.md": "---\ntype: note\ntitle: Sound effects\nstatus: open\ncreated: 2026-11-07\n---\nShort and soft.\n",
  // The last day Pomade ran before this: Saturday, Nov 7.
  "Daily/2026-11-07.md": "---\ntype: daily-note\ndate: 2026-11-07\n---\n# Saturday, November 7, 2026\n\n- [x] Market\n",
};

/** The note the template makes on `day` — spelled out, not computed by the app's code. */
const fromTemplate = (day: string): string => DAILY_TEMPLATE.replace("---\ntags: [daily]\ntype: journal\n---\n", `---\ntype: daily-note\ndate: ${day}\ntags: [daily]\n---\n`);

/** A shell's environment outside Pomade: nothing of Pomade's — the shim sets its own POMADE_HOME. */
function shellEnv(): Record<string, string> {
  return Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined && !e[0].startsWith("POMADE_") && e[0] !== "ELECTRON_RUN_AS_NODE"));
}

test.describe("daily notes, notes, thoughts and pins in a real Pomade", () => {
  test.describe.configure({ mode: "serial" });
  let fixture: PomadeFixture;
  let app: ElectronApplication | undefined;
  let page: Page;
  const abs = (rel: string) => join(fixture.workspaceRoot, rel);
  const todo = (name: string) => abs(`${TODOS}/${name}`);
  const text = (name: string) => readFile(todo(name), "utf8");
  const there = (name: string) => stat(todo(name)).then(
    () => true,
    () => false,
  );
  const daily = async () => (await readdir(todo("Daily"))).sort();
  const panel = (): FrameLocator => page.frameLocator(PANEL);
  const quiz = () => fixture.projects.quizlab ?? "";

  async function launch(): Promise<void> {
    ({ app, page } = await launchPomade(fixture));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1400, 900));
    await page.getByTestId("project-__workspace__").click();
  }

  async function quit(): Promise<void> {
    await app?.close();
    app = undefined;
  }

  async function openPanel(): Promise<FrameLocator> {
    if ((await page.getByTestId(ICON).getAttribute("aria-pressed")) !== "true") await page.getByTestId(ICON).click();
    await panelShown(page, ICON);
    await expect(panel().getByTestId("view-planner-panel")).toBeVisible();
    await settled(panel());
    return panel();
  }

  /**
   * Wait until the Planner hears changes on disk: a change in the first moments after Pomade
   * starts watching can go unreported (FSEvents), so a probe file is written until it shows, then
   * removed.
   */
  async function watchLive(p: FrameLocator): Promise<void> {
    const probe = "2026-11-10-watch-probe.md";
    await expect(async () => {
      await writeFile(todo(probe), `---\ntype: task\ntitle: Watch probe\nstatus: open\ndo-on: 2026-11-10\ncreated: 2026-11-10\n---\n`);
      await expect(row(p, "Watch probe")).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await rm(todo(probe));
    await expect(row(p, "Watch probe")).toHaveCount(0);
  }

  /** The visible editor in raw mode (its toggle flips raw ↔ live). */
  async function rawMode(): Promise<void> {
    const toggle = page.locator('[data-testid="mode-toggle"]:visible');
    await expect(toggle).toBeVisible();
    if ((await toggle.getAttribute("data-mode")) !== "raw") await toggle.click();
    await expect(toggle).toHaveAttribute("data-mode", "raw");
  }

  /** The Planner's clock, as the `test.clock` hook stores it, at `local` — written before Pomade starts. */
  async function seedState(local: string, values: Record<string, unknown>): Promise<void> {
    const dir = join(fixture.userDataDir, "app-state/pomade-planner");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "state.json"), JSON.stringify({ "test.clock": { offsetMs: new Date(local).getTime() - Date.now() }, ...values }));
  }

  test.beforeAll(async () => {
    fixture = await createPomadeFixture([
      { key: "alpha", name: "Alpha", root: "Projects/alpha", files: { "README.md": "# Alpha\n" } },
      { key: "quizlab", name: "QuizLab", root: "Projects/QuizLab", files: { "README.md": "# QuizLab\n" } },
    ]);
    await mkdir(abs("Apps/pomade-planner"), { recursive: true });
    await writeFile(
      abs(SETTINGS),
      `${JSON.stringify({ tasksRoot: TODOS, dailyNoteTemplate: "Templates/Daily.md", projectFolders: { [quiz()]: { folder: "QuizLab", name: "QuizLab", groupPath: [] } } }, null, 2)}\n`,
    );
    await mkdir(abs("Templates"), { recursive: true });
    await writeFile(abs("Templates/Daily.md"), DAILY_TEMPLATE);
    for (const [name, content] of Object.entries(FILES)) {
      await mkdir(join(todo(name), ".."), { recursive: true });
      await writeFile(todo(name), content);
    }
    const out = execFileSync(process.execPath, [INSTALL_SCRIPT, DIST], { env: pomadeEnv(fixture, { POMADE_BIN }), encoding: "utf8" });
    expect(out).toContain(`Planner ${APP_VERSION} (pomade-planner)`);
    // Tuesday, Nov 10, 07:30 — Pomade last ran on Saturday the 7th.
    await seedState("2026-11-10T07:30", { "planner.dailyNoteDay": "2026-11-07" });
    await launch();
  });

  test.afterAll(async () => {
    await app?.close();
    await fixture.cleanup();
  });

  test("the first Pomade start after 03:00 makes Daily/2026-11-10.md from the template — the Planner not opened yet — and pins it on the Workspace Today with “0/8”; none for the days Pomade wasn't opened", async () => {
    // Pomade is open, the Planner isn't: its launch panel frame, hidden, made the note.
    await expect.poll(daily).toEqual(["2026-11-07.md", "2026-11-10.md"]);
    await expect(page.locator(PANEL)).toBeHidden();
    const p = await openPanel();
    await expect(p.getByTestId("planner-day")).toHaveText("Tue, Nov 10");
    expect(await text("Daily/2026-11-10.md")).toBe(fromTemplate("2026-11-10"));
    expect(await daily()).toEqual(["2026-11-07.md", "2026-11-10.md"]);
    await expect(p.getByTestId("daily-card-title")).toHaveText("Tue, Nov 10");
    await expect(p.getByTestId("daily-card-progress")).toHaveText("0/8");
    expect(await titles(p)).toEqual(["Call the dentist", "Fix login bug"]);
    await shot(page, "e006-pomade-today-daily-card");
  });

  test("ticking two lines in Pomade's editor shows “2/8”", async () => {
    const p = await openPanel();
    await p.getByTestId("daily-card-open").click({ modifiers: ["Meta"] });
    await expect(page.getByTestId("tabstrip").getByRole("tab", { name: /2026-11-10/, selected: true })).toBeVisible();
    const boxes = page.locator('[data-testid="live-task-checkbox"]:visible');
    await expect(boxes).toHaveCount(8);
    await boxes.nth(0).click();
    await boxes.nth(4).click();
    await page.keyboard.press("Meta+s");
    const ticked = fromTemplate("2026-11-10").replace("- [ ] Review Today", "- [x] Review Today").replace("- [ ] One deep-work block", "- [x] One deep-work block");
    await expect.poll(() => text("Daily/2026-11-10.md")).toBe(ticked);
    await expect(p.getByTestId("daily-card-progress")).toHaveText("2/8", { timeout: 1_500 });
    await shot(page, "e006-pomade-daily-note-ticked");
  });

  test("reopening Pomade the same day makes nothing new — not even when the note was deleted meanwhile", async () => {
    const before = await stat(todo("Daily/2026-11-10.md"));
    await quit();
    await launch();
    let p = await openPanel();
    await expect(p.getByTestId("daily-card-progress")).toHaveText("2/8");
    expect(await daily()).toEqual(["2026-11-07.md", "2026-11-10.md"]);
    expect((await stat(todo("Daily/2026-11-10.md"))).mtimeMs).toBe(before.mtimeMs);

    // Deleted while Pomade is closed: the next launch the same day doesn't make it again.
    const kept = await text("Daily/2026-11-10.md");
    await quit();
    await rm(todo("Daily/2026-11-10.md"));
    await launch();
    p = await openPanel();
    await expect(p.getByTestId("planner-day")).toHaveText("Tue, Nov 10");
    expect(await daily()).toEqual(["2026-11-07.md"]);
    await expect(p.getByTestId("daily-card")).toHaveCount(0);
    await watchLive(p);
    await writeFile(todo("Daily/2026-11-10.md"), kept);
    await expect(p.getByTestId("daily-card-progress")).toHaveText("2/8", { timeout: 1_500 });
  });

  test("⌘⇧A → Thought with no day creates a thought that appears in All but not in Today; “Resolve” marks it resolved", async () => {
    const p = await openPanel();
    await page.keyboard.press("Meta+Shift+A");
    await expect(page.getByTestId("app-overlay")).toBeVisible();
    const overlay = page.frameLocator(OVERLAY);
    await expect(overlay.getByTestId("qa-title")).toBeFocused();
    await page.keyboard.type("Should Nora start piano?");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    await expect(overlay.getByTestId("qa-type-thought")).toBeChecked();
    await expect(overlay.getByTestId("qa-do-on")).toHaveValue("");
    await expect(overlay.getByTestId("qa-deadline")).toHaveCount(0);
    await shot(page, "e006-pomade-quick-add-thought-overlay");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app-overlay")).toHaveCount(0);
    const name = "2026-11-10-should-nora-start-piano.md";
    await expect.poll(() => text(name).catch(() => null)).toBe("---\ntype: thought\ntitle: Should Nora start piano?\nstatus: open\ncreated: 2026-11-10\n---\n");

    await expect(row(p, "Should Nora start piano?")).toHaveCount(0);
    await p.getByTestId("view-all").click();
    await expect(row(p, "Should Nora start piano?")).toHaveAttribute("data-type", "thought");
    await row(p, "Should Nora start piano?").hover();
    await row(p, "Should Nora start piano?").getByTestId("task-resolve").click();
    await expect.poll(() => text(name)).toBe("---\ntype: thought\ntitle: Should Nora start piano?\nstatus: resolved\ncreated: 2026-11-10\ndone-on: 2026-11-10\n---\n");
    await expect(row(p, "Should Nora start piano?")).toHaveCount(0);
    await p.getByTestId("show-done").check();
    await expect(row(p, "Should Nora start piano?").getByTestId("hint-done")).toHaveText("resolved today");
    await shot(page, "e006-pomade-all-thought-resolved");
    await p.getByTestId("show-done").uncheck();
  });

  test("⌘⇧A offers all five types; a note from it has its type's frontmatter", async () => {
    await openPanel();
    await page.keyboard.press("Meta+Shift+A");
    const overlay = page.frameLocator(OVERLAY);
    await expect(overlay.getByTestId("qa-title")).toBeFocused();
    await expect(overlay.locator('[data-testid^="qa-type-"]')).toHaveCount(5);
    await page.keyboard.type("Lamp for the desk");
    await overlay.getByTestId("qa-type-note").check();
    await shot(page, "e006-pomade-quick-add-note-overlay");
    await overlay.getByTestId("qa-type-note").press("Enter");
    await expect(page.getByTestId("app-overlay")).toHaveCount(0);
    await expect.poll(() => text("2026-11-10-lamp-for-the-desk.md").catch(() => null)).toBe("---\ntype: note\ntitle: Lamp for the desk\nstatus: open\ncreated: 2026-11-10\n---\n");
  });

  test("“Archive” on a note moves it into _archive/ (its sub-folder kept); it leaves All unless archived items are shown", async () => {
    const p = await openPanel();
    await p.getByTestId("view-all").click();
    const before = await text("QuizLab/2026-11-07-sound-effects.md");
    await row(p, "Sound effects").hover();
    await row(p, "Sound effects").getByTestId("task-archive").click();
    await expect.poll(() => there("QuizLab/2026-11-07-sound-effects.md")).toBe(false);
    expect(await text("_archive/QuizLab/2026-11-07-sound-effects.md")).toBe(before);
    await expect(row(p, "Sound effects")).toHaveCount(0);
    await p.getByTestId("show-archived").check();
    await expect(row(p, "Sound effects").getByTestId("hint-archived")).toHaveText("archived");
    await shot(page, "e006-pomade-all-show-archived");
    await p.getByTestId("show-archived").uncheck();
    await expect(row(p, "Sound effects")).toHaveCount(0);
  });

  test("pinning a task in QuizLab's Project view keeps it on top there only", async () => {
    await page.getByTestId(`project-${quiz()}`).click();
    const p = await openPanel();
    await p.getByTestId("view-project").click();
    expect(await titles(p)).toEqual(["Fix login bug", "Add dark mode"]);
    await row(p, "Add dark mode").hover();
    await row(p, "Add dark mode").getByTestId("task-pin").click();
    await expect(p.getByTestId("pinned-list").getByTestId("task-title")).toHaveText(["Add dark mode"]);
    expect(await titles(p)).toEqual(["Add dark mode", "Fix login bug"]);
    await page.mouse.move(700, 450);
    await shot(page, "e006-pomade-pins-project");
    // Not on Today, not at Workspace.
    await p.getByTestId("view-today").click();
    await expect(p.getByTestId("pinned-list").getByTestId("task-row")).toHaveCount(0);
    await page.getByTestId("project-__workspace__").click();
    await p.getByTestId("view-project").click();
    await expect(row(p, "Add dark mode")).toBeVisible();
    await expect(row(p, "Add dark mode")).not.toHaveAttribute("data-pinned", "true");
    await expect(p.getByTestId("pinned-list")).toHaveCount(0);
    // Back in QuizLab, still on top.
    await page.getByTestId(`project-${quiz()}`).click();
    await p.getByTestId("view-project").click();
    await expect(p.getByTestId("pinned-list").getByTestId("task-title")).toHaveText(["Add dark mode"]);
    await page.getByTestId("project-__workspace__").click();
    await p.getByTestId("view-today").click();
  });

  test("changing type: in Pomade's editor re-renders the item as the new type within ~1 s — a note planned for the day stays in Today", async () => {
    const p = await openPanel();
    await expect(row(p, "Call the dentist")).toBeVisible();
    await row(p, "Call the dentist").getByTestId("task-open").click({ modifiers: ["Meta"] });
    await rawMode();
    const line = page.locator('[data-testid="raw-editor"]:visible .cm-line').filter({ hasText: "type: task" });
    await line.click();
    await page.keyboard.press("End");
    for (let i = 0; i < 4; i++) await page.keyboard.press("Backspace");
    await page.keyboard.type("note");
    await page.keyboard.press("Meta+s");
    await expect.poll(() => text("2026-11-07-call-the-dentist.md")).toContain("type: note");
    const saved = Date.now();
    // Its do-on is the day: as a note it stays in Today, with its type's glyph in the checkbox's place.
    await expect(row(p, "Call the dentist")).toHaveAttribute("data-type", "note", { timeout: 1_500 });
    expect(Date.now() - saved).toBeLessThan(1_500);
    await expect(row(p, "Call the dentist").getByTestId("task-check")).toHaveCount(0);
    await p.getByTestId("view-all").click();
    await expect(row(p, "Call the dentist")).toHaveAttribute("data-type", "note");
    await p.getByTestId("view-today").click();
  });

  test("unpinning the daily note today brings it back tomorrow", async () => {
    const p = await openPanel();
    await expect(p.getByTestId("daily-card")).toBeVisible();
    await p.getByTestId("daily-card-unpin").click();
    await expect(p.getByTestId("daily-card")).toHaveCount(0);
    await shot(page, "e006-pomade-daily-unpinned");
    // Still unpinned after a restart the same day.
    await quit();
    await launch();
    let again = await openPanel();
    await expect(again.getByTestId("planner-day")).toHaveText("Tue, Nov 10");
    await expect(again.getByTestId("daily-card")).toHaveCount(0);
    // Tomorrow: the new day's note, pinned.
    await setClock(again, "2026-11-11T08:00");
    again = panel();
    await expect(again.getByTestId("daily-card-title")).toHaveText("Wed, Nov 11");
    expect(await text("Daily/2026-11-11.md")).toBe(fromTemplate("2026-11-11"));
  });

  test("Open in tab opens the Planner as a tab with the same view selected, rows with their excerpts; its settings page holds the template", async () => {
    const p = await openPanel();
    await p.getByTestId("view-all").click();
    await p.getByTestId("planner-open-tab").click();
    const tab = page.frameLocator(TAB);
    await expect(tab.getByTestId("view-planner-tab")).toBeVisible();
    // A tab just opened takes clicks only once Pomade has drawn it.
    await frameShown(page);
    await expect(tab.getByTestId("view-all")).toHaveAttribute("aria-selected", "true");
    await expect(row(tab, "Quiz timer idea").getByTestId("task-excerpt")).toHaveText("A countdown on every question.");
    await shot(page, "e006-pomade-full-tab-all");
    await tab.getByTestId("view-today").click();
    await expect(tab.getByTestId("daily-card-title")).toHaveText("Wed, Nov 11");
    await expect(p.getByTestId("view-today")).toHaveAttribute("aria-selected", "true");
    await shot(page, "e006-pomade-full-tab-today");

    await tab.getByTestId("planner-settings").click();
    const field = tab.getByTestId("settings-template");
    await expect(field).toHaveValue("Templates/Daily.md");
    await field.fill("Templates/Nope.md");
    await field.press("Enter");
    await expect(tab.getByTestId("settings-template-error")).toHaveText("No file can be read at Templates/Nope.md — it isn't there.");
    await shot(page, "e006-pomade-settings-template-error");
    await field.fill("Templates/Daily.md");
    await field.press("Enter");
    await expect(tab.getByTestId("settings-template-error")).toHaveCount(0);
    await tab.getByTestId("settings-back").click();
  });

  test("`pomade-planner today` names the day's daily note when it exists, with Pomade closed", async () => {
    await quit();
    const shim = join(fixture.homeDir, "bin/pomade-planner");
    const env = shellEnv();
    const json = spawnSync(shim, ["today", "--json", "--date", "2026-11-11"], { env, encoding: "utf8" });
    expect(json.stderr).toBe("");
    expect((JSON.parse(json.stdout) as { "daily-note": string | null })["daily-note"]).toBe(`${TODOS}/Daily/2026-11-11.md`);
    const textOut = spawnSync(shim, ["today", "--date", "2026-11-11"], { env, encoding: "utf8" });
    expect(textOut.stdout.split("\n").slice(0, 2)).toEqual(["Today — Wed, Nov 11, 2026", `  Daily note: ${TODOS}/Daily/2026-11-11.md`]);
    const none = spawnSync(shim, ["today", "--json", "--date", "2026-11-09"], { env, encoding: "utf8" });
    expect((JSON.parse(none.stdout) as { "daily-note": string | null })["daily-note"]).toBeNull();
  });
});
