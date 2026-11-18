import { describe, expect, it } from "vitest";

import { t } from "./fixtures";
import { filterParents, parentCandidates } from "./parents";

const tickets = [
  t("P-1", { title: "Slow start", status: "planned" }),
  t("P-12", { title: "Flaky sync", status: "grooming" }),
  t("P-3", { title: "Old", status: "done" }),
  t("P-4", { title: "Ignored", status: "dropped" }),
  t("E-17", { title: "Icon picker redesign", status: "review" }),
  t("E-2", { title: "Sync rewrite", status: "in-progress" }),
  t("E-9", { title: "Repository setup", status: "done", inDone: true }),
  t("T-1", { title: "Cache the index" }),
  t("S-1", { title: "Cmd+click" }),
];

const ids = (list: { id: string }[]) => list.map((x) => x.id);

describe("parentCandidates", () => {
  it.each([
    ["epic", ["P-12", "P-1", "P-4", "P-3"]],
    ["signal", ["P-12", "P-1", "P-4", "P-3"]],
    ["task", ["E-17", "E-2", "E-9"]],
    ["problem", []],
  ] as const)("a %s picks from %j: open first, newest ID first", (kind, expected) => {
    expect(ids(parentCandidates(tickets, kind))).toEqual(expected);
  });

  it("lists one entry per ID", () => {
    expect(ids(parentCandidates([t("E-1"), t("E-1", { path: "other.md" }), t("E-2")], "task"))).toEqual(["E-2", "E-1"]);
  });

  it("an empty backlog has no candidates", () => {
    expect(parentCandidates([], "task")).toEqual([]);
  });

  it("orders 999 before 1000 as numbers", () => {
    expect(ids(parentCandidates([t("E-999"), t("E-1000"), t("E-100")], "task"))).toEqual(["E-1000", "E-999", "E-100"]);
  });
});

describe("filterParents", () => {
  const all = parentCandidates(tickets, "task");
  it.each([
    ["", ["E-17", "E-2", "E-9"]],
    ["   ", ["E-17", "E-2", "E-9"]],
    ["e-17", ["E-17"]],
    ["17", ["E-17"]],
    ["sync", ["E-2"]],
    ["SYNC", ["E-2"]],
    ["icon redesign", ["E-17"]],
    ["redesign icon", ["E-17"]],
    ["icon sync", []],
    ["e-", ["E-17", "E-2", "E-9"]],
    ["zzz", []],
  ])("%j → %j", (query, expected) => {
    expect(ids(filterParents(all, query))).toEqual(expected);
  });
});
