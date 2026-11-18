import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The apps this repo builds, each from `apps/<name>/` into `dist/<name>/`, and their dev-server
 * ports ($PLANNER_DEV_PORT and $BOARD_DEV_PORT move them).
 */
export const APPS = {
  planner: { port: Number(process.env.PLANNER_DEV_PORT ?? 5317) },
  board: { port: Number(process.env.BOARD_DEV_PORT ?? 5319) },
} as const;
export type AppName = keyof typeof APPS;

const isApp = (name: string): name is AppName => name in APPS;
const repo = fileURLToPath(new URL(".", import.meta.url));

// One config for both apps; `--mode planner` or `--mode board` picks the app. Its root is
// `apps/<name>/` — index.html, the entry, and `public/` with manifest.json and the icon — and its
// build is a self-contained Pomade app folder, `dist/<name>/`, with relative URLs so it serves from
// pomade-app://<id>/ and from a dev-server link.
export default defineConfig(({ mode }) => {
  if (!isApp(mode)) throw new Error(`vite: name the app with --mode ${Object.keys(APPS).join(" or --mode ")} (got "${mode}")`);
  return {
    root: `${repo}apps/${mode}`,
    plugins: [react()],
    base: "./",
    build: { outDir: `${repo}dist/${mode}`, emptyOutDir: true },
    server: { port: APPS[mode].port, strictPort: true },
  };
});
