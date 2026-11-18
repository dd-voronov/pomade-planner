import { createFakeHost } from "pomade-kit/fake-host";
import { connect, HostError, type HostClient } from "pomade-kit/sdk";
import { describe, expect, it } from "vitest";

import manifest from "../../apps/board/public/manifest.json" with { type: "json" };
import { createTicket, Failure, writeFields } from "./write";

const B = "Projects/alpha/docs/roadmap";

async function hostWith(files: Record<string, string>) {
  const fake = createFakeHost({ manifest, projects: [{ id: "alpha", name: "Alpha", root: "Projects/alpha" }], activeProject: "alpha", files });
  const result = await connect({ transport: fake.transport });
  if (result.status !== "connected") throw new Error(result.status);
  return { fake, host: result.host };
}

const request = { kind: "task" as const, title: "Mine", status: "planned", priority: "P2", parent: null, source: "", today: "2026-11-17", backlog: B, moveDone: true };

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

  it("refuses a file changed since the board read it, writing nothing", async () => {
    const { fake, host } = await hostWith({ [`${B}/E-1.md`]: text });
    const ticket = { path: `${B}/E-1.md`, mtimeMs: -1 } as Parameters<typeof writeFields>[1];
    await expect(writeFields(host, ticket, [{ key: "priority", value: "P0" }])).rejects.toMatchObject({ failure: { kind: "changed" } });
    expect(fake.readFile(`${B}/E-1.md`)).toBe(text);
  });
});
