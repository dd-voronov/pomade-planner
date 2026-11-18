// The two apps' manifests (apps/<app>/public/manifest.json): valid by the kit's rules, each naming
// only what its app is and uses — the capabilities and events checked against the Host API calls in
// the app's own source.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { launchPanelIcon, METHOD_CAPABILITY, parseManifest, resolveFrameTarget, type Manifest, type MethodName } from "pomade-kit/protocol";
import { describe, expect, it } from "vitest";

import { boardView, plannerView, ROUTES } from "../src/core/views";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(readFileSync(`${REPO}package.json`, "utf8")) as { version: string };

/** Each app: its folder under apps/, and the source folders compiled into it. */
const APPS = {
  planner: { sources: ["apps/planner", "src/planner", "src/core"] },
  board: { sources: ["apps/board", "src/board", "src/core"] },
} as const;
type AppName = keyof typeof APPS;

const publicDir = (app: AppName): string => `${REPO}apps/${app}/public/`;
const raw = (app: AppName): unknown => JSON.parse(readFileSync(`${publicDir(app)}manifest.json`, "utf8"));

function parsed(app: AppName): Manifest {
  const result = parseManifest(raw(app));
  if (!result.ok) throw new Error(`apps/${app}/public/manifest.json is invalid: ${JSON.stringify(result.errors)}`);
  return result.manifest;
}

/** The app's own source text: every non-test .ts/.tsx file of its folders. */
function sourceOf(app: AppName): string {
  const files = APPS[app].sources.flatMap((folder) =>
    readdirSync(`${REPO}${folder}`, { recursive: true, encoding: "utf8" })
      .filter((name) => /\.tsx?$/.test(name) && !name.endsWith(".test.ts"))
      .map((name) => `${REPO}${folder}/${name}`),
  );
  return files.map((file) => readFileSync(file, "utf8")).join("\n");
}

const isMethod = (name: string): name is MethodName => name in METHOD_CAPABILITY;

/** The Host API methods the app's source calls (`host.files.readFile(`), by name. */
function methodsCalled(app: AppName): MethodName[] {
  const names = [...sourceOf(app).matchAll(/\bhost\s*\.\s*(\w+)\s*\.\s*(\w+)\s*\(/g)].map((m) => `${m[1]}.${m[2]}`);
  return [...new Set(names)].filter(isMethod).sort();
}

/** The events the app's source subscribes to: every platform event name it spells out. */
function eventsNamed(app: AppName): string[] {
  const source = sourceOf(app);
  expect(source).toMatch(/\bhost\s*\.\s*events\s*\.\s*subscribe\(/);
  return [...new Set([...source.matchAll(/"((?:pomade|project)\.[a-zA-Z]+)"/g)].map((m) => m[1] ?? ""))].sort();
}

describe.each(["planner", "board"] as const)("the %s app's manifest", (app) => {
  it("is valid per the Host API (pomade-kit parseManifest)", () => {
    expect(parseManifest(raw(app))).toMatchObject({ ok: true });
  });

  it("carries the repository's version and the Host API it speaks, with no backend, API or outside paths", () => {
    const m = parsed(app);
    expect(m.version).toBe(pkg.version);
    expect(m.hostApi).toBe(0);
    for (const key of ["backend", "symlinks", "api", "calls", "skills"]) expect(raw(app)).not.toHaveProperty(key);
  });

  it("asks for exactly the capabilities its source's Host API calls need", () => {
    const called = methodsCalled(app);
    expect(called.length).toBeGreaterThan(5);
    const needed = [...new Set(called.map((method) => METHOD_CAPABILITY[method]).filter((c) => c !== null))].sort();
    expect([...parsed(app).capabilities].sort()).toEqual(needed);
  });

  it("subscribes to exactly the events its source names, and publishes none", () => {
    const events = parsed(app).events;
    expect([...(events?.subscribe ?? [])].sort()).toEqual(eventsNamed(app));
    expect(events?.publish ?? []).toEqual([]);
  });

  it("ships every icon it names, and its page", () => {
    const m = parsed(app);
    const icons = [m.icon, ...(m.strip ?? []).map((s) => s.icon)].filter((icon) => icon !== undefined);
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      expect(icon).toMatch(/\.svg$/);
      expect(existsSync(`${publicDir(app)}${icon}`), `${icon} in apps/${app}/public/`).toBe(true);
    }
    expect(readFileSync(`${REPO}apps/${app}/index.html`, "utf8")).toContain(`<title>${m.name}</title>`);
  });
});

describe("the Planner's manifest", () => {
  const m = parsed("planner");

  it("is the app pomade-planner, named Planner, without the Board's project settings writes", () => {
    expect(m).toMatchObject({ id: "pomade-planner", name: "Planner" });
    expect(m.capabilities).not.toContain("project.write");
  });

  it("has one strip icon, Planner, that fills the panel — the launch panel, which hears Pomade ready", () => {
    const strip = m.strip ?? [];
    expect(strip.map((s) => [s.id, s.title, s.action])).toEqual([["planner", "Planner", "panel"]]);
    expect(plannerView("panel", resolveFrameTarget(strip, "panel", "planner").route)).toBe("planner-panel");
    expect(m.startOnLaunch).toBe(true);
    expect(launchPanelIcon(m)?.id).toBe("planner");
    expect(m.events?.subscribe).toContain("pomade.ready");
  });

  it("declares the quick-add overlay on Cmd+Shift+A, a chord Pomade itself doesn't use", () => {
    expect(m.shortcuts).toEqual([{ id: "quick-add", title: "Quick add a task", key: "Cmd+Shift+A", action: "overlay", route: ROUTES.quickAdd }]);
    expect(plannerView("overlay", ROUTES.quickAdd)).toBe("quick-add");
  });

  it("declares the pomade-planner command, its entry the bundled build of cli/main.ts in the Planner's folder", () => {
    expect(m.commands).toEqual([{ name: "pomade-planner", entry: "cli/main.mjs", title: expect.stringContaining("pomade-planner today") as unknown }]);
    const config = readFileSync(`${REPO}vite.cli.config.ts`, "utf8");
    expect(config).toContain('ssr: "cli/main.ts"');
    expect(config).toContain('outDir: "dist/planner/cli"');
    expect(config).toContain('entryFileNames: "main.mjs"');
  });

  it("opens the Planner tab from the new-tab menu, and has no view for the Board's routes", () => {
    expect(plannerView("tab", "")).toBe("planner-tab");
    expect(plannerView("tab", ROUTES.board)).toBe("unknown");
    expect(plannerView("panel", ROUTES.needsYou)).toBe("unknown");
  });
});

describe("the Board's manifest", () => {
  const m = parsed("board");

  it("is the app pomade-board, named Board", () => {
    expect(m).toMatchObject({ id: "pomade-board", name: "Board" });
  });

  it("has one strip icon, Board, that opens the Board tab and fills the panel with Needs you", () => {
    const strip = m.strip ?? [];
    expect(strip.map((s) => [s.id, s.title, s.action])).toEqual([["board", "Board", "both"]]);
    expect(boardView("tab", resolveFrameTarget(strip, "tab", "board").route)).toBe("board-tab");
    expect(resolveFrameTarget(strip, "panel", "board").route).toBe(ROUTES.needsYou);
    expect(boardView("panel", ROUTES.needsYou)).toBe("needs-you-panel");
  });

  it("starts nothing at launch and declares no shortcut and no command", () => {
    expect(m.startOnLaunch ?? false).toBe(false);
    for (const key of ["shortcuts", "commands", "startOnLaunch"]) expect(raw("board")).not.toHaveProperty(key);
    expect(m.events?.subscribe).not.toContain("pomade.ready");
  });

  it("opens the Board tab from the new-tab menu, and has no view for the Planner's routes", () => {
    expect(boardView("tab", "")).toBe("board-tab");
    for (const route of [ROUTES.planner, ROUTES.settings, ROUTES.today]) expect(boardView("tab", route)).toBe("unknown");
    expect(boardView("overlay", ROUTES.quickAdd)).toBe("unknown");
  });
});

describe("the two apps", () => {
  it("have different ids, and neither's source reaches into the other's", () => {
    expect(parsed("planner").id).not.toBe(parsed("board").id);
    expect(sourceOf("board")).not.toMatch(/from "[./]*\/planner\/(?!model\/item-draft")/);
    expect(sourceOf("planner")).not.toMatch(/from "[./]*\/board\//);
    expect(sourceOf("board")).not.toContain("pomade-planner");
    expect(sourceOf("planner")).not.toContain("pomade-board");
  });
});
