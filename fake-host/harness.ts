// The fake host as the parent window of an app's frame — what `npm run dev:fake` and the
// fake-host e2e open instead of Pomade. It hosts one of the two apps at a time, with that app's
// manifest. Query: `app` (the app page's URL, required — the Planner's or the Board's, as the
// harness's server was told them: `__APP_URLS__`, fake-host/vite.config.ts), `surface`
// (`tab` · `panel` · `overlay`, default `tab`), `icon` (a strip icon id), `route`, `shortcut` (an
// overlay's shortcut id), `project` (the active project's id, or `workspace`; default the fixture's),
// `hostApi` (the Host API version the fake host speaks, to see the app refuse a mismatch), `tasks`
// (the Planner's tasks root, written into the synced settings file), `fixture` (`planner`: the
// Planner's projects workspace, test/fixtures/workspace.ts), `now` (a local time,
// `2026-11-17T10:00`, the Planner's clock starts at — the app's `test.clock` state), `state` (a
// JSON object of further app state keys to start with), `mount`
// (`manual`: the frame is mounted only when a spec calls `window.mountNow()`, after it changed
// the fake workspace — what the app finds when it opens). The frame is
// sized like its Pomade surface: a tab fills the stage, a panel is 240px wide (`panelWidth` to
// change it). An overlay — `surface=overlay`, or the one the app opens itself (`overlay.open`, the
// Planner's +) — is mounted by the kit's `mountApp` as Pomade shows it: an
// `iframe[data-surface="overlay"]` over a scrim, 420 wide and as high as the app asks; Escape,
// `overlay.close` or a click on the scrim removes it and gives focus back to the frame that opened
// it. `theme` (`light` · `dark`) is Pomade's theme at the handshake; `window.fakeHost.setTheme`
// changes it. `window.fakeHost` and `window.mounted` are there for specs and the console.

import "pomade-kit/tokens.css";
import { createFakeHost, mountApp, type FakeHost, type FrameOptions, type MountedApp } from "pomade-kit/fake-host";
import type { JsonValue, Surface } from "pomade-kit/protocol";

import boardManifest from "../apps/board/public/manifest.json" with { type: "json" };
import plannerManifest from "../apps/planner/public/manifest.json" with { type: "json" };
import { FIXTURE_WORKSPACE, NOTES_FILES, PLANNER_FIXTURE_DAY, PLANNER_WORKSPACE, RECURRING_FIXTURE_DAY } from "../test/fixtures/workspace";

/** Where the two apps' pages are served (fake-host/vite.config.ts). */
declare const __APP_URLS__: Record<AppName, string>;

const MANIFESTS = { planner: plannerManifest, board: boardManifest };
type AppName = keyof typeof MANIFESTS;

declare global {
  interface Window {
    fakeHost: FakeHost;
    mounted: MountedApp | undefined;
    mountNow: () => void;
  }
}

type FrameSurface = Extract<Surface, "tab" | "panel" | "overlay">;

/** The surfaces a developer opens from the harness's nav bar. */
interface Preset {
  label: string;
  app: AppName;
  surface: FrameSurface;
  icon?: string;
  route?: string;
  project?: string;
  tasks?: string;
  fixture?: string;
  /** The Planner's clock, when not the Tasks/ fixture's morning. */
  now?: string;
  extra?: string;
  template?: string;
}

/** The fixture's Tasks/ is dated around this morning. */
const PLANNER_NOW = `${PLANNER_FIXTURE_DAY}T10:00`;

const PRESETS: Preset[] = [
  { label: "Board tab", app: "board", surface: "tab", icon: "board" },
  { label: "Board · Beta (no backlog)", app: "board", surface: "tab", icon: "board", project: "beta" },
  { label: "Board · Scale", app: "board", surface: "tab", icon: "board", project: "scale" },
  { label: "Board · Delta", app: "board", surface: "tab", icon: "board", project: "delta" },
  { label: "Board at Workspace", app: "board", surface: "tab", icon: "board", project: "workspace" },
  { label: "Needs-you panel", app: "board", surface: "panel", icon: "board" },
  { label: "Needs-you at Workspace", app: "board", surface: "panel", icon: "board", project: "workspace" },
  { label: "Planner onboarding", app: "planner", surface: "panel", icon: "planner" },
  { label: "Planner panel", app: "planner", surface: "panel", icon: "planner", tasks: "Tasks", project: "workspace" },
  { label: "Planner · projects at Workspace", app: "planner", surface: "panel", icon: "planner", tasks: "Tasks", project: "workspace", fixture: "planner" },
  { label: "Planner · Pomade", app: "planner", surface: "panel", icon: "planner", tasks: "Tasks", fixture: "planner" },
  { label: "Planner tab", app: "planner", surface: "tab", route: "planner", tasks: "Tasks", fixture: "planner" },
  { label: "Planner settings", app: "planner", surface: "tab", route: "settings", tasks: "Tasks" },
  { label: "Quick add", app: "planner", surface: "overlay", route: "quick-add", tasks: "Tasks", fixture: "planner" },
  { label: "Planner · notes", app: "planner", surface: "panel", icon: "planner", tasks: "Tasks", project: "workspace", fixture: "planner", extra: "notes", template: "Templates/Daily.md" },
  { label: "Planner tab · notes", app: "planner", surface: "tab", route: "planner", tasks: "Tasks", project: "workspace", fixture: "planner", extra: "notes", template: "Templates/Daily.md" },
  { label: "Planner · recurring", app: "planner", surface: "panel", icon: "planner", tasks: "Chores", project: "workspace", fixture: "planner", now: `${RECURRING_FIXTURE_DAY}T10:00` },
  { label: "Planner · new-tab default", app: "planner", surface: "tab" },
  { label: "Board · new-tab default", app: "board", surface: "tab" },
];

const query = new URLSearchParams(location.search);
const app = query.get("app");
if (!app) throw new Error("fake host: missing ?app=<url of the app page>");
const appName = (Object.keys(MANIFESTS) as AppName[]).find((name) => __APP_URLS__[name] === app);
if (!appName) throw new Error(`fake host: ${app} is neither app's page (${Object.values(__APP_URLS__).join(", ")})`);

const surfaceParam = query.get("surface");
const surface: FrameSurface = surfaceParam === "panel" || surfaceParam === "overlay" ? surfaceParam : "tab";
const open: FrameOptions = { surface };
const icon = query.get("icon");
if (icon !== null) open.icon = icon;
const route = query.get("route");
if (route !== null) open.route = route;
const shortcut = query.get("shortcut");
if (shortcut !== null) open.shortcut = shortcut;

const nav = document.querySelector("nav");
const stage = document.getElementById("stage");
if (!nav || !stage) throw new Error("fake host: index.html lacks nav or #stage");

const heading = document.createElement("strong");
heading.textContent = "Fake host:";
nav.append(heading);
for (const preset of PRESETS) {
  const params = new URLSearchParams({ app: __APP_URLS__[preset.app], surface: preset.surface });
  if (preset.icon !== undefined) params.set("icon", preset.icon);
  if (preset.route !== undefined) params.set("route", preset.route);
  if (preset.project !== undefined) params.set("project", preset.project);
  if (preset.tasks !== undefined) params.set("tasks", preset.tasks);
  if (preset.tasks !== undefined) params.set("now", preset.now ?? PLANNER_NOW);
  if (preset.fixture !== undefined) params.set("fixture", preset.fixture);
  if (preset.extra !== undefined) params.set("extra", preset.extra);
  if (preset.template !== undefined) params.set("template", preset.template);
  const link = document.createElement("a");
  link.href = `?${params.toString()}`;
  link.textContent = preset.label;
  if (link.search === location.search) link.setAttribute("aria-current", "page");
  nav.append(link);
}

stage.dataset.surface = surface;
const panelWidth = query.get("panelWidth");
if (panelWidth !== null) stage.style.setProperty("--panel-width", `${Number(panelWidth)}px`);
const hostApi = query.get("hostApi");
const project = query.get("project");
const tasks = query.get("tasks");
const now = query.get("now");
const base = query.get("fixture") === "planner" ? PLANNER_WORKSPACE : FIXTURE_WORKSPACE;
const template = query.get("template");
const theme = query.get("theme");
const seeded = JSON.parse(query.get("state") ?? "{}") as Record<string, JsonValue>;
const files: Record<string, string> = { ...base.files, ...(query.get("extra") === "notes" ? NOTES_FILES : {}) };
if (tasks !== null) files["Apps/pomade-planner/settings.json"] = `${JSON.stringify({ tasksRoot: tasks, ...(template === null ? {} : { dailyNoteTemplate: template }) }, null, 2)}\n`;
window.fakeHost = createFakeHost({
  ...base,
  files,
  state: { ...seeded, ...(now === null ? {} : { "test.clock": { offsetMs: new Date(now).getTime() - Date.now() } }) },
  ...(project === null ? {} : { activeProject: project === "workspace" ? null : project }),
  manifest: MANIFESTS[appName],
  pomadeVersion: "0.0.0-fake",
  ...(hostApi === null ? {} : { hostApi: Number(hostApi) }),
  ...(theme === "dark" || theme === "light" ? { theme } : {}),
});
window.mountNow = () => {
  window.mounted = mountApp(window.fakeHost, { ...open, src: app, parent: stage });
};
if (query.get("mount") !== "manual") window.mountNow();
