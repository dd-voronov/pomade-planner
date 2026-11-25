import { describe, expect, it } from "vitest";

import { at, recurring, task } from "./fixtures";
import { checkDraft, type ItemDraft } from "./item-draft";
import { bodyParts, bodyWith, detailsChanged, isDirty, isEmptyEdit, itemEdit, itemFile, logEntries, settleDraft } from "./item-edit";

const B3 = { hour: 3, minute: 0 };
// Wed 2026-11-18 10:00.
const NOW = at("2026-11-18 10:00");

const LOG = "## Log\n- 2026-11-04 done\n- 2026-10-05 skipped\n";

describe("bodyParts — the body as Details, the gap after it and a recurring item's log", () => {
  it.each([
    ["", { details: "", gap: "", log: null }],
    ["Text.\n", { details: "Text.", gap: "\n", log: null }],
    ["Text.", { details: "Text.", gap: "", log: null }],
    ["One\n\n- two\n\n\n", { details: "One\n\n- two", gap: "\n\n\n", log: null }],
    ["  indented\n", { details: "  indented", gap: "\n", log: null }],
  ])("%j", (body, parts) => {
    expect(bodyParts(body, false)).toEqual({ ...parts, eol: "\n" });
  });

  it("a recurring item's last section, the log, stands apart; other items keep theirs in the text", () => {
    expect(bodyParts(`Upload all.\n\n${LOG}`, true)).toEqual({ details: "Upload all.", gap: "\n\n", log: LOG, eol: "\n" });
    expect(bodyParts(LOG, true)).toEqual({ details: "", gap: "", log: LOG, eol: "\n" });
    expect(bodyParts(`Upload all.\n\n${LOG}`, false)).toMatchObject({ details: `Upload all.\n\n${LOG}`.trimEnd(), log: null });
  });

  it("a log with a heading after it is part of the text", () => {
    const body = `Top.\n\n${LOG}\n## Notes\nMore.\n`;
    expect(bodyParts(body, true)).toMatchObject({ details: body.trimEnd(), log: null });
    expect(bodyParts(`Top.\n\n${LOG}\n### Deeper\n`, true)).toMatchObject({ details: "Top.", log: `${LOG}\n### Deeper\n` });
  });

  it("CRLF bodies show with plain line breaks and keep their own", () => {
    const parts = bodyParts("One\r\nTwo\r\n\r\n## Log\r\n- 2026-11-04 done\r\n", true);
    expect(parts).toEqual({ details: "One\nTwo", gap: "\r\n\r\n", log: "## Log\r\n- 2026-11-04 done\r\n", eol: "\r\n" });
    expect(bodyWith(parts, "One\nTwo\nThree")).toBe("One\r\nTwo\r\nThree\r\n\r\n## Log\r\n- 2026-11-04 done\r\n");
  });

  it("the log's entries, in file order", () => {
    expect(logEntries(bodyParts(`x\n\n${LOG}`, true))).toEqual([
      { date: "2026-11-04", text: "done" },
      { date: "2026-10-05", text: "skipped" },
    ]);
    expect(logEntries(bodyParts("x\n", true))).toEqual([]);
  });
});

describe("bodyWith — Details typed over the body", () => {
  const over = (body: string, details: string, isRecurring = false) => bodyWith(bodyParts(body, isRecurring), details);

  it.each(["", "Text.\n", "Text.", "One\n\n- two\n\n\n", `Upload all.\n\n${LOG}`, LOG, `Upload.\n${LOG}`])("what is shown, untouched, is the body byte for byte: %j", (body) => {
    expect(over(body, bodyParts(body, true).details, true)).toBe(body);
  });

  it("new text keeps the file's own ending; a body without one gets a line break", () => {
    expect(over("Text.\n", "Text.\nMore.")).toBe("Text.\nMore.\n");
    expect(over("Text.\n\n\n", "Other")).toBe("Other\n\n\n");
    expect(over("Text.", "Other")).toBe("Other\n");
    expect(over("", "First line\n- [ ] a box")).toBe("First line\n- [ ] a box\n");
  });

  it("white space typed at the end is not text", () => {
    expect(over("Text.\n", "Text.\n\n  ")).toBe("Text.\n");
    expect(over("", " \n ")).toBe("");
  });

  it("emptied: no body", () => {
    expect(over("Text.\n", "")).toBe("");
  });

  it("the log stays under whatever is typed, a blank line before it", () => {
    expect(over(`Upload all.\n\n${LOG}`, "Upload every invoice.", true)).toBe(`Upload every invoice.\n\n${LOG}`);
    expect(over(`Upload.\n${LOG}`, "Upload more.", true)).toBe(`Upload more.\n${LOG}`);
    expect(over(LOG, "New text", true)).toBe(`New text\n\n${LOG}`);
    expect(over(`Upload all.\n\n${LOG}`, "", true)).toBe(LOG);
  });
});

const TAX = task({ title: "Pay the tax", deadline: "2026-11-14", importance: 5 });

function edited(file: ReturnType<typeof itemFile>, patch: Partial<ItemDraft>) {
  const draft = { ...file.draft, ...patch };
  return { draft, edit: itemEdit(file, draft, checkDraft(draft, NOW, B3)) };
}

describe("itemFile — the file as the form's draft", () => {
  it("dates as YYYY-MM-DD, importance as its number, Details as the body's text", () => {
    expect(itemFile(TAX, "Body.\n", NOW, B3).draft).toMatchObject({ kind: "task", title: "Pay the tax", doOn: "", deadline: "2026-11-14", importance: "5", details: "Body." });
  });

  it("a file without a title: the field is empty", () => {
    expect(itemFile(task({ type: "daily-note", titled: false, title: "2026-11-18" }), "", NOW, B3).draft.title).toBe("");
  });

  it("a rule the editor holds is its draft; one it can't hold is not editable", () => {
    const invoices = itemFile(recurring({ monthly: { days: [5] }, "lead-days": 3 }), "", NOW, B3);
    expect(invoices.repeatEditable).toBe(true);
    expect(invoices.draft.repeat).toMatchObject({ mode: "every", count: "1", unit: "month", on: "5", lead: "3" });
    expect(itemFile(recurring({ once: "2026-12-24" }), "", NOW, B3).repeatEditable).toBe(false);
    expect(itemFile(recurring({ weekly: { days: ["fry"] } }), "", NOW, B3).repeatEditable).toBe(false);
  });
});

describe("itemEdit — what a changed draft writes", () => {
  const file = itemFile(TAX, "Body.\n", NOW, B3);

  it("nothing typed: nothing written", () => {
    expect(isEmptyEdit(edited(file, {}).edit)).toBe(true);
    expect(isDirty(file.draft, file)).toBe(false);
  });

  it("a deadline phrase: only deadline, as the date it comes to", () => {
    expect(edited(file, { deadline: "fri" }).edit).toEqual({ fields: [{ key: "deadline", value: "2026-11-20" }], repeat: null });
  });

  it("the same date typed another way writes nothing", () => {
    expect(isEmptyEdit(edited(file, { deadline: "nov 14 2026" }).edit)).toBe(true);
  });

  it("an emptied field removes its key; a set one is written; importance as a number", () => {
    expect(edited(file, { deadline: "", doOn: "tomorrow", importance: "2" }).edit.fields).toEqual([
      { key: "do-on", value: "2026-11-19" },
      { key: "deadline", value: null },
      { key: "importance", value: 2 },
    ]);
    expect(edited(file, { importance: "" }).edit.fields).toEqual([{ key: "importance", value: null }]);
  });

  it("a note or a thought: do-on alone is written — set, changed or emptied; its other dates and importance are not", () => {
    for (const type of ["note", "thought"] as const) {
      const idea = itemFile(task({ title: "Gift ideas", type }), "", NOW, B3);
      expect(edited(idea, { doOn: "fri", deadline: "fri", importance: "3" }).edit).toEqual({ fields: [{ key: "do-on", value: "2026-11-20" }], repeat: null });
      const planned = itemFile(task({ title: "Gift ideas", type, doOn: "2026-11-20" }), "", NOW, B3);
      expect(edited(planned, { doOn: "" }).edit.fields).toEqual([{ key: "do-on", value: null }]);
    }
  });

  it("text that isn't a value is not written, and stops nothing else", () => {
    expect(edited(file, { deadline: "someday", importance: "high", title: "Pay the tax now" }).edit.fields).toEqual([{ key: "title", value: "Pay the tax now" }]);
  });

  it("the title: written as it is normalized; an emptied one is not written", () => {
    expect(edited(file, { title: "  Pay   it " }).edit.fields).toEqual([{ key: "title", value: "Pay it" }]);
    expect(isEmptyEdit(edited(file, { title: "  " }).edit)).toBe(true);
    expect(isEmptyEdit(edited(file, { title: "Pay the tax " }).edit)).toBe(true);
  });

  it("a file without a title gets one when it is typed", () => {
    const daily = itemFile(task({ type: "daily-note", titled: false, title: "2026-11-18" }), "", NOW, B3);
    expect(edited(daily, { title: "Trip day" }).edit.fields).toEqual([{ key: "title", value: "Trip day" }]);
    expect(isEmptyEdit(edited(daily, {}).edit)).toBe(true);
  });

  it("a note's or thought's dates are never written", () => {
    const note = itemFile(task({ type: "note" }), "", NOW, B3);
    expect(isEmptyEdit(edited(note, { deadline: "fri", importance: "3" }).edit)).toBe(true);
  });

  it("Details is no field: it marks the draft, not the edit", () => {
    const { draft, edit } = edited(file, { details: "Body.\nMore." });
    expect(isEmptyEdit(edit)).toBe(true);
    expect(detailsChanged(draft, file)).toBe(true);
    expect(isDirty(draft, file)).toBe(true);
    expect(detailsChanged({ ...file.draft, details: "Body.\n\n" }, file)).toBe(false);
  });
});

describe("itemEdit — a recurring item's rule", () => {
  const invoices = recurring({ monthly: { days: [5] }, "lead-days": 3 }, { title: "Upload invoices", doOn: "2026-12-05", created: "2026-01-01" });
  const file = itemFile(invoices, "", NOW, B3);
  const rule = (patch: Partial<ItemDraft["repeat"]>) => edited(file, { repeat: { ...file.draft.repeat, ...patch } }).edit;

  it("untouched: nothing", () => {
    expect(isEmptyEdit(edited(file, {}).edit)).toBe(true);
  });

  it("the day changed: the rule, and do-on on the new rule's next date", () => {
    const edit = rule({ on: "10" });
    expect(edit.repeat).toMatchObject({ rule: { kind: "monthly", days: [10] }, leadDays: 3 });
    expect(edit.fields).toEqual([{ key: "do-on", value: "2026-12-10" }]);
    expect(rule({ on: "25" }).fields).toEqual([{ key: "do-on", value: "2026-11-25" }]);
  });

  it("only the lead time changed: the rule alone, do-on stays", () => {
    const edit = rule({ lead: "7" });
    expect(edit.repeat).toMatchObject({ leadDays: 7 });
    expect(edit.fields).toEqual([]);
  });

  it("a rule the kit refuses is not written", () => {
    expect(isEmptyEdit(rule({ count: "5" }))).toBe(true);
    expect(isEmptyEdit(rule({ on: "45" }))).toBe(true);
  });

  it("a rule the editor can't hold is never written, whatever its draft says", () => {
    const once = itemFile(recurring({ once: "2026-12-24" }, { doOn: "2026-12-24" }), "", NOW, B3);
    expect(isEmptyEdit(edited(once, { repeat: { ...once.draft.repeat, on: "9" } }).edit)).toBe(true);
  });

  it("a recurring item's deadline and importance are not the form's", () => {
    expect(isEmptyEdit(edited(file, { deadline: "fri", importance: "3" }).edit)).toBe(true);
  });
});

describe("settleDraft — the draft once its writes are the file", () => {
  it("a phrase reads as the date the file holds; Details and text that isn't a value stay as typed", () => {
    const typed: ItemDraft = { ...itemFile(TAX, "Body.\n", NOW, B3).draft, deadline: "fri", importance: "high", details: "Body.\nStill typing" };
    const saved = itemFile({ ...TAX, deadline: "2026-11-20" }, "Body.\n", NOW, B3);
    expect(settleDraft(typed, saved, NOW, B3)).toMatchObject({ deadline: "2026-11-20", importance: "high", details: "Body.\nStill typing" });
  });

  it("a field typed on since the write stays as typed", () => {
    const typed: ItemDraft = { ...itemFile(TAX, "", NOW, B3).draft, deadline: "sat", title: "Pay the tax today" };
    const saved = itemFile({ ...TAX, deadline: "2026-11-20" }, "", NOW, B3);
    expect(settleDraft(typed, saved, NOW, B3)).toMatchObject({ deadline: "sat", title: "Pay the tax today" });
  });

  it("an emptied title is the file's again", () => {
    const file = itemFile(TAX, "", NOW, B3);
    expect(settleDraft({ ...file.draft, title: "" }, file, NOW, B3).title).toBe("Pay the tax");
  });

  it("a rule that came to the file's reads as the file's draft", () => {
    const saved = itemFile(recurring({ monthly: { days: [18] } }, { doOn: "2026-11-18" }), "", NOW, B3);
    const typed: ItemDraft = { ...saved.draft, repeat: { ...saved.draft.repeat, on: "" } };
    expect(settleDraft(typed, saved, NOW, B3).repeat.on).toBe("18");
    expect(settleDraft({ ...typed, repeat: { ...typed.repeat, on: "45" } }, saved, NOW, B3).repeat.on).toBe("45");
  });
});
