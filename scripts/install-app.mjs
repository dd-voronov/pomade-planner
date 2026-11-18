// `npm run install-app` — builds, then installs the apps into Pomade, one `pomade apps install
// <folder>` each (HOST-API §2). With no argument it installs both, dist/planner and dist/board;
// `npm run install-app -- planner` (or `board`) installs that one. An argument that is not an
// app's name is a build folder to install as it is.
//
// Which `pomade` runs: $POMADE_BIN when set; else `pomade` on PATH (Pomade's terminals have it,
// and so does any shell with Pomade's PATH line); else `bin/pomade` of the Pomade checkout
// (scripts/pomade-dir.mjs: $POMADE_DIR, default the `Pomade` folder beside this repository). The
// command targets the dev Pomade's user data unless POMADE_USER_DATA says otherwise; it never
// installs into the stable Pomade.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { pomadeDir } from "./pomade-dir.mjs";

const APPS = ["planner", "board"];
const repo = fileURLToPath(new URL("..", import.meta.url));
const named = process.argv.slice(2);
const folders = (named.length > 0 ? named : APPS).map((arg) => resolve(repo, APPS.includes(arg) ? `dist/${arg}` : arg));

for (const folder of folders) {
  if (!existsSync(resolve(folder, "manifest.json"))) {
    console.error(`install-app: ${folder} has no manifest.json — run \`npm run build\` first`);
    process.exit(1);
  }
}

/** @param {string} command */
function onPath(command) {
  return spawnSync("/bin/sh", ["-c", `command -v ${command}`], { encoding: "utf8" }).status === 0;
}

function pomadeCommand() {
  if (process.env.POMADE_BIN) return process.env.POMADE_BIN;
  if (onPath("pomade")) return "pomade";
  const bin = resolve(pomadeDir(), "bin/pomade");
  if (existsSync(bin)) return bin;
  console.error(
    "install-app: no `pomade` command — none on PATH and none at " +
      `${bin}. Set POMADE_BIN or POMADE_DIR, or add Pomade's commands to PATH (Pomade ▸ Settings ▸ General ▸ Commands).`,
  );
  process.exit(1);
}

const pomade = pomadeCommand();
try {
  for (const folder of folders) execFileSync(pomade, ["apps", "install", folder], { stdio: "inherit" });
} catch {
  process.exit(1);
}
