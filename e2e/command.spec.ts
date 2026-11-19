// `pomade-planner today` ([[today-command]]) from the build: dist/planner/cli/main.mjs, copied alone into an empty
// folder — as an installed app folder has no node_modules — and run with Node against throwaway
// workspaces, with no Pomade at all. The real Pomade shim is run by e2e/pomade-planner.spec.ts.

import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { PLANNER_TASKS, PROJECT_TASKS } from "../test/fixtures/workspace";

const BUILT = resolve(import.meta.dirname, "../dist/planner/cli/main.mjs");

let base: string;
let entry: string;

test.beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "pomade-planner-cmd-"));
  entry = join(base, "app/cli/main.mjs");
  await mkdir(dirname(entry), { recursive: true });
  await copyFile(BUILT, entry);
});

test.afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

async function workspace(name: string, files: Record<string, string>): Promise<string> {
  const root = join(base, name);
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  await mkdir(root, { recursive: true });
  return root;
}

function run(args: string[], env: Record<string, string>): { status: number | null; stdout: string; stderr: string } {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !k.startsWith("POMADE_")) clean[k] = v;
  const r = spawnSync(process.execPath, [entry, ...args], { cwd: base, env: { ...clean, POMADE_HOME: join(base, "no-home"), ...env }, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const tasks = Object.fromEntries(Object.entries(PLANNER_TASKS).map(([name, text]) => [`Tasks/${name}`, text]));

test("with no tasks root configured it exits 1 with a readable message", async () => {
  const ws = await workspace("ws-no-settings", tasks);
  const r = run(["today"], { POMADE_WORKSPACE: ws });
  expect(r).toEqual({ status: 1, stdout: "", stderr: "pomade-planner: No tasks folder is set. Open the Planner in Pomade and choose where your tasks live.\n" });
});

test("with no workspace it exits 1 and says so", () => {
  const r = run(["today"], {});
  expect(r.status).toBe(1);
  expect(r.stderr).toBe("pomade-planner: No Pomade workspace found. Open Pomade once, so it records its workspace.\n");
});

test("finds the workspace through POMADE_HOME's pointer, as with Pomade closed", async () => {
  const ws = await workspace("ws-pointer", { ...tasks, "Apps/pomade-planner/settings.json": '{ "tasksRoot": "Tasks" }' });
  const home = join(base, "home-pointer");
  await mkdir(home, { recursive: true });
  await writeFile(join(home, "workspace"), ws);
  const r = run(["today", "--date", "2026-11-17", "--json"], { POMADE_HOME: home });
  expect(r.status).toBe(0);
  expect((JSON.parse(r.stdout) as { day: string }).day).toBe("2026-11-17");
});

test("--json: the Today items in order, each with its reason; the unreadable file; the Board's keys don't matter", async () => {
  const ws = await workspace("ws-json", { ...tasks, "Apps/pomade-planner/settings.json": '{ "backlogPathPattern": "plans/", "tasksRoot": "Tasks/" }' });
  const r = run(["today", "--json", "--date", "2026-11-17"], { POMADE_WORKSPACE: ws });
  expect(r.stderr).toBe("");
  expect(r.status).toBe(0);
  const report = JSON.parse(r.stdout) as { day: string; items: { title: string; reason: string; status: string; path: string }[]; unreadable: { path: string }[] };
  expect(report.items.map((i) => [i.title, i.reason, i.status])).toEqual([
    ["Pay the tax", "overdue", "open"],
    ["Renew Nora's swimming class", "due-today", "open"],
    ["Call the dentist", "rolled-over", "open"],
    ["Buy printer ink", "rolled-over", "open"],
    ["Book flights for the Christmas trip to see the grandparents in Valencia", "planned", "open"],
    ["Water the plants", "planned", "done"],
  ]);
  expect(report.items[0]).toMatchObject({ type: "task", project: null, deadline: "2026-11-14", importance: 5, path: "Tasks/2026-11-01-pay-the-tax.md" });
  expect(report.unreadable.map((u) => u.path)).toEqual(["Tasks/2026-11-13-broken.md"]);
});

test("text output, for --date on another day", async () => {
  const ws = await workspace("ws-text", { ...tasks, "Apps/pomade-planner/settings.json": '{ "tasksRoot": "Tasks", "dayBoundary": "4:00" }' });
  const r = run(["today", "--date", "2026-11-18"], { POMADE_WORKSPACE: ws });
  expect(r.status).toBe(0);
  expect(r.stdout).toBe(
    [
      "Today — Wed, Nov 18, 2026",
      "  [ ] Pay the tax — overdue, due Nov 14, !5",
      "  [ ] Renew Nora's swimming class — overdue, due yesterday",
      "  [ ] Call the dentist — planned 2 days ago, due Fri",
      "  [ ] Buy printer ink — planned 9 days ago",
      "  [ ] Book flights for the Christmas trip to see the grandparents in Valencia — planned 1 day ago, !2",
      "",
      "Can't read (open to fix):",
      "  Tasks/2026-11-13-broken.md — unexpected end of the stream within a flow collection (3:1)",
      "",
    ].join("\n"),
  );
});

test("a tasks root that isn't there, a bad argument, and --help", async () => {
  const ws = await workspace("ws-missing", { "Apps/pomade-planner/settings.json": '{ "tasksRoot": "Gone" }' });
  expect(run(["today"], { POMADE_WORKSPACE: ws })).toMatchObject({ status: 1, stderr: "pomade-planner: The tasks folder Gone doesn't exist. Choose another one in the Planner's settings.\n" });
  const bad = run(["today", "--date", "fri"], { POMADE_WORKSPACE: ws });
  expect(bad.status).toBe(2);
  expect(bad.stderr).toMatch(/^pomade-planner: --date needs a date as YYYY-MM-DD, got "fri"\.\n\nUsage: pomade-planner today/);
  const help = run(["--help"], {});
  expect(help.status).toBe(0);
  expect(help.stdout).toMatch(/^Usage: pomade-planner today \[--project <name>\] \[--json\] \[--date YYYY-MM-DD\]/);
});

test.describe("projects", () => {
  const projectTasks = Object.fromEntries(Object.entries(PROJECT_TASKS).map(([name, text]) => [`Tasks/${name}`, text]));
  const settings = JSON.stringify({
    tasksRoot: "Tasks",
    projectFolders: {
      pomade: { folder: "Pomade", name: "Pomade", groupPath: ["Building tools"] },
      quiz: { folder: "QuizLab", name: "QuizLab", groupPath: ["Building tools", "Tools"] },
      "quiz-old": { folder: "QuizLab (Archive)", name: "QuizLab", groupPath: ["Archive"] },
    },
  });
  const files = { ...tasks, ...projectTasks, "Tasks/QuizLab (Archive)/2026-11-02-old.md": "---\ntype: task\ntitle: Export old scores\nstatus: open\ndo-on: 2026-11-17\n---\n", "Apps/pomade-planner/settings.json": settings };

  test("project items grouped by project, as the Workspace Today shows them", async () => {
    const ws = await workspace("ws-projects", files);
    const r = run(["today", "--date", "2026-11-17"], { POMADE_WORKSPACE: ws });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(
      [
        "Today — Tue, Nov 17, 2026",
        "",
        "No project",
        "  [ ] Pay the tax — overdue, due Nov 14, !5",
        "  [ ] Renew Nora's swimming class — due today",
        "  [ ] Call the dentist — planned 1 day ago, due Fri",
        "  [ ] Buy printer ink — planned 8 days ago",
        "  [ ] Book flights for the Christmas trip to see the grandparents in Valencia — planned today, !2",
        "  [x] Water the plants — planned today",
        "",
        "Old stuff",
        "  [ ] Sort the attic — due today",
        "",
        "Pomade",
        "  [ ] Review the Host API — overdue, due yesterday",
        "  [ ] Ship the planner — planned today, !3",
        "",
        "QuizLab (Archive)",
        "  [ ] Export old scores — planned today",
        "",
        "QuizLab (Building tools › Tools)",
        "  [ ] Fix the score screen — planned 2 days ago",
        "",
        "Can't read (open to fix):",
        "  Tasks/2026-11-13-broken.md — unexpected end of the stream within a flow collection (3:1)",
        "  Tasks/QuizLab/2026-11-14-broken.md — unexpected end of the stream within a flow collection (3:1)",
        "",
      ].join("\n"),
    );
  });

  test("--project narrows to one project's Today; a shared name is an error listing the choices; <name> (<group>) picks one", async () => {
    const ws = await workspace("ws-projects-narrow", files);
    const pomade = run(["today", "--date", "2026-11-17", "--project", "pomade"], { POMADE_WORKSPACE: ws });
    expect(pomade).toEqual({ status: 0, stderr: "", stdout: "Today — Pomade — Tue, Nov 17, 2026\n  [ ] Review the Host API — overdue, due yesterday\n  [ ] Ship the planner — planned today, !3\n" });
    const shared = run(["today", "--project", "QuizLab"], { POMADE_WORKSPACE: ws });
    expect(shared).toEqual({
      status: 2,
      stdout: "",
      stderr: 'pomade-planner: More than one project is named "QuizLab" — name one of them: "QuizLab (Archive)", "QuizLab (Building tools › Tools)".\n',
    });
    const archived = run(["today", "--date", "2026-11-17", "--project", "QuizLab (Archive)", "--json"], { POMADE_WORKSPACE: ws });
    expect(archived.status).toBe(0);
    expect((JSON.parse(archived.stdout) as { items: { title: string; project: string }[] }).items).toMatchObject([{ title: "Export old scores", project: "QuizLab (Archive)" }]);
    const tools = run(["today", "--date", "2026-11-17", "--project=QuizLab (Tools)"], { POMADE_WORKSPACE: ws });
    expect(tools.stdout).toContain("  [ ] Fix the score screen — planned 2 days ago\n");
    const unknown = run(["today", "--project", "Nope"], { POMADE_WORKSPACE: ws });
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toBe('pomade-planner: No project named "Nope". Projects with tasks: Old stuff, Pomade, QuizLab (Archive), QuizLab (Building tools › Tools).\n');
  });
});

test("names the day's daily note when its file exists — text and --json; notes, thoughts and daily notes are never Today items", async () => {
  const ws = await workspace("ws-daily", {
    ...tasks,
    "Apps/pomade-planner/settings.json": '{ "tasksRoot": "Tasks" }',
    "Tasks/Daily/2026-11-17.md": "---\ntype: daily-note\ndate: 2026-11-17\n---\n- [ ] a thing\n",
    "Tasks/2026-11-12-idea.md": "---\ntype: note\ntitle: An idea\nstatus: open\ndeadline: 2026-11-01\ncreated: 2026-11-12\n---\n",
    "Tasks/2026-11-12-why.md": "---\ntype: thought\ntitle: Why\nstatus: open\ndo-on: 2026-11-17\ncreated: 2026-11-12\n---\n",
  });
  const text = run(["today", "--date", "2026-11-17"], { POMADE_WORKSPACE: ws });
  expect(text.status).toBe(0);
  expect(text.stdout.split("\n").slice(0, 2)).toEqual(["Today — Tue, Nov 17, 2026", "  Daily note: Tasks/Daily/2026-11-17.md"]);
  expect(text.stdout).not.toContain("An idea");
  expect(text.stdout).not.toContain("Why");
  const json = JSON.parse(run(["today", "--json", "--date", "2026-11-17"], { POMADE_WORKSPACE: ws }).stdout) as { "daily-note": string | null; items: { title: string }[] };
  expect(json["daily-note"]).toBe("Tasks/Daily/2026-11-17.md");
  expect(json.items.map((i) => i.title)).not.toContain("An idea");
  const other = JSON.parse(run(["today", "--json", "--date", "2026-11-18"], { POMADE_WORKSPACE: ws }).stdout) as { "daily-note": string | null };
  expect(other["daily-note"]).toBeNull();
  expect(run(["today", "--date", "2026-11-18"], { POMADE_WORKSPACE: ws }).stdout).not.toContain("Daily note");
});
