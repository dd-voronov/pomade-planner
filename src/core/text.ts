// Text helpers both surfaces use: a title as it is written, its slug for a file name, and a string
// as a YAML scalar that reads back as the same string.

import { emitScalar } from "pomade-kit/frontmatter";

/** The longest slug, in characters. */
export const SLUG_MAX = 60;

/** A title as it is written: one line, whitespace runs collapsed, trimmed. */
export function normalizeTitle(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** A title's slug: lowercase words joined by `-` — Latin accents folded, other scripts kept, at most `max` characters, cut at a word boundary. */
export function slugify(title: string, max = SLUG_MAX): string {
  const folded = Array.from(title.normalize("NFC"), (ch) => {
    const base = ch.normalize("NFD").replace(/\p{M}+/gu, "");
    return /^[A-Za-z]$/.test(base) ? base : ch;
  }).join("");
  const slug = folded
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  const chars = Array.from(slug);
  if (chars.length <= max) return slug;
  const cut = chars.slice(0, max).join("");
  const boundary = cut.lastIndexOf("-");
  return (boundary >= max / 2 ? cut.slice(0, boundary) : cut).replace(/-+$/, "");
}

/** Plain scalars a YAML reader may take for something other than a string: booleans, null, numbers, dates (YAML 1.1 and 1.2 spellings). */
const NOT_A_STRING = /^(?:\d{4}-\d\d?-\d\d?(?:[Tt ].*)?|true|false|yes|no|on|off|y|n|null|~|[-+]?(?:\.inf|\.nan)|[-+]?(?:0x[\da-f_]+|0o[0-7_]+|0b[01_]+)|[-+]?(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:e[-+]?\d+)?)$/i;

/** A string as a YAML scalar that reads back as the same string: plain when it can be, else double-quoted. */
export function yamlString(value: string): string {
  const plain = emitScalar(value);
  return !plain.startsWith('"') && NOT_A_STRING.test(plain) ? JSON.stringify(value) : plain;
}
