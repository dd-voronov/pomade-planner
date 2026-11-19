// Archiving a note ([[storage-and-item-types]] "Storage", [[views]] "Rows"): the file moves into `<tasks root>/_archive/`, into the same
// sub-folder it was in (`QuizLab/idea.md` → `_archive/QuizLab/idea.md`); a taken name becomes
// `idea-2.md`, `idea-3.md`, …. Restoring moves it back the same way.

import { joinPath } from "pomade-kit/protocol";

import { ARCHIVE_FOLDER } from "./items";

/** `name` with `-<n>` before its extension for the `n`th try (n ≥ 2). */
export function numbered(name: string, n: number): string {
  if (n <= 1) return name;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)}-${n}${name.slice(dot)}` : `${name}-${n}`;
}

/** The path of `path` relative to `root` (`root` itself: ""); `null` when it isn't inside it. */
function relative(root: string, path: string): string | null {
  if (root === "") return path;
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : null;
}

function split(rel: string): { dir: string; name: string } {
  const slash = rel.lastIndexOf("/");
  return slash < 0 ? { dir: "", name: rel } : { dir: rel.slice(0, slash), name: rel.slice(slash + 1) };
}

/** Where an item at `path` (in the tasks root `root`) goes when archived, on the `n`th try; `null` when it isn't in the root or already archived. */
export function archivePath(root: string, path: string, n = 1): string | null {
  const rel = relative(root, path);
  if (rel === null || rel === ARCHIVE_FOLDER || rel.startsWith(`${ARCHIVE_FOLDER}/`)) return null;
  const { dir, name } = split(rel);
  return joinPath(joinPath(root, dir === "" ? ARCHIVE_FOLDER : `${ARCHIVE_FOLDER}/${dir}`), numbered(name, n));
}

/** Where an archived item at `path` goes back to, on the `n`th try; `null` when it isn't in `_archive/`. */
export function restorePath(root: string, path: string, n = 1): string | null {
  const rel = relative(root, path);
  if (rel === null || !rel.startsWith(`${ARCHIVE_FOLDER}/`)) return null;
  const { dir, name } = split(rel.slice(ARCHIVE_FOLDER.length + 1));
  return joinPath(dir === "" ? root : joinPath(root, dir), numbered(name, n));
}
