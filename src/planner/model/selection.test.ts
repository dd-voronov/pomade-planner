import { describe, expect, it } from "vitest";

import {
  canArchive,
  deleteHeading,
  deleteBatches,
  deleteFailure,
  deleteOutcome,
  EMPTY_SELECTION,
  isArchivable,
  pruneSelection,
  selectAllState,
  selectedRows,
  toggleAll,
  toggleRow,
  type Selection,
  type SelectableRow,
} from "./selection";

const ROWS = ["a", "b", "c", "d", "e"];
const sel = (paths: string[], anchor: string | null = null): Selection => ({ paths: new Set(paths), anchor });
const paths = (s: Selection) => [...s.paths].sort();

describe("toggleRow", () => {
  it("flips one row and makes it the anchor", () => {
    const one = toggleRow(EMPTY_SELECTION, "b", ROWS, false);
    expect(paths(one)).toEqual(["b"]);
    expect(one.anchor).toBe("b");
    const off = toggleRow(one, "b", ROWS, false);
    expect(paths(off)).toEqual([]);
    expect(off.anchor).toBe("b");
  });

  it("Shift selects from the anchor to the row, either direction, and keeps the anchor", () => {
    const down = toggleRow(sel(["b"], "b"), "d", ROWS, true);
    expect(paths(down)).toEqual(["b", "c", "d"]);
    expect(down.anchor).toBe("b");
    const up = toggleRow(sel(["d"], "d"), "a", ROWS, true);
    expect(paths(up)).toEqual(["a", "b", "c", "d"]);
  });

  it("Shift from an unselected anchor clears the range, leaving rows outside it", () => {
    expect(paths(toggleRow(sel(["a", "b", "c", "e"], "d"), "b", ROWS, true))).toEqual(["a", "e"]);
  });

  it("Shift with no anchor, or one no longer listed, toggles the row alone", () => {
    expect(paths(toggleRow(EMPTY_SELECTION, "c", ROWS, true))).toEqual(["c"]);
    const gone = toggleRow(sel(["x"], "x"), "c", ROWS, true);
    expect(paths(gone)).toEqual(["c", "x"]);
    expect(gone.anchor).toBe("c");
  });

  it("ignores a row that isn't listed", () => {
    const s = sel(["a"], "a");
    expect(toggleRow(s, "zz", ROWS, false)).toBe(s);
  });
});

describe("select all", () => {
  it("reports none, some or all of the visible rows", () => {
    expect(selectAllState(EMPTY_SELECTION, ROWS)).toBe("none");
    expect(selectAllState(sel(["a", "x"]), ROWS)).toBe("some");
    expect(selectAllState(sel(ROWS), ROWS)).toBe("all");
    expect(selectAllState(EMPTY_SELECTION, [])).toBe("none");
  });

  it("selects every visible row, or clears when all already are", () => {
    expect(paths(toggleAll(sel(["b"]), ROWS))).toEqual(ROWS);
    expect(paths(toggleAll(sel(ROWS), ROWS))).toEqual([]);
    expect(toggleAll(sel(["b"], "b"), ROWS).anchor).toBeNull();
  });
});

describe("pruneSelection", () => {
  it("keeps only the rows still shown, and the anchor while it is", () => {
    const pruned = pruneSelection(sel(["a", "c", "x"], "x"), ROWS);
    expect(paths(pruned)).toEqual(["a", "c"]);
    expect(pruned.anchor).toBeNull();
    expect(pruneSelection(sel(["a"], "c"), ROWS).anchor).toBe("c");
  });

  it("returns the same selection when nothing changed", () => {
    const s = sel(["a", "c"], "a");
    expect(pruneSelection(s, ROWS)).toBe(s);
  });
});

const row = (path: string, type: SelectableRow["type"], archived = false, title = path, readable = true): SelectableRow => ({ path, title, type, archived, readable });

describe("selected rows and Archive", () => {
  const rows = [row("t", "task"), row("n1", "note"), row("n2", "note", true), row("u", "note", false, "u", false), row("n3", "note")];

  it("lists the selected rows in All's order", () => {
    expect(selectedRows(rows, sel(["n3", "t", "x"])).map((r) => r.path)).toEqual(["t", "n3"]);
  });

  it("archives only a selection of notes not yet archived", () => {
    expect(rows.map(isArchivable)).toEqual([false, true, false, false, true]);
    expect(canArchive(selectedRows(rows, sel(["n1", "n3"])))).toBe(true);
    expect(canArchive(selectedRows(rows, sel(["n1", "t"])))).toBe(false);
    expect(canArchive(selectedRows(rows, sel(["n2"])))).toBe(false);
    expect(canArchive([])).toBe(false);
  });
});

describe("the confirmation", () => {
  it("names one file by its title, more by their count", () => {
    expect(deleteHeading([row("a", "task", false, "Buy milk")])).toBe("Delete “Buy milk”?");
    expect(deleteHeading([row("a", "task"), row("b", "note"), row("c", "thought")])).toBe("Delete 3 files?");
  });
});

describe("deleteOutcome", () => {
  it("deleted and already-gone files are gone; the rest failed with a reason, in the order asked", () => {
    const outcome = deleteOutcome(
      ["a", "b", "c", "d"],
      [
        { path: "a", ok: true },
        { path: "b", ok: false, error: { code: "io-error", message: '"b" could not be moved to the Trash: EPERM' } },
        { path: "c", ok: false, error: { code: "not-found", message: '"c" does not exist' } },
        { path: "d", ok: false, error: { code: "capability-denied", message: "no" } },
      ],
    );
    expect(outcome.gone).toEqual(["a", "c"]);
    expect(outcome.failed).toEqual([
      { path: "b", text: "Couldn't move it to the Trash.", detail: '"b" could not be moved to the Trash: EPERM' },
      { path: "d", text: "Couldn't delete it: Pomade keeps that file.", detail: "no" },
    ]);
  });

  it("a path the answer leaves out failed", () => {
    expect(deleteOutcome(["a", "b"], [{ path: "a", ok: true }]).failed).toEqual([{ path: "b", text: "Couldn't delete it: Pomade didn't answer for it.", detail: "" }]);
  });

  it("says every error code the Host API gives", () => {
    expect(deleteFailure("outside-workspace")).toBe("Couldn't delete it: it's outside the workspace.");
    expect(deleteFailure("invalid-params")).toBe("Couldn't delete it: it's a folder.");
    expect(deleteFailure("something-new")).toBe("Couldn't delete it: Pomade refused.");
  });

  it("splits a long list into calls the Host API takes", () => {
    expect(deleteBatches([], 2)).toEqual([]);
    expect(deleteBatches(["a", "b", "c", "d", "e"], 2)).toEqual([["a", "b"], ["c", "d"], ["e"]]);
  });
});
