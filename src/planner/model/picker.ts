// The quick-add project picker (DESIGN §3.7): two steps, group → project, over Pomade's groups →
// projects tree. Step one lists "No project" first, then every group path that holds projects
// ("Building tools › Tools"), in sidebar order, and "Ungrouped" last; typing filters it to the
// matching projects (straight to them: "qui" → QuizLab) and the matching groups. Step two lists the
// chosen group's projects; typing filters them. Every word typed must match, ignoring case and
// accents.

export interface PickerProject {
  id: string;
  name: string;
  groupId: string | null;
  groupPath: readonly string[];
}

export interface PickerGroupInfo {
  id: string;
  path: readonly string[];
}

export const UNGROUPED = "__ungrouped__";

export interface PickerGroup {
  /** A group id, or `UNGROUPED`. */
  id: string;
  /** "Building tools › Tools", "Ungrouped". */
  label: string;
  projects: PickerProject[];
}

export type PickerOption = { kind: "none" } | { kind: "group"; group: PickerGroup } | { kind: "project"; project: PickerProject };

/** A group path as one label. */
export const groupLabel = (path: readonly string[]): string => (path.length === 0 ? "Ungrouped" : path.join(" › "));

/** The groups that hold projects directly, in sidebar order, each with its projects in sidebar order; Ungrouped last. */
export function pickerGroups(groups: readonly PickerGroupInfo[], projects: readonly PickerProject[]): PickerGroup[] {
  const out: PickerGroup[] = [];
  for (const g of groups) {
    const members = projects.filter((p) => p.groupId === g.id);
    if (members.length > 0) out.push({ id: g.id, label: groupLabel(g.path), projects: members });
  }
  const known = new Set(groups.map((g) => g.id));
  const loose = projects.filter((p) => p.groupId === null || !known.has(p.groupId));
  if (loose.length > 0) out.push({ id: UNGROUPED, label: "Ungrouped", projects: loose });
  return out;
}

const fold = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();

/** Whether every word of `query` is in one of `texts`, ignoring case and accents. An empty query matches. */
export function matchesQuery(query: string, ...texts: string[]): boolean {
  const words = fold(query).split(/\s+/).filter((w) => w !== "");
  const hay = fold(texts.join(" "));
  return words.every((w) => hay.includes(w));
}

/** Step one: "No project", then — with no query — the groups; with one, the matching projects, then the matching groups. */
export function stepOneOptions(groups: readonly PickerGroup[], query: string): PickerOption[] {
  const none: PickerOption = { kind: "none" };
  if (query.trim() === "") return [none, ...groups.map((group): PickerOption => ({ kind: "group", group }))];
  const projects = groups.flatMap((g) => g.projects.filter((p) => matchesQuery(query, p.name)).map((project): PickerOption => ({ kind: "project", project })));
  const matching = groups.filter((g) => matchesQuery(query, g.label)).map((group): PickerOption => ({ kind: "group", group }));
  return [none, ...projects, ...matching];
}

/** Step two: the group's projects that match. */
export function stepTwoOptions(group: PickerGroup, query: string): PickerOption[] {
  return group.projects.filter((p) => matchesQuery(query, p.name)).map((project): PickerOption => ({ kind: "project", project }));
}

/** Which option is highlighted as the list shows: with a query, the first match after "No project"; else `preferred` when listed, else the first. */
export function initialActive(options: readonly PickerOption[], query: string, preferred: (o: PickerOption) => boolean): number {
  if (query.trim() !== "") {
    const first = options.findIndex((o) => o.kind !== "none");
    return first === -1 ? 0 : first;
  }
  const i = options.findIndex(preferred);
  return i === -1 ? 0 : i;
}
