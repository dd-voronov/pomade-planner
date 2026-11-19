import { createFakeHost } from "pomade-kit/fake-host";
import { connect, type HostClient } from "pomade-kit/sdk";
import { describe, expect, it } from "vitest";

import manifest from "../../apps/planner/public/manifest.json" with { type: "json" };
import { recurring } from "./model/fixtures";
import { readItemsAt, type TextCache } from "./usePlannerData";
import { archiveItem, completeRecurring, createDailyNote, createTask, moveProjectFolder, resolveThought, restoreItem, saveBody, saveItemEdit, saveProjectFolders, saveSettings, StaleError, tickTask, WriteError } from "./write";

const TEXT = "---\ntype: task\ntitle: Pay the tax # due soon\nstatus: open\ndeadline: 2026-11-14\nimportance: 5\ncreated: 2026-11-09\n---\nBody stays.\n";

async function setup(files: Record<string, string> = { "Tasks/tax.md": TEXT }) {
  const fake = createFakeHost({ manifest, files });
  const result = await connect({ transport: fake.transport });
  if (result.status !== "connected") throw new Error(result.status);
  return { fake, host: result.host };
}

async function task(host: HostClient, path: string) {
  const items = await readItemsAt(host, "Tasks");
  const t = items?.tasks.find((x) => x.path === path);
  if (!t) throw new Error(`no task ${path}`);
  return t;
}

describe("tickTask", () => {
  it("writes status and done-on as field-only writes — comments, order and body stay; unticking gives the bytes back", async () => {
    const { fake, host } = await setup();
    await tickTask(host, await task(host, "Tasks/tax.md"), true, "2026-11-17");
    expect(fake.readFile("Tasks/tax.md")).toBe(TEXT.replace("status: open", "status: done").replace("created: 2026-11-09\n", "created: 2026-11-09\ndone-on: 2026-11-17\n"));
    await tickTask(host, await task(host, "Tasks/tax.md"), false, "2026-11-17");
    expect(fake.readFile("Tasks/tax.md")).toBe(TEXT);
  });

  it("refuses a file changed since it was read, and writes nothing", async () => {
    const { fake, host } = await setup();
    const stale = await task(host, "Tasks/tax.md");
    await new Promise((r) => setTimeout(r, 5));
    fake.writeFile("Tasks/tax.md", TEXT.replace("importance: 5", "importance: 6"));
    await expect(tickTask(host, stale, true, "2026-11-17")).rejects.toThrow(new WriteError("Changed on disk since the Planner read it — not saved. The row shows the file as it is now."));
    expect(fake.readFile("Tasks/tax.md")).toContain("status: open");
  });

  it("a file gone since the read is not saved", async () => {
    const { fake, host } = await setup();
    const stale = await task(host, "Tasks/tax.md");
    fake.deleteFile("Tasks/tax.md");
    await expect(tickTask(host, stale, true, "2026-11-17")).rejects.toThrow("Not saved: the file is gone.");
  });
});

describe("createTask", () => {
  it("creates <created>-<slug>.md with the whole text at once; taken names step to -2, -3", async () => {
    const { fake, host } = await setup({ "Tasks/2026-11-17-buy-milk.md": "x", "Tasks/2026-11-17-buy-milk-2.md": "y" });
    const path = await createTask(host, "Tasks", null, { title: "Buy milk", doOn: null, deadline: "2026-11-20", importance: null, created: "2026-11-17" });
    expect(path).toBe("Tasks/2026-11-17-buy-milk-3.md");
    expect(fake.readFile(path)).toBe("---\ntype: task\ntitle: Buy milk\nstatus: open\ndeadline: 2026-11-20\ncreated: 2026-11-17\n---\n");
    expect(fake.readFile("Tasks/2026-11-17-buy-milk.md")).toBe("x");
  });

  it("creates the tasks root when it is gone", async () => {
    const { fake, host } = await setup({});
    const path = await createTask(host, "Lists/Todo", null, { title: "First", doOn: null, deadline: null, importance: null, created: "2026-11-17" });
    expect(fake.readFile(path)).toContain("title: First");
  });

  it("creates into a project's folder, made when missing", async () => {
    const { fake, host } = await setup({});
    const path = await createTask(host, "Tasks", "QuizLab", { title: "Fix login bug", doOn: null, deadline: null, importance: null, created: "2026-11-17" });
    expect(path).toBe("Tasks/QuizLab/2026-11-17-fix-login-bug.md");
    expect(fake.readFile(path)).toContain("title: Fix login bug");
  });
});

describe("readItemsAt", () => {
  it("reads the root's items, Daily/'s (workspace-level) and each project sub-folder's, with the folders; Daily/, _archive/ and hidden folders are no project's", async () => {
    const { host } = await setup({
      "Tasks/tax.md": TEXT,
      "Tasks/QuizLab/a.md": "---\ntype: task\ntitle: A\n---\n",
      "Tasks/QuizLab/deeper/b.md": "---\ntype: task\ntitle: Deep\n---\n",
      "Tasks/QuizLab/broken.md": "---\ntype: task\nx: [\n---\n",
      "Tasks/Daily/2026-11-17.md": "---\ntype: task\ntitle: Not a project's\n---\n",
      "Tasks/.obsidian/x.md": "---\ntype: task\ntitle: Hidden\n---\n",
    });
    const items = await readItemsAt(host, "Tasks");
    expect(items?.folders).toEqual(["QuizLab"]);
    expect(items?.tasks.map((t) => [t.title, t.folder]).sort()).toEqual([
      ["A", "QuizLab"],
      ["Not a project's", null],
      ["Pay the tax", null],
    ]);
    expect(items?.unreadable.map((u) => [u.path, u.folder])).toEqual([["Tasks/QuizLab/broken.md", "QuizLab"]]);
  });
});

describe("moveProjectFolder and saveProjectFolders", () => {
  it("renames a folder; a taken name is refused and nothing merges; a folder already moved counts as moved", async () => {
    const { fake, host } = await setup({ "Tasks/QuizLab/a.md": "a", "Tasks/Taken/b.md": "b" });
    expect(await moveProjectFolder(host, "Tasks", "QuizLab", "Taken")).toBe("taken");
    expect(fake.readFile("Tasks/QuizLab/a.md")).toBe("a");
    expect(fake.readFile("Tasks/Taken/b.md")).toBe("b");
    expect(await moveProjectFolder(host, "Tasks", "QuizLab", "QuizLab2")).toBe("moved");
    expect(fake.readFile("Tasks/QuizLab2/a.md")).toBe("a");
    expect(await moveProjectFolder(host, "Tasks", "QuizLab", "QuizLab2")).toBe("moved");
    expect(await moveProjectFolder(host, "Tasks", "Gone", "Elsewhere")).toEqual({ reason: "the folder is gone" });
  });

  it("sets entries of the map, keeping every other entry and key", async () => {
    const { fake, host } = await setup({
      "Apps/pomade-planner/settings.json": JSON.stringify({ backlogPathPattern: "plans/", projectFolders: { p: { folder: "Pomade", name: "Pomade", groupPath: [] } } }),
    });
    await saveProjectFolders(host, { q: { folder: "QuizLab", name: "QuizLab", groupPath: ["Work"] } });
    expect(JSON.parse(fake.readFile("Apps/pomade-planner/settings.json"))).toEqual({
      backlogPathPattern: "plans/",
      projectFolders: { p: { folder: "Pomade", name: "Pomade", groupPath: [] }, q: { folder: "QuizLab", name: "QuizLab", groupPath: ["Work"] } },
    });
  });
});

describe("saveSettings", () => {
  it("creates the file, then changes only the Planner's keys; a file that isn't JSON is refused, never overwritten", async () => {
    const { fake, host } = await setup({});
    await saveSettings(host, { tasksRoot: "Tasks" });
    expect(fake.readFile("Apps/pomade-planner/settings.json")).toBe('{\n  "tasksRoot": "Tasks"\n}\n');
    fake.writeFile("Apps/pomade-planner/settings.json", '{"backlogPathPattern":"plans/","tasksRoot":"Tasks"}');
    await saveSettings(host, { dayBoundary: "4:00" });
    expect(JSON.parse(fake.readFile("Apps/pomade-planner/settings.json"))).toEqual({ backlogPathPattern: "plans/", tasksRoot: "Tasks", dayBoundary: "4:00" });
    expect(fake.state["planner.settingsWritten"]).toEqual(expect.any(Number));
    fake.writeFile("Apps/pomade-planner/settings.json", "{ broken");
    await expect(saveSettings(host, { dayBoundary: "5:00" })).rejects.toThrow(/is not valid JSON.*Fix the file first/);
    expect(fake.readFile("Apps/pomade-planner/settings.json")).toBe("{ broken");
  });
});

const INVOICES = "---\ntype: recurring\ntitle: Upload invoices # monthly\nstatus: open\ndo-on: 2026-10-05\nrepeat:\n  monthly: { days: [5] }\n  lead-days: 3\ncreated: 2026-01-01\n---\nUpload all invoices to the accountant's portal.\n\n## Log\n- 2026-09-04 done\n";

/** `host` whose `files.<method>` refuses (a disk that is full, a file locked by another app). */
function failing(host: HostClient, method: "setField" | "removeField" | "setBody" | "write"): HostClient {
  const files = new Proxy(host.files, {
    get(target, key, receiver) {
      if (key === method) return () => Promise.reject(new Error("EACCES: permission denied"));
      return Reflect.get(target, key, receiver) as unknown;
    },
  });
  return new Proxy(host, { get: (target, key, receiver) => (key === "files" ? files : (Reflect.get(target, key, receiver) as unknown)) });
}

describe("completeRecurring", () => {
  it("done on a missed item: the log line first under ## Log, then do-on moved to the next future occurrence — every other byte stays", async () => {
    const { fake, host } = await setup({ "Tasks/invoices.md": INVOICES });
    expect(await completeRecurring(host, await task(host, "Tasks/invoices.md"), "done", "2026-11-18")).toBe("2026-12-05");
    expect(fake.readFile("Tasks/invoices.md")).toBe(INVOICES.replace("do-on: 2026-10-05", "do-on: 2026-12-05").replace("## Log\n", "## Log\n- 2026-11-18 done\n"));
  });

  it("skip: the same with `skipped`; a body without a log gets the section; the item reads back with its new log entry", async () => {
    const text = "---\ntype: recurring\ntitle: Change toothbrush\nstatus: open\ndo-on: 2026-11-09\nrepeat:\n  after-completion: { months: 3 }\n---\n";
    const { fake, host } = await setup({ "Tasks/brush.md": text });
    expect(await completeRecurring(host, await task(host, "Tasks/brush.md"), "skipped", "2026-11-20")).toBe("2027-02-20");
    expect(fake.readFile("Tasks/brush.md")).toBe(text.replace("do-on: 2026-11-09", "do-on: 2027-02-20") + "\n## Log\n- 2026-11-20 skipped\n");
    expect((await task(host, "Tasks/brush.md")).lastLog).toEqual({ date: "2026-11-20", text: "skipped" });
  });

  it("a once done: do-on removed", async () => {
    const text = "---\ntype: recurring\ntitle: Once\nstatus: open\ndo-on: 2026-11-18\nrepeat:\n  once: 2026-11-18\n---\nBody\n";
    const { fake, host } = await setup({ "Tasks/once.md": text });
    expect(await completeRecurring(host, await task(host, "Tasks/once.md"), "done", "2026-11-18")).toBeNull();
    expect(fake.readFile("Tasks/once.md")).toBe("---\ntype: recurring\ntitle: Once\nstatus: open\nrepeat:\n  once: 2026-11-18\n---\nBody\n\n## Log\n- 2026-11-18 done\n");
  });

  it("refuses a file changed since the read, a rule that can't be read, and a file gone — writing nothing", async () => {
    const { fake, host } = await setup({ "Tasks/invoices.md": INVOICES, "Tasks/bad.md": INVOICES.replace("days: [5]", "days: [fry]") });
    const stale = await task(host, "Tasks/invoices.md");
    await new Promise((r) => setTimeout(r, 5));
    fake.writeFile("Tasks/invoices.md", INVOICES.replace("lead-days: 3", "lead-days: 4"));
    await expect(completeRecurring(host, stale, "done", "2026-11-18")).rejects.toThrow(new WriteError("Changed on disk since the Planner read it — not saved. The row shows the file as it is now."));
    expect(fake.readFile("Tasks/invoices.md")).toBe(INVOICES.replace("lead-days: 3", "lead-days: 4"));
    await expect(completeRecurring(host, await task(host, "Tasks/bad.md"), "done", "2026-11-18")).rejects.toThrow("Not saved: fix the repeat rule first.");
    const gone = await task(host, "Tasks/invoices.md");
    fake.deleteFile("Tasks/invoices.md");
    await expect(completeRecurring(host, gone, "done", "2026-11-18")).rejects.toThrow("Not saved: the file is gone.");
  });

  it("the log write fails: nothing is written", async () => {
    const { fake, host } = await setup({ "Tasks/invoices.md": INVOICES });
    const t = await task(host, "Tasks/invoices.md");
    await expect(completeRecurring(failing(host, "setBody"), t, "done", "2026-11-18")).rejects.toThrow("Not saved: EACCES: permission denied.");
    expect(fake.readFile("Tasks/invoices.md")).toBe(INVOICES);
  });

  it("the do-on write fails after the log line: the file is put back as it was — never logged without advancing", async () => {
    const { fake, host } = await setup({ "Tasks/invoices.md": INVOICES });
    const t = await task(host, "Tasks/invoices.md");
    await expect(completeRecurring(failing(host, "setField"), t, "done", "2026-11-18")).rejects.toThrow("Not saved: EACCES: permission denied.");
    expect(fake.readFile("Tasks/invoices.md")).toBe(INVOICES);
  });

  it("the do-on write and the putting back both fail: the error says the log line is in and what do-on to set", async () => {
    const { fake, host } = await setup({ "Tasks/invoices.md": INVOICES });
    const t = await task(host, "Tasks/invoices.md");
    const broken = failing(failing(host, "setField"), "write");
    await expect(completeRecurring(broken, t, "skipped", "2026-11-18")).rejects.toThrow("Logged “skipped”, but do-on couldn't be moved (EACCES: permission denied) — set “do-on: 2026-12-05” by hand.");
    expect(fake.readFile("Tasks/invoices.md")).toBe(INVOICES.replace("## Log\n", "## Log\n- 2026-11-18 skipped\n"));
  });
});

describe("notes, thoughts and daily notes", () => {
  const NOTE = "---\ntype: note\ntitle: Quiz timer idea\nstatus: open\ncreated: 2026-11-09\n---\nA countdown on every question.\n";
  const THOUGHT = "---\ntype: thought\ntitle: Why do we test # really\nstatus: open\ncreated: 2026-11-09\n---\nHmm.\n";

  it("resolving a thought: status resolved and done-on, field-only; reopening gives the bytes back; never over a newer file", async () => {
    const { fake, host } = await setup({ "Tasks/why.md": THOUGHT });
    await resolveThought(host, await task(host, "Tasks/why.md"), true, "2026-11-17");
    expect(fake.readFile("Tasks/why.md")).toBe(THOUGHT.replace("status: open", "status: resolved").replace("created: 2026-11-09\n", "created: 2026-11-09\ndone-on: 2026-11-17\n"));
    await resolveThought(host, await task(host, "Tasks/why.md"), false, "2026-11-17");
    expect(fake.readFile("Tasks/why.md")).toBe(THOUGHT);
    const stale = await task(host, "Tasks/why.md");
    await new Promise((r) => setTimeout(r, 5));
    fake.writeFile("Tasks/why.md", `${THOUGHT}more\n`);
    await expect(resolveThought(host, stale, true, "2026-11-17")).rejects.toThrow(WriteError);
    expect(fake.readFile("Tasks/why.md")).toContain("status: open");
  });

  it("archiving moves a note into _archive/ keeping its sub-folder and bytes; a taken name steps to -2; restoring brings it back", async () => {
    const { fake, host } = await setup({ "Tasks/QuizLab/idea.md": NOTE, "Tasks/_archive/QuizLab/idea.md": "taken" });
    const to = await archiveItem(host, "Tasks", await task(host, "Tasks/QuizLab/idea.md"));
    expect(to).toBe("Tasks/_archive/QuizLab/idea-2.md");
    expect(fake.readFile(to)).toBe(NOTE);
    expect(fake.readFile("Tasks/_archive/QuizLab/idea.md")).toBe("taken");
    const items = await readItemsAt(host, "Tasks");
    const archived = items?.tasks.find((t) => t.path === to);
    expect(archived).toMatchObject({ archived: true, folder: "QuizLab", type: "note" });
    expect(await restoreItem(host, "Tasks", archived!)).toBe("Tasks/QuizLab/idea-2.md");
    expect(fake.readFile("Tasks/QuizLab/idea-2.md")).toBe(NOTE);
  });

  it("a note gone since the read is not archived", async () => {
    const { fake, host } = await setup({ "Tasks/idea.md": NOTE });
    const t = await task(host, "Tasks/idea.md");
    fake.deleteFile("Tasks/idea.md");
    await expect(archiveItem(host, "Tasks", t)).rejects.toThrow("Couldn't archive it: the file is gone.");
  });

  it("the day's daily note: made from the template; a taken path is the note already there — never overwritten", async () => {
    const { fake, host } = await setup({ "Templates/Daily.md": "---\ntags: [daily]\n---\n## Plan\n- [ ] a\n" });
    expect(await createDailyNote(host, "Tasks", "2026-11-10", "Templates/Daily.md")).toEqual({ path: "Tasks/Daily/2026-11-10.md", result: "created" });
    expect(fake.readFile("Tasks/Daily/2026-11-10.md")).toBe("---\ntype: daily-note\ndate: 2026-11-10\ntags: [daily]\n---\n## Plan\n- [ ] a\n");
    fake.writeFile("Tasks/Daily/2026-11-10.md", "mine");
    expect(await createDailyNote(host, "Tasks", "2026-11-10", "Templates/Daily.md")).toEqual({ path: "Tasks/Daily/2026-11-10.md", result: "exists" });
    expect(fake.readFile("Tasks/Daily/2026-11-10.md")).toBe("mine");
  });

  it("a missing template makes the built-in note", async () => {
    const { fake, host } = await setup({});
    await createDailyNote(host, "Tasks", "2026-11-10", "Templates/Gone.md");
    expect(fake.readFile("Tasks/Daily/2026-11-10.md")).toBe("---\ntype: daily-note\ndate: 2026-11-10\n---\n# Tuesday, November 10, 2026\n\n- [ ]\n");
  });

  it("reads Daily/ and _archive/ with its sub-folders; daily notes with their progress", async () => {
    const { host } = await setup({
      "Tasks/Daily/2026-11-10.md": "---\ntype: daily-note\ndate: 2026-11-10\n---\n- [x] a\n- [ ] b\n",
      "Tasks/_archive/old.md": NOTE,
      "Tasks/_archive/QuizLab/older.md": NOTE,
      "Tasks/_archive/QuizLab/deeper/no.md": NOTE,
      "Tasks/_archive/QuizLab/broken.md": "---\ntype: note\nx: [\n---\n",
    });
    const items = await readItemsAt(host, "Tasks");
    expect(items?.folders).toEqual([]);
    expect(items?.tasks.map((t) => [t.path, t.folder, t.archived, t.progress]).sort()).toEqual([
      ["Tasks/Daily/2026-11-10.md", null, false, { done: 1, total: 2 }],
      ["Tasks/_archive/QuizLab/older.md", "QuizLab", true, null],
      ["Tasks/_archive/old.md", null, true, null],
    ]);
    expect(items?.unreadable.map((u) => [u.path, u.archived])).toEqual([["Tasks/_archive/QuizLab/broken.md", true]]);
  });

  it("texts are read once per file version: a cached text stays while the mtime holds; every text with allTexts", async () => {
    const { fake, host } = await setup({ "Tasks/a.md": NOTE, "Tasks/Daily/2026-11-10.md": "---\ntype: daily-note\n---\n- [ ] a\n" });
    const cache: TextCache = new Map();
    let reads = 0;
    const counting = new Proxy(host, {
      get(target, key) {
        if (key !== "files") return Reflect.get(target, key) as unknown;
        return new Proxy(target.files, {
          get(files, k) {
            if (k === "readFile") {
              return (p: { path: string }) => {
                reads++;
                return files.readFile(p);
              };
            }
            return Reflect.get(files, k) as unknown;
          },
        });
      },
    });
    const first = await readItemsAt(counting, "Tasks", { allTexts: true, cache });
    expect(reads).toBe(2);
    expect(first?.tasks.find((t) => t.path === "Tasks/a.md")?.excerpt).toBe("A countdown on every question.");
    await readItemsAt(counting, "Tasks", { allTexts: true, cache });
    expect(reads).toBe(2);
    await new Promise((r) => setTimeout(r, 5));
    fake.writeFile("Tasks/a.md", NOTE.replace("A countdown", "A timer"));
    const third = await readItemsAt(counting, "Tasks", { allTexts: true, cache });
    expect(reads).toBe(3);
    expect(third?.tasks.find((t) => t.path === "Tasks/a.md")?.excerpt).toBe("A timer on every question.");
    fake.deleteFile("Tasks/a.md");
    await readItemsAt(counting, "Tasks", { allTexts: true, cache });
    expect([...cache.keys()]).toEqual(["Tasks/Daily/2026-11-10.md"]);
  });
});

describe("saveItemEdit and saveBody — an item edited in its compact view", () => {
  it("fields are field-only writes: the changed key's line alone, a removed key's line gone, the body and comments as they were", async () => {
    const { fake, host } = await setup();
    await saveItemEdit(host, await task(host, "Tasks/tax.md"), {
      fields: [
        { key: "deadline", value: "2026-11-20" },
        { key: "importance", value: null },
        { key: "do-on", value: "2026-11-18" },
      ],
      repeat: null,
    });
    expect(fake.readFile("Tasks/tax.md")).toBe("---\ntype: task\ntitle: Pay the tax # due soon\nstatus: open\ndeadline: 2026-11-20\ncreated: 2026-11-09\ndo-on: 2026-11-18\n---\nBody stays.\n");
  });

  it("importance is written as a number, a title that needs quotes with them", async () => {
    const { fake, host } = await setup();
    await saveItemEdit(host, await task(host, "Tasks/tax.md"), { fields: [{ key: "importance", value: 2.5 }, { key: "title", value: "Tax: pay it" }], repeat: null });
    expect(fake.readFile("Tasks/tax.md")).toBe(TEXT.replace("importance: 5", "importance: 2.5").replace("title: Pay the tax # due soon", 'title: "Tax: pay it" # due soon'));
  });

  it("the body is a body-only write: every byte of the frontmatter stays", async () => {
    const { fake, host } = await setup();
    await saveBody(host, await task(host, "Tasks/tax.md"), "Line one\n\n- [ ] two\n");
    expect(fake.readFile("Tasks/tax.md")).toBe(TEXT.replace("Body stays.\n", "Line one\n\n- [ ] two\n"));
  });

  it("both refuse a file changed since it was read, as a StaleError, and write nothing", async () => {
    const { fake, host } = await setup();
    const stale = await task(host, "Tasks/tax.md");
    await new Promise((r) => setTimeout(r, 5));
    const changed = TEXT.replace("Body stays.", "Edited elsewhere.");
    fake.writeFile("Tasks/tax.md", changed);
    await expect(saveBody(host, stale, "Mine\n")).rejects.toBeInstanceOf(StaleError);
    await expect(saveItemEdit(host, stale, { fields: [{ key: "deadline", value: "2026-11-20" }], repeat: null })).rejects.toBeInstanceOf(StaleError);
    expect(fake.readFile("Tasks/tax.md")).toBe(changed);
  });

  it("a file gone since the read is not saved", async () => {
    const { fake, host } = await setup();
    const gone = await task(host, "Tasks/tax.md");
    fake.deleteFile("Tasks/tax.md");
    await expect(saveBody(host, gone, "x\n")).rejects.toThrow("Not saved: the file is gone.");
  });

  const INVOICES = "---\ntype: recurring\ntitle: Upload invoices\nstatus: open\ndo-on: 2026-12-05          # the next occurrence\nrepeat:                    # the rule\n  monthly: { days: [5] }\n  lead-days: 3\ncreated: 2026-01-01\n---\nUpload all.\n\n## Log\n- 2026-11-04 done\n";
  const rule = (value: unknown) => {
    const read = recurring(value).repeat;
    if (read?.kind !== "ok") throw new Error("the rule can't be read");
    return read.schedule;
  };

  it("a rule replaces the repeat: key's own lines; do-on follows as a field-only write; the rest stays", async () => {
    const { fake, host } = await setup({ "Tasks/invoices.md": INVOICES });
    await saveItemEdit(host, await task(host, "Tasks/invoices.md"), { repeat: rule({ monthly: { days: [10] }, "lead-days": 3 }), fields: [{ key: "do-on", value: "2026-12-10" }] });
    expect(fake.readFile("Tasks/invoices.md")).toBe(
      "---\ntype: recurring\ntitle: Upload invoices\nstatus: open\ndo-on: 2026-12-10          # the next occurrence\nrepeat:\n  monthly: { days: [10] }\n  lead-days: 3\ncreated: 2026-01-01\n---\nUpload all.\n\n## Log\n- 2026-11-04 done\n",
    );
    expect((await task(host, "Tasks/invoices.md")).repeat).toMatchObject({ kind: "ok", description: "monthly on the 10th, shows 3 days early" });
  });

  it("a rule edit changes only the repeat: key's lines — CRLF line endings and a body that looks like frontmatter stay", async () => {
    const crlf = INVOICES.replaceAll("\n", "\r\n");
    const tricky = `${INVOICES}---\nrepeat:\n  not: this\n---\n`;
    const { fake, host } = await setup({ "Tasks/crlf.md": crlf, "Tasks/tricky.md": tricky });
    await saveItemEdit(host, await task(host, "Tasks/crlf.md"), { repeat: rule({ weekly: { days: ["mon"] } }), fields: [] });
    expect(fake.readFile("Tasks/crlf.md")).toBe(crlf.replace("repeat:                    # the rule\r\n  monthly: { days: [5] }\r\n  lead-days: 3\r\n", "repeat:\r\n  weekly: { days: [mon] }\r\n"));
    await saveItemEdit(host, await task(host, "Tasks/tricky.md"), { repeat: rule({ daily: {} }), fields: [] });
    expect(fake.readFile("Tasks/tricky.md")).toBe(tricky.replace("repeat:                    # the rule\n  monthly: { days: [5] }\n  lead-days: 3\n", "repeat:\n  daily: {}\n"));
  });

  it("a rule edit over a file changed since the read is refused by the host (changed-on-disk) as a StaleError — nothing written", async () => {
    const { fake, host } = await setup({ "Tasks/invoices.md": INVOICES });
    const stale = await task(host, "Tasks/invoices.md");
    const changed = INVOICES.replace("Upload all.", "Edited elsewhere.");
    fake.writeFile("Tasks/invoices.md", changed);
    await expect(saveItemEdit(host, stale, { repeat: rule({ daily: {} }), fields: [{ key: "do-on", value: "2026-12-10" }] })).rejects.toBeInstanceOf(StaleError);
    expect(fake.readFile("Tasks/invoices.md")).toBe(changed);
  });
});

describe("conditional writes", () => {
  /** `host` recording each `files.*` call's method and params. */
  function recording(host: HostClient, calls: [string, Record<string, unknown>][]): HostClient {
    const files = new Proxy(host.files, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver) as unknown;
        if (typeof value !== "function") return value;
        return (params: Record<string, unknown>) => {
          calls.push([String(key), params]);
          return (value as (p: unknown) => Promise<unknown>).call(target, params);
        };
      },
    });
    return new Proxy(host, { get: (target, key, receiver) => (key === "files" ? files : (Reflect.get(target, key, receiver) as unknown)) });
  }

  it("the first write of an action carries the mtime read as ifMtime — no re-read, no mtime compare of the Planner's own", async () => {
    const { host } = await setup();
    const t = await task(host, "Tasks/tax.md");
    const calls: [string, Record<string, unknown>][] = [];
    await tickTask(recording(host, calls), t, true, "2026-11-17");
    expect(calls).toEqual([
      ["setField", { path: "Tasks/tax.md", key: "status", value: "done", ifMtime: t.mtimeMs }],
      ["setField", { path: "Tasks/tax.md", key: "done-on", value: "2026-11-17" }],
    ]);
  });
});
