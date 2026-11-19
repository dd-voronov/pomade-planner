// A real Pomade for the apps' specs: the built Electron app of the Pomade checkout
// (scripts/pomade-dir.mjs: $POMADE_DIR, default the `Pomade` folder beside this repository — from
// a git worktree too), launched against a throwaway workspace with an isolated user
// data dir and home, the way Pomade's own e2e launches it (NODE_ENV=test, POMADE_WORKSPACE,
// POMADE_USER_DATA; HOST-API §2 "Testing hook"). Nothing of the developer's own Pomade is read or
// written. The checkout is only read: it must already hold a build (`out/main/index.js`) and its
// Electron (`node_modules/electron`). Every launch is closed by the spec that made it.

import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { _electron as electron, expect, type ElectronApplication, type Locator, type Page } from "@playwright/test";

import { pomadeDir } from "../../scripts/pomade-dir.mjs";
import { frameShown } from "./frames";

const REPO = resolve(import.meta.dirname, "../..");

export const POMADE_DIR = pomadeDir();

/** The two apps' build folders (`npm run build`), each an app folder Pomade installs or dev-links as it is. */
export const PLANNER_BUILD = join(REPO, "dist/planner");
export const BOARD_BUILD = join(REPO, "dist/board");
/** `POMADE_DEV_APPS` with both apps dev-linked. */
export const BOTH_BUILDS = `${PLANNER_BUILD};${BOARD_BUILD}`;
/** The `pomade` command of that checkout (HOST-API §2). */
export const POMADE_BIN = join(POMADE_DIR, "bin/pomade");

const MAIN = join(POMADE_DIR, "out/main/index.js");

/** The Electron binary the checkout ships; throws a readable error when the checkout is not built. */
function electronBinary(): string {
  if (!existsSync(MAIN)) {
    throw new Error(
      `No Pomade build at ${MAIN}. Set POMADE_DIR to a Pomade checkout that has been built (npm run build there), ` +
        `e.g. POMADE_DIR=../Pomade/.claude/worktrees/<name> npm run e2e.`,
    );
  }
  const electronPackage = join(POMADE_DIR, "node_modules/electron/package.json");
  if (!existsSync(electronPackage)) {
    throw new Error(`No Electron in ${POMADE_DIR}/node_modules — run npm install in that Pomade checkout.`);
  }
  const path: unknown = createRequire(electronPackage)(dirname(electronPackage));
  if (typeof path !== "string" || !existsSync(path)) {
    throw new Error(`The Electron of ${POMADE_DIR} points at ${String(path)}, which does not exist.`);
  }
  return path;
}

export interface PomadeFixture {
  workspaceRoot: string;
  userDataDir: string;
  homeDir: string;
  /** Project key → project id. */
  projects: Record<string, string>;
  /** Removes every temp folder. */
  cleanup(): Promise<void>;
}

/** A project of the fixture workspace: its folder (workspace-relative), files (project-relative) and group. */
export interface FixtureProject {
  key: string;
  name: string;
  root: string;
  files: Record<string, string>;
  /** A `FixtureGroup` id; absent = ungrouped. */
  group?: string;
}

/** A sidebar group of the fixture workspace; `parent` nests it. */
export interface FixtureGroup {
  id: string;
  name: string;
  parent?: string;
}

async function write(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

const DEFAULT_PROJECTS: FixtureProject[] = [
  {
    key: "alpha",
    name: "Alpha",
    root: "Projects/alpha",
    files: {
      "README.md": "# Alpha\n",
      "docs/roadmap/E-001-first.md": "---\nid: E-001\nkind: epic\ntitle: First\nstatus: planned\npriority: P1\n---\n\n# E-001 — First\n",
    },
  },
];

/**
 * A throwaway workspace with `projects` (default: Alpha with a one-ticket backlog) in `groups`,
 * plus user data and home dirs. The first project is the one `launchPomade` opens.
 */
export async function createPomadeFixture(projects: FixtureProject[] = DEFAULT_PROJECTS, groups: FixtureGroup[] = []): Promise<PomadeFixture> {
  const base = await mkdtemp(join(tmpdir(), "pomade-planner-e2e-"));
  const workspaceRoot = join(base, "workspace");
  const userDataDir = join(base, "user-data");
  const homeDir = join(base, "pomade-home");
  await mkdir(userDataDir, { recursive: true });
  await mkdir(homeDir, { recursive: true });
  for (const project of projects) {
    await mkdir(join(workspaceRoot, project.root), { recursive: true });
    for (const [path, content] of Object.entries(project.files)) await write(join(workspaceRoot, project.root, path), content);
  }
  await write(
    join(workspaceRoot, ".pomade/workspace.json"),
    JSON.stringify({
      groups: groups.map((g, order) => ({ id: g.id, name: g.name, order, ...(g.parent === undefined ? {} : { parentId: g.parent }) })),
      projects: projects.map((p, order) => ({ id: `proj-${p.key}`, name: p.name, rootPath: p.root, visibleAgents: ["*"], order, ...(p.group === undefined ? {} : { groupId: p.group }) })),
    }),
  );
  return {
    workspaceRoot,
    userDataDir,
    homeDir,
    projects: Object.fromEntries(projects.map((p) => [p.key, `proj-${p.key}`])),
    cleanup: () => rm(base, { recursive: true, force: true }),
  };
}

/** The environment a `pomade` command or a Pomade launch gets: the fixture's dirs, nothing of the developer's Pomade. */
export function pomadeEnv(fixture: PomadeFixture, extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith("POMADE_") && key !== "ELECTRON_RENDERER_URL") env[key] = value;
  }
  return {
    ...env,
    NODE_ENV: "test",
    POMADE_WORKSPACE: fixture.workspaceRoot,
    POMADE_USER_DATA: fixture.userDataDir,
    POMADE_HOME: fixture.homeDir,
    ...extra,
  };
}

/** Launch Pomade on the fixture and wait for its window's app shell, with the fixture's first project active. */
export async function launchPomade(
  fixture: PomadeFixture,
  extra: Record<string, string> = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({ executablePath: electronBinary(), args: [MAIN], env: pomadeEnv(fixture, extra) });
  const page = await app.firstWindow();
  await page.waitForURL("**/index.html");
  await page.getByTestId("app-shell").waitFor();
  const first = Object.values(fixture.projects)[0];
  if (first !== undefined) await page.getByTestId(`project-${first}`).click();
  return { app, page };
}

/**
 * Wait until Pomade has finished showing the panel of strip icon `icon` (its test id): the icon
 * pressed, then the frames its out-of-process frame needs to take input (`frameShown`). A launch
 * panel frame (`startOnLaunch`) is loaded long before it is shown, so its content is there at
 * once, but a click sent before it is drawn is dropped.
 */
export async function panelShown(page: Page, icon: string): Promise<void> {
  await expect(page.getByTestId(icon)).toHaveAttribute("aria-pressed", "true");
  await frameShown(page);
}

/** The checkout's HOST-API: the contract its build implements, which says what that build already does. */
const HOST_API = readFileSync(join(POMADE_DIR, "docs/HOST-API.md"), "utf8");

/**
 * Whether this Pomade build draws an app's one-colour SVG icon in its own colours, as it draws
 * Files and Git (`pomade:T-244`; HOST-API §1 "Icon images"). A build before it shows the icon as
 * an image.
 */
export const TINTED_APP_ICONS = HOST_API.includes("Pomade draws such an icon in its own colours");

/** Whether a reinstall that renames a strip icon retitles the tab opened from it (`pomade:T-244`; HOST-API §1). */
export const REINSTALL_RETITLES_TABS = HOST_API.includes("a reinstall that renames the icon retitles the open tab");

/**
 * The icon of app `appId` inside `container` (a strip icon, a new-tab menu row) shows the image at
 * `url`: drawn as a mask of that image filled with the text colour around it, so it follows
 * hover, selection and theme — or, before `pomade:T-244`, as the image itself.
 */
export async function expectAppIcon(container: Locator, appId: string, url: string): Promise<void> {
  const icon = container.getByTestId(`app-icon-${appId}`);
  if (!TINTED_APP_ICONS) {
    await expect(icon).toHaveAttribute("src", url);
    return;
  }
  await expect
    .poll(() =>
      icon.evaluate((el) => {
        const style = getComputedStyle(el);
        return { mask: style.maskImage, fill: style.backgroundColor === style.color };
      }),
    )
    .toEqual({ mask: `url("${url}")`, fill: true });
}

/**
 * Queue the user's answers (absolute paths, `null` = cancel) for Pomade's folder and file pickers,
 * through its testing hook (Pomade's CONTRACTS "Testing hooks"): `__pomadePick`, or
 * `__pomadePickFolder` on a build before `pomade:T-245`.
 */
export async function queuePickerAnswers(app: ElectronApplication | undefined, answers: (string | null)[]): Promise<void> {
  if (app === undefined) throw new Error("Pomade is not running");
  await app.evaluate((_electron, queued) => {
    const hooks = globalThis as { __pomadePick?: unknown; __pomadePickFolder?: unknown };
    hooks.__pomadePick = { answers: [...queued], requests: [] };
    hooks.__pomadePickFolder = { answers: [...queued], requests: [] };
  }, answers);
}
