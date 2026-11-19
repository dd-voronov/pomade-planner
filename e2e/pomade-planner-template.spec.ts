// T-010's acceptance in a real Pomade ($POMADE_DIR, e2e/fixtures/pomade.ts) with the app installed
// into the fixture's user data: the Planner's Settings choose the daily-note template with Pomade's
// file picker (`files.pickFile`, its NODE_ENV=test hook `globalThis.__pomadePick`) and save it.

import { execFileSync } from "node:child_process";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { expect, test, type ElectronApplication, type FrameLocator, type Page } from "@playwright/test";

import { DAILY_TEMPLATE } from "../test/fixtures/workspace";
import { frameShown } from "./fixtures/frames";
import { settled } from "./fixtures/planner";
import { POMADE_BIN, createPomadeFixture, launchPomade, panelShown, pomadeEnv, type PomadeFixture } from "./fixtures/pomade";
import { shot } from "./fixtures/screens";

const DIST = resolve(import.meta.dirname, "../dist/planner");
const INSTALL_SCRIPT = resolve(import.meta.dirname, "../scripts/install-app.mjs");
const ICON = "strip-app-pomade-planner-planner";
const PANEL = '[data-testid="panel-frame-app-pomade-planner-planner"]';
const TAB = '[data-testid="app-frame-pomade-planner"]:visible';
const TODOS = "To-dos";
const SETTINGS = "Apps/pomade-planner/settings.json";

interface PickHook {
  answers: (string | null)[];
  requests: { defaultPath: string; extensions?: string[] }[];
}

test.describe("the daily-note template chosen in a real Pomade", () => {
  test.describe.configure({ mode: "serial" });
  let fixture: PomadeFixture;
  let app: ElectronApplication | undefined;
  let page: Page;
  const abs = (rel: string) => join(fixture.workspaceRoot, rel);
  const settings = async (): Promise<unknown> => JSON.parse(await readFile(abs(SETTINGS), "utf8"));

  /** Queue the user's next picker choices in Pomade's test hook (absolute paths; `null` cancels), its requests emptied. */
  const answerPicks = (answers: (string | null)[]) =>
    app?.evaluate((_, queued) => {
      (globalThis as { __pomadePick?: PickHook }).__pomadePick = { answers: queued, requests: [] };
    }, answers);
  const pickRequests = async () => (await app?.evaluate(() => (globalThis as { __pomadePick?: PickHook }).__pomadePick?.requests)) ?? [];

  /** The Planner's settings page in its tab: the panel, Open in tab, then Settings. */
  async function openSettings(): Promise<FrameLocator> {
    if ((await page.getByTestId(ICON).getAttribute("aria-pressed")) !== "true") await page.getByTestId(ICON).click();
    await panelShown(page, ICON);
    const p = page.frameLocator(PANEL);
    await expect(p.getByTestId("view-planner-panel")).toBeVisible();
    await settled(p);
    await p.getByTestId("planner-open-tab").click();
    const tab = page.frameLocator(TAB);
    await expect(tab.getByTestId("view-planner-tab")).toBeVisible();
    // A tab just opened takes clicks only once Pomade has drawn it.
    await frameShown(page);
    await tab.getByTestId("planner-settings").click();
    await expect(tab.getByTestId("planner-settings-page")).toBeVisible();
    return tab;
  }

  test.beforeAll(async () => {
    fixture = await createPomadeFixture([{ key: "alpha", name: "Alpha", root: "Projects/alpha", files: { "README.md": "# Alpha\n" } }]);
    await mkdir(abs("Apps/pomade-planner"), { recursive: true });
    await writeFile(abs(SETTINGS), `${JSON.stringify({ tasksRoot: TODOS }, null, 2)}\n`);
    await mkdir(abs(`${TODOS}/Templates`), { recursive: true });
    await writeFile(abs(`${TODOS}/Templates/Morning.md`), DAILY_TEMPLATE);
    const out = execFileSync(process.execPath, [INSTALL_SCRIPT, DIST], { env: pomadeEnv(fixture, { POMADE_BIN }), encoding: "utf8" });
    expect(out).toContain("Planner 0.1.0 (pomade-planner)");
    ({ app, page } = await launchPomade(fixture));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1400, 900));
    await page.getByTestId("project-__workspace__").click();
  });

  test.afterAll(async () => {
    await app?.close();
    await fixture.cleanup();
  });

  test("Choose… opens Pomade's file picker in the tasks folder for .md files; the picked path is saved; Cancel changes nothing; Clear returns to none", async () => {
    const tab = await openSettings();
    await expect(tab.getByTestId("settings-template")).toHaveValue("");

    // Cancel: nothing changes.
    await answerPicks([null]);
    await tab.getByTestId("settings-template-choose").click();
    await expect.poll(async () => (await pickRequests()).length).toBe(1);
    const [request] = await pickRequests();
    expect(request?.extensions).toEqual(["md"]);
    expect(await realpath(request?.defaultPath ?? "")).toBe(await realpath(abs(TODOS)));
    await expect(tab.getByTestId("settings-template")).toHaveValue("");
    expect(await settings()).toEqual({ tasksRoot: TODOS });

    // A pick: the field fills and the path is saved.
    await answerPicks([await realpath(abs(`${TODOS}/Templates/Morning.md`))]);
    await tab.getByTestId("settings-template-choose").click();
    await expect(tab.getByTestId("settings-template")).toHaveValue(`${TODOS}/Templates/Morning.md`);
    await expect(tab.getByTestId("settings-saved")).toHaveText("Daily note template saved.");
    expect(await settings()).toEqual({ tasksRoot: TODOS, dailyNoteTemplate: `${TODOS}/Templates/Morning.md` });
    await shot(page, "t010-pomade-settings-template-chosen");

    await tab.getByTestId("settings-template-clear").click();
    await expect(tab.getByTestId("settings-saved")).toHaveText("Daily notes use the built-in template.");
    expect(await settings()).toEqual({ tasksRoot: TODOS });
  });
});
