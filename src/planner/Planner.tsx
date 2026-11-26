import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject, type ReactNode, type RefObject } from "react";
import type { HostClient } from "pomade-kit/sdk";
import { WORKSPACE_PROJECT_ID, type JsonValue } from "pomade-kit/protocol";

import { EmptyState } from "../core/EmptyState";
import { GearGlyph } from "../core/glyphs";
import { OPEN_HINT_PANEL, OPEN_HINT_TAB } from "../core/hints";
import { errorText, useActiveProject } from "../core/host";
import { itemRoute, quickAddOverlay, ROUTES, type QuickAddPrefill } from "../core/views";
import { useClock, usePlannerDay, type Clock } from "./clock";
import { dailyNotePath } from "./model/daily";
import { foldsKey, groupKey, parseFolds, rowsByGroup, serializeFolds, setFolded, unfoldAll, unfoldedEntries, unfoldedRows, type Folds, type ListEntry } from "./model/folds";
import { allHints, dayHeading, displayTitle, recurringHints, shortDate, todayHints, type Hint } from "./model/labels";
import { isTaskType, PLANNER_TYPES, type Items, type PlannerType, type Task, type UnreadableItem } from "./model/items";
import { DAILY_UNPINNED_KEY, dailyNotePinned, isPinned, parsePins, serializePins, splitPinned, togglePin, pinsKey, type Pins } from "./model/pins";
import { groupLabel } from "./model/picker";
import { folderForNew, folderKey, folderSources, NO_PROJECT, NONE_SOURCE, sectionsBySource, sourceKey, sourceLabels, type ProjectSource, type Source } from "./model/projects";
import { countsInProject, inAllFilter, inScope, inToday, isOwn, liveMixins, projectEntries, projectGroupOf, projectRows, revealInAll, viewListing, type Context, type Listing, type ProjectGroup } from "./model/scope";
import { PLANNER_KEYS, type ParsedPlannerSettings } from "./model/settings";
import { recurringState, type LogWord } from "./model/recurring";
import { allTasks, compareTasks, recurringRows, todayRows, type TodayRow } from "./model/today";
import { DEFAULT_VIEW, parsePlannerView, plannerViewKey, serializePlannerView, type PlannerView, type PlannerViewId } from "./model/view-state";
import { ROW_ACTIONS, rowActionIds, rowMenuEntries, type RowActionId, type RowMenuEntry, type RowMenuPin } from "./model/row-menu";
import {
  canArchive,
  EMPTY_SELECTION,
  pruneSelection,
  selectAllState,
  selectedRows,
  selectOnly,
  toggleAll,
  toggleRow,
  type RowFailure,
  type SelectableRow,
  type Selection,
} from "./model/selection";
import type { Added } from "./AddForm";
import { AddFoot, useAddInPlace } from "./AddInPlace";
import { DailyCard } from "./DailyCard";
import { DeleteConfirm } from "./DeleteConfirm";
import { GroupHeading, type GroupHeadingProps } from "./GroupHeading";
import { ItemPane, ItemSplit } from "./ItemPane";
import { OpenInTabGlyph } from "./OpenInTabGlyph";
import { PlannerGlyph } from "./PlannerGlyph";
import { RowMenu, useRowMenu, type RowMenuTrigger } from "./RowMenu";
import { TaskRow, UnreadableRow, type RowAction, type RowSelect } from "./TaskRow";
import { usePlannerItems, usePlannerSettings } from "./usePlannerData";
import type { AddedAsk } from "./useAddedItem";
import { useAttention } from "./useAttention";
import { useOpenItem, type ItemAsk } from "./useOpenItem";
import { useAppState, useDailyNoteCreation } from "./usePlannerState";
import { useFolderReconciliation, useProjectList, type ProjectList } from "./useProjects";
import { DueTodayChip, FilterMenu, MixBar, OnlyProjectBar, type FilterOption } from "./ViewBars";
import { archiveItem, completeRecurring, resolveThought, restoreItem, saveSettings, tickTask, trashFiles, WriteError } from "./write";

export type PlannerSurface = "panel" | "tab";

const glyph = (size: number) => <PlannerGlyph size={size} />;

/** Pick the tasks root with the workspace-wide folder picker and save it; `null` when cancelled. */
export async function chooseTasksRoot(host: HostClient, current: string | null): Promise<string | null> {
  const { path } = await host.files.pickFolder(current === null ? {} : { initial: current });
  if (path === null) return null;
  await saveSettings(host, { [PLANNER_KEYS.tasksRoot]: path });
  return path;
}

function useChooseRoot(host: HostClient, current: string | null, reload: () => Promise<void>): { choose: () => void; error: string | null } {
  const [error, setError] = useState<string | null>(null);
  const choose = useCallback(() => {
    setError(null);
    void chooseTasksRoot(host, current).then(
      (path) => (path === null ? undefined : reload()),
      (e: unknown) => setError(e instanceof WriteError ? e.message : `Couldn't choose the folder: ${errorText(e)}`),
    );
  }, [host, current, reload]);
  return { choose, error };
}

interface LoadedProps {
  host: HostClient;
  surface: PlannerSurface;
  /** The tab's settings page (the panel opens the tab at it). */
  settingsPage?: (props: { host: HostClient; settings: ParsedPlannerSettings; reload: () => Promise<void>; onBack: () => void }) => ReactNode;
  showSettings?: boolean;
  onShowSettings?: (show: boolean) => void;
  /** Bumped each time the tab is asked to show the Workspace Today (route `today`, the morning summary's click). */
  todayAsks?: number;
  /** The tab is asked to show an item in its compact view (an item route, the click on a panel row). */
  itemAsk?: ItemAsk | undefined;
  /** The quick-add overlay added an item: the Planner shows it in its list (the panel at its added route, a tab on `item.added`). */
  addedAsk?: AddedAsk | undefined;
  /** The user picked a view. */
  onSelectView?: (view: PlannerViewId) => void;
}

/** The Planner in the side panel or a tab: onboarding until a tasks root is chosen, then Today, Project, Recurring and All for the active context. */
export function Planner({ host, surface, settingsPage, showSettings = false, onShowSettings, todayAsks = 0, itemAsk, addedAsk, onSelectView }: LoadedProps) {
  /** The last `addedAsk` the views took: kept here, so the views coming back (the settings page closed) don't take it again. */
  const addedTaken = useRef(0);
  const testId = surface === "panel" ? "view-planner-panel" : "view-planner-tab";
  const clock = useClock(host);
  const { state: settingsState, reload: reloadSettings } = usePlannerSettings(host);
  const root = settingsState.status === "ready" ? settingsState.parsed.settings.tasksRoot : null;
  const { choose, error: chooseError } = useChooseRoot(host, root, reloadSettings);

  if (settingsState.status === "error") {
    return (
      <EmptyState testId={testId} glyph={glyph(32)} title="Can't read the Planner's settings">
        {settingsState.message}
      </EmptyState>
    );
  }
  if (settingsState.status === "loading" || clock === null) return <main className="planner" data-testid={testId} aria-busy="true" />;
  const settings = settingsState.parsed;

  if (showSettings && settingsPage) {
    return <>{settingsPage({ host, settings, reload: reloadSettings, onBack: () => onShowSettings?.(false) })}</>;
  }

  if (settings.settings.tasksRoot === null) {
    return (
      <EmptyState
        testId={testId}
        glyph={glyph(32)}
        title="Where should your tasks live?"
        action={
          <button type="button" className="btn btn--primary" data-testid="choose-tasks-root" onClick={choose}>
            Choose folder…
          </button>
        }
        error={chooseError ?? settings.problem}
      >
        <span data-testid="onboarding">
          Pick any folder in the workspace — the Knowledge vault too. Each task, note and thought is a Markdown file there, and each day starts with a daily note in its Daily/ folder.
        </span>
      </EmptyState>
    );
  }
  return (
    <TasksRoot
      host={host}
      surface={surface}
      clock={clock}
      settings={settings}
      reloadSettings={reloadSettings}
      testId={testId}
      onShowSettings={onShowSettings}
      todayAsks={todayAsks}
      itemAsk={itemAsk}
      addedAsk={addedAsk}
      addedTaken={addedTaken}
      onSelectView={onSelectView}
    />
  );
}

interface TasksRootProps {
  host: HostClient;
  surface: PlannerSurface;
  clock: Clock;
  settings: ParsedPlannerSettings;
  reloadSettings: () => Promise<void>;
  testId: string;
  onShowSettings: ((show: boolean) => void) | undefined;
  todayAsks: number;
  itemAsk: ItemAsk | undefined;
  addedAsk: AddedAsk | undefined;
  addedTaken: MutableRefObject<number>;
  onSelectView: ((view: PlannerViewId) => void) | undefined;
}

function TasksRoot({ host, surface, clock, settings, reloadSettings, testId, onShowSettings, todayAsks, itemAsk, addedAsk, addedTaken, onSelectView }: TasksRootProps) {
  const root = settings.settings.tasksRoot ?? "";
  const { state, reload } = usePlannerItems(host, root, surface === "tab");
  const projects = useProjectList(host);
  const { choose, error: chooseError } = useChooseRoot(host, root, reloadSettings);

  if (state.status === "loading") return <main className="planner" data-testid={testId} aria-busy="true" />;
  if (state.status === "missing" || state.status === "error") {
    return (
      <EmptyState
        testId={testId}
        glyph={glyph(32)}
        title={state.status === "missing" ? "Tasks folder not found" : "Can't read the tasks folder"}
        action={
          <button type="button" className="btn btn--primary" data-testid="choose-tasks-root" onClick={choose}>
            Choose folder…
          </button>
        }
        error={chooseError}
      >
        <span data-testid="tasks-root-problem">
          {state.status === "missing" ? `${root || "The workspace root"}/ isn't there any more.` : `${root}/: ${state.message}`} Choose where your tasks live.
        </span>
      </EmptyState>
    );
  }
  return (
    <Views
      host={host}
      surface={surface}
      clock={clock}
      settings={settings}
      reloadSettings={reloadSettings}
      items={state.value}
      reload={reload}
      projects={projects}
      testId={testId}
      onShowSettings={onShowSettings}
      todayAsks={todayAsks}
      itemAsk={itemAsk}
      addedAsk={addedAsk}
      addedTaken={addedTaken}
      onSelectView={onSelectView}
    />
  );
}

/** The machine-local view of a context, loaded before the views show. */
function useView(host: HostClient, contextId: string): [PlannerView | null, (next: PlannerView) => void] {
  const key = plannerViewKey(contextId);
  const [loaded, setLoaded] = useState<{ key: string; view: PlannerView } | null>(null);
  useEffect(() => {
    let live = true;
    void host.state.get(key).then(
      (v) => live && setLoaded({ key, view: parsePlannerView(v) }),
      () => live && setLoaded({ key, view: DEFAULT_VIEW }),
    );
    const off = host.state.onChange((k, v) => {
      if (k === key) setLoaded({ key, view: parsePlannerView(v) });
    });
    return () => {
      live = false;
      off();
    };
  }, [host, key]);
  const set = useCallback(
    (view: PlannerView) => {
      setLoaded({ key, view });
      void host.state.set(key, serializePlannerView(view)).catch(() => undefined);
    },
    [host, key],
  );
  return [loaded?.key === key ? loaded.view : null, set];
}

interface ViewsProps extends TasksRootProps {
  items: Items;
  reload: () => Promise<void>;
  projects: ProjectList;
}

function MoreGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="3.5" cy="8" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="12.5" cy="8" r="1.25" />
    </svg>
  );
}

function PlusGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** A ticked box behind an open one: select several. */
function SelectGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="8" height="8" rx="1.8" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.8 6.6l1.4 1.4 2.6-2.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.8 6v5.7c0 .6-.5 1.1-1.1 1.1H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

interface PanelSelect {
  on: boolean;
  /** Nothing to select: the item is off. */
  disabled: boolean;
  toggle: () => void;
}

/** The panel's ⋯ menu: select mode, and the Planner's settings. */
function PanelMenu({ host, select, button }: { host: HostClient; select: PanelSelect; button: RefObject<HTMLButtonElement> }) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        button.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, button]);
  return (
    <div className="menu-wrap">
      <button ref={button} type="button" className="icon-btn" aria-label="More" aria-haspopup="menu" aria-expanded={open} data-tip="More" data-testid="planner-menu-button" onClick={() => setOpen((o) => !o)}>
        <MoreGlyph />
      </button>
      {open ? (
        <>
          <div className="menu-scrim" onClick={() => setOpen(false)} />
          <div className="menu menu--compact" role="menu" ref={menu} data-testid="planner-menu">
            <button
              type="button"
              role="menuitem"
              className="menu__item"
              data-testid="menu-select"
              disabled={select.disabled}
              onClick={() => {
                setOpen(false);
                select.toggle();
              }}
            >
              {select.on ? "Stop selecting" : "Select items…"}
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu__item"
              data-testid="menu-settings"
              onClick={() => {
                setOpen(false);
                void host.tabs.openApp({ route: ROUTES.settings }).catch(() => undefined);
              }}
            >
              Settings…
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Views({ host, surface, clock, settings, items, reload, testId, onShowSettings, projects, todayAsks, itemAsk, addedAsk, addedTaken, onSelectView }: ViewsProps) {
  const { tasksRoot, dayBoundary, projectFolders, dailyNoteTemplate } = settings.settings;
  const root = tasksRoot ?? "";
  const day = usePlannerDay(clock, dayBoundary);
  const active = useActiveProject(host);
  const context: Context = active.kind === "project" ? { kind: "project", id: active.id } : { kind: "workspace" };
  const [view, setView] = useView(host, active.id);
  const [contextPins, setContextPins] = useAppState(host, pinsKey(active.id), parsePins, serializePins);
  const [workspacePins, setWorkspacePins] = useAppState(host, pinsKey(WORKSPACE_PROJECT_ID), parsePins, serializePins);
  const [unpinned, setUnpinned] = useAppState(host, DAILY_UNPINNED_KEY, parseUnpinned, serializeUnpinned);
  const [folds, setFolds] = useAppState(host, foldsKey(active.id), parseFolds, serializeFolds);
  // The panel is the Planner's launch frame (startOnLaunch): it alone makes the day's note, sets the badge and posts the summary.
  const launchFrame = surface === "panel";
  const daily = useDailyNoteCreation(host, launchFrame, root, day, dailyNoteTemplate, reload);
  const dailyError = daily.error;
  /** Ticks shown before their write lands: path → the state shown and the file version it was made on. */
  const [pending, setPending] = useState<Record<string, { done: boolean; mtimeMs: number }>>({});
  const [error, setError] = useState<string | null>(null);
  const folderProblems = useFolderReconciliation(host, root, projectFolders, items.folders, projects);
  const trim = useTrimming(active.id, view?.view ?? null);
  const rowMenu = useRowMenu(active.id);
  const add = useAddInPlace();
  const split = useRef<HTMLDivElement>(null);
  const item = useOpenItem(host, root, items, active.id, itemAsk, split);

  const acks = useAcks();
  const added = useAddedReveal();

  // An item the overlay added in this context: the folder is read again, then the item shown.
  const { show: showAdded } = added;
  useEffect(() => {
    if (addedAsk === undefined || addedAsk.n === addedTaken.current) return;
    addedTaken.current = addedAsk.n;
    if (addedAsk.contextId !== null && addedAsk.contextId !== active.id) return;
    void reload().then(() => showAdded(addedAsk.path, false));
  }, [addedAsk, addedTaken, active.id, reload, showAdded]);

  // A tick shows at once; the read of a newer version of its file takes over (another file's read leaves it).
  useEffect(
    () =>
      setPending((p) => {
        const kept = Object.entries(p).filter(([path, tick]) => items.tasks.some((t) => t.path === path && t.mtimeMs === tick.mtimeMs));
        return kept.length === Object.keys(p).length ? p : Object.fromEntries(kept);
      }),
    [items],
  );
  const isDone = (t: Task) => pending[t.path]?.done ?? t.done;
  const shown = useMemo(
    () =>
      items.tasks.map((t) => {
        const tick = pending[t.path];
        return tick === undefined ? t : { ...t, done: tick.done, doneOn: tick.done ? day : null };
      }),
    [items, pending, day],
  );
  const summaryChecks = useAttention(host, launchFrame, shown, day);

  // Asked for the Workspace Today: selected once the context is the Workspace (the click switches to it).
  const asked = useRef(0);
  useEffect(() => {
    if (todayAsks === asked.current || view === null || context.kind !== "workspace") return;
    asked.current = todayAsks;
    if (view.view !== "today") setView({ ...view, view: "today" });
  }, [todayAsks, view, context.kind, setView]);

  const list = projects.status === "ready" ? projects : null;
  const sources = useMemo(() => folderSources(items.folders, projectFolders, list?.projects ?? null), [items.folders, projectFolders, list]);
  const labels = useMemo(() => sourceLabels([NONE_SOURCE, ...sources.values()]), [sources]);
  const sourceOf = useCallback(
    (folder: string | null): Source => (folder === null ? NONE_SOURCE : (sources.get(folderKey(folder)) ?? { kind: "project", key: `folder:${folderKey(folder)}`, id: null, name: folder, groupPath: [], folder })),
    [sources],
  );
  const labelOf = (source: Source): string => labels.get(sourceKey(source))?.text ?? (source.kind === "none" ? "No project" : source.name);

  /** Project lists the project's Today items alone: "Due today" is on, inside a project. */
  const dueToday = context.kind === "project" && view?.dueToday === true;
  const viewId = view?.view ?? null;
  /**
   * The keys of the groups an item stands in on the view, outermost first (`folds.ts`): its
   * source's; in Project its group's ("tasks", "notes") — at Workspace under its source's.
   */
  const groupsOf = useCallback(
    (task: Task): string[] => {
      const source = sourceKey(sourceOf(task.folder));
      const group = viewId === "project" && !dueToday ? projectGroupOf(task, day) : null;
      if (group === null) return [source];
      return context.kind === "workspace" ? [source, groupKey([source, group])] : [group];
    },
    [sourceOf, viewId, dueToday, day, context.kind],
  );
  /** The item just added, once its file is read. */
  const addedTask = added.ask === null ? null : (items.tasks.find((t) => t.path === added.ask?.path) ?? null);
  // A group holding the item asked for (the panel's click, an item route) or just added unfolds.
  const revealing = useReveal(
    [
      item.open === null ? null : { path: item.open.path, ask: `open:${String(item.open.id)}:${String(item.open.asks)}` },
      added.ask === null ? null : { path: added.ask.path, ask: `added:${String(added.ask.id)}` },
    ],
    items,
    groupsOf,
    view?.view ?? null,
    folds,
    setFolds,
  );

  const own = context.kind === "project" ? (list?.projects.find((p) => p.id === context.id) ?? null) : null;
  const ownName = context.kind === "project" ? (own?.name ?? active.name) : "Workspace";
  const ownFolder = context.kind === "project" && own !== null ? folderForNew(own, projectFolders).folder : null;

  const knownKeys = useMemo(() => new Set([...(list?.projects.map((p) => p.id) ?? []), ...[...sources.values()].map((s) => s.key)]), [list, sources]);

  // No projectId: the editor tab opens in the project this frame is shown in, and Pomade stays there (HOST-API §4 `tabs.open`).
  const openFile = (path: string) => void host.tabs.openFile({ path }).catch((e: unknown) => setError(`Couldn't open ${path}: ${errorText(e)}`));
  /**
   * A click on an item: its compact view beside the tab's lists; from the panel, too narrow to edit
   * in, the Planner tab of this context with that view open. `direct` (⌘-click): the editor tab.
   */
  const openItem = (path: string, direct: boolean) => {
    if (direct) openFile(path);
    else if (surface === "tab") item.show(path);
    else void host.tabs.openApp({ route: itemRoute(path) }).catch((e: unknown) => setError(`Couldn't open the Planner tab: ${errorText(e)}`));
  };
  const toggle = (task: Task, done: boolean) => {
    setError(null);
    const original = items.tasks.find((t) => t.path === task.path) ?? task;
    setPending((p) => ({ ...p, [task.path]: { done, mtimeMs: original.mtimeMs } }));
    void (task.type === "thought" ? resolveThought(host, original, done, day) : tickTask(host, original, done, day))
      .catch((e: unknown) => {
        setError(e instanceof WriteError ? e.message : `Not saved: ${errorText(e)}.`);
        setPending((p) => {
          const { [task.path]: _, ...rest } = p;
          return rest;
        });
      })
      .finally(() => void reload());
  };

  /**
   * Done or skip on a recurring item: the row says so at once ("Done…"), then where the item went
   * ("Done · next Dec 5") for a moment — in Today, from where it was, even when it has left — and
   * the views show the file as it is now.
   */
  const complete = (task: Task, word: LogWord, row: TodayRow | null) => {
    if (acks.has(task.path)) return;
    setError(null);
    const original = items.tasks.find((t) => t.path === task.path) ?? task;
    const label = word === "done" ? "Done" : "Skipped";
    acks.start(task.path, { task: original, row, word, text: `${label}…`, settled: false });
    void completeRecurring(host, original, word, day)
      .then(
        (next) => {
          const end = original.repeat?.kind === "ok" ? original.repeat.schedule.end : null;
          const ended = next === null || (end !== null && next > end);
          acks.settle(task.path, `${label} · ${ended ? "ended" : `next ${shortDate(next, day)}`}`);
        },
        (e: unknown) => {
          setError(e instanceof WriteError ? e.message : `Not saved: ${errorText(e)}.`);
          acks.drop(task.path);
        },
      )
      .finally(() => void reload());
  };

  /** Archive a note, or restore an archived item: a move; the row leaves with the next read. */
  const move = (task: Task) => {
    setError(null);
    void (task.archived ? restoreItem(host, root, task) : archiveItem(host, root, task))
      .then((to) => item.moved(task.path, to))
      .catch((e: unknown) => setError(e instanceof WriteError ? e.message : `Not moved: ${errorText(e)}.`))
      .finally(() => void reload());
  };

  if (view === null || contextPins === null || workspacePins === null || unpinned === null || folds === null) return <main className="planner" data-testid={testId} aria-busy="true" />;
  // Today has one pin list for the whole workspace: the Workspace's; every other view's are the context's own.
  // The Workspace's key is read and written through its own state alone, so it never goes stale here.
  const pins: Pins = context.kind === "workspace" ? workspacePins : { ...contextPins, today: workspacePins.today };
  const setPins = (next: Pins) => {
    if (context.kind === "workspace" || next.today !== pins.today) setWorkspacePins(context.kind === "workspace" ? next : { ...workspacePins, today: next.today });
    else setContextPins({ ...next, today: [] });
  };
  const pinnedHere = pins[view.view];
  const pinOf = (task: Task) => ({ pinned: isPinned(pins, view.view, task.path), onToggle: () => setPins(togglePin(pins, view.view, task.path)) });
  /** What each row action does: a recurring item's Skip (`row`: its Today row), a note's Archive, an archived item's Restore, a thought's Resolve and Reopen. */
  const act = (task: Task, id: RowActionId, row: TodayRow | null) => {
    if (id === "skip") complete(task, "skipped", row);
    else if (id === "archive" || id === "restore") move(task);
    else toggle(task, id === "resolve");
  };
  /** A row's actions besides its pin (`rowActionIds`): the row's buttons and its menu both offer these. */
  const actionsOf = (task: Task, locked = false, row: TodayRow | null = null): RowAction[] =>
    rowActionIds(task, isDone(task), locked).map((id) => ({ id, ...ROW_ACTIONS[id], onClick: () => act(task, id, row) }));
  const select = (id: PlannerViewId) => {
    if (id !== view.view) trim.stop(false);
    setView({ ...view, view: id });
    onSelectView?.(id);
  };
  const mixins = { mixins: liveMixins(context, view, knownKeys) };
  const scoped = shown.filter((t) => inScope(context, mixins, sourceOf(t.folder)));
  /** Today narrowed to the project's own items: the project filter is on, inside a project. */
  const onlyOwn = context.kind === "project" && view.onlyProject;
  const wholeDay = withAcks(todayRows(shown, day), acks.list(), (a) => a.row, (r) => r.task);
  const today = onlyOwn ? wholeDay.filter((r) => inToday(context, view, sourceOf(r.task.folder))) : wholeDay;
  const projectGroups = projectRows(scoped, day);
  /** Project with "Due today" on: the Today module's rows of its scope. */
  const projectToday = dueToday ? withAcks(todayRows(scoped, day), acks.list(), (a) => a.row, (r) => r.task) : [];
  /** What Project lists, top to bottom (its pinned rows aside). */
  const projectList: Task[] = dueToday ? projectToday.map((r) => r.task) : [...projectGroups.tasks, ...projectGroups.notes];
  const recurringList = recurringRows(scoped, day);
  const filtered = shown.filter((t) => inAllFilter(view, sourceOf(t.folder), t.type));
  const showDaily = view.types.includes("daily-note");
  const all = allTasks(filtered, { showDone: view.showDone, showArchived: view.showArchived, showDaily });
  /** The list stands under project headings: Today unless narrowed to the project, Project and Recurring at Workspace. */
  const bySource = view.view === "today" ? !onlyOwn : context.kind === "workspace" && view.view !== "all";
  const unreadableShown = items.unreadable.filter((u) =>
    view.view === "all"
      ? inAllFilter(view, sourceOf(u.folder), u.type) && (view.showArchived || !u.archived) && (showDaily || u.type !== "daily-note")
      : !u.archived &&
        (view.view === "project" && !dueToday ? u.type !== "daily-note" : isTaskType(u.type)) &&
        (view.view === "today" ? inToday(context, view, sourceOf(u.folder)) : inScope(context, mixins, sourceOf(u.folder))) &&
        (view.view !== "recurring" || u.type === "recurring"),
  );

  /** The row whose menu is open. */
  const menuFor = rowMenu.menu?.path ?? null;

  /**
   * A row's menu ([[views]] "Rows"): Open in tab (as ⌘-click), the pin, the row's own `actions`,
   * Select… (select mode with this row selected), then Delete…, which asks select mode's question
   * for the one row. None in select mode.
   */
  const menuOf = (row: SelectableRow, actions: readonly RowAction[], pin: RowMenuPin, onPin: () => void = () => undefined): RowMenuTrigger | undefined => {
    if (inSelect) return undefined;
    return (anchor, focusRow) => {
      const pick = (entry: RowMenuEntry) => () => {
        if (entry === "open-tab") openFile(row.path);
        else if (entry === "pin" || entry === "unpin" || entry === "unpin-today") onPin();
        else if (entry === "select") trim.start(row.path);
        else if (entry === "delete") rowMenu.askDelete(row, focusRow);
        else actions.find((a) => a.id === entry)?.onClick();
      };
      rowMenu.open({ anchor, path: row.path, title: row.title, focusRow, items: rowMenuEntries(actions.map((a) => a.id), pin).map((entry) => ({ entry, onPick: pick(entry) })) });
    };
  };
  const rowOf = (task: Task): SelectableRow => ({ path: task.path, title: displayTitle(task, day), type: task.type, archived: task.archived, readable: true });
  const unreadableRowOf = (u: UnreadableItem): SelectableRow => ({ path: u.path, title: u.name, type: u.type, archived: u.archived, readable: false });
  /** What a click and a ⌘-click on a row do here — its title's delayed tooltip. */
  const openHint = surface === "tab" ? OPEN_HINT_TAB : OPEN_HINT_PANEL;
  /** A readable row's menu props: its menu with its actions and its view pin, open or not, what a failed delete left, and its open hint. */
  const menuProps = (task: Task, actions: readonly RowAction[]) => {
    const pin = pinOf(task);
    return {
      openHint,
      menu: menuOf(rowOf(task), actions, pin.pinned ? "pinned" : "unpinned", pin.onToggle),
      menuOpen: menuFor === task.path,
      failure: failureOf(task.path),
    };
  };

  /** Move the chosen files to the Trash; the ones that stay keep their selection and say why. */
  const confirmDelete = () => {
    setError(null);
    trim.setBusy(true);
    void trashFiles(host, chosen.map((r) => r.path))
      .then(trim.settle)
      .finally(() => void reload());
  };

  /** Move the row the menu asked about to the Trash; a file that stays says why on its row. */
  const confirmRowDelete = () => {
    const asked = rowMenu.deleting;
    if (asked === null) return;
    setError(null);
    rowMenu.start();
    void trashFiles(host, [asked.row.path])
      .then(rowMenu.settle)
      .finally(() => void reload());
  };

  /** Archive the chosen notes (all of them are, `canArchive`), one move each. */
  const archiveChosen = () => {
    const notes = chosen.flatMap((r) => items.tasks.filter((t) => t.path === r.path));
    setError(null);
    trim.setBusy(true);
    void (async () => {
      const failed: RowFailure[] = [];
      for (const note of notes) {
        try {
          await archiveItem(host, root, note);
        } catch (e) {
          failed.push({ path: note.path, text: e instanceof WriteError ? e.message : `Couldn't archive it: ${errorText(e)}.`, detail: "" });
        }
      }
      return failed;
    })()
      .then(trim.settle)
      .finally(() => void reload());
  };

  /** Select mode's keys: Esc leaves it, ⌘A selects every row shown, Delete or Backspace asks to delete, ↑ ↓ walk the rows' checkboxes. */
  const onSelectKeys = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (!inSelect || trim.confirming) return;
    const target = e.target as HTMLElement;
    const typing = (target instanceof HTMLInputElement && target.type !== "checkbox") || target instanceof HTMLTextAreaElement;
    if (typing || target.closest(".popover") !== null) return;
    if (e.key === "Escape") {
      e.preventDefault();
      trim.stop(true);
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      trim.setSelection({ paths: new Set(shownPaths), anchor: null });
    } else if ((e.key === "Delete" || e.key === "Backspace") && chosen.length > 0 && !trim.busy) {
      e.preventDefault();
      trim.ask();
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && target.dataset.testid === "select-row") {
      e.preventDefault();
      const boxes = [...e.currentTarget.querySelectorAll<HTMLInputElement>('[data-testid="select-row"]')];
      boxes[boxes.indexOf(target as HTMLInputElement) + (e.key === "ArrowDown" ? 1 : -1)]?.focus();
    }
  };

  /** Whose rows go unlabelled: the context's own — in the whole day's Today, as at Workspace, the workspace-level items. */
  const labelContext: Context = view.view === "today" && !onlyOwn ? { kind: "workspace" } : context;
  /** A row's source label: shown when the row isn't the context's own — under a project heading only on a pinned row, which stands above the headings. */
  const rowSource = (task: Task, pinned = false): string | undefined => {
    const source = sourceOf(task.folder);
    return (bySource && !(pinned && source.kind === "project")) || isOwn(labelContext, source) ? undefined : labelOf(source);
  };
  const excerpt = surface === "tab" ? (task: Task) => task.excerpt : () => null;
  /** A recurring item's row: done advances it (never unticks), Skip on hover; locked while its rule can't be read, once ended, and while a write is under way. */
  const recurringRow = (task: Task, hints: Hint[], reason: string | undefined, row: TodayRow | null, pinned = false) => {
    const ack = acks.get(task.path);
    const state = recurringState(task, day);
    const locked =
      ack !== undefined
        ? "Saving…"
        : task.repeat?.kind !== "ok"
          ? "Fix the repeat rule first — open the file"
          : state.phase === "ended"
            ? "Ended — change end or do-on in the file to bring it back"
            : undefined;
    const actions = actionsOf(task, locked !== undefined, row);
    return (
      <TaskRow
        key={task.path}
        task={ack?.task ?? task}
        done={ack?.word === "done"}
        hints={ack === undefined ? hints : [{ kind: "ack", text: ack.text, tone: ack.settled ? "accent" : "muted" }, ...hints.filter((h) => h.kind === "repeat")]}
        reason={reason}
        source={rowSource(task, pinned)}
        onToggle={(d) => {
          if (d) complete(task, "done", row);
        }}
        onOpen={(direct) => openItem(task.path, direct)}
        open={item.open?.path === task.path}
        actions={actions}
        pin={pinOf(task)}
        excerpt={excerpt(task)}
        locked={locked}
        select={selectOf(task.path)}
        {...menuProps(task, actions)}
      />
    );
  };
  const todayRow = (row: TodayRow, pinned = false) => {
    if (row.task.repeat !== null) return recurringRow(row.task, row.recurring === null ? [] : todayHints(row, day), row.reason, row, pinned);
    const actions = actionsOf(row.task);
    return (
      <TaskRow
        key={row.task.path}
        task={row.task}
        done={isDone(row.task)}
        hints={todayHints(row, day)}
        reason={row.reason}
        source={rowSource(row.task, pinned)}
        onToggle={(d) => toggle(row.task, d)}
        onOpen={(direct) => openItem(row.task.path, direct)}
        open={item.open?.path === row.task.path}
        actions={actions}
        pin={pinOf(row.task)}
        excerpt={excerpt(row.task)}
        select={selectOf(row.task.path)}
        {...menuProps(row.task, actions)}
      />
    );
  };
  const listRow = (task: Task, pinned = false) => {
    if (task.repeat !== null && !task.archived) return recurringRow(task, recurringHints(task, recurringState(task, day), day), undefined, null, pinned);
    const actions = actionsOf(task);
    return (
      <TaskRow
        key={task.path}
        task={task}
        title={displayTitle(task, day)}
        done={isDone(task)}
        hints={allHints(task, day)}
        source={rowSource(task, pinned)}
        onToggle={(d) => toggle(task, d)}
        onOpen={(direct) => openItem(task.path, direct)}
        open={item.open?.path === task.path}
        actions={actions}
        pin={pinOf(task)}
        excerpt={excerpt(task)}
        select={selectOf(task.path)}
        {...menuProps(task, actions)}
      />
    );
  };
  /** The view's folded groups, those holding the item asked for or just added aside. */
  const folded = new Set(folds[view.view].filter((k) => !revealing.has(k)));
  const fold = (key: string, on: boolean) => setFolds(setFolded(folds, view.view, key, on));
  /** The heading of the source of `task` (a group's first row): its label (name and qualifier), and its key as `data-source`. */
  const sourceHeading = (task: Task | undefined, key: string): Pick<GroupHeadingProps, "name" | "qualifier" | "source"> => {
    const label = labels.get(key);
    const source = task === undefined ? null : sourceOf(task.folder);
    return { name: label?.name ?? (source === null ? key : labelOf(source)), qualifier: label?.qualifier ?? undefined, source: key };
  };
  /** `rows` with no headings. */
  const flat = <T,>(rows: readonly T[]): Grouped<T> => ({ entries: rows.map((row) => ({ kind: "row", row })), headingOf: (group) => ({ name: group.key, count: 0 }) });
  /** `rows` under a heading per project, each folding; with no row of a project, no headings. */
  const sectioned = <T,>(rows: readonly T[], taskOf: (row: T) => Task, open: (row: T) => boolean = (r) => !isDone(taskOf(r))): Grouped<T> => {
    const sections = sectionsBySource(rows, (r) => sourceOf(taskOf(r).folder));
    if (sections.every((sec) => sec.source.kind === "none")) return flat(rows);
    return {
      entries: sections.flatMap((sec) => [{ kind: "group" as const, key: sourceKey(sec.source), level: 1 as const }, ...sec.items.map((row) => ({ kind: "row" as const, row }))]),
      headingOf: (group, groupRows) => ({ ...sourceHeading(groupRows[0] === undefined ? undefined : taskOf(groupRows[0]), group.key), count: groupRows.filter(open).length }),
    };
  };
  /**
   * Project's rows in its two groups, "Tasks" and "Notes and thoughts" — at Workspace inside a
   * heading per project. "Tasks" and a project's heading count what the switcher counts
   * (`countsInProject`); "Notes and thoughts" counts its rows.
   */
  const projectGrouped = (rows: readonly Task[]): Grouped<Task> => {
    const atWorkspace = context.kind === "workspace";
    const counted = (groupRows: readonly Task[]) => groupRows.filter((t) => countsInProject(t, day)).length;
    return {
      entries: projectEntries(rows, (t) => projectGroupOf(t, day) ?? "tasks", atWorkspace ? (t) => sourceOf(t.folder) : undefined),
      headingOf: (group, groupRows) => {
        if (group.level === 1) return { ...sourceHeading(groupRows[0], group.key), count: counted(groupRows) };
        // A level-2 key is its group's, under its source's at Workspace (`projectEntries`).
        const notes = group.key.endsWith("notes");
        return { name: PROJECT_GROUP_NAMES[notes ? "notes" : "tasks"], nested: atWorkspace, count: notes ? groupRows.length : counted(groupRows) };
      },
    };
  };

  /**
   * The view's list: the pinned rows (in pin order, above the list) and the rest (`group`: under
   * project headings where the view has them, else flat). `shown` is every row on screen, top to
   * bottom — a folded group's rows are not — for select mode; `draw` renders them.
   */
  const layOut = <T,>(
    list: readonly T[],
    taskOf: (row: T) => Task,
    render: (row: T, pinned?: boolean) => ReactNode,
    group: (rest: readonly T[]) => Grouped<T> = (rest) => (bySource ? sectioned(rest, taskOf) : flat(rest)),
  ): { shown: Task[]; draw: () => { pinned: ReactNode[]; rest: ReactNode[] } } => {
    const split = splitPinned(list, pinnedHere, (r) => taskOf(r).path);
    const { entries, headingOf } = group(split.rest);
    return {
      shown: [...split.pinned, ...unfoldedRows(entries, folded)].map(taskOf),
      draw: () => {
        const rowsOf = rowsByGroup(entries);
        const rest = unfoldedEntries(entries, folded).map((entry) =>
          entry.kind === "row" ? (
            render(entry.row)
          ) : (
            <GroupHeading
              key={`section:${entry.key}`}
              groupKey={entry.key}
              level={entry.level}
              {...headingOf(entry, rowsOf.get(entry.key) ?? [])}
              folded={folded.has(entry.key)}
              onFold={(on) => fold(entry.key, on)}
            />
          ),
        );
        return { pinned: split.pinned.map((r) => render(r, true)), rest };
      },
    };
  };
  let laidOut: ReturnType<typeof layOut>;
  if (view.view === "today") laidOut = layOut(today, (r) => r.task, todayRow);
  else if (view.view === "project") laidOut = dueToday ? layOut(projectToday, (r) => r.task, todayRow) : layOut(projectList, (t) => t, listRow, projectGrouped);
  else if (view.view === "recurring") {
    const recurringView = (r: (typeof recurringList)[number], pinned?: boolean) => recurringRow(r.task, recurringHints(r.task, r.state, day), r.state.phase, null, pinned);
    laidOut = layOut(recurringList, (r) => r.task, recurringView, (rest) => (bySource ? sectioned(rest, (r) => r.task, (r) => r.state.phase !== "ended") : flat(rest)));
  } else laidOut = layOut(all, (t) => t, listRow);
  const todayNote = view.view === "today" && !onlyOwn ? (items.tasks.find((t) => t.type === "daily-note" && !t.archived && t.path === dailyNotePath(root, day)) ?? null) : null;
  /** The daily note's card, pinned above Today's rows. */
  const cardNote = todayNote !== null && dailyNotePinned(day, unpinned.day) ? todayNote : null;

  /** The view's rows top to bottom (the card, pinned, the list, the unreadable files): what select mode chooses from. */
  const selectable: SelectableRow[] = [...(cardNote === null ? [] : [rowOf(cardNote)]), ...laidOut.shown.map(rowOf), ...unreadableShown.map(unreadableRowOf)];
  const shownPaths = selectable.map((r) => r.path);
  const inSelect = trim.selecting === view.view;
  const selection = inSelect ? pruneSelection(trim.selection, shownPaths) : EMPTY_SELECTION;
  // A filter that hides a row, a group folded over it, or a file that leaves, drops it from the selection.
  if (inSelect && selection !== trim.selection) trim.setSelection(selection);
  const chosen = selectedRows(selectable, selection);
  const selectOf = (path: string): RowSelect | undefined =>
    inSelect ? { selected: selection.paths.has(path), onToggle: (range) => trim.setSelection(toggleRow(selection, path, shownPaths, range)) } : undefined;
  /** Why the last delete (select mode's, or the row menu's) or archive left a row. */
  const failureOf = (path: string) => (inSelect ? trim.failures.get(path) : rowMenu.failures.get(path));

  const listed = laidOut.draw();
  const rows = listed.rest;
  const dailyCard =
    cardNote !== null ? (
      <DailyCard
        key="daily-card"
        note={cardNote}
        day={day}
        open={item.open?.path === cardNote.path}
        onOpen={(direct) => openItem(cardNote.path, direct)}
        onUnpin={() => setUnpinned({ day })}
        menu={menuOf(rowOf(cardNote), [], "card", () => setUnpinned({ day }))}
        menuOpen={menuFor === cardNote.path}
        failure={failureOf(cardNote.path)}
        openHint={openHint}
        select={selectOf(cardNote.path)}
      />
    ) : null;
  const pinnedRows = dailyCard === null ? listed.pinned : [dailyCard, ...listed.pinned];
  const unreadable = unreadableShown.map((u) => (
    <UnreadableRow
      key={u.path}
      item={u}
      onOpen={() => openFile(u.path)}
      select={selectOf(u.path)}
      menu={menuOf(unreadableRowOf(u), [], null)}
      menuOpen={menuFor === u.path}
      failure={failureOf(u.path)}
    />
  ));
  const empty = rows.length === 0 && unreadable.length === 0;
  const filtering = view.projects.length > 0 || view.types.length > 0;

  const counts: Record<PlannerViewId, number> = {
    today: wholeDay.filter((r) => !isDone(r.task)).length,
    // "Due today" on or off: the open tasks and the recurring items due (`countsInProject`).
    project: projectGroups.tasks.filter((t) => countsInProject(t, day)).length,
    recurring: recurringList.filter((r) => r.state.phase !== "ended").length,
    all: filtered.filter((t) => !isDone(t) && !t.archived && t.type !== "daily-note").length,
  };
  const rootPath = root === "" ? "" : `${root}/`;
  /** The line under the header names the context: the project in its own views (Today only while narrowed to it), else "All projects"; the folder's path is its tooltip. */
  const namesProject = context.kind === "project" && (view.view !== "today" || onlyOwn);
  const ownSource = context.kind === "project" ? [...sources.values()].find((src) => src.id === context.id) : undefined;
  const contextName = namesProject ? (ownSource === undefined ? ownName : labelOf(ownSource)) : "All projects";
  const contextPath = namesProject && ownFolder !== null ? `${rootPath}${ownFolder}/` : rootPath || "the workspace root";

  /** What an add starts with here ([[quick-add]] "Pre-fills"); the project is the context's on every path. */
  const prefill: QuickAddPrefill = { doOn: view.view === "today" ? "today" : "", kind: view.view === "recurring" ? "recurring" : "task" };
  /** An add in place: the form closes and the item is shown, focused — unless it opens in its compact view (⇧⌘↵), which takes the focus. */
  const addedInPlace = async (made: Added, openIt: boolean) => {
    await reload();
    add.close(false);
    added.show(made.path, !openIt);
    if (openIt) item.show(made.path);
  };
  /**
   * Where the item just added shows ([[quick-add]] "After an add"): this view when it lists it; else
   * Project or Recurring when they do; else All, its filters widened to pass it (`viewListing`).
   */
  const addedListing: Listing | null =
    addedTask === null
      ? null
      : viewListing(addedTask.path, view.view, { today: today.map((r) => r.task.path), project: projectList.map((t) => t.path), recurring: recurringList.map((r) => r.task.path), all: all.map((t) => t.path) });
  const goToAdded = (listing: Listing) => {
    if (addedTask === null) return;
    if (listing.view !== "all") select(listing.view);
    else {
      setView(revealInAll(view, sourceOf(addedTask.folder), addedTask.type));
      onSelectView?.("all");
    }
  };
  /** Adding from **+** or the Add button: in place in the tab; from the panel, too narrow for the form, in the overlay beside it, at the form's height. */
  const openAdd = (from: HTMLElement) => {
    setError(null);
    if (surface === "tab") add.open(from);
    else void host.overlay.open(quickAddOverlay(prefill)).catch((e: unknown) => setError(`Couldn't open quick add: ${errorText(e)}`));
  };
  const addFoot = (
    <AddFoot
      add={add}
      host={host}
      clock={clock}
      root={root}
      boundary={dayBoundary}
      projects={projects}
      folders={projectFolders}
      template={dailyNoteTemplate}
      project={active.kind === "project" ? { id: active.id, name: active.name } : null}
      view={view.view}
      prefill={prefill}
      onOpen={openAdd}
      empty={empty}
      quiet={inSelect}
      onAdded={addedInPlace}
      onError={setError}
    />
  );

  const projectOptions: FilterOption[] = [
    { key: NO_PROJECT, label: "No project" },
    ...(list?.projects ?? []).map((p) => ({ key: p.id, label: p.name, meta: groupLabel(p.groupPath) })),
    ...[...sources.values()].filter((src) => src.id === null).map((src) => ({ key: src.key, label: src.name, meta: "folder only" })),
  ];
  const typeOptions: FilterOption[] = PLANNER_TYPES.map((t) => ({ key: t, label: TYPE_LABELS[t] }));

  const inOwn = (what: string): string => (namesProject ? `${what} in ${contextName}` : what);
  const emptyTitle =
    view.view === "today"
      ? inOwn("Nothing for today")
      : view.view === "project"
        ? inOwn(dueToday ? "Nothing for today" : "Nothing open")
        : view.view === "recurring"
          ? inOwn("No recurring tasks")
          : filtering
            ? "Nothing matches the filters"
            : "No open tasks";
  const emptyText =
    view.view === "today" || dueToday
      ? "Nothing overdue, due or planned."
      : view.view === "recurring"
        ? "Tasks that come back on a schedule show here."
        : view.view === "all" && filtering
          ? "Change the filters to see more."
          : "Add one here, or with ⌘⇧A from anywhere in Pomade.";

  const selectToggle: PanelSelect = { on: inSelect, disabled: !inSelect && selectable.length === 0, toggle: () => (inSelect ? trim.stop(true) : trim.start()) };

  /** The open item's pin: the view's own while it lists the item as a row; the daily note's card unpins for the day. */
  const openPath = item.open?.path ?? null;
  const listedHere = view.view === "today" ? today.map((r) => r.task.path) : view.view === "project" ? projectList.map((t) => t.path) : view.view === "recurring" ? recurringList.map((r) => r.task.path) : all.map((t) => t.path);
  const openPin =
    openPath === null
      ? undefined
      : dailyCard !== null && todayNote?.path === openPath
        ? { pinned: true, label: "Unpin for today — it is pinned again tomorrow", onToggle: () => setUnpinned({ day }) }
        : listedHere.includes(openPath)
          ? { pinned: isPinned(pins, view.view, openPath), label: isPinned(pins, view.view, openPath) ? "Unpin from this view" : "Pin to the top of this view", onToggle: () => setPins(togglePin(pins, view.view, openPath)) }
          : undefined;
  const pane =
    item.open === null ? null : (
      <ItemPane
        key={item.open.id}
        host={host}
        clock={clock}
        boundary={dayBoundary}
        day={day}
        root={root}
        task={items.tasks.find((t) => t.path === openPath) ?? null}
        asks={item.open.asks}
        pin={openPin}
        reload={reload}
        onClose={() => item.close(true)}
        onOpenInTab={openFile}
        onMoved={item.moved}
        onError={setError}
      />
    );

  const planner = (
    <main className={`planner planner--${surface}${inSelect ? " planner--selecting" : ""}`} data-testid={testId} data-day={day} data-context={active.id} data-daily={daily.settled ? day : "pending"}
      data-summary-checks={launchFrame ? summaryChecks : undefined}
      onKeyDown={onSelectKeys}
    >
      {added.ask !== null && addedListing !== null ? (
        <AddedShown key={added.ask.id} path={added.ask.path} focus={added.ask.focus} listing={addedListing} view={view.view} onGo={goToAdded} onDone={added.done} />
      ) : null}
      <header className="planner__header">
        <ViewSwitcher view={view.view} counts={counts} onSelect={select} />
        <div className="planner__actions">
          <button type="button" className="icon-btn" aria-label="New task" aria-haspopup={surface === "panel" ? "dialog" : undefined} data-tip="New task (⌘⇧A)" data-testid="planner-add" onClick={(e) => openAdd(e.currentTarget)}>
            <PlusGlyph />
          </button>
          {surface === "panel" ? (
            <>
              <button type="button" className="icon-btn" aria-label="Open in tab" data-tip="Open in tab" data-testid="planner-open-tab" onClick={() => void host.tabs.openApp({ route: ROUTES.planner }).catch(() => undefined)}>
                <OpenInTabGlyph />
              </button>
              <PanelMenu host={host} button={trim.startButton} select={selectToggle} />
            </>
          ) : (
            <>
              <button
                ref={trim.startButton}
                type="button"
                className="icon-btn"
                aria-label="Select"
                aria-pressed={inSelect}
                data-tip={inSelect ? "Leave select mode (Esc)" : "Select items to delete or archive"}
                data-testid="select-start"
                disabled={selectToggle.disabled}
                onClick={selectToggle.toggle}
              >
                <SelectGlyph />
              </button>
              <button type="button" className="icon-btn" aria-label="Settings" data-tip="Settings" data-testid="planner-settings" onClick={() => onShowSettings?.(true)}>
                <GearGlyph />
              </button>
            </>
          )}
        </div>
      </header>
      {settings.problem !== null ? (
        <div className="planner__notice" role="status" data-testid="settings-problem">
          {settings.problem} — using the defaults.
        </div>
      ) : null}
      {folderProblems.map((p) => (
        <div key={p.key} className="planner__notice" role="alert" data-testid="folder-problem">
          {p.text}
        </div>
      ))}
      <div className="planner__subheader">
        {view.view !== "all" ? (
          <span className="planner__day" data-testid="planner-day" title={`The planner day starts at ${String(dayBoundary.hour)}:${String(dayBoundary.minute).padStart(2, "0")}`}>
            {dayHeading(day)}
          </span>
        ) : (
          <>
            <label className="planner__toggle">
              <input type="checkbox" checked={view.showDone} data-testid="show-done" onChange={(e) => setView({ ...view, showDone: e.target.checked })} />
              Show done
            </label>
            <label className="planner__toggle">
              <input type="checkbox" checked={view.showArchived} data-testid="show-archived" onChange={(e) => setView({ ...view, showArchived: e.target.checked })} />
              Show archived
            </label>
          </>
        )}
        <span className="planner__context" data-tip={contextPath} data-testid="planner-context">
          <bdi>{contextName}</bdi>
        </span>
      </div>
      {context.kind === "project" && view.view === "today" ? <OnlyProjectBar name={ownSource === undefined ? ownName : labelOf(ownSource)} on={view.onlyProject} onToggle={() => setView({ ...view, onlyProject: !view.onlyProject })} /> : null}
      {context.kind === "project" && (view.view === "project" || view.view === "recurring") ? (
        <MixBar
          ownId={context.id}
          mixed={mixins.mixins.map((key) => ({ key, label: labelOf(key === NO_PROJECT ? NONE_SOURCE : sourceByKey(key, list?.projects ?? [], sources)) }))}
          groups={list?.groups ?? []}
          projects={list?.projects ?? []}
          onAdd={(key) => setView({ ...view, mixins: [...mixins.mixins.filter((k) => k !== key), key] })}
          onRemove={(key) => setView({ ...view, mixins: mixins.mixins.filter((k) => k !== key) })}
        >
          {view.view === "project" ? <DueTodayChip name={ownSource === undefined ? ownName : labelOf(ownSource)} on={view.dueToday} onToggle={() => setView({ ...view, dueToday: !view.dueToday })} /> : null}
        </MixBar>
      ) : null}
      {view.view === "all" ? (
        <div className="chip-bar" role="toolbar" aria-label="Filters" data-testid="filter-bar">
          <FilterMenu label="Projects" allLabel="All projects" options={projectOptions} selected={view.projects} onChange={(next) => setView({ ...view, projects: next })} testId="filter-projects" searchable />
          <FilterMenu label="Types" allLabel="All types" options={typeOptions} selected={view.types} onChange={(next) => setView({ ...view, types: next })} testId="filter-types" />
        </div>
      ) : null}
      {inSelect ? (
        <SelectBar
          count={chosen.length}
          all={selectAllState(selection, shownPaths)}
          rows={shownPaths.length}
          archive={canArchive(chosen)}
          busy={trim.busy}
          deleteButton={trim.deleteButton}
          onToggleAll={() => trim.setSelection(toggleAll(selection, shownPaths))}
          onArchive={archiveChosen}
          onDelete={trim.ask}
          onDone={() => trim.stop(true)}
        />
      ) : null}
      <div className="planner__body">
        {pinnedRows.length > 0 ? (
          <ul className="task-list task-list--pinned" data-testid="pinned-list" aria-label="Pinned">
            {pinnedRows}
          </ul>
        ) : null}
        {empty ? (
          <EmptyState tag="div" testId={`${view.view}-empty`} glyph={pinnedRows.length > 0 ? undefined : glyph(28)} title={pinnedRows.length > 0 ? emptyTitle.replace(/^Nothing/, "Nothing else") : emptyTitle} action={addFoot}>
            {emptyText}
          </EmptyState>
        ) : (
          <>
            <ul className="task-list" data-testid={`list-${view.view}`}>
              {rows}
              {unreadable}
            </ul>
            {addFoot}
          </>
        )}
      </div>
      {inSelect && trim.confirming ? <DeleteConfirm rows={chosen} busy={trim.busy} onCancel={trim.cancel} onConfirm={confirmDelete} /> : null}
      {rowMenu.menu !== null && !inSelect ? <RowMenu ask={rowMenu.menu} onClose={rowMenu.close} /> : null}
      {rowMenu.deleting !== null && !inSelect ? <DeleteConfirm rows={[rowMenu.deleting.row]} busy={rowMenu.deleting.busy} onCancel={rowMenu.cancel} onConfirm={confirmRowDelete} /> : null}
      {(error ?? dailyError) !== null ? (
        <div className="toast" role="alert" data-testid="planner-error">
          <span>{error ?? dailyError}</span>
          <button type="button" className="icon-btn toast__close" aria-label="Dismiss" data-tip="Dismiss" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      ) : null}
    </main>
  );
  return (
    <ItemSplit splitRef={split} pane={pane}>
      {planner}
    </ItemSplit>
  );
}

interface SelectBarProps {
  count: number;
  all: ReturnType<typeof selectAllState>;
  rows: number;
  /** Every selected row is a note not yet archived. */
  archive: boolean;
  busy: boolean;
  deleteButton: RefObject<HTMLButtonElement>;
  onToggleAll: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onDone: () => void;
}

/** Select mode's bar: select all (of the rows the view shows), the count, Archive (notes only), Delete N…, Done. */
function SelectBar({ count, all, rows, archive, busy, deleteButton, onToggleAll, onArchive, onDelete, onDone }: SelectBarProps) {
  return (
    <div className="select-bar" role="toolbar" aria-label="Selection" data-testid="select-bar">
      <label className="select-bar__all" data-tip="Select every row shown (⌘A)">
        <input
          type="checkbox"
          data-testid="select-all"
          aria-label="Select all shown"
          autoFocus
          checked={all === "all"}
          disabled={rows === 0}
          ref={(el) => {
            if (el) el.indeterminate = all === "some";
          }}
          onChange={onToggleAll}
        />
        <span className="select-bar__count" data-testid="select-count">
          {count === 0 ? "None selected" : `${String(count)} selected`}
        </span>
      </label>
      <span className="select-bar__actions">
        {archive ? (
          <button type="button" className="btn btn--sm btn--ghost" data-tip="Move the selected notes into _archive/ — All shows them with “Show archived”" data-testid="select-archive" disabled={busy} onClick={onArchive}>
            Archive
          </button>
        ) : null}
        <button ref={deleteButton} type="button" className="btn btn--sm btn--ghost btn--danger-text" data-tip="Move the selected files to the Trash (⌫)" data-testid="select-delete" disabled={count === 0 || busy} onClick={onDelete}>
          {count === 0 ? "Delete…" : `Delete ${String(count)}…`}
        </button>
        <button type="button" className="btn btn--sm btn--ghost select-bar__done" data-tip="Leave select mode (Esc)" data-testid="select-done" onClick={onDone}>
          Done
        </button>
      </span>
    </div>
  );
}

/**
 * Select mode ([[trimming]]): the view it is on (`null`: off), the selection, the rows the last
 * delete or archive left (and why), the confirmation and a write under way. Switching the view or
 * the context ends it. Focus goes back to the control that starts it (the tab's Select, the
 * panel's ⋯) when it ends, to Delete when the confirmation closes with rows left, and to the row's
 * box when the row menu's Select… starts it.
 */
function useTrimming(contextId: string, viewId: PlannerViewId | null) {
  const [selecting, setSelecting] = useState<PlannerViewId | null>(null);
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [failures, setFailures] = useState<ReadonlyMap<string, RowFailure>>(new Map());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Where the focus goes next: the start control, Delete…, or a row's box (by its path). */
  const [focusTo, setFocusTo] = useState<"start" | "delete" | { row: string } | null>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusTo === null) return;
    if (focusTo === "start" || focusTo === "delete") (focusTo === "start" ? startButton : deleteButton).current?.focus();
    else document.querySelector<HTMLInputElement>(`[data-path="${CSS.escape(focusTo.row)}"] [data-testid="select-row"]`)?.focus();
    setFocusTo(null);
  }, [focusTo]);
  useEffect(() => {
    setSelecting(null);
    setSelection(EMPTY_SELECTION);
    setFailures(new Map());
    setConfirming(false);
  }, [contextId, viewId]);
  const stop = (refocus: boolean) => {
    setSelecting(null);
    setSelection(EMPTY_SELECTION);
    setFailures(new Map());
    setConfirming(false);
    if (refocus) setFocusTo("start");
  };
  return {
    selecting,
    selection,
    setSelection,
    failures,
    confirming,
    busy,
    setBusy,
    startButton,
    deleteButton,
    /** Start on the view shown: with nothing selected, or with the row `path` selected (the row menu's Select…) and the focus on its box. */
    start: (path?: string) => {
      setSelecting(viewId);
      setSelection(path === undefined ? EMPTY_SELECTION : selectOnly(path));
      setFailures(new Map());
      if (path !== undefined) setFocusTo({ row: path });
    },
    stop,
    ask: () => {
      setFailures(new Map());
      setConfirming(true);
    },
    cancel: () => {
      setConfirming(false);
      setFocusTo("delete");
    },
    /** A delete or archive is done: all went → select mode ends; else the rows left stay selected with their reasons. */
    settle: (failed: readonly RowFailure[]) => {
      setBusy(false);
      if (failed.length === 0) {
        stop(true);
        return;
      }
      setConfirming(false);
      setFailures(new Map(failed.map((f) => [f.path, f])));
      setSelection({ paths: new Set(failed.map((f) => f.path)), anchor: null });
      setFocusTo("delete");
    },
  };
}

const VIEW_LABELS: [PlannerViewId, string][] = [
  ["today", "Today"],
  ["project", "Project"],
  ["recurring", "Recurring"],
  ["all", "All"],
];

/** The views' glyphs, for the tightest switchers: a day, a folder, the circling arrows, a list. */
const VIEW_GLYPHS: Record<PlannerViewId, ReactNode> = {
  today: (
    <>
      <rect x="1.5" y="2.5" width="9" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
      <path d="M1.5 5h9M4 1.3v2M8 1.3v2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </>
  ),
  project: <path d="M1.5 3.2c0-.6.4-1 1-1h2.3l1 1.2h3.7c.6 0 1 .4 1 1v4.9c0 .6-.4 1-1 1h-7c-.6 0-1-.4-1-1z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />,
  recurring: (
    <>
      <path d="M9.8 4.9A4 4 0 0 0 2.8 3.4M2.2 7.1a4 4 0 0 0 7 1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M2.5 1.3v2.3h2.3M9.5 10.7V8.4H7.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  all: <path d="M2 3h8M2 6h8M2 9h8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />,
};

/**
 * How the switcher gives way in a narrow header, step by step: the counts go, the tabs tighten,
 * Recurring shows as its glyph, then every view does, then the glyphs join into one strip — never
 * a view itself.
 */
const SWITCHER_STEPS = ["area-switcher--compact", "area-switcher--tight", "area-switcher--glyphs", "area-switcher--icons", "area-switcher--joined"];

/**
 * The view switcher; when the views and their counts don't fit (a narrow panel, long counts, All's
 * longer counts), the counts go and the views stay.
 */
function ViewSwitcher({ view, counts, onSelect }: { view: PlannerViewId; counts: Record<PlannerViewId, number>; onSelect: (id: PlannerViewId) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const countsKey = `${view === "all" ? "all:" : ""}${counts.today}/${counts.project}/${counts.recurring}/${counts.all}`;
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    const measure = () => {
      node.classList.remove(...SWITCHER_STEPS);
      for (const step of SWITCHER_STEPS) {
        if (node.scrollWidth <= node.clientWidth) break;
        node.classList.add(step);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (node.parentElement) observer.observe(node.parentElement);
    return () => observer.disconnect();
  }, [countsKey]);
  return (
    <div ref={el} className="area-switcher planner__switcher" role="tablist" aria-label="Planner views">
      {VIEW_LABELS.map(([id, label]) => (
        <button key={id} type="button" role="tab" className="area-switcher__tab" aria-selected={view === id} data-tip={label} data-testid={`view-${id}`} onClick={() => onSelect(id)}>
          <span className={`area-switcher__label${id === "recurring" ? " area-switcher__label--first" : ""}`} data-tip-label="">
            {label}
          </span>
          <span className={`area-switcher__glyph${id === "recurring" ? " area-switcher__glyph--first" : ""}`}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              {VIEW_GLYPHS[id]}
            </svg>
          </span>
          <span className="area-switcher__count" data-testid={`count-${id}`}>
            {counts[id]}
          </span>
        </button>
      ))}
    </div>
  );
}

/** A mixed-in source by its key: a Pomade project, or a folder no project owns. */
function sourceByKey(key: string, projects: readonly { id: string; name: string; groupPath: readonly string[] }[], sources: ReadonlyMap<string, ProjectSource>): Source {
  for (const s of sources.values()) if (s.key === key) return s;
  const p = projects.find((x) => x.id === key);
  return { kind: "project", key, id: p?.id ?? null, name: p?.name ?? key, groupPath: [...(p?.groupPath ?? [])], folder: "" };
}

/** A list as it stands under its headings: its entries top to bottom, and what each heading says — counted over the group's rows, folded or not. */
interface Grouped<T> {
  entries: ListEntry<T>[];
  headingOf: (group: { key: string; level: 1 | 2 }, rows: readonly T[]) => Pick<GroupHeadingProps, "name" | "qualifier" | "source" | "nested" | "count">;
}

/** Project's group headings. */
const PROJECT_GROUP_NAMES: Record<ProjectGroup, string> = { tasks: "Tasks", notes: "Notes and thoughts" };

const TYPE_LABELS: Record<PlannerType, string> = { task: "Tasks", recurring: "Recurring", note: "Notes", thought: "Thoughts", "daily-note": "Daily notes" };

const parseUnpinned = (value: JsonValue | null): { day: string | null } => ({ day: typeof value === "string" ? value : null });
const serializeUnpinned = (value: { day: string | null }): JsonValue => value.day;

/** How long a recurring row says where done or skip took it ("Done · next Dec 5") before the views show the file as it is. */
const ACK_MS = 1600;

interface Ack {
  /** The item as it was before the write. */
  task: Task;
  /** Its Today row then (`null`: it wasn't in Today) — it keeps its place there while acknowledged. */
  row: TodayRow | null;
  word: LogWord;
  text: string;
  /** The write is done. */
  settled: boolean;
}

/** The acknowledgements of done and skip, each dropped `ACK_MS` after its write settles (or at once when it fails). */
function useAcks() {
  const [acks, setAcks] = useState<ReadonlyMap<string, Ack>>(new Map());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const live = timers.current;
    return () => {
      for (const t of live) clearTimeout(t);
    };
  }, []);
  return useMemo(() => {
    const update = (path: string, f: (a: Ack | undefined) => Ack | undefined) =>
      setAcks((current) => {
        const next = new Map(current);
        const value = f(current.get(path));
        if (value === undefined) next.delete(path);
        else next.set(path, value);
        return next;
      });
    const drop = (path: string) => update(path, () => undefined);
    return {
      has: (path: string) => acks.has(path),
      get: (path: string) => acks.get(path),
      list: () => [...acks.values()],
      start: (path: string, ack: Ack) => update(path, () => ack),
      settle: (path: string, text: string) => {
        update(path, (a) => (a === undefined ? a : { ...a, text, settled: true }));
        const timer = setTimeout(() => {
          timers.current.delete(timer);
          drop(path);
        }, ACK_MS);
        timers.current.add(timer);
      },
      drop,
    };
  }, [acks]);
}

/** The item just added, to show in the list: `focus` — its row takes the keyboard (an add in place); `id` tells one add from the next. */
interface AddedReveal {
  path: string;
  focus: boolean;
  id: number;
}

/** The item just added that the views are to show ([[quick-add]] "After an add"), until they have. */
function useAddedReveal() {
  const [ask, setAsk] = useState<AddedReveal | null>(null);
  const ids = useRef(0);
  const show = useCallback((path: string, focus: boolean) => setAsk({ path, focus, id: ++ids.current }), []);
  const done = useCallback(() => setAsk(null), []);
  return { ask, show, done };
}

interface AddedShownProps {
  path: string;
  focus: boolean;
  /** Where the item shows (`viewListing`), read with its file. */
  listing: Listing;
  view: PlannerViewId;
  /** Go to the view that lists it (All: its filters widened). */
  onGo: (listing: Listing) => void;
  onDone: () => void;
}

/**
 * Show the item just added, once its file is read: the Planner goes to the view that lists it, its
 * group unfolded (`useReveal`); its row is scrolled to, takes the focus when asked to, and is
 * marked for a moment. A view gone to that still doesn't list it gives up.
 */
function AddedShown({ path, focus, listing, view, onGo, onDone }: AddedShownProps) {
  const here = listing.view === view && listing.listed;
  const went = useRef(false);
  const latest = useRef({ path, focus, listing, onGo, onDone });
  useLayoutEffect(() => {
    latest.current = { path, focus, listing, onGo, onDone };
  });
  useEffect(() => {
    const { path: at, focus: take, listing: where, onGo: go, onDone: finish } = latest.current;
    if (!here) {
      if (went.current) finish();
      else {
        went.current = true;
        go(where);
      }
      return;
    }
    // One mark at a time: a mark still running (its frame was hidden while it ran) gives way.
    for (const marked of document.querySelectorAll<HTMLElement>(".task-row[data-added]")) delete marked.dataset.added;
    const row = document.querySelector<HTMLElement>(`.task-row[data-path="${CSS.escape(at)}"]`);
    if (row) {
      row.scrollIntoView({ block: "nearest" });
      if (take) row.querySelector<HTMLElement>(".task-row__main")?.focus();
      row.dataset.added = "";
      row.addEventListener("animationend", () => delete row.dataset.added, { once: true });
    }
    finish();
  }, [here, view]);
  return null;
}

/** An ask to show an item: its path, and what tells this ask from the next one for the same path. */
interface Reveal {
  path: string;
  ask: string;
}

/**
 * Unfold the groups that hold an item asked for or just added ([[views]] "Groups"), once per ask:
 * returns the keys to show unfolded at once, and stores them unfolded on `view` as soon as the item
 * and the fold state are read. A group folded again afterwards stays folded.
 */
function useReveal(asks: readonly (Reveal | null)[], items: Items, groupsOf: (task: Task) => string[], view: PlannerViewId | null, folds: Folds | null, setFolds: (next: Folds) => void): ReadonlySet<string> {
  const done = useRef(new Set<string>());
  const pending: { id: string; keys: string[] }[] = [];
  for (const a of asks) {
    if (a === null || view === null) continue;
    const id = JSON.stringify([view, a.path, a.ask]);
    const task = items.tasks.find((t) => t.path === a.path);
    if (task !== undefined && !done.current.has(id)) pending.push({ id, keys: groupsOf(task) });
  }
  const keys = pending.flatMap((p) => p.keys);
  const pendingIds = JSON.stringify(pending.map((p) => p.id));
  const read = folds !== null;
  const latest = useRef({ folds, setFolds, keys, view });
  useLayoutEffect(() => {
    latest.current = { folds, setFolds, keys, view };
  });
  useEffect(() => {
    const { folds: current, setFolds: set, keys: shown, view: on } = latest.current;
    const ids = JSON.parse(pendingIds) as string[];
    if (ids.length === 0 || current === null || on === null) return;
    for (const id of ids) done.current.add(id);
    const next = unfoldAll(current, on, shown);
    if (next !== current) set(next);
  }, [pendingIds, read]);
  return new Set(keys);
}

/** `rows` with each acknowledged item that has left them put back where it was (its row from before the write), in list order. */
function withAcks<T>(rows: readonly T[], acks: readonly Ack[], before: (ack: Ack) => T | null, taskOf: (row: T) => Task): T[] {
  const present = new Set(rows.map((r) => taskOf(r).path));
  const back = acks.flatMap((a) => {
    const row = before(a);
    return row === null || present.has(a.task.path) ? [] : [row];
  });
  if (back.length === 0) return [...rows];
  return [...rows, ...back].sort((x, y) => compareTasks(taskOf(x), taskOf(y)));
}
