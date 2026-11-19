// Every colour the two apps draw comes from Pomade's design tokens (pomade-kit/tokens.css), so a
// theme Pomade adds restyles them whole: no colour literal in the styles, the components or the
// app icons, an SVG glyph drawn in currentColor, a data-URI image only as a mask, and every
// custom property the styles read is one of Pomade's tokens or declared by the styles themselves.

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const TOKENS = readFileSync(createRequire(import.meta.url).resolve("pomade-kit/tokens.css"), "utf8");

/** The apps' source files with `ext`, repo-relative. */
function files(ext: string): string[] {
  return ["src", "apps"].flatMap((dir) =>
    readdirSync(`${REPO}${dir}`, { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(ext) && !f.endsWith(`.test${ext}`))
      .map((f) => `${dir}/${f}`),
  );
}

const read = (path: string): string => readFileSync(`${REPO}${path}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Colour literals: hex, the rgb/hsl functions and the named colours an app might reach for. */
const LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|(?<![-\w])(?:white|black|gray|grey|silver|red|blue|green)(?![-\w])/i;

const offending = (text: string, pattern: RegExp): string[] => text.split("\n").filter((line) => pattern.test(line)).map((line) => line.trim());

describe("colours come from Pomade's tokens", () => {
  const css = files(".css");
  const tsx = files(".tsx");
  const svg = files(".svg");

  it("finds the styles, components and icons it checks", () => {
    expect(css.length).toBeGreaterThan(5);
    expect(tsx.length).toBeGreaterThan(20);
    expect(svg).toEqual(expect.arrayContaining(["apps/board/public/board.svg", "apps/planner/public/planner.svg"]));
  });

  it.each(css)("%s has no colour literal and no data-URI image but a mask", (path) => {
    const text = read(path);
    expect(offending(text.replace(/url\("data:[^"]*"\)/g, "url()"), LITERAL)).toEqual([]);
    expect(offending(text, /^(?!\s*mask(?:-image)?\s*:).*url\("data:/)).toEqual([]);
  });

  it.each(css)("%s reads only Pomade's tokens and its own properties", (path) => {
    const text = read(path);
    const own = new Set([...text.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    const unknown = [...new Set([...text.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1] as string))].filter((name) => !own.has(name) && !TOKENS.includes(`${name}:`));
    expect(unknown).toEqual([]);
  });

  it.each(tsx)("%s draws in currentColor, with no colour literal", (path) => {
    const text = read(path);
    expect(offending(text, /(?:fill|stroke)="(?!none"|currentColor")/)).toEqual([]);
    expect(offending(text, /#[0-9a-f]{6}\b|\brgba?\(/i)).toEqual([]);
  });

  it.each(svg)("%s draws in currentColor", (path) => {
    expect(offending(read(path), /(?:fill|stroke)="(?!none"|currentColor")/)).toEqual([]);
  });
});
