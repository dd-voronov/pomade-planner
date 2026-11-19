// The two apps in a browser: each inside pomade-kit's fake host (fake-host/) with its own manifest,
// one frame per surface the host can open it on; and standalone, with no host at all.

import { expect, test, type FrameLocator, type Page } from "@playwright/test";

import { BOARD_URL, HARNESS_PORT, PLANNER_URL } from "../playwright.config";
import { shot } from "./fixtures/screens";

const URLS = { planner: PLANNER_URL, board: BOARD_URL };
type AppName = keyof typeof URLS;

interface Open {
  app: AppName;
  surface: "tab" | "panel" | "overlay";
  icon?: string;
  route?: string;
  hostApi?: number;
  theme?: "light" | "dark";
}

function harness(open: Open): string {
  const params = new URLSearchParams({ app: URLS[open.app], surface: open.surface });
  if (open.icon !== undefined) params.set("icon", open.icon);
  if (open.route !== undefined) params.set("route", open.route);
  if (open.hostApi !== undefined) params.set("hostApi", String(open.hostApi));
  if (open.theme !== undefined) params.set("theme", open.theme);
  return `http://localhost:${HARNESS_PORT}/index.html?${params.toString()}`;
}

function app(page: Page): FrameLocator {
  return page.frameLocator("#stage iframe >> nth=0");
}

/** Fails the test on any uncaught error in the page or the app frame. */
function noPageErrors(page: Page): Error[] {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  return errors;
}

const SURFACES: { name: string; open: Open; view: string; title: string | null; shot: string }[] = [
  { name: "the Board icon's tab", open: { app: "board", surface: "tab", icon: "board" }, view: "board", title: null, shot: "board-tab" },
  { name: "the Board icon's panel", open: { app: "board", surface: "panel", icon: "board" }, view: "view-needs-you-panel", title: null, shot: "needs-you-panel" },
  { name: "the Board's new-tab default view", open: { app: "board", surface: "tab" }, view: "board", title: null, shot: "board-default-tab" },
  { name: "the Planner icon's panel", open: { app: "planner", surface: "panel", icon: "planner" }, view: "view-planner-panel", title: "Where should your tasks live?", shot: "planner-panel" },
  { name: "the Planner tab", open: { app: "planner", surface: "tab", route: "planner" }, view: "view-planner-tab", title: "Where should your tasks live?", shot: "planner-tab" },
  { name: "the Planner's new-tab default view", open: { app: "planner", surface: "tab" }, view: "view-planner-tab", title: "Where should your tasks live?", shot: "default-tab" },
  { name: "the quick-add overlay", open: { app: "planner", surface: "overlay", route: "quick-add" }, view: "view-quick-add", title: "Choose a tasks folder first", shot: "quick-add-overlay" },
];

test.describe("fake host", () => {
  for (const surface of SURFACES) {
    test(`${surface.name} renders its view`, async ({ page }) => {
      const errors = noPageErrors(page);
      await page.goto(harness(surface.open));
      await expect(app(page).getByTestId(surface.view)).toBeVisible();
      // The Board and "Needs you" have no title of their own: Pomade's tab and panel header already name them.
      await expect(app(page).getByTestId("view-title")).toHaveText(surface.title === null ? [] : [surface.title]);
      await shot(page, `fake-${surface.shot}`);
      expect(errors).toEqual([]);
    });
  }
});

test("each app is hosted with its own manifest: its id, and only its own strip icon", async ({ page }) => {
  for (const [name, id, icon, other] of [
    ["planner", "pomade-planner", "planner", "board"],
    ["board", "pomade-board", "board", "planner"],
  ] as const) {
    await page.goto(harness({ app: name, surface: "panel", icon }));
    await expect(app(page).locator("main").first()).toBeVisible();
    const manifest = await page.evaluate(() => window.fakeHost.manifest);
    expect(manifest.id).toBe(id);
    expect((manifest.strip ?? []).map((s) => s.id)).toEqual([icon]);
    expect((manifest.strip ?? []).map((s) => s.id)).not.toContain(other);
  }
});

test("the page background follows the surface and stays light in a dark system appearance", async ({ page }) => {
  const background = () => app(page).locator("html").evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(harness({ app: "board", surface: "tab", icon: "board" }));
  await expect(app(page).getByTestId("board")).toBeVisible();
  await expect.poll(background).toBe("rgb(255, 255, 255)");

  await page.goto(harness({ app: "planner", surface: "panel", icon: "planner" }));
  await expect(app(page).getByTestId("view-planner-panel")).toBeVisible();
  await expect.poll(background).toBe("rgb(250, 251, 252)");
  await expect.poll(() => app(page).locator("html").evaluate((el) => getComputedStyle(el).colorScheme)).toBe("light");
  await expect(app(page).locator("html")).toHaveAttribute("data-theme", "light");
});

test("each frame follows Pomade's theme — welcome.theme on its root, then every theme.changed — never the Mac's appearance", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  for (const open of [
    { app: "board", surface: "tab", icon: "board" },
    { app: "board", surface: "panel", icon: "board" },
    { app: "planner", surface: "panel", icon: "planner" },
    { app: "planner", surface: "tab", route: "planner" },
    { app: "planner", surface: "overlay", route: "quick-add" },
  ] as const) {
    const root = app(page).locator("html");
    await page.goto(harness({ ...open, theme: "dark" }));
    await expect(app(page).locator("main").first()).toBeVisible();
    await expect(root, `${open.app} ${open.surface}`).toHaveAttribute("data-theme", "dark");
    await page.evaluate(() => window.fakeHost.setTheme("light"));
    await expect(root, `${open.app} ${open.surface}`).toHaveAttribute("data-theme", "light");
    await page.evaluate(() => window.fakeHost.setTheme("dark"));
    await expect(root, `${open.app} ${open.surface}`).toHaveAttribute("data-theme", "dark");
  }
});

test("a tab follows Pomade navigating it to another of the app's routes", async ({ page }) => {
  await page.goto(harness({ app: "planner", surface: "tab", route: "planner" }));
  await expect(app(page).getByTestId("view-planner-tab")).toBeVisible();
  await page.evaluate(() => window.mounted?.navigate("nowhere"));
  await expect(app(page).getByTestId("view-unknown")).toBeVisible();
  await page.evaluate(() => window.mounted?.navigate("planner"));
  await expect(app(page).getByTestId("view-planner-tab")).toBeVisible();

  await page.goto(harness({ app: "board", surface: "tab", route: "nowhere" }));
  await expect(app(page).getByTestId("view-unknown")).toBeVisible();
  await page.evaluate(() => window.mounted?.navigate("board"));
  await expect(app(page).getByTestId("board")).toBeVisible();
});

test.describe("an app never renders the other app's views", () => {
  const FOREIGN: { open: Open; route: string; says: string }[] = [
    { open: { app: "planner", surface: "tab", route: "board" }, route: "board", says: "The Planner has no view for board on this surface." },
    { open: { app: "planner", surface: "panel", route: "needs-you" }, route: "needs-you", says: "The Planner has no view for needs-you on this surface." },
    { open: { app: "board", surface: "tab", route: "planner" }, route: "planner", says: "The Board has no view for planner on this surface." },
    { open: { app: "board", surface: "tab", route: "settings" }, route: "settings", says: "The Board has no view for settings on this surface." },
    { open: { app: "board", surface: "tab", route: "today" }, route: "today", says: "The Board has no view for today on this surface." },
    { open: { app: "board", surface: "panel", route: "planner" }, route: "planner", says: "The Board has no view for planner on this surface." },
    { open: { app: "board", surface: "overlay", route: "quick-add" }, route: "quick-add", says: "The Board has no view for quick-add on this surface." },
  ];
  for (const foreign of FOREIGN) {
    test(`${foreign.open.app} on a ${foreign.open.surface} at ${foreign.route}`, async ({ page }) => {
      const errors = noPageErrors(page);
      await page.goto(harness(foreign.open));
      await expect(app(page).getByTestId("view-unknown")).toBeVisible();
      await expect(app(page).getByTestId("unknown-route")).toHaveText(foreign.route);
      await expect(app(page).getByTestId("view-unknown").locator("p")).toHaveText(foreign.says);
      for (const view of ["board", "view-needs-you-panel", "view-planner-panel", "view-planner-tab", "view-quick-add"]) await expect(app(page).getByTestId(view)).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
});

test("a route the app does not know says so instead of rendering nothing", async ({ page }) => {
  await page.goto(harness({ app: "planner", surface: "tab", route: "nowhere" }));
  await expect(app(page).getByTestId("view-unknown")).toBeVisible();
  await expect(app(page).getByTestId("unknown-route")).toHaveText("nowhere");
  await shot(page, "fake-unknown-route");
});

test("Escape in the quick-add overlay closes it", async ({ page }) => {
  await page.goto(harness({ app: "planner", surface: "overlay", route: "quick-add" }));
  await expect(app(page).getByTestId("view-quick-add")).toBeVisible();
  await app(page).getByTestId("view-title").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#stage iframe")).toHaveCount(0);
});

for (const [name, icon, label] of [
  ["planner", "planner", "Planner"],
  ["board", "board", "Board"],
] as const) {
  test(`a host speaking another Host API version is refused by the ${label} with a readable message`, async ({ page }) => {
    await page.goto(harness({ app: name, surface: "tab", icon, hostApi: 1 }));
    await expect(app(page).getByTestId("rejected")).toBeVisible();
    await expect(app(page).getByTestId("rejected")).toContainText(`This Pomade needs a newer ${label}. Reinstall the app from its repository.`);
    await shot(page, `fake-rejected-${name}`);
  });

  test(`standalone ${label}: no Pomade host, and nothing throws`, async ({ page }) => {
    const errors = noPageErrors(page);
    await page.goto(URLS[name]);
    await expect(page).toHaveTitle(label);
    await expect(page.getByTestId("connecting")).toBeAttached();
    await expect(page.getByTestId("no-host")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("view-title")).toHaveText("No Pomade host");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByTestId("no-host").locator("p")).toHaveText(`The ${label} runs inside Pomade. Open it from the ${label} icon in Pomade's left strip.`);
    await shot(page, `standalone-no-host-${name}`);
    expect(errors).toEqual([]);
  });
}
