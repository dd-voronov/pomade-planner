// What the Planner reads from an item's body ([[daily-notes]] "Progress", [[views]] "Rows"): a daily note's checkbox progress
// ("5/8") and the description excerpt the full tab shows under a title.
//
// - **Progress** counts GFM task-list items: a list item (`-`, `+`, `*`, `1.`, `1)`; nested, inside
//   block quotes too) whose text starts with `[ ]`, `[x]` or `[X]`, then whitespace and some text —
//   an item with nothing after its box isn't one, as in GFM. Lines inside fenced
//   code blocks (``` or ~~~) don't count.
// - **Excerpt**: the first non-empty lines of the body that are neither headings, nor fences, nor
//   inside code, nor a recurring item's `## Log` (where reading stops), markdown stripped, joined
//   with a space (" · " next to a list item) and cut at a word near `EXCERPT_MAX` characters with
//   "…".

export interface Progress {
  done: number;
  total: number;
}

/** A fence opening or closing a code block: its character and length. */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** The body's lines outside fenced code blocks (an unclosed fence runs to the end). */
function proseLines(body: string): string[] {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of body.split(/\r?\n/)) {
    const quoted = line.replace(/^(\s*>\s?)+/, "");
    const open = FENCE.exec(quoted)?.[1];
    if (fence !== null) {
      if (open !== undefined && open[0] === fence[0] && open.length >= fence.length && quoted.trim() === open) fence = null;
      continue;
    }
    if (open !== undefined) {
      fence = open;
      continue;
    }
    out.push(quoted);
  }
  return out;
}

const TASK_ITEM = /^\s*(?:[-+*]|\d{1,9}[.)])\s+\[([ xX])\]\s+\S/;

/** A body's GFM task items: how many are ticked, how many there are. */
export function checkboxProgress(body: string): Progress {
  let done = 0;
  let total = 0;
  for (const line of proseLines(body)) {
    const mark = TASK_ITEM.exec(line)?.[1];
    if (mark === undefined) continue;
    total++;
    if (mark !== " ") done++;
  }
  return { done, total };
}

/** "5/8"; `null` when the body has no checklist. */
export const progressText = (p: Progress | null): string | null => (p === null || p.total === 0 ? null : `${p.done}/${p.total}`);

/** How long an excerpt may get before it is cut. */
export const EXCERPT_MAX = 160;
/** How many body lines an excerpt takes at most. */
const EXCERPT_LINES = 2;

/** One line of markdown as plain text: list and task markers, emphasis, code, links and images reduced to their text. */
export function stripMarkdown(line: string): string {
  return line
    .replace(/^\s*(?:[-+*]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s*)?/, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_]([^*_\s][^*_]*?)[*_](?=[^\w*]|$)/g, "$1$2")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const HEADING = /^\s{0,3}#{1,6}(\s|$)/;
const LIST_ITEM = /^\s*(?:[-+*]|\d{1,9}[.)])\s/;
const LOG_HEADING = /^\s{0,3}##\s+Log\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;

/** The description excerpt of a body, or `null` when it has no prose. */
export function excerptOf(body: string): string | null {
  const parts: { text: string; item: boolean }[] = [];
  for (const line of proseLines(body)) {
    if (LOG_HEADING.test(line)) break;
    if (line.trim() === "" || HEADING.test(line) || RULE.test(line)) continue;
    const text = stripMarkdown(line);
    if (text === "") continue;
    parts.push({ text, item: LIST_ITEM.test(line) });
    if (parts.length === EXCERPT_LINES) break;
  }
  if (parts.length === 0) return null;
  const joined = parts.map((p, i) => (i === 0 ? p.text : `${p.item || parts[i - 1]?.item ? " · " : " "}${p.text}`)).join("");
  if (joined.length <= EXCERPT_MAX) return joined;
  const cut = joined.slice(0, EXCERPT_MAX);
  const space = cut.lastIndexOf(" ");
  return `${(space > EXCERPT_MAX * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
