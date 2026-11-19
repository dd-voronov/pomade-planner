// The two apps in a real Pomade (e2e/fixtures/pomade.ts): dev-linked through the POMADE_DEV_APPS
// testing hook, and installed with `npm run install-app`'s script — then one of them reinstalled
// from a changed build while Pomade runs.

import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test, type ElectronApplication, type FrameLocator, type Locator, type Page } from "@playwright/test";

import { shot } from "./fixtures/screens";
import { APP_VERSION, BOARD_BUILD, BOTH_BUILDS, POMADE_BIN, createPomadeFixture, expectAppIcon, launchPomade, pomadeEnv, type PomadeFixture } from "./fixtures/pomade";

const INSTALL_SCRIPT = resolve(import.meta.dirname, "../scripts/install-app.mjs");

const ICON = { planner: "strip-app-pomade-planner-planner", board: "strip-app-pomade-board-board" };
const PANEL = { planner: "panel-frame-app-pomade-planner-planner", board: "panel-frame-app-pomade-board-board" };
const BOARD_TAB = '[data-testid="app-frame-pomade-board"]';

function frame(page: Page, testId: string): FrameLocator {
  return page.frameLocator(`[data-testid="${testId}"]`);
}

/** Each app's strip icon, with its manifest's title and its own image, after Pomade's own icons. */
async function expectStripIcons(page: Page, boardTitle = "Board"): Promise<void> {
  await expect(page.getByTestId(ICON.planner)).toBeVisible();
  await expect(page.getByTestId(ICON.planner)).toHaveAttribute("aria-label", "Planner");
  await expectAppIcon(page.getByTestId(ICON.planner), "pomade-planner", "pomade-app://pomade-planner/planner.svg");
  await expect(page.getByTestId(ICON.board)).toBeVisible();
  await expect(page.getByTestId(ICON.board)).toHaveAttribute("aria-label", boardTitle);
  await expectAppIcon(page.getByTestId(ICON.board), "pomade-board", "pomade-app://pomade-board/board.svg");
}

/**
 * The colour an icon is drawn in once its button's colour transition has ended: a built-in glyph's
 * stroke colour, a tinted app icon's fill.
 */
function inkOf(icon: Locator): Promise<string> {
  return icon.evaluate(async (el) => {
    const transitions = (el.closest("button") ?? el).getAnimations({ subtree: true });
    await Promise.all(transitions.map((t) => t.finished.catch(() => undefined)));
    return el instanceof SVGElement ? getComputedStyle(el).color : getComputedStyle(el).backgroundColor;
  });
}

/** Board icon → a "Board" tab showing the Board, and the Needs-you panel; Planner icon → the Planner panel. */
async function expectSurfaces(page: Page, shots: string | null): Promise<void> {
  await page.getByTestId(ICON.board).click();
  await expect(page.getByTestId("tabstrip").getByRole("tab", { name: "Board", selected: true })).toBeVisible();
  await expect(page.frameLocator(BOARD_TAB).getByTestId("board")).toBeVisible();
  await expect(page.frameLocator(BOARD_TAB).getByTestId("area-solutions")).toHaveText("Solutions1");
  await expect(frame(page, PANEL.board).getByTestId("view-needs-you-panel")).toBeVisible();
  if (shots) await shot(page, `${shots}-board`);

  await page.getByTestId(ICON.planner).click();
  await expect(page.getByTestId(ICON.planner)).toHaveAttribute("aria-pressed", "true");
  await expect(frame(page, PANEL.planner).getByTestId("view-planner-panel")).toBeVisible();
  await expect(frame(page, PANEL.planner).getByTestId("view-title")).toHaveText("Where should your tasks live?");
  if (shots) await shot(page, `${shots}-planner`);
}

/** A copy of the Board's build changed the way a new build changes: a new version, a renamed strip icon and a new page title. */
async function writeChangedBuild(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "pomade-board-build-"));
  await cp(BOARD_BUILD, folder, { recursive: true });
  const manifestPath = join(folder, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { version: string; strip: { id: string; title: string }[] };
  manifest.version = "0.1.1";
  manifest.strip = manifest.strip.map((icon) => ({ ...icon, title: "Board (updated)" }));
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  const indexPath = join(folder, "index.html");
  await writeFile(indexPath, (await readFile(indexPath, "utf8")).replace("<title>Board</title>", "<title>Board (updated)</title>"));
  return folder;
}

test.describe("dev-linked into a real Pomade", () => {
  let fixture: PomadeFixture;
  let app: ElectronApplication | undefined;
  let page: Page;

  test.beforeAll(async () => {
    fixture = await createPomadeFixture();
    ({ app, page } = await launchPomade(fixture, { POMADE_DEV_APPS: BOTH_BUILDS }));
  });

  test.afterAll(async () => {
    await app?.close();
    await fixture.cleanup();
  });

  test("shows the Planner's and the Board's icons; Board opens a tab and Needs you, Planner fills the panel", async () => {
    await expectStripIcons(page);
    await shot(page, "pomade-devlink-strip");
    await expectSurfaces(page, "pomade-devlink");
  });

  test("the strip icons are drawn in Pomade's colours: idle like Git, hovered like a hovered Git, selected like a selected Files", async () => {
    const files = page.getByTestId("strip-files");
    const git = page.getByTestId("strip-git");
    const planner = page.getByTestId(ICON.planner).getByTestId("app-icon-pomade-planner");
    const board = page.getByTestId(ICON.board).getByTestId("app-icon-pomade-board");
    await files.click();
    await expect(files).toHaveAttribute("aria-pressed", "true");
    await page.mouse.move(0, 0);
    const filesSelected = await inkOf(files.locator("svg"));
    const idle = await inkOf(git.locator("svg"));
    expect(filesSelected).not.toBe(idle);
    await expect.poll(() => inkOf(planner)).toBe(idle);
    await expect.poll(() => inkOf(board)).toBe(idle);

    await git.hover();
    const hovered = await inkOf(git.locator("svg"));
    await page.getByTestId(ICON.board).hover();
    await expect.poll(() => inkOf(board)).toBe(hovered);

    await page.getByTestId(ICON.planner).click();
    await expect(page.getByTestId(ICON.planner)).toHaveAttribute("aria-pressed", "true");
    await page.mouse.move(0, 0);
    await expect.poll(() => inkOf(planner)).toBe(filesSelected);
    await shot(page, "pomade-devlink-strip-selected");
  });

  test("in a dark system appearance the apps stay light, like Pomade", async () => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.getByTestId(ICON.board).click();
    const html = page.frameLocator(BOARD_TAB).locator("html");
    await expect(page.frameLocator(BOARD_TAB).getByTestId("board")).toBeVisible();
    await expect.poll(() => html.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 255, 255)");
    await page.emulateMedia({ colorScheme: "light" });
  });
});

test.describe("installed into a real Pomade", () => {
  test.describe.configure({ mode: "serial" });
  let fixture: PomadeFixture;
  let app: ElectronApplication | undefined;
  let page: Page;
  let changedBuild: string | undefined;

  /** `npm run install-app`'s script: both apps with no argument, else the build folder named. */
  function install(...folders: string[]): string {
    return execFileSync(process.execPath, [INSTALL_SCRIPT, ...folders], {
      env: pomadeEnv(fixture, { POMADE_BIN }),
      encoding: "utf8",
    });
  }

  test.beforeAll(async () => {
    fixture = await createPomadeFixture();
  });

  test.afterAll(async () => {
    await app?.close();
    await fixture.cleanup();
    if (changedBuild) await rm(changedBuild, { recursive: true, force: true });
  });

  test("install-app installs both builds; Pomade shows their icons and surfaces", async () => {
    const out = install();
    expect(out).toContain(`Planner ${APP_VERSION} (pomade-planner)`);
    expect(out).toContain(`Board ${APP_VERSION} (pomade-board)`);
    ({ app, page } = await launchPomade(fixture));
    await expectStripIcons(page);
    await expectSurfaces(page, null);
  });

  test("reinstalling a changed build of one app updates it without a Pomade restart, and leaves the other running", async () => {
    const tabFrame = page.frameLocator(BOARD_TAB);
    await page.getByTestId(ICON.board).click();
    await expect(tabFrame.getByTestId("board")).toBeVisible();
    // A mark on each running frame: a reloaded frame no longer has it.
    const mark = (f: FrameLocator) =>
      f.locator("html").evaluate(() => {
        (window as Window & { __appMark?: string }).__appMark = "before-update";
      });
    const marked = (f: FrameLocator) => f.locator("html").evaluate(() => [document.title, (window as Window & { __appMark?: string }).__appMark ?? null]);
    await mark(tabFrame);
    await mark(frame(page, PANEL.planner));

    changedBuild = await writeChangedBuild();
    expect(install(changedBuild)).toContain("Board 0.1.1 (pomade-board)");

    await expectStripIcons(page, "Board (updated)");
    await expect.poll(() => marked(tabFrame)).toEqual(["Board (updated)", null]);
    await expect(tabFrame.getByTestId("board")).toBeVisible();
    expect(await marked(frame(page, PANEL.planner))).toEqual(["Planner", "before-update"]);
    await page.getByTestId(ICON.planner).click();
    await expect(frame(page, PANEL.planner).getByTestId("view-planner-panel")).toBeVisible();
    await shot(page, "pomade-installed-after-update");
  });

  test("the Board tab opened from the renamed strip icon takes the icon's new title", async () => {
    const tabs = page.getByTestId("tabstrip").getByRole("tab");
    await expect(tabs.filter({ hasText: "Board (updated)" })).toHaveCount(1);
    await expect(tabs.filter({ hasText: /^Board$/ })).toHaveCount(0);
  });
});
