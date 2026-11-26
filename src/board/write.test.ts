import { createFakeHost } from "pomade-kit/fake-host";
import { connect, HostError, type HostClient } from "pomade-kit/sdk";
import { describe, expect, it } from "vitest";

import manifest from "../../apps/board/public/manifest.json" with { type: "json" };
import { chooseBacklogFolder, createTicket, Failure, saveSyncedSettings, setBacklogFolder, writeFields } from "./write";

const B = "Projects/alpha/docs/roadmap";

async function hostWith(files: Record<string, string>) {
  const fake = createFakeHost({ manifest, projects: [{ id: "alpha", name: "Alpha", root: "Projects/alpha" }], activeProject: "alpha", files });
  const result = await connect({ transport: fake.transport });
  if (result.status !== "connected") throw new Error(result.status);
  return { fake, host: result.host };
}

const request = { kind: "task" as const, title: "Mine", status: "planned", priority: "P2", parent: null, reporter: "d.voronov", source: "", today: "2026-11-17", backlog: B, moveDone: true };

/** A host whose `files.create` finds `taken` paths already there — another writer won the race after the re-read. */
function racing(host: HostClient, taken: string[]): { host: HostClient; tried: string[] } {
  const tried: string[] = [];
  const files = new Proxy(host.files, {
    get(target, prop, receiver) {
      if (prop !== "create") return Reflect.get(target, prop, receiver) as unknown;
      return async (params: { path: string; content?: string }) => {
        tried.push(params.path);
        if (taken.includes(params.path)) throw new HostError("already-exists", `${params.path} already exists`);
        return target.create(params);
      };
    },
  });
  return { host: new Proxy(host, { get: (t, p, r) => (p === "files" ? files : (Reflect.get(t, p, r) as unknown)) }), tried };
}

describe("createTicket", () => {
  it("re-reads the folder and done/ at write time and takes the next ID", async () => {
    const { fake, host } = await hostWith({ [`${B}/T-003-a.md`]: "---\nid: T-003\nkind: task\n---\n", [`${B}/done/T-041-b.md`]: "---\nid: T-041\nkind: task\n---\n" });
    expect(await createTicket(host, request)).toEqual({ path: `${B}/T-042-mine.md`, id: "T-042" });
    expect(fake.readFile(`${B}/T-042-mine.md`)).toContain("id: T-042\n");
  });

  it("writes the reporter it is given and no source", async () => {
    const { fake, host } = await hostWith({});
    await createTicket(host, { ...request, reporter: "a.person" });
    const text = fake.readFile(`${B}/T-001-mine.md`);
    expect(text).toContain("updated: 2026-11-17\nreporter: a.person\n---");
    expect(text).not.toMatch(/^source:/m);
  });

  it("a path taken between the read and the create bumps the number until one is free", async () => {
    const { fake, host } = await hostWith({ [`${B}/T-001-a.md`]: "---\nid: T-001\nkind: task\n---\n" });
    const race = racing(host, [`${B}/T-002-mine.md`, `${B}/T-003-mine.md`]);
    expect(await createTicket(race.host, request)).toEqual({ path: `${B}/T-004-mine.md`, id: "T-004" });
    expect(race.tried).toEqual([`${B}/T-002-mine.md`, `${B}/T-003-mine.md`, `${B}/T-004-mine.md`]);
    expect(fake.readFile(`${B}/T-004-mine.md`)).toContain("id: T-004\n");
  });

  it("an epic or task created on done goes into done/; a missing backlog folder is made", async () => {
    const { fake, host } = await hostWith({});
    expect(await createTicket(host, { ...request, status: "done" })).toEqual({ path: `${B}/done/T-001-mine.md`, id: "T-001" });
    expect(fake.readFile(`${B}/done/T-001-mine.md`)).toContain("status: done\n");
  });

  it("any other refusal is a create failure, not a bump", async () => {
    const { host } = await hostWith({ "Projects/alpha/docs/roadmap": "a file, not a folder" });
    await expect(createTicket(host, request)).rejects.toBeInstanceOf(Failure);
    await expect(createTicket(host, request)).rejects.toMatchObject({ failure: { kind: "host" } });
  });

  it("gives up after 50 taken IDs in a row", async () => {
    const { host } = await hostWith({});
    const taken = Array.from({ length: 50 }, (_, i) => `${B}/T-${String(i + 1).padStart(3, "0")}-mine.md`);
    await expect(createTicket(racing(host, taken).host, request)).rejects.toMatchObject({ failure: { kind: "host", step: "create", code: "already-exists" } });
  });
});

describe("writeFields", () => {
  const text = "---\nid: E-1\nkind: epic\npriority: P2 # keep\nproblem: P-1\nupdated: 2026-11-01\n---\nBody\n";

  it("writes each key field-only, removes a null one, and leaves every other byte", async () => {
    const { fake, host } = await hostWith({ [`${B}/E-1.md`]: text });
    const { mtimeMs } = await host.files.readFile({ path: `${B}/E-1.md` });
    const ticket = { path: `${B}/E-1.md`, mtimeMs } as Parameters<typeof writeFields>[1];
    await writeFields(host, ticket, [
      { key: "priority", value: "P0" },
      { key: "problem", value: null },
      { key: "updated", value: "2026-11-17" },
    ]);
    expect(fake.readFile(`${B}/E-1.md`)).toBe("---\nid: E-1\nkind: epic\npriority: P0 # keep\nupdated: 2026-11-17\n---\nBody\n");
  });

  it("refuses a file changed since the board read it (the host's changed-on-disk), writing nothing", async () => {
    const { fake, host } = await hostWith({ [`${B}/E-1.md`]: text });
    const { mtimeMs } = await host.files.readFile({ path: `${B}/E-1.md` });
    const ticket = { path: `${B}/E-1.md`, mtimeMs } as Parameters<typeof writeFields>[1];
    const changed = text.replace("Body", "Edited elsewhere");
    fake.writeFile(`${B}/E-1.md`, changed);
    await expect(writeFields(host, ticket, [{ key: "status", value: "done" }, { key: "updated", value: "2026-11-17" }])).rejects.toMatchObject({ failure: { kind: "changed" } });
    expect(fake.readFile(`${B}/E-1.md`)).toBe(changed);
  });

  it("a file gone since the read is a host failure of the field step", async () => {
    const { fake, host } = await hostWith({ [`${B}/E-1.md`]: text });
    const { mtimeMs } = await host.files.readFile({ path: `${B}/E-1.md` });
    fake.deleteFile(`${B}/E-1.md`);
    const ticket = { path: `${B}/E-1.md`, mtimeMs } as Parameters<typeof writeFields>[1];
    await expect(writeFields(host, ticket, [{ key: "priority", value: "P0" }])).rejects.toMatchObject({ failure: { kind: "host", step: "field", code: "not-found" } });
  });
});

describe("the Board's settings writes", () => {
  const SETTINGS = "Apps/pomade-board/settings.json";

  /** A workspace of two projects with Alpha active — Beta is the project that isn't. */
  async function twoProjects(files: Record<string, string> = {}) {
    const fake = createFakeHost({
      manifest,
      projects: [
        { id: "alpha", name: "Alpha", root: "Projects/alpha" },
        { id: "beta", name: "Beta", root: "Projects/beta", settings: { moveDoneToDoneFolder: false } },
      ],
      activeProject: "alpha",
      files: { "Projects/alpha/README.md": "# Alpha\n", "Projects/beta/tickets/E-001-x.md": "---\nid: E-001\nkind: epic\n---\n", ...files },
    });
    const result = await connect({ transport: fake.transport });
    if (result.status !== "connected") throw new Error(result.status);
    const { projects } = await result.host.project.list();
    const beta = projects.find((p) => p.id === "beta");
    if (!beta) throw new Error("no beta");
    return { fake, host: result.host, beta };
  }

  it("saveSyncedSettings sets and removes its keys, keeps the others, and tells the other frames", async () => {
    const { fake, host } = await twoProjects({ [SETTINGS]: '{ "reporter": "a.person", "other": true }' });
    await saveSyncedSettings(host, { backlogPathPattern: "tickets/" });
    expect(JSON.parse(fake.readFile(SETTINGS))).toEqual({ reporter: "a.person", other: true, backlogPathPattern: "tickets/" });
    expect(fake.state["board.settingsWritten"]).toEqual(expect.any(Number));
    await saveSyncedSettings(host, { backlogPathPattern: undefined, reporter: "claude" });
    expect(JSON.parse(fake.readFile(SETTINGS))).toEqual({ reporter: "claude", other: true });
  });

  it("saveSyncedSettings makes the file on the first write, and never writes over one that isn't a JSON object", async () => {
    const { fake, host } = await twoProjects();
    await saveSyncedSettings(host, { reporter: "claude" });
    expect(fake.readFile(SETTINGS)).toBe('{\n  "reporter": "claude"\n}\n');
    fake.writeFile(SETTINGS, "[1, 2]");
    await expect(saveSyncedSettings(host, { reporter: "a.person" })).rejects.toThrow(`Not saved: ${SETTINGS} is not a JSON object. Fix the file first.`);
    expect(fake.readFile(SETTINGS)).toBe("[1, 2]");
  });

  it("chooseBacklogFolder stores the pick of a project that is not the active one, relative to its root, and keeps its other settings", async () => {
    const { fake, host, beta } = await twoProjects();
    fake.answerPick("Projects/beta/tickets");
    expect(await chooseBacklogFolder(host, beta)).toEqual({ kind: "chosen", folder: "tickets" });
    expect(fake.pickRequests).toEqual([{ kind: "folder", root: "Projects/beta", initial: "Projects/beta" }]);
    expect((await host.project.getSettings({ projectId: "beta" })).settings).toEqual({ moveDoneToDoneFolder: false, backlogPath: "tickets" });
    expect((await host.project.getSettings({ projectId: "alpha" })).settings).toEqual({});
  });

  it("chooseBacklogFolder: the project's own root is the folder \"\"; a cancelled dialog stores nothing", async () => {
    const { fake, host, beta } = await twoProjects();
    fake.answerPick(null);
    expect(await chooseBacklogFolder(host, beta)).toEqual({ kind: "cancelled" });
    expect((await host.project.getSettings({ projectId: "beta" })).settings).toEqual({ moveDoneToDoneFolder: false });
    fake.answerPick("Projects/beta");
    expect(await chooseBacklogFolder(host, beta)).toEqual({ kind: "chosen", folder: "" });
    expect((await host.project.getSettings({ projectId: "beta" })).settings).toEqual({ moveDoneToDoneFolder: false, backlogPath: "" });
  });

  it("chooseBacklogFolder refuses a folder outside the project, and says what the host refused", async () => {
    const { host, beta } = await twoProjects();
    const answering = (path: string): HostClient =>
      new Proxy(host, { get: (t, p, r) => (p === "files" ? new Proxy(t.files, { get: (f, q, s) => (q === "pickFolder" ? () => Promise.resolve({ path }) : (Reflect.get(f, q, s) as unknown)) }) : (Reflect.get(t, p, r) as unknown)) });
    expect(await chooseBacklogFolder(answering("Projects/alpha/docs"), beta)).toEqual({
      kind: "refused",
      message: "Projects/alpha/docs is outside Beta. Choose a folder inside the project.",
    });
    expect((await host.project.getSettings({ projectId: "beta" })).settings).toEqual({ moveDoneToDoneFolder: false });
    expect(await chooseBacklogFolder(host, { ...beta, id: "gone" })).toEqual({ kind: "refused", message: expect.stringMatching(/^Couldn't set the backlog folder: /) as string });
  });

  it("setBacklogFolder(null) removes the project's folder and keeps its other settings", async () => {
    const { host } = await twoProjects();
    await setBacklogFolder(host, "beta", "plans");
    expect((await host.project.getSettings({ projectId: "beta" })).settings).toEqual({ moveDoneToDoneFolder: false, backlogPath: "plans" });
    await setBacklogFolder(host, "beta", null);
    expect((await host.project.getSettings({ projectId: "beta" })).settings).toEqual({ moveDoneToDoneFolder: false });
  });
});
