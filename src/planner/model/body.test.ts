import { describe, expect, it } from "vitest";

import { checkboxProgress, EXCERPT_MAX, excerptOf, progressText, stripMarkdown } from "./body";

describe("checkboxProgress", () => {
  it.each([
    ["", 0, 0],
    ["- [ ] a\n- [x] b\n- [X] c\n", 2, 3],
    ["* [ ] star\n+ [x] plus\n1. [ ] one\n2) [x] two\n", 2, 4],
    ["- [ ] parent\n  - [x] nested\n    - [ ] deeper\n", 1, 3],
    ["> - [x] quoted\n> > - [ ] twice\n", 1, 2],
    ["- [ ]\n- [x]  \n", 0, 0],
    ["- [ ]x not a task\n- [y] no\n-[ ] no space\n[ ] bare\n- [  ] two spaces\n", 0, 0],
    ["```\n- [ ] in code\n```\n- [x] out\n", 1, 1],
    ["~~~md\n- [x] in code\n~~~\n- [ ] out\n", 0, 1],
    ["````\n```\n- [x] still code\n```\n````\n- [ ] out\n", 0, 1],
    ["```\n- [x] unclosed fence runs to the end\n", 0, 0],
    ["- [ ] a\r\n- [x] b\r\n", 1, 2],
  ])("%j → %i/%i", (body, done, total) => {
    expect(checkboxProgress(body)).toEqual({ done, total });
  });

  it("reads as N/M, nothing without a checklist", () => {
    expect(progressText({ done: 2, total: 8 })).toBe("2/8");
    expect(progressText({ done: 0, total: 0 })).toBeNull();
    expect(progressText(null)).toBeNull();
  });
});

describe("excerptOf", () => {
  it("the first two prose lines, markdown stripped; headings, rules and code skipped", () => {
    expect(excerptOf("# Heading\n\nUpload all **invoices** to the [portal](https://x).\n---\n```\ncode\n```\n- [ ] then `this`\n- third\n")).toBe("Upload all invoices to the portal. · then this");
    expect(excerptOf("One line\nwraps here.\n")).toBe("One line wraps here.");
    expect(excerptOf("- a\n- b\n")).toBe("a · b");
  });

  it("stops at a recurring item's ## Log", () => {
    expect(excerptOf("## Log\n- 2026-11-02 done\n")).toBeNull();
    expect(excerptOf("Soft one.\n\n## Log\n- 2026-11-02 done\n")).toBe("Soft one.");
  });

  it("nothing for an empty body or only headings", () => {
    expect(excerptOf("")).toBeNull();
    expect(excerptOf("\n\n# Title\n## Sub\n")).toBeNull();
  });

  it("cuts a long excerpt at a word with …", () => {
    const long = `${"word ".repeat(60)}end`;
    const e = excerptOf(long) ?? "";
    expect(e.endsWith("…")).toBe(true);
    expect(e.length).toBeLessThanOrEqual(EXCERPT_MAX + 1);
    expect(e).not.toMatch(/ …$/);
  });

  it.each([
    ["[[Some note]]", "Some note"],
    ["[[Some note|alias]]", "alias"],
    ["![img](a.png) caption", "img caption"],
    ["*em* and _also_ ~~gone~~", "em and also gone"],
    ["snake_case_name stays", "snake_case_name stays"],
    ["<b>tag</b>", "tag"],
  ])("strips %j", (line, text) => {
    expect(stripMarkdown(line)).toBe(text);
  });
});
