import { describe, expect, it } from "vitest";

import { t } from "./fixtures";
import { compareIds, compareTickets, priorityRank } from "./order";

describe("priorityRank", () => {
  it.each([
    ["P0", 0],
    ["P1", 1],
    ["P2", 2],
    ["P3", 3],
    ["P4", 4],
    ["p1", 4],
    ["high", 4],
    ["", 4],
    [null, 4],
  ] as const)("%j → %d", (p, rank) => {
    expect(priorityRank(p)).toBe(rank);
  });
});

describe("compareIds", () => {
  it.each([
    ["E-9", "E-10", -1],
    ["E-010", "E-9", 1],
    ["E-017", "E-017", 0],
    ["E-999", "T-001", -1],
    ["P-001", "E-001", 1],
    ["E-001", "idea", -1],
    ["idea", "E-001", 1],
    ["alpha", "beta", -1],
    ["E-001", "E-1", -1], // equal numbers: the text decides, so the order is stable
  ] as const)("%s vs %s → %d", (a, b, sign) => {
    expect(Math.sign(compareIds(a, b))).toBe(sign);
  });
});

describe("compareTickets", () => {
  it("orders by priority (P0 first, none last), then ID", () => {
    const tickets = [
      t("E-3", { priority: null }),
      t("T-1", { priority: "P2" }),
      t("E-10", { priority: "P1" }),
      t("E-9", { priority: "P1" }),
      t("E-1", { priority: "P3" }),
      t("T-2", { priority: "P0" }),
      t("E-2", { priority: "weird" }),
    ];
    expect([...tickets].sort(compareTickets).map((x) => x.id)).toEqual(["T-2", "E-9", "E-10", "T-1", "E-1", "E-2", "E-3"]);
  });

  it("keeps two files with one ID in path order", () => {
    const a = t("E-1", { path: "a/E-1-x.md" });
    const b = t("E-1", { path: "b/E-1-x.md" });
    expect([b, a].sort(compareTickets)).toEqual([a, b]);
  });
});
