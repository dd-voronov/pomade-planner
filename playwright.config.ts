import { defineConfig, devices } from "@playwright/test";

/**
 * The built apps (dist/planner/, dist/board/), each served the way Pomade serves an app: on its own
 * origin. `E2E_APP_PORT` (the Planner), `E2E_BOARD_PORT` and `E2E_HARNESS_PORT` move the three
 * servers, so several checkouts can run their suites at once.
 */
export const APP_PORT = Number(process.env.E2E_APP_PORT ?? 4417);
/** The fake-host harness (fake-host/), on another origin. */
export const HARNESS_PORT = Number(process.env.E2E_HARNESS_PORT ?? 4418);
export const BOARD_PORT = Number(process.env.E2E_BOARD_PORT ?? 4419);

/** The apps' pages as the fake-host specs open them. */
export const PLANNER_URL = `http://localhost:${APP_PORT}/`;
export const BOARD_URL = `http://localhost:${BOARD_PORT}/`;

// Two projects:
// - `fake-host`: each app in Chromium inside the kit's fake host, and standalone (no host).
// - `pomade`: a real Pomade (Electron) launched from the Pomade checkout with the apps dev-linked
//   or installed, against an isolated user data dir, home and fixture workspace (e2e/fixtures/pomade.ts).
// The web servers start in this order: the first builds dist/ before it serves; the Pomade specs
// load that same build.
export default defineConfig({
  testDir: "e2e",
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  projects: [
    { name: "fake-host", testIgnore: /\/e2e\/pomade-[^/]*\.spec\.ts$/, use: { ...devices["Desktop Chrome"] }, fullyParallel: true },
    { name: "pomade", testMatch: /\/e2e\/pomade-[^/]*\.spec\.ts$/, fullyParallel: false, timeout: 90_000 },
  ],
  webServer: [
    {
      command: `node scripts/build.mjs && npx vite preview --mode planner --port ${APP_PORT} --strictPort`,
      url: `${PLANNER_URL}manifest.json`,
      reuseExistingServer: false,
    },
    {
      command: `npx vite preview --mode board --port ${BOARD_PORT} --strictPort`,
      url: `${BOARD_URL}manifest.json`,
      reuseExistingServer: false,
    },
    {
      command: `npx vite --config fake-host/vite.config.ts --port ${HARNESS_PORT} --strictPort`,
      url: `http://localhost:${HARNESS_PORT}/index.html?app=x`,
      env: { FAKE_HOST_PLANNER_URL: PLANNER_URL, FAKE_HOST_BOARD_URL: BOARD_URL },
      reuseExistingServer: false,
    },
  ],
});
