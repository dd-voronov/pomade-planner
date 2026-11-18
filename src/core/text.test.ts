import { describe, expect, it } from "vitest";

import { normalizeTitle, slugify } from "./text";

describe("normalizeTitle", () => {
  it.each([
    ["  Verify T-199  ", "Verify T-199"],
    ["a\n b\t\tc", "a b c"],
    ["   ", ""],
    ["", ""],
  ])("%j → %j", (raw, title) => {
    expect(normalizeTitle(raw)).toBe(title);
  });
});

describe("slugify", () => {
  it.each([
    ["Verify T-199", "verify-t-199"],
    ["Cmd+click opened random files", "cmd-click-opened-random-files"],
    ["  Leading and trailing!  ", "leading-and-trailing"],
    ["Don't break the build", "dont-break-the-build"],
    ["It’s fine", "its-fine"],
    ["Fix: the (weird) [thing] — now/again", "fix-the-weird-thing-now-again"],
    ["Café crème brûlée", "cafe-creme-brulee"],
    ["Ångström Øresund Łódź", "angstrom-øresund-łodz"],
    ["Проверить импорт задач", "проверить-импорт-задач"],
    ["Ёлка и йогурт", "ёлка-и-йогурт"],
    ["数据 同步", "数据-同步"],
    ["🚀 Launch 🎉", "launch"],
    ["!!!", ""],
    ["", ""],
    ["UPPER lower 123", "upper-lower-123"],
    ["a--b__c", "a-b-c"],
    ["v1.2.3 release", "v1-2-3-release"],
    ["été", "ete"],
  ])("%j → %j", (title, slug) => {
    expect(slugify(title)).toBe(slug);
  });

  it("cuts a long title at the last word boundary within the limit", () => {
    const title = "a very long title that goes on and on well past the sixty character limit of slugs";
    const slug = slugify(title);
    expect(slug).toBe("a-very-long-title-that-goes-on-and-on-well-past-the-sixty");
    expect(slug.length).toBeLessThanOrEqual(60);
  });

  it("cuts a single long word hard", () => {
    expect(slugify("x".repeat(100))).toBe("x".repeat(60));
  });

  it("counts characters, not UTF-16 units, and never splits one", () => {
    const slug = slugify("𝒜".repeat(10) + "б".repeat(70));
    expect(Array.from(slug)).toHaveLength(60);
    expect(slug).toBe("𝒜".repeat(10) + "б".repeat(50));
  });

  it("never ends with a hyphen after a cut", () => {
    const slug = slugify(`${"word ".repeat(11)}tail`, 30);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug).toBe("word-word-word-word-word-word");
  });
});
