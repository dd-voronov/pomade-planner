import { describe, expect, it } from "vitest";

import { recurring, task } from "./fixtures";
import { ROW_MENU_LABELS, rowActionIds, rowMenuEntries, type RowMenuEntry, type RowMenuPin } from "./row-menu";
import type { Task } from "./items";

const labels = (entries: readonly RowMenuEntry[]) => entries.map((e) => ROW_MENU_LABELS[e]);
const menuOf = (t: Task, pin: RowMenuPin = "unpinned", done = t.done, locked = false) => labels(rowMenuEntries(rowActionIds(t, done, locked), pin));

describe("a row's menu", () => {
  it("a task: Open in tab, its pin, Select…, Delete…", () => {
    expect(menuOf(task())).toEqual(["Open in tab", "Pin", "Select…", "Delete…"]);
    expect(menuOf(task({ done: true }), "pinned")).toEqual(["Open in tab", "Unpin", "Select…", "Delete…"]);
  });

  it("a recurring item: Skip after the pin, none while locked", () => {
    const r = recurring({ every: "day", from: "2026-11-01" });
    expect(menuOf(r)).toEqual(["Open in tab", "Pin", "Skip", "Select…", "Delete…"]);
    expect(menuOf(r, "unpinned", false, true)).toEqual(["Open in tab", "Pin", "Select…", "Delete…"]);
  });

  it("a thought: Resolve, or Reopen once resolved", () => {
    expect(menuOf(task({ type: "thought" }))).toEqual(["Open in tab", "Pin", "Resolve", "Select…", "Delete…"]);
    expect(menuOf(task({ type: "thought" }), "pinned", true)).toEqual(["Open in tab", "Unpin", "Reopen", "Select…", "Delete…"]);
  });

  it("a note: Archive; an archived note or recurring item: Restore", () => {
    expect(menuOf(task({ type: "note" }))).toEqual(["Open in tab", "Pin", "Archive", "Select…", "Delete…"]);
    expect(menuOf(task({ type: "note", archived: true }))).toEqual(["Open in tab", "Pin", "Restore", "Select…", "Delete…"]);
    expect(menuOf(recurring({ every: "day", from: "2026-11-01" }, { archived: true }))).toEqual(["Open in tab", "Pin", "Restore", "Select…", "Delete…"]);
  });

  it("a daily note: no actions of its own; on its card, Unpin for today", () => {
    const note = task({ type: "daily-note" });
    expect(menuOf(note)).toEqual(["Open in tab", "Pin", "Select…", "Delete…"]);
    expect(menuOf(note, "card")).toEqual(["Open in tab", "Unpin for today", "Select…", "Delete…"]);
  });

  it("an unreadable file: Open in tab, Select… and Delete… only", () => {
    expect(labels(rowMenuEntries([], null))).toEqual(["Open in tab", "Select…", "Delete…"]);
  });
});
