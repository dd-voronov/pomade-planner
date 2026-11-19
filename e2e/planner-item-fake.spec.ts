// E-009 on the fake host: an item opened in place. In the tab a click on a row (or Enter on it)
// opens the item's compact view beside the list — never an editor tab; its fields and Details save
// without a button, each write field-only or body-only and only over the version the view read; a
// file changed elsewhere shows as it is; the row's own actions; Open in tab and ⌘-click; the daily
// note's card; "add and open"; the view following its file; a tab too narrow for both; and the
// panel's rows, which bring up the tab at the item's route. Tasks/ is dated around Tue 2026-11-17,
// Chores/ around Wed 2026-12-02.

import { expect, test, type FrameLocator, type Locator, type Page } from "@playwright/test";

import { APP_PORT, HARNESS_PORT } from "../playwright.config";
import { logged, openAddForm, row, settled } from "./fixtures/planner";
import { shot } from "./fixtures/screens";

const APP = `http://localhost:${APP_PORT}/`;

interface Open {
  surface: "tab" | "panel";
  project?: string;
  fixture?: string;
  extra?: string;
  tasks?: string;
  now?: string;
  route?: string;
  width?: number;
}

function harness(open: Open): string {
  const params = new URLSearchParams({ app: APP, surface: open.surface, tasks: open.tasks ?? "Tasks", now: open.now ?? "2026-11-17T10:00", project: open.project ?? "workspace" });
  if (open.surface === "panel") params.set("icon", "planner");
  else params.set("route", open.route ?? "planner");
  for (const key of ["fixture", "extra"] as const) {
    const value = open[key];
    if (value !== undefined) params.set(key, value);
  }
  return `http://localhost:${HARNESS_PORT}/index.html?${params.toString()}`;
}

const app = (page: Page): FrameLocator => page.frameLocator("#stage iframe >> nth=0");
const fileText = (page: Page, path: string) => page.evaluate((p) => window.fakeHost.readFile(p), path);
const writeFile = (page: Page, path: string, content: string) => page.evaluate(([p, c]) => window.fakeHost.writeFile(p, c), [path, content] as const);
const openedTabs = (page: Page) => page.evaluate(() => window.fakeHost.openedTabs);

const TAX = "Tasks/2026-11-01-pay-the-tax.md";
const TAX_TEXT = "---\ntype: task\ntitle: Pay the tax\nstatus: open\ndeadline: 2026-11-14\nimportance: 5\ncreated: 2026-11-09\n---\n";
const GIFTS = "Tasks/2026-11-12-gift-ideas.md";
const GIFTS_TEXT = "---\ntype: note\ntitle: Gift ideas for Greta\nstatus: open\ncreated: 2026-11-12\n---\n- the blue scarf from the market\n- tickets to the opera\n";
const INVOICES = "Chores/2026-01-01-upload-invoices.md";
const INVOICES_TEXT =
  "---\ntype: recurring\ntitle: Upload invoices\nstatus: open\ndo-on: 2026-12-05\nrepeat:\n  monthly: { days: [5] }\n  lead-days: 3\ncreated: 2026-01-01\n---\nUpload all invoices to the accountant's portal.\n\n## Log\n- 2026-11-04 done\n- 2026-10-05 skipped\n";

/** Open `title`'s compact view from its row in the tab and wait for it. */
async function openItem(a: FrameLocator, title: string): Promise<Locator> {
  await row(a, title).getByTestId("task-open").click();
  const pane = a.getByTestId("item-pane");
  await expect(pane).toBeFocused();
  return pane;
}

async function openPlanner(page: Page, open: Open): Promise<FrameLocator> {
  await page.setViewportSize({ width: open.width ?? 1200, height: 800 });
  await page.goto(harness(open));
  const a = app(page);
  await expect(a.getByTestId(open.surface === "panel" ? "view-planner-panel" : "view-planner-tab")).toBeVisible();
  await settled(a);
  return a;
}


test.describe("the compact view in the tab", () => {
  test("a click on a task opens it beside the list — no tab opens; the row is marked; Esc closes it and the focus is back on the row", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    const pane = await openItem(a, "Pay the tax");
    await expect(pane).toHaveAttribute("data-path", TAX);
    await expect(pane).toHaveAccessibleName("Task: Pay the tax");
    await expect(a.getByTestId("item-type")).toHaveText("Task");
    await expect(pane.getByTestId("qa-title")).toHaveValue("Pay the tax");
    await expect(pane.getByTestId("qa-do-on")).toHaveValue("");
    await expect(pane.getByTestId("qa-deadline")).toHaveValue("2026-11-14");
    await expect(pane.getByTestId("qa-deadline-resolved")).toHaveText("Sat, Nov 14");
    await expect(pane.getByTestId("qa-importance")).toHaveValue("5");
    await expect(pane.getByTestId("qa-details")).toHaveValue("");
    await expect(pane.getByTestId("item-path")).toHaveText(TAX);
    // The add form's project picker and type switch are not the view's.
    await expect(pane.getByTestId("qa-project")).toHaveCount(0);
    await expect(pane.getByTestId("qa-type")).toHaveCount(0);
    // Beside the list: both show, the list on the left.
    const list = a.getByTestId("list-today");
    await expect(list).toBeVisible();
    const [listBox, paneBox] = [await list.boundingBox(), await pane.boundingBox()];
    expect(listBox!.x + listBox!.width).toBeLessThanOrEqual(paneBox!.x);
    expect(paneBox!.x + paneBox!.width).toBeCloseTo(1200, 0);
    await expect(row(a, "Pay the tax")).toHaveAttribute("data-open", "true");
    await expect(row(a, "Pay the tax").getByTestId("task-open")).toHaveAttribute("aria-current", "true");
    await expect(a.locator('[data-open="true"]')).toHaveCount(1);
    await shot(page, "e009-fake-tab-task");
    expect(await openedTabs(page)).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(pane).toHaveCount(0);
    await expect(row(a, "Pay the tax").getByTestId("task-open")).toBeFocused();
    await expect(a.locator('[data-open="true"]')).toHaveCount(0);
    expect(await fileText(page, TAX)).toBe(TAX_TEXT);
  });

  test("Enter on a focused row opens it; another row's click takes the view over; the close button closes it", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    await row(a, "Pay the tax").getByTestId("task-open").focus();
    await page.keyboard.press("Enter");
    const pane = a.getByTestId("item-pane");
    await expect(pane).toBeFocused();
    await expect(pane).toHaveAttribute("data-path", TAX);
    await row(a, "Call the dentist").getByTestId("task-open").click();
    await expect(pane).toHaveAttribute("data-path", "Tasks/2026-11-15-call-the-dentist.md");
    await expect(pane.getByTestId("qa-title")).toHaveValue("Call the dentist");
    await expect(pane).toHaveCount(1);
    await expect(a.locator('[data-open="true"]')).toHaveCount(1);
    await expect(row(a, "Call the dentist")).toHaveAttribute("data-open", "true");
    await a.getByTestId("item-close").click();
    await expect(pane).toHaveCount(0);
    await expect(row(a, "Call the dentist").getByTestId("task-open")).toBeFocused();
    expect(await openedTabs(page)).toEqual([]);
  });

  test("a deadline typed as “fri” and Enter changes only the deadline line; the field reads the date; the row follows", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    await a.getByTestId("view-all").click();
    const pane = await openItem(a, "Pay the tax");
    await pane.getByTestId("qa-deadline").fill("fri");
    await expect(pane.getByTestId("qa-deadline-resolved")).toHaveText("Fri, Nov 20");
    expect(await fileText(page, TAX)).toBe(TAX_TEXT);
    await pane.getByTestId("qa-deadline").press("Enter");
    await expect.poll(() => fileText(page, TAX)).toBe(TAX_TEXT.replace("deadline: 2026-11-14", "deadline: 2026-11-20"));
    await expect(pane.getByTestId("qa-deadline")).toHaveValue("2026-11-20");
    await expect(pane.getByTestId("item-status")).toHaveText("Saved");
    await expect(row(a, "Pay the tax").getByTestId("hint-deadline")).toHaveText("due Fri");
    await expect(pane).toHaveAttribute("data-path", TAX);
    await shot(page, "e009-fake-tab-saved");
  });

  test("a field is written when the focus leaves it: an emptied one loses its line, a set one gets one; text that isn't a value is not written and says why", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    const pane = await openItem(a, "Pay the tax");
    await pane.getByTestId("qa-importance").fill("");
    await pane.getByTestId("qa-do-on").fill("tomorrow");
    await pane.getByTestId("qa-title").focus();
    await expect.poll(() => fileText(page, TAX)).toBe("---\ntype: task\ntitle: Pay the tax\nstatus: open\ndeadline: 2026-11-14\ncreated: 2026-11-09\ndo-on: 2026-11-18\n---\n");
    await expect(pane.getByTestId("qa-do-on")).toHaveValue("2026-11-18");

    await pane.getByTestId("qa-deadline").fill("someday");
    await pane.getByTestId("qa-title").fill("Pay the tax office");
    await pane.getByTestId("qa-title").press("Enter");
    await expect.poll(() => fileText(page, TAX)).toBe("---\ntype: task\ntitle: Pay the tax office\nstatus: open\ndeadline: 2026-11-14\ncreated: 2026-11-09\ndo-on: 2026-11-18\n---\n");
    await expect(pane.getByTestId("qa-deadline")).toHaveValue("someday");
    await expect(pane.getByTestId("qa-deadline")).toHaveAttribute("aria-invalid", "true");
    await expect(pane.getByTestId("qa-deadline-resolved")).toHaveText("Not a date — try fri, tomorrow, +3d, nov 20");
    await expect(row(a, "Pay the tax office")).toHaveAttribute("data-open", "true");
    await shot(page, "e009-fake-tab-field-error");

    // An emptied title is the file's again.
    await pane.getByTestId("qa-title").fill("");
    await pane.getByTestId("qa-do-on").focus();
    await pane.getByTestId("qa-do-on").fill("");
    await pane.getByTestId("qa-do-on").press("Enter");
    await expect.poll(() => fileText(page, TAX)).toBe("---\ntype: task\ntitle: Pay the tax office\nstatus: open\ndeadline: 2026-11-14\ncreated: 2026-11-09\n---\n");
    await expect(pane.getByTestId("qa-title")).toHaveValue("Pay the tax office");
  });

  test("Details is the body as raw markdown: typing changes only the body, shortly after it stops; it grows with its text", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab", fixture: "planner", extra: "notes" });
    await a.getByTestId("view-all").click();
    const pane = await openItem(a, "Gift ideas for Greta");
    const details = pane.getByTestId("qa-details");
    await expect(details).toHaveValue("- the blue scarf from the market\n- tickets to the opera");
    const before = (await details.boundingBox())!.height;
    await details.focus();
    await page.keyboard.press("Meta+ArrowDown");
    await page.keyboard.type("\n- a **weekend** away\n\n1. one\n2. two\n3. three\n4. four\n5. five");
    expect(await fileText(page, GIFTS)).toBe(GIFTS_TEXT);
    await expect.poll(() => fileText(page, GIFTS)).toBe(`${GIFTS_TEXT}- a **weekend** away\n\n1. one\n2. two\n3. three\n4. four\n5. five\n`);
    await expect(pane.getByTestId("item-status")).toHaveText("Saved");
    // Still focused, the caret where it was; every line shows, nothing scrolls inside.
    await expect(details).toBeFocused();
    expect((await details.boundingBox())!.height).toBeGreaterThan(before);
    expect(await details.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
    await shot(page, "e009-fake-tab-details");
  });

  test("closing writes what is typed at once: Details and a field still focused", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    const pane = await openItem(a, "Pay the tax");
    await pane.getByTestId("qa-details").fill("Bring the form 100.");
    await pane.getByTestId("qa-importance").fill("7");
    await page.keyboard.press("Escape");
    await expect(pane).toHaveCount(0);
    await expect.poll(() => fileText(page, TAX)).toBe(`${TAX_TEXT.replace("importance: 5", "importance: 7")}Bring the form 100.\n`);
    await expect(row(a, "Pay the tax").getByTestId("task-open")).toBeFocused();
    await expect(a.getByTestId("planner-error")).toHaveCount(0);
  });

  test("an edit made elsewhere shows in the open view within a second, and nothing is said when nothing was typed", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    const pane = await openItem(a, "Pay the tax");
    const changed = "---\ntype: task\ntitle: Pay the tax today\nstatus: open\ndeadline: 2026-11-21\ncreated: 2026-11-09\n---\nFrom another editor.\n";
    await writeFile(page, TAX, changed);
    await expect(pane.getByTestId("qa-title")).toHaveValue("Pay the tax today", { timeout: 1000 });
    await expect(pane.getByTestId("qa-deadline")).toHaveValue("2026-11-21");
    await expect(pane.getByTestId("qa-importance")).toHaveValue("");
    await expect(pane.getByTestId("qa-details")).toHaveValue("From another editor.");
    await expect(pane.getByTestId("item-notice")).toHaveCount(0);
    expect(await fileText(page, TAX)).toBe(changed);
  });

  test("Details typed over a version that changed on disk is not written: the view shows the file and says so", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    const pane = await openItem(a, "Pay the tax");
    await pane.getByTestId("qa-details").focus();
    await page.keyboard.type("Mine, typed over the old version");
    const changed = `${TAX_TEXT}Theirs.\n`;
    await writeFile(page, TAX, changed);
    await expect(pane.getByTestId("item-notice")).toContainText("The file changed on disk — nothing was written over it.");
    await expect(pane.getByTestId("qa-details")).toHaveValue("Theirs.");
    await shot(page, "e009-fake-tab-changed-on-disk");
    // Past the save delay: still the other editor's bytes.
    await page.waitForTimeout(900); // eslint-disable-line playwright/no-wait-for-timeout -- the save delay has passed and nothing must have been written
    expect(await fileText(page, TAX)).toBe(changed);
    // The next edit is over the new version, and is written; the notice goes with it.
    await pane.getByTestId("qa-details").fill("Theirs.\nAnd mine.");
    await expect(pane.getByTestId("item-notice")).toHaveCount(0);
    await expect.poll(() => fileText(page, TAX)).toBe(`${TAX_TEXT}Theirs.\nAnd mine.\n`);
  });

  test("a field committed over a version that changed on disk is not written either", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    const pane = await openItem(a, "Pay the tax");
    await pane.getByTestId("qa-deadline").fill("fri");
    const changed = TAX_TEXT.replace("importance: 5", "importance: 9");
    // The file changes and the field is committed before the watch has told the view.
    await writeFile(page, TAX, changed);
    await pane.getByTestId("qa-deadline").press("Enter");
    await expect(pane.getByTestId("item-notice")).toBeVisible();
    await expect(pane.getByTestId("qa-deadline")).toHaveValue("2026-11-14");
    await expect(pane.getByTestId("qa-importance")).toHaveValue("9");
    expect(await fileText(page, TAX)).toBe(changed);
  });

  test("the row's own actions are in the view: tick and untick, pin", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    const pane = await openItem(a, "Pay the tax");
    await pane.getByTestId("item-check").check();
    await expect.poll(() => fileText(page, TAX)).toBe(TAX_TEXT.replace("status: open", "status: done").replace("created: 2026-11-09\n", "created: 2026-11-09\ndone-on: 2026-11-17\n"));
    await expect(row(a, "Pay the tax")).toHaveAttribute("data-done", "true");
    await expect(pane.getByTestId("item-type")).toHaveText("Taskdone");
    await pane.getByTestId("item-check").uncheck();
    await expect.poll(() => fileText(page, TAX)).toBe(TAX_TEXT);

    await expect(pane.getByTestId("item-pin")).toHaveAttribute("aria-pressed", "false");
    await pane.getByTestId("item-pin").click();
    await expect(pane.getByTestId("item-pin")).toHaveAttribute("aria-pressed", "true");
    await expect(a.getByTestId("pinned-list").locator('[data-testid="task-row"]')).toHaveAttribute("data-path", TAX);
    await expect(row(a, "Pay the tax")).toHaveAttribute("data-open", "true");
    await pane.getByTestId("item-pin").click();
    await expect(a.getByTestId("pinned-list")).toHaveCount(0);
    expect(await fileText(page, TAX)).toBe(TAX_TEXT);
  });

  test("a thought resolves and reopens from the view; a note archives and restores, the view staying on the moved file", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab", fixture: "planner", extra: "notes" });
    await a.getByTestId("view-all").click();
    await a.getByTestId("show-done").check();
    await a.getByTestId("show-archived").check();
    const pane = await openItem(a, "Why do I sleep badly on Sundays?");
    await expect(a.getByTestId("item-type")).toHaveText("Thought");
    await expect(pane.getByTestId("item-check")).toHaveCount(0);
    await expect(pane.getByTestId("qa-do-on")).toHaveCount(0);
    await pane.getByTestId("item-resolve").click();
    await expect.poll(() => fileText(page, "Tasks/2026-11-12-sleep.md")).toContain("status: resolved\ncreated: 2026-11-12\ndone-on: 2026-11-17\n");
    await expect(pane.getByTestId("item-reopen")).toBeVisible();
    await expect(a.getByTestId("item-type")).toHaveText("Thoughtresolved");
    await pane.getByTestId("item-reopen").click();
    await expect.poll(() => fileText(page, "Tasks/2026-11-12-sleep.md")).toBe("---\ntype: thought\ntitle: Why do I sleep badly on Sundays?\nstatus: open\ncreated: 2026-11-12\n---\nMaybe the late coffee.\n");

    await openItem(a, "Gift ideas for Greta");
    await pane.getByTestId("qa-details").fill("- the blue scarf\n");
    await pane.getByTestId("item-archive").click();
    const archived = "Tasks/_archive/2026-11-12-gift-ideas.md";
    await expect(pane).toHaveAttribute("data-path", archived);
    // What was typed went in before the move.
    expect(await fileText(page, archived)).toBe(GIFTS_TEXT.replace("- the blue scarf from the market\n- tickets to the opera\n", "- the blue scarf\n"));
    await expect(a.getByTestId("item-type")).toHaveText("Notearchived");
    await expect(row(a, "Gift ideas for Greta")).toHaveAttribute("data-open", "true");
    await expect(pane.getByTestId("item-path")).toHaveText(archived);
    await shot(page, "e009-fake-tab-archived");
    await pane.getByTestId("item-restore").click();
    await expect(pane).toHaveAttribute("data-path", GIFTS);
    await expect(pane.getByTestId("item-archive")).toBeVisible();
    expect(await openedTabs(page)).toEqual([]);
  });

  test("Open in tab opens the file in an editor tab; ⌘-click on a row does it without the view", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    const pane = await openItem(a, "Pay the tax");
    await pane.getByTestId("item-open-tab").click();
    await expect.poll(() => openedTabs(page)).toEqual([{ kind: "file", projectId: "__workspace__", path: TAX }]);
    await expect(pane).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(pane).toHaveCount(0);

    await row(a, "Call the dentist").getByTestId("task-open").click({ modifiers: ["Meta"] });
    await expect.poll(() => openedTabs(page)).toEqual([
      { kind: "file", projectId: "__workspace__", path: TAX },
      { kind: "file", projectId: "__workspace__", path: "Tasks/2026-11-15-call-the-dentist.md" },
    ]);
    await expect(pane).toHaveCount(0);
    await expect(a.locator('[data-open="true"]')).toHaveCount(0);
  });

  test("the editor tab opens in the project that holds the file, not the one in front: Workspace for a tasks folder in no project", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab", fixture: "planner", project: "quiz" });
    const task = "Tasks/QuizLab/2026-11-17-timer.md";
    await writeFile(page, task, "---\ntype: task\ntitle: Add the timer\nstatus: open\ndo-on: 2026-11-17\ncreated: 2026-11-17\n---\n");
    await row(a, "Add the timer").getByTestId("task-open").click({ modifiers: ["Meta"] });
    await expect.poll(() => openedTabs(page)).toEqual([{ kind: "file", projectId: "__workspace__", path: task }]);
  });

  test("…and that project for a tasks folder inside one", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab", fixture: "planner", project: "quiz", tasks: "Projects/Pomade" });
    const task = "Projects/Pomade/QuizLab/2026-11-17-timer.md";
    await writeFile(page, task, "---\ntype: task\ntitle: Add the timer\nstatus: open\ndo-on: 2026-11-17\ncreated: 2026-11-17\n---\n");
    await row(a, "Add the timer").getByTestId("task-open").click({ modifiers: ["Meta"] });
    await expect.poll(() => openedTabs(page)).toEqual([{ kind: "file", projectId: "pomade", path: task }]);
  });

  test("a file that can't be read opens the editor tab straight away", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    await a.locator('[data-testid="unreadable-row"] button').click();
    await expect.poll(() => openedTabs(page)).toEqual([{ kind: "file", projectId: "__workspace__", path: "Tasks/2026-11-13-broken.md" }]);
    await expect(a.getByTestId("item-pane")).toHaveCount(0);
  });

  test("the daily note's card opens the same view with the note's body; its pin unpins it for the day", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab", fixture: "planner", extra: "notes" });
    const note = "Tasks/Daily/2026-11-17.md";
    await writeFile(page, note, "---\ntype: daily-note\ndate: 2026-11-17\n---\n# Tuesday, November 17, 2026\n\n- [x] Pancakes\n- [ ] Call mum\n");
    await a.getByTestId("daily-card-open").click();
    const pane = a.getByTestId("item-pane");
    await expect(pane).toBeFocused();
    await expect(pane).toHaveAttribute("data-path", note);
    await expect(a.getByTestId("item-type")).toHaveText("Daily note");
    await expect(pane.getByTestId("qa-title")).toHaveValue("");
    await expect(pane.getByTestId("qa-title")).toHaveAttribute("placeholder", "Tue, Nov 17");
    await expect(pane.getByTestId("qa-details")).toHaveValue("# Tuesday, November 17, 2026\n\n- [x] Pancakes\n- [ ] Call mum");
    await expect(a.getByTestId("daily-card")).toHaveAttribute("data-open", "true");
    await shot(page, "e009-fake-tab-daily");
    // A line ticked in Details is the card's progress.
    await pane.getByTestId("qa-details").fill("# Tuesday, November 17, 2026\n\n- [x] Pancakes\n- [x] Call mum");
    await expect(a.getByTestId("daily-card-progress")).toHaveText("2/2");
    expect(await fileText(page, note)).toBe("---\ntype: daily-note\ndate: 2026-11-17\n---\n# Tuesday, November 17, 2026\n\n- [x] Pancakes\n- [x] Call mum\n");
    expect(await openedTabs(page)).toEqual([]);

    await expect(pane.getByTestId("item-pin")).toHaveAttribute("aria-pressed", "true");
    await pane.getByTestId("item-pin").click();
    await expect(a.getByTestId("daily-card")).toHaveCount(0);
    await expect(pane).toBeVisible();
    await expect(pane.getByTestId("item-pin")).toHaveCount(0);
    // The button that held the focus is gone: the view has it, so the keyboard still works.
    await expect(pane).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(pane).toHaveCount(0);
  });

  test("⇧⌘↵ in the add form in place opens the new item's view — no editor tab", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    await openAddForm(a);
    await page.keyboard.type("Post the parcel");
    await page.keyboard.press("Shift+Meta+Enter");
    const pane = a.getByTestId("item-pane");
    await expect(pane).toBeFocused();
    await expect(pane).toHaveAttribute("data-path", "Tasks/2026-11-17-post-the-parcel.md");
    await expect(pane.getByTestId("qa-title")).toHaveValue("Post the parcel");
    await expect(pane.getByTestId("qa-do-on")).toHaveValue("2026-11-17");
    await expect(a.getByTestId("add-form")).toHaveCount(0);
    await expect(row(a, "Post the parcel")).toHaveAttribute("data-open", "true");
    expect(await openedTabs(page)).toEqual([]);

    // An item the view doesn't list opens all the same.
    await a.getByTestId("planner-add").click();
    const form = a.getByTestId("add-form");
    await expect(form.getByTestId("qa-title")).toBeFocused();
    await form.getByTestId("qa-type-note").check();
    await form.getByTestId("qa-title").fill("Lamp for the desk");
    await page.keyboard.press("Shift+Meta+Enter");
    await expect(pane).toHaveAttribute("data-path", "Tasks/2026-11-17-lamp-for-the-desk.md");
    await expect(pane).toBeFocused();
    await expect(a.getByTestId("added-elsewhere")).toBeVisible();
    expect(await openedTabs(page)).toEqual([]);
  });

  test("the open view follows its file: renamed it stays open on the new path; deleted, it closes", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab" });
    const pane = await openItem(a, "Pay the tax");
    await pane.getByTestId("qa-details").focus();
    await page.evaluate((from) => window.fakeHost.rename(from, "Tasks/tax-2026.md"), TAX);
    await expect(pane).toHaveAttribute("data-path", "Tasks/tax-2026.md");
    await expect(pane.getByTestId("qa-details")).toBeFocused();
    await expect(row(a, "Pay the tax")).toHaveAttribute("data-open", "true");
    // Writes go to the file where it is now.
    await page.keyboard.type("Still here.");
    await expect.poll(() => fileText(page, "Tasks/tax-2026.md")).toBe(`${TAX_TEXT}Still here.\n`);

    await page.evaluate(() => window.fakeHost.deleteFile("Tasks/tax-2026.md"));
    await expect(pane).toHaveCount(0);
    await expect(row(a, "Pay the tax")).toHaveCount(0);
    await expect(a.getByTestId("planner-error")).toHaveCount(0);
  });

  test("a project switch closes the view", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab", fixture: "planner" });
    const pane = await openItem(a, "Pay the tax");
    await page.evaluate(() => window.fakeHost.setActiveProject("quiz"));
    await expect(a.getByTestId("view-planner-tab")).toHaveAttribute("data-context", "quiz");
    await expect(pane).toHaveCount(0);
  });
});

test.describe("a recurring item's view", () => {
  const chores = { surface: "tab", fixture: "planner", tasks: "Chores", now: "2026-12-02T10:00" } as const;

  test("the rule stands in the repeat editor, the log under Details, read-only", async ({ page }) => {
    const a = await openPlanner(page, chores);
    await a.getByTestId("view-recurring").click();
    const pane = await openItem(a, "Upload invoices");
    await expect(a.getByTestId("item-type")).toHaveText("Recurring task");
    await expect(pane.getByTestId("qa-repeat-mode")).toHaveValue("every");
    await expect(pane.getByTestId("qa-repeat-count")).toHaveValue("1");
    await expect(pane.getByTestId("qa-repeat-unit")).toHaveValue("month");
    await expect(pane.getByTestId("qa-repeat-on")).toHaveValue("5");
    await expect(pane.getByTestId("qa-repeat-lead")).toHaveValue("3");
    await expect(pane.getByTestId("item-repeat")).toHaveText("monthly on the 5th, shows 3 days early · next Sat, Dec 5");
    await expect(pane.getByTestId("qa-details")).toHaveValue("Upload all invoices to the accountant's portal.");
    await expect(pane.getByTestId("item-log-entry")).toHaveText(["Nov 4done", "Oct 5skipped"]);
    await expect(pane.getByTestId("item-log").locator("input, textarea, button")).toHaveCount(0);
    await shot(page, "e009-fake-tab-recurring");

    // Details typed over the log: the log's bytes stay under it.
    await pane.getByTestId("qa-details").fill("Upload every invoice.\nAnd the receipts.");
    await expect.poll(() => fileText(page, INVOICES)).toBe(INVOICES_TEXT.replace("Upload all invoices to the accountant's portal.", "Upload every invoice.\nAnd the receipts."));
    await expect(pane.getByTestId("item-log-entry")).toHaveCount(2);
  });

  test("a rule changed in the editor replaces the repeat: lines and moves do-on to the new rule's next date", async ({ page }) => {
    const a = await openPlanner(page, chores);
    await a.getByTestId("view-recurring").click();
    const pane = await openItem(a, "Upload invoices");
    await pane.getByTestId("qa-repeat-on").fill("10");
    await expect(pane.getByTestId("item-repeat")).toContainText("monthly on the 10th, shows 3 days early");
    await pane.getByTestId("qa-repeat-on").press("Enter");
    await expect.poll(() => fileText(page, INVOICES)).toBe(INVOICES_TEXT.replace("days: [5]", "days: [10]").replace("do-on: 2026-12-05", "do-on: 2026-12-10"));
    await expect(pane.getByTestId("item-repeat")).toHaveText("monthly on the 10th, shows 3 days early · next Thu, Dec 10");
    await expect(row(a, "Upload invoices").getByTestId("hint-repeat")).toHaveText("monthly on the 10th, shows 3 days early");

    // A select's choice is written as it is made; every N weeks counts from today, written as start.
    await pane.getByTestId("qa-repeat-unit").selectOption("week");
    await expect.poll(() => fileText(page, INVOICES)).toContain("repeat:\n  weekly: { days: [wed] }\n  lead-days: 3\n");
    await pane.getByTestId("qa-repeat-count").fill("2");
    await pane.getByTestId("qa-repeat-count").press("Enter");
    await expect.poll(() => fileText(page, INVOICES)).toContain("repeat:\n  weekly: { every: 2, days: [wed] }\n  start: 2026-12-02\n  lead-days: 3\n");
    await expect(pane.getByTestId("item-repeat")).toHaveText("every other Wed, from Dec 2, 2026, shows 3 days early · next Wed, Dec 2");
    await expect(pane.getByTestId("qa-repeat-start")).toHaveValue("2026-12-02");
    // A rule the kit refuses is not written and says why.
    const everyOther = await fileText(page, INVOICES);
    await pane.getByTestId("qa-repeat-on").fill("fry");
    await pane.getByTestId("qa-repeat-on").press("Enter");
    await expect(pane.getByTestId("item-repeat-error")).toHaveText('"fry" is not a weekday — use mon, tue, wed, thu, fri, sat or sun');
    await shot(page, "e009-fake-tab-repeat-error");
    expect(await fileText(page, INVOICES)).toBe(everyOther);
  });

  test("done and Skip in the view log the day and move do-on; the log shows the new entry", async ({ page }) => {
    const a = await openPlanner(page, chores);
    await a.getByTestId("view-recurring").click();
    const pane = await openItem(a, "Upload invoices");
    await pane.getByTestId("item-skip").click();
    await expect(pane.getByTestId("item-status")).toHaveText("Skipped · next Jan 5, 2027");
    expect(await fileText(page, INVOICES)).toBe(logged(INVOICES_TEXT, { doOn: ["2026-12-05", "2027-01-05"], entry: "- 2026-12-02 skipped" }));
    await expect(pane.getByTestId("item-log-entry")).toHaveText(["Dec 2skipped", "Nov 4done", "Oct 5skipped"]);
    await pane.getByTestId("item-check").click();
    await expect(pane.getByTestId("item-status")).toHaveText("Done · next Feb 5, 2027");
    await expect(pane.getByTestId("item-check")).not.toBeChecked();
    await expect(pane.getByTestId("item-log-entry")).toHaveCount(4);
  });

  test("a rule that can't be read, and one the editor can't hold, show in words; done and Skip are off for the first", async ({ page }) => {
    const a = await openPlanner(page, chores);
    await writeFile(page, "Chores/2026-01-01-once.md", "---\ntype: recurring\ntitle: Sign the lease\nstatus: open\ndo-on: 2026-12-24\nrepeat:\n  once: 2026-12-24\ncreated: 2026-01-01\n---\n");
    await a.getByTestId("view-recurring").click();
    const pane = await openItem(a, "Take vitamins");
    await expect(pane.getByTestId("qa-repeat")).toHaveCount(0);
    await expect(pane.getByTestId("qa-repeat-text")).toHaveText('repeat.weekly.days[0]: "fry" is not a weekday — use mon, tue, wed, thu, fri, sat or sun. Fix the rule in the file — Open in tab.');
    await expect(pane.getByTestId("item-check")).toBeDisabled();
    await expect(pane.getByTestId("item-skip")).toBeDisabled();
    await openItem(a, "Sign the lease");
    await expect(pane.getByTestId("qa-repeat-text")).toHaveText("Repeats once on Dec 24, 2026. Change this rule in the file — Open in tab.");
    await expect(pane.getByTestId("item-skip")).toBeEnabled();
  });
});

test.describe("a tab too narrow for the list and the view side by side", () => {
  test("the view takes the list's place, with a way back; widened, they stand side by side again", async ({ page }) => {
    const a = await openPlanner(page, { surface: "tab", width: 640 });
    const pane = await openItem(a, "Pay the tax");
    await expect(a.getByTestId("view-planner-tab")).toBeHidden();
    const box = (await pane.boundingBox())!;
    expect(box.x).toBe(0);
    expect(box.width).toBe(640);
    await expect(pane.getByTestId("item-back")).toBeVisible();
    await expect(pane.getByTestId("item-close")).toBeHidden();
    expect(await a.locator("html").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await shot(page, "e009-fake-tab-narrow");

    await page.setViewportSize({ width: 1000, height: 800 });
    await expect(a.getByTestId("view-planner-tab")).toBeVisible();
    await expect(pane.getByTestId("item-back")).toBeHidden();
    await expect(pane.getByTestId("item-close")).toBeVisible();
    await page.setViewportSize({ width: 640, height: 800 });

    await pane.getByTestId("item-back").click();
    await expect(pane).toHaveCount(0);
    await expect(a.getByTestId("view-planner-tab")).toBeVisible();
    await expect(row(a, "Pay the tax").getByTestId("task-open")).toBeFocused();
  });

  for (const width of [360, 720, 721, 900, 1600]) {
    test(`at ${String(width)}px nothing of the view is cut or overlaps`, async ({ page }) => {
      const a = await openPlanner(page, { surface: "tab", width, fixture: "planner", tasks: "Chores", now: "2026-12-02T10:00" });
      await a.getByTestId("view-recurring").click();
      const pane = await openItem(a, "Upload invoices");
      expect(await a.locator("html").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      const within = await pane.evaluate((el) => {
        const frame = el.getBoundingClientRect();
        return [...el.querySelectorAll<HTMLElement>("button, input, select, textarea")].filter((c) => c.offsetParent !== null).every((c) => {
          const r = c.getBoundingClientRect();
          return r.left >= frame.left - 0.5 && r.right <= frame.right + 0.5;
        });
      });
      expect(within).toBe(true);
      await expect(a.getByTestId("view-planner-tab")).toBeVisible({ visible: width >= 720 });
      await shot(page, `e009-fake-tab-${String(width)}`);
    });
  }
});

test.describe("the tab at an item's route", () => {
  const route = (path: string) => `item?${new URLSearchParams({ path }).toString()}`;

  test("opens that item's view and goes back to route planner, so the same item can be asked for again", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto(harness({ surface: "tab", route: route(TAX) }));
    const a = app(page);
    const pane = a.getByTestId("item-pane");
    await expect(pane).toBeFocused();
    await expect(pane).toHaveAttribute("data-path", TAX);
    await expect(row(a, "Pay the tax")).toHaveAttribute("data-open", "true");
    await expect.poll(() => openedTabs(page)).toEqual([{ kind: "app", projectId: "__workspace__", route: "planner" }]);
    await page.evaluate(() => window.mounted?.navigate("planner"));
    await expect(pane).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(pane).toHaveCount(0);
    await page.evaluate((r) => window.mounted?.navigate(r), route(TAX));
    await expect(pane).toHaveAttribute("data-path", TAX);
    await page.evaluate(() => window.mounted?.navigate("planner"));
    // Another item asked for while one is open takes the view over.
    await page.evaluate((r) => window.mounted?.navigate(r), route("Tasks/2026-11-15-call-the-dentist.md"));
    await expect(pane).toHaveAttribute("data-path", "Tasks/2026-11-15-call-the-dentist.md");
    await expect(pane).toHaveCount(1);
  });

  test("a route naming a file that isn't an item opens nothing", async ({ page }) => {
    await page.goto(harness({ surface: "tab", route: route("Tasks/gone.md") }));
    const a = app(page);
    await settled(a);
    await expect.poll(() => openedTabs(page)).toEqual([{ kind: "app", projectId: "__workspace__", route: "planner" }]);
    await expect(a.getByTestId("item-pane")).toHaveCount(0);
    await expect(a.getByTestId("list-today")).toBeVisible();
  });
});

test.describe("the panel, too narrow to edit in", () => {
  test("a click on a row brings up the Planner tab at the item's route — no view in the panel, no editor tab; ⌘-click opens the editor tab", async ({ page }) => {
    const a = await openPlanner(page, { surface: "panel", fixture: "planner", extra: "notes", project: "quiz" });
    await a.getByTestId("view-all").click();
    await row(a, "Sound effects").getByTestId("task-open").click();
    await expect.poll(() => openedTabs(page)).toEqual([{ kind: "app", projectId: "quiz", route: "item?path=Tasks%2FQuizLab%2F2026-11-12-sound-effects.md" }]);
    await expect(a.getByTestId("item-pane")).toHaveCount(0);
    await expect(a.locator('[data-open="true"]')).toHaveCount(0);

    await row(a, "Sound effects").getByTestId("task-open").click({ modifiers: ["Meta"] });
    // The file is in no project: its editor tab is the Workspace's, and Pomade switches there — the panel follows.
    await expect.poll(async () => (await openedTabs(page)).at(-1)).toEqual({ kind: "file", projectId: "__workspace__", path: "Tasks/QuizLab/2026-11-12-sound-effects.md" });
    await expect(a.getByTestId("view-planner-panel")).toHaveAttribute("data-context", "__workspace__");
  });

  test("the daily note's card does the same", async ({ page }) => {
    const a = await openPlanner(page, { surface: "panel", fixture: "planner", extra: "notes" });
    await a.getByTestId("daily-card-open").click();
    await expect.poll(() => openedTabs(page)).toEqual([{ kind: "app", projectId: "__workspace__", route: "item?path=Tasks%2FDaily%2F2026-11-17.md" }]);
    await expect(a.getByTestId("item-pane")).toHaveCount(0);
  });
});
