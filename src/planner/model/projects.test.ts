import { describe, expect, it } from "vitest";

import {
  compareSources,
  folderCandidates,
  folderForNew,
  folderKey,
  folderSources,
  isProjectFolder,
  matchProject,
  NAME_MAX,
  NONE_SOURCE,
  planFolders,
  sanitizeFolderName,
  sectionsBySource,
  sourceKey,
  sourceLabels,
  type FolderMap,
  type ProjectLike,
  type ProjectSource,
} from "./projects";

const P = (id: string, name: string, groupPath: string[] = []): ProjectLike => ({ id, name, groupPath });
const E = (folder: string, name = folder, groupPath: string[] = []) => ({ folder, name, groupPath });

describe("sanitizeFolderName", () => {
  it.each([
    ["QuizLab", "QuizLab"],
    ["Pomade", "Pomade"],
    ["Client/Server", "Client-Server"],
    ["A\\B", "A-B"],
    ["Notes: 2026", "Notes- 2026"],
    [".dotfiles", "dotfiles"],
    ["...hidden", "hidden"],
    [" . lead", "lead"],
    ["trailing   ", "trailing"],
    ["trailing dot.", "trailing dot"],
    ["dots and spaces . . ", "dots and spaces"],
    ["tab\tand\nnewline", "tab and newline"],
    ["bell\u0007char", "bellchar"],
    ["many    spaces", "many spaces"],
    ["Café", "Café"],
    ["Café", "Café"],
    ["プロジェクト", "プロジェクト"],
    ["Daily", "Daily"],
    ["", "Project"],
    ["   ", "Project"],
    ["...", "Project"],
    ["/", "-"],
  ])("%j → %j", (name, folder) => {
    expect(sanitizeFolderName(name)).toBe(folder);
  });

  it(`caps a long name at ${NAME_MAX} characters, without a trailing space or dot`, () => {
    expect(Array.from(sanitizeFolderName("x".repeat(200))).length).toBe(NAME_MAX);
    expect(sanitizeFolderName(`${"a".repeat(NAME_MAX - 1)} b`)).toBe("a".repeat(NAME_MAX - 1));
    expect(Array.from(sanitizeFolderName("😀".repeat(100))).length).toBe(NAME_MAX);
  });
});

describe("isProjectFolder and folderKey", () => {
  it.each([
    ["QuizLab", true],
    ["Daily", false],
    ["daily", false],
    ["_archive", false],
    ["_Archive", false],
    [".git", false],
    ["_scratch", true],
  ])("%s → %s", (name, expected) => {
    expect(isProjectFolder(name)).toBe(expected);
  });

  it("compares names case- and normalization-insensitively", () => {
    expect(folderKey("QuizLab")).toBe(folderKey("quizlab"));
    expect(folderKey("Café")).toBe(folderKey("café"));
  });
});

describe("folderCandidates", () => {
  it("ungrouped: the name, then (2), (3), …", () => {
    expect(folderCandidates("QuizLab", [], 4)).toEqual(["QuizLab", "QuizLab (2)", "QuizLab (3)", "QuizLab (4)"]);
  });

  it("grouped: the name, then (<group>), then (<group> 2), …", () => {
    expect(folderCandidates("QuizLab", ["Archive"], 4)).toEqual(["QuizLab", "QuizLab (Archive)", "QuizLab (Archive 2)", "QuizLab (Archive 3)"]);
  });

  it("nested: the innermost group, then the whole path", () => {
    expect(folderCandidates("QuizLab", ["Building tools", "Tools"], 4)).toEqual(["QuizLab", "QuizLab (Tools)", "QuizLab (Building tools › Tools)", "QuizLab (Tools 2)"]);
  });

  it("group names are made safe too; a group that leaves nothing is skipped", () => {
    expect(folderCandidates("A/B", ["x:y", "..."], 3)).toEqual(["A-B", "A-B (x-y)", "A-B (x-y 2)"]);
    expect(folderCandidates("A", ["..."], 2)).toEqual(["A", "A (2)"]);
  });

  it("gives as many as asked, all different", () => {
    const all = folderCandidates("Q", ["G"]);
    expect(all).toHaveLength(100);
    expect(new Set(all.map(folderKey)).size).toBe(100);
  });
});

describe("folderForNew", () => {
  it("a mapped project keeps its folder", () => {
    expect(folderForNew(P("q", "QuizLab Renamed"), { q: E("QuizLab") })).toEqual({ folder: "QuizLab", entry: E("QuizLab", "QuizLab Renamed"), isNew: false });
  });

  it("an unmapped project takes its name", () => {
    expect(folderForNew(P("q", "QuizLab", ["Work"]), {})).toEqual({ folder: "QuizLab", entry: E("QuizLab", "QuizLab", ["Work"]), isNew: true });
  });

  it("the later of two same-named projects gets its group appended; whoever is mapped keeps the plain name", () => {
    const map: FolderMap = { a: E("QuizLab") };
    expect(folderForNew(P("b", "QuizLab", ["Archive"]), map).folder).toBe("QuizLab (Archive)");
    expect(folderForNew(P("c", "quizlab"), map).folder).toBe("quizlab (2)");
    expect(folderForNew(P("d", "QuizLab", ["Archive"]), { ...map, b: E("QuizLab (Archive)") }).folder).toBe("QuizLab (Archive 2)");
  });

  it("a project named like a reserved folder never takes it", () => {
    expect(folderForNew(P("d", "Daily"), {}).folder).toBe("Daily (2)");
    expect(folderForNew(P("d", "Daily", ["Life"]), {}).folder).toBe("Daily (Life)");
    expect(folderForNew(P("a", "_archive"), {}).folder).toBe("_archive (2)");
  });

  it("an unknown id's entry still reserves its folder", () => {
    expect(folderForNew(P("new", "Old"), { gone: E("Old") }).folder).toBe("Old (2)");
  });
});

describe("planFolders", () => {
  it("nothing to do when every folder matches its project", () => {
    const map: FolderMap = { q: E("QuizLab"), p: E("Pomade") };
    expect(planFolders([P("q", "QuizLab"), P("p", "Pomade")], map, ["QuizLab", "Pomade"])).toEqual({ map, moves: [], collisions: [], changed: false });
  });

  it("a rename moves the folder and updates the map", () => {
    const plan = planFolders([P("q", "QuizLab 2")], { q: E("QuizLab") }, ["QuizLab"]);
    expect(plan.moves).toEqual([{ id: "q", from: "QuizLab", to: "QuizLab 2" }]);
    expect(plan.map).toEqual({ q: E("QuizLab 2") });
    expect(plan.changed).toBe(true);
    expect(plan.collisions).toEqual([]);
  });

  it("a rename onto a folder that is already there is a collision: nothing moves, the map keeps the old folder", () => {
    const plan = planFolders([P("q", "Quiz")], { q: E("QuizLab") }, ["QuizLab", "quiz"]);
    expect(plan.moves).toEqual([]);
    expect(plan.collisions).toEqual([{ id: "q", name: "Quiz", from: "QuizLab", to: "Quiz" }]);
    expect(plan.map.q?.folder).toBe("QuizLab");
  });

  it("renamed while Pomade was closed: the same plan from the map and the stable id", () => {
    const plan = planFolders([P("q", "Quizzy"), P("p", "Pomade")], { q: E("QuizLab"), p: E("Pomade") }, ["Pomade", "QuizLab"]);
    expect(plan.moves).toEqual([{ id: "q", from: "QuizLab", to: "Quizzy" }]);
  });

  it("the old folder gone (moved by hand, or never made): the entry points at the new name, nothing moves", () => {
    expect(planFolders([P("q", "Quizzy")], { q: E("QuizLab") }, [])).toMatchObject({ moves: [], collisions: [], map: { q: E("Quizzy") }, changed: true });
    expect(planFolders([P("q", "Quizzy")], { q: E("QuizLab") }, ["Quizzy"])).toMatchObject({ moves: [], collisions: [], map: { q: E("Quizzy") } });
  });

  it("a case-only rename keeps the folder (the disk can't tell them apart) but records the new name", () => {
    const plan = planFolders([P("q", "Quizlab")], { q: E("QuizLab") }, ["QuizLab"]);
    expect(plan.moves).toEqual([]);
    expect(plan.map).toEqual({ q: E("QuizLab", "Quizlab") });
    expect(plan.changed).toBe(true);
  });

  it("a rename into a name another project holds takes the suffix", () => {
    const plan = planFolders([P("a", "QuizLab"), P("b", "QuizLab", ["Archive"])], { a: E("QuizLab"), b: E("Old") }, ["QuizLab", "Old"]);
    expect(plan.moves).toEqual([{ id: "b", from: "Old", to: "QuizLab (Archive)" }]);
  });

  it("regroup: the folder changes only when the suffix rule requires it", () => {
    // A plain-named project moves to another group: its folder stays.
    expect(planFolders([P("q", "QuizLab", ["New"])], { q: E("QuizLab", "QuizLab", ["Old"]) }, ["QuizLab"]).moves).toEqual([]);
    // The suffixed one of a pair moves group: the suffix follows.
    const pair = { a: E("QuizLab"), b: E("QuizLab (Archive)", "QuizLab", ["Archive"]) };
    expect(planFolders([P("a", "QuizLab"), P("b", "QuizLab", ["Old"])], pair, ["QuizLab", "QuizLab (Archive)"]).moves).toEqual([{ id: "b", from: "QuizLab (Archive)", to: "QuizLab (Old)" }]);
    // The plain one is renamed away: the suffixed one keeps its folder — still one of its names.
    expect(planFolders([P("a", "Quiz"), P("b", "QuizLab", ["Archive"])], pair, ["QuizLab", "QuizLab (Archive)"]).moves).toEqual([{ id: "a", from: "QuizLab", to: "Quiz" }]);
  });

  it("an unmapped project takes over a folder of its name; of a same-named pair, the first in sidebar order", () => {
    const plan = planFolders([P("a", "QuizLab"), P("b", "QuizLab", ["Archive"]), P("c", "Nothing")], {}, ["QuizLab", "QuizLab (Archive)"]);
    expect(plan.map).toEqual({ a: E("QuizLab"), b: E("QuizLab (Archive)", "QuizLab", ["Archive"]) });
    expect(plan.moves).toEqual([]);
    expect(plan.changed).toBe(true);
  });

  it("an unmapped project leaves another project's folder alone", () => {
    expect(planFolders([P("b", "QuizLab")], { a: E("QuizLab") }, ["QuizLab"]).map).toEqual({ a: E("QuizLab") });
  });

  it("entries of projects Pomade no longer lists stay, and keep their folder reserved", () => {
    const plan = planFolders([P("b", "Old")], { gone: E("Old") }, ["Old"]);
    expect(plan.map).toEqual({ gone: E("Old") });
    expect(plan.changed).toBe(false);
  });

  it("a mapped name that became a reserved one moves out of the way", () => {
    expect(planFolders([P("q", "Daily")], { q: E("QuizLab") }, ["QuizLab"]).moves).toEqual([{ id: "q", from: "QuizLab", to: "Daily (2)" }]);
  });

  it("is idempotent: planning again from its result does nothing", () => {
    const projects = [P("a", "Quiz"), P("b", "QuizLab", ["Archive"]), P("c", "Pomade")];
    const first = planFolders(projects, { a: E("QuizLab"), b: E("QuizLab (Archive)", "QuizLab", ["Archive"]) }, ["QuizLab", "QuizLab (Archive)", "Pomade"]);
    const disk = ["Quiz", "QuizLab (Archive)", "Pomade"];
    expect(planFolders(projects, first.map, disk)).toEqual({ map: first.map, moves: [], collisions: [], changed: false });
  });
});

describe("folderSources and labels", () => {
  const map: FolderMap = { q: E("QuizLab", "QuizLab", ["Work"]), old: E("Archive me", "Archive me") };

  it("names each folder by its project — live names over the map's — and a folder nobody owns by itself", () => {
    const sources = folderSources(["QuizLab", "Stray", "Archive me"], map, [P("q", "QuizLab Renamed", ["Work"])]);
    expect(sources.get(folderKey("QuizLab"))).toMatchObject({ key: "q", id: "q", name: "QuizLab Renamed", folder: "QuizLab" });
    expect(sources.get(folderKey("Stray"))).toMatchObject({ key: "folder:stray", id: null, name: "Stray" });
    expect(sources.get(folderKey("Archive me"))).toMatchObject({ key: "old", name: "Archive me" });
  });

  it("a folder an unmapped project would take over shows as that project's already", () => {
    expect(folderSources(["Pomade"], {}, [P("p", "Pomade")]).get(folderKey("Pomade"))).toMatchObject({ key: "p", id: "p" });
  });

  it("the command (no live list) names folders from the map alone", () => {
    expect(folderSources(["QuizLab", "Pomade"], map, null).get(folderKey("Pomade"))).toMatchObject({ id: null, name: "Pomade" });
  });

  it("labels qualify same-named sources with their group path, Ungrouped, or folder only", () => {
    const s = (key: string, name: string, groupPath: string[], id: string | null = key): ProjectSource => ({ kind: "project", key, id, name, groupPath, folder: name });
    const labels = sourceLabels([NONE_SOURCE, s("a", "QuizLab", []), s("b", "QuizLab", ["Building tools", "Tools"]), s("folder:quizlab", "quizlab", [], null), s("p", "Pomade", ["Work"])]);
    expect(labels.get("none")?.text).toBe("No project");
    expect(labels.get("a")?.text).toBe("QuizLab (Ungrouped)");
    expect(labels.get("b")?.text).toBe("QuizLab (Building tools › Tools)");
    expect(labels.get("folder:quizlab")?.text).toBe("quizlab (folder only)");
    expect(labels.get("p")).toEqual({ name: "Pomade", qualifier: null, text: "Pomade" });
  });
});

describe("sectionsBySource", () => {
  const s = (key: string, name: string, groupPath: string[] = []): ProjectSource => ({ kind: "project", key, id: key, name, groupPath, folder: name });
  it("no project first, then projects by name (case-insensitive, numeric), group, folder; items keep their order", () => {
    const q = s("q", "QuizLab");
    const p = s("p", "pomade");
    const q2 = s("q2", "QuizLab", ["Archive"]);
    const items = [
      { t: 1, src: q },
      { t: 2, src: NONE_SOURCE },
      { t: 3, src: p },
      { t: 4, src: q },
      { t: 5, src: q2 },
    ];
    const sections = sectionsBySource(items, (i) => i.src);
    expect(sections.map((sec) => [sourceKey(sec.source), sec.items.map((i) => i.t)])).toEqual([
      ["none", [2]],
      ["p", [3]],
      ["q", [1, 4]],
      ["q2", [5]],
    ]);
    expect(compareSources(s("a", "Project 2"), s("b", "Project 10"))).toBeLessThan(0);
  });
});

describe("matchProject", () => {
  const s = (key: string, name: string, groupPath: string[], folder = name): ProjectSource => ({ kind: "project", key, id: key, name, groupPath, folder });
  const sources = [s("a", "QuizLab", []), s("b", "QuizLab", ["Building tools", "Archive"], "QuizLab (Archive)"), s("p", "Pomade", ["Work"])];

  it("a unique name, any case", () => {
    expect(matchProject("pomade", sources)).toMatchObject({ kind: "one", source: { key: "p" } });
  });

  it("a shared name is ambiguous, with the labels to choose from", () => {
    expect(matchProject("QuizLab", sources)).toEqual({ kind: "ambiguous", choices: ["QuizLab (Building tools › Archive)", "QuizLab (Ungrouped)"] });
  });

  it.each([
    ["QuizLab (Archive)", "b"],
    ["quizlab (building tools › archive)", "b"],
    ["QuizLab (Ungrouped)", "a"],
    ["Pomade (Work)", "p"],
  ])("%s → %s", (query, key) => {
    expect(matchProject(query, sources)).toMatchObject({ kind: "one", source: { key } });
  });

  it("nothing of that name: the known ones", () => {
    expect(matchProject("Nope", sources)).toEqual({ kind: "none", known: ["Pomade", "QuizLab (Building tools › Archive)", "QuizLab (Ungrouped)"] });
  });
});
