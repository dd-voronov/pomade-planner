// Where the Pomade checkout is: $POMADE_DIR when set (relative to this repository's folder), else
// the `Pomade` folder beside the main repository — also when this code runs from a git worktree
// (`.claude/worktrees/<name>/`), whose own siblings are other worktrees.

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));

/** The main repository's folder: the parent of the git folder every worktree shares. */
function mainRepository() {
  try {
    const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (common !== "") return dirname(common);
  } catch {
    // Not a git checkout (an unpacked copy): the folder itself is the repository.
  }
  return repo;
}

/** The absolute path of the Pomade checkout. */
export function pomadeDir() {
  const named = process.env.POMADE_DIR;
  return named ? resolve(repo, named) : resolve(mainRepository(), "../Pomade");
}
