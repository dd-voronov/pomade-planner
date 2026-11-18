// The build: dist/ made anew with one self-contained Pomade app folder per app — dist/planner/
// (with the `pomade-planner` command bundled into cli/) and dist/board/ — each installable as it
// is (`pomade apps install dist/<app>`).

import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { build } from "vite";

const repo = fileURLToPath(new URL("..", import.meta.url));
process.chdir(repo);

await rm(`${repo}dist`, { recursive: true, force: true });
for (const mode of ["planner", "board"]) await build({ configFile: `${repo}vite.config.ts`, mode });
await build({ configFile: `${repo}vite.cli.config.ts` });
