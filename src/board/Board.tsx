import { useCallback, useEffect, useMemo, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/core";
import type { HostClient } from "pomade-kit/sdk";
import type { ProjectRef } from "pomade-kit/protocol";

import { BoardMenu } from "./BoardMenu";
import { Card, CardOverlay } from "./Card";
import { CardPopover } from "./CardPopover";
import { Column } from "./Column";
import { CreateForm, type CreateValues } from "./CreateForm";
import { TriagePicker } from "./TriagePicker";
import { UnreadableStrip } from "./UnreadableStrip";
import { columnCollision, columnKeyboardCoordinates, KEYBOARD_CODES } from "./dnd";
import { buildArea, canTake, countByArea, creatableKinds, createTarget, refusalText, type AreaDef, type ColumnDef } from "./model/areas";
import { KIND_NAME } from "./model/create";
import { describeFailure, localDay, planDrop, planEdit, type EditableField } from "./model/drop";
import { GearGlyph } from "../core/glyphs";
import type { Rect } from "../core/place";
import type { BacklogLocation, ProjectBoardSettings } from "./model/settings";
import { readSyncedSettings } from "./useBoardData";
import type { Backlog, Kind, Ticket } from "./model/ticket";
import { isCollapsed, parseView, serializeView, setCollapsed, viewKey, type BoardView } from "./model/view-state";
import { createTicket, failureOf, step, writeFields } from "./write";

interface BoardProps {
  host: HostClient;
  project: ProjectRef;
  areas: readonly AreaDef[];
  location: BacklogLocation;
  settings: ProjectBoardSettings;
  /** A problem with the synced settings file, shown above the board. */
  settingsProblem: string | null;
  backlog: Backlog;
  /** The next free ID per kind as of the last read. */
  nextIds: Record<Kind, string>;
  /** Re-read the backlog; resolves once the board shows the result. */
  reload: () => Promise<void>;
  onToggleMoveDone: () => void;
  onChangeFolder: () => void;
  /** Open the Board's settings page. */
  onShowSettings: () => void;
}

/** A popover, form or picker open over the board, with what it hangs off. */
type Overlay =
  | { kind: "create"; column: ColumnDef; initialKind?: Kind; anchor: Rect; align: "start" | "end"; focusBack: string }
  | { kind: "edit"; path: string; anchor: Rect }
  | { kind: "triage"; ticket: Ticket; target: ColumnDef; anchor: Rect };

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

const cardSelector = (path: string) => `[data-testid="card"][data-path="${CSS.escape(path)}"]`;
const focusSelector = (selector: string) => () => document.querySelector<HTMLElement>(selector)?.focus();

/** "New epic or task", "New signal". */
const createLabel = (kinds: readonly Kind[]): string => `New ${kinds.map((k) => KIND_NAME[k].toLowerCase()).join(" or ")}`;

/** The machine-local view (area, expanded columns) of the project's board, loaded before the board shows. */
function useView(host: HostClient, projectId: string, areas: readonly AreaDef[]): [BoardView | null, (next: BoardView) => void] {
  const [view, setView] = useState<BoardView | null>(null);
  useEffect(() => {
    let live = true;
    setView(null);
    host.state.get(viewKey(projectId)).then(
      (value) => live && setView(parseView(value, areas)),
      () => live && setView(parseView(null, areas)),
    );
    return () => {
      live = false;
    };
  }, [host, projectId, areas]);
  const update = useCallback(
    (next: BoardView) => {
      setView(next);
      void host.state.set(viewKey(projectId), serializeView(next)).catch(() => undefined);
    },
    [host, projectId],
  );
  return [view, update];
}

/** The kanban: area switcher, the project's ⋯ menu and the way to the settings page, the Unreadable strip, and the area's columns. */
export function Board(props: BoardProps) {
  const { host, project, areas, location, settings, settingsProblem, backlog, reload } = props;
  const [view, setView] = useView(host, project.id, areas);
  const [dragging, setDragging] = useState<Ticket | null>(null);
  /** The column the dragged card is over. */
  const [over, setOver] = useState<ColumnDef | null>(null);
  /** Drops being written: path → the status the card shows meanwhile. */
  const [pending, setPending] = useState<Record<string, string>>({});
  /** Inline errors of failed drops, by the card's path. */
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  /** The card popover's write in flight, and its last failure. */
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { keyboardCodes: KEYBOARD_CODES, coordinateGetter: columnKeyboardCoordinates }),
  );

  const tickets = useMemo(
    () => backlog.tickets.map((t) => (pending[t.path] !== undefined ? { ...t, status: pending[t.path] ?? t.status } : t)),
    [backlog.tickets, pending],
  );
  const counts = useMemo(() => countByArea(areas, tickets), [areas, tickets]);
  const area = areas.find((a) => a.id === view?.area) ?? areas[0];
  const board = useMemo(() => (area ? buildArea(area, tickets) : null), [area, tickets]);

  const open = useCallback(
    (path: string) => {
      host.tabs.openFile({ path, projectId: project.id }).catch((error: unknown) => {
        setErrors((e) => ({ ...e, [path]: `Couldn't open: ${error instanceof Error ? error.message : String(error)}` }));
      });
    },
    [host, project.id],
  );

  const dismissError = useCallback((path: string) => {
    setErrors((e) => {
      const next = { ...e };
      delete next[path];
      return next;
    });
  }, []);

  const onFailedMove = useCallback(
    (target: ColumnDef) => {
      if (!view || !area || !isCollapsed(view, area.id, target)) return;
      setView(setCollapsed(view, area.id, target, false));
    },
    [view, area, setView],
  );

  const write = useCallback(
    async (ticket: Ticket, target: ColumnDef, parentChoice?: string | null) => {
      const plan = planDrop({
        ticket,
        target,
        backlog: location.path,
        moveDone: settings.moveDoneToDoneFolder,
        today: localDay(new Date()),
        ...(parentChoice === undefined ? {} : { parentChoice }),
      });
      if (plan.kind === "ask-parent") {
        const column = document.querySelector(`[data-testid="column"][data-status="${CSS.escape(target.status)}"]`);
        if (column) setOverlay({ kind: "triage", ticket, target, anchor: rectOf(column.querySelector(".column__header") ?? column) });
        return;
      }
      if (plan.kind !== "write") return;
      setPending((p) => ({ ...p, [ticket.path]: target.status }));
      try {
        // Never write over a newer file: the board read this card at `mtimeMs`.
        await writeFields(host, ticket, plan.fields);
        const move = plan.move;
        if (move) await step("move", () => host.files.move(move), location.path === "" ? move.to : move.to.slice(location.path.length + 1));
      } catch (error) {
        const failure = failureOf(error);
        setErrors((e) => ({ ...e, [ticket.path]: describeFailure(failure) }));
        // The status was written, so the card now sits in the target column: open it to show the error.
        if (failure.kind === "host" && failure.step === "move") onFailedMove(target);
      } finally {
        await reload();
        setPending((p) => {
          const next = { ...p };
          delete next[ticket.path];
          return next;
        });
      }
    },
    [host, location.path, settings.moveDoneToDoneFolder, reload, onFailedMove],
  );

  /** The form hangs under a column's + (right edges lined up) or under the empty area's button. */
  const openCreate = useCallback((column: ColumnDef, from: HTMLElement, focusBack: string, align: "start" | "end", initialKind?: Kind) => {
    setOverlay({ kind: "create", column, anchor: rectOf(from), align, focusBack, ...(initialKind === undefined ? {} : { initialKind }) });
  }, []);

  const submitCreate = useCallback(
    async (column: ColumnDef, values: CreateValues): Promise<string | null> => {
      try {
        // The reporter as the settings file says now: another tab may have changed it.
        const { settings: synced } = await readSyncedSettings(host);
        const { path } = await createTicket(host, {
          ...values,
          reporter: synced.reporter,
          status: column.status,
          today: localDay(new Date()),
          backlog: location.path,
          moveDone: settings.moveDoneToDoneFolder,
        });
        setOverlay(null);
        await reload();
        open(path);
        return null;
      } catch (error) {
        return describeFailure(failureOf(error, "create"));
      }
    },
    [host, location.path, settings.moveDoneToDoneFolder, reload, open],
  );

  const openEdit = useCallback((ticket: Ticket, anchor: Rect) => {
    setEditError(null);
    setOverlay({ kind: "edit", path: ticket.path, anchor });
  }, []);

  const edit = useCallback(
    async (ticket: Ticket, field: EditableField, value: string | null) => {
      const plan = planEdit(ticket, field, value, localDay(new Date()));
      if (plan.kind !== "write") return;
      setEditBusy(true);
      setEditError(null);
      try {
        await writeFields(host, ticket, plan.fields);
      } catch (error) {
        setEditError(describeFailure(failureOf(error)));
      } finally {
        await reload();
        setEditBusy(false);
      }
    },
    [host, reload],
  );

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      const ticket = (event.active.data.current as { ticket?: Ticket } | undefined)?.ticket;
      if (!ticket) return;
      dismissError(ticket.path);
      setDragging(ticket);
    },
    [dismissError],
  );

  const onDragOver = useCallback((event: DragOverEvent) => {
    setOver((event.over?.data.current as { column?: ColumnDef } | undefined)?.column ?? null);
  }, []);

  const onDragCancel = useCallback(() => {
    setDragging(null);
    setOver(null);
  }, []);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      // The card as it was grabbed: a file that changed during the drag is refused by its mtime.
      const ticket = dragging;
      setDragging(null);
      setOver(null);
      const target = (event.over?.data.current as { column?: ColumnDef } | undefined)?.column;
      if (!ticket || !target || !canTake(target, ticket.kind)) return;
      void write(ticket, target);
    },
    [dragging, write],
  );

  if (!view || !area || !board) return <main className="board board--loading" data-testid="board" aria-busy="true" />;

  const areaEmpty = (counts[area.id] ?? 0) === 0;
  const cta = createTarget(area);
  const editing = overlay?.kind === "edit" ? tickets.find((t) => t.path === overlay.path) : undefined;

  const solutions = area.kinds.includes("epic");
  const main = board.columns.filter((c) => c.def.placement === "main");
  const side = board.columns.filter((c) => c.def.placement === "side");
  const renderColumn = (column: (typeof board.columns)[number]) => {
    const collapsed = isCollapsed(view, area.id, column.def);
    const collapsible = column.def.startsCollapsed;
    return (
      <Column
        key={column.def.status}
        column={column}
        collapsed={collapsed}
        refused={dragging !== null && !canTake(column.def, dragging.kind)}
        onExpand={() => setView(setCollapsed(view, area.id, column.def, false))}
        onCollapse={collapsible ? () => setView(setCollapsed(view, area.id, column.def, true)) : null}
        createLabel={createLabel(creatableKinds(area, column.def))}
        onCreate={(button) =>
          openCreate(column.def, button, `[data-testid="column"][data-status="${CSS.escape(column.def.status)}"] [data-testid="column-add"]`, "end")
        }
      >
        {column.cards.map((ticket) => (
          <Card
            key={ticket.path}
            ticket={ticket}
            solutions={solutions}
            saving={pending[ticket.path] !== undefined}
            error={errors[ticket.path]}
            onOpen={(t) => open(t.path)}
            onDismissError={(t) => dismissError(t.path)}
            onEdit={openEdit}
          />
        ))}
      </Column>
    );
  };

  return (
    <main className="board" data-testid="board" data-project={project.id} data-area={area.id}>
      <header className="board__header">
        <div className="area-switcher" role="tablist" aria-label="Area" data-testid="area-switcher">
          {areas.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={a.id === area.id}
              className="area-switcher__tab"
              data-testid={`area-${a.id}`}
              onClick={() => setView({ ...view, area: a.id })}
            >
              {a.label}
              <span className="area-switcher__count">{counts[a.id] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="board__header-end">
          <span className="board__location" data-testid="backlog-location" title={location.path}>
            {location.relative === "" ? project.name : location.relative}
          </span>
          <div className="board__actions">
            <BoardMenu moveDone={settings.moveDoneToDoneFolder} onToggleMoveDone={props.onToggleMoveDone} onChangeFolder={props.onChangeFolder} />
            <button type="button" className="icon-btn" aria-label="Settings" data-tip="Settings" data-testid="board-settings" onClick={props.onShowSettings}>
              <GearGlyph />
            </button>
          </div>
        </div>
      </header>
      {settingsProblem !== null ? (
        <div className="board__notice" role="status" data-testid="settings-problem">
          {settingsProblem} — using the defaults.
        </div>
      ) : null}
      <UnreadableStrip unreadable={backlog.unreadable} misfits={board.misfits} onOpen={open} />
      <DndContext
        sensors={sensors}
        collisionDetection={columnCollision}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        {areaEmpty && cta ? (
          <div className="board__empty" data-testid="area-empty">
            <h2 className="board__empty-title">No {area.label.toLowerCase()} yet</h2>
            <p className="board__empty-text">
              {project.name}&apos;s backlog has no {area.kinds.map((k) => KIND_NAME[k].toLowerCase()).join(" or ")} tickets.
            </p>
            <button
              type="button"
              className="btn btn--primary"
              data-testid="area-create"
              onClick={(e) => openCreate(cta.column, e.currentTarget, '[data-testid="area-create"]', "start", cta.kind)}
            >
              + {createLabel([cta.kind])}
            </button>
          </div>
        ) : (
          /* Keyed by area: another area's columns start scrolled to their beginning. */
          <div key={area.id} className="board__columns" data-testid="board-columns">
            {main.map(renderColumn)}
            {side.length > 0 ? <div className="board__side">{side.map(renderColumn)}</div> : null}
          </div>
        )}
        <DragOverlay dropAnimation={null}>
          {dragging ? (
            <CardOverlay ticket={dragging} solutions={solutions} refusal={over && !canTake(over, dragging.kind) ? refusalText(over, dragging.kind) : null} />
          ) : null}
        </DragOverlay>
      </DndContext>
      {overlay?.kind === "create" ? (
        <CreateForm
          anchor={overlay.anchor}
          align={overlay.align}
          column={overlay.column}
          kinds={creatableKinds(area, overlay.column)}
          initialKind={overlay.initialKind}
          tickets={tickets}
          nextIds={props.nextIds}
          onSubmit={(values) => submitCreate(overlay.column, values)}
          onClose={() => setOverlay(null)}
          restoreFocus={focusSelector(overlay.focusBack)}
        />
      ) : null}
      {overlay?.kind === "edit" && editing ? (
        <CardPopover
          anchor={overlay.anchor}
          ticket={editing}
          tickets={tickets}
          busy={editBusy}
          error={editError}
          onEdit={(field, value) => void edit(editing, field, value)}
          onClose={() => setOverlay(null)}
          restoreFocus={focusSelector(cardSelector(editing.path))}
        />
      ) : null}
      {overlay?.kind === "triage" ? (
        <TriagePicker
          anchor={overlay.anchor}
          signal={overlay.ticket}
          tickets={tickets}
          onPick={(problem) => {
            setOverlay(null);
            void write(overlay.ticket, overlay.target, problem);
          }}
          onCancel={() => setOverlay(null)}
          restoreFocus={focusSelector(cardSelector(overlay.ticket.path))}
        />
      ) : null}
    </main>
  );
}
