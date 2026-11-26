import { useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

import type { Hint } from "./model/labels";
import { importanceText } from "./model/labels";
import { isTaskType, type PlannerType, type Task, type UnreadableItem } from "./model/items";
import type { RowActionId } from "./model/row-menu";
import { SELECT_ROW_HINT } from "../core/hints";
import { rowMenuHandlers, type RowMenuTrigger } from "./RowMenu";

/** A row's action, shown over its right end on hover or keyboard focus ("Skip", "Archive", "Resolve"). */
export interface RowAction {
  id: RowActionId;
  label: string;
  /** Its accessible name before the title ("Skip this time"); default `label`. */
  ariaLabel?: string;
  /** Its tooltip: what it does. */
  title: string;
  onClick: () => void;
}

/** A row in select mode: its selection checkbox in the tick's place; a click anywhere on it toggles, Shift extends from the anchor. */
export interface RowSelect {
  selected: boolean;
  /** `range`: Shift was held — select from the anchor to here. */
  onToggle: (range: boolean) => void;
}

/** Why the last delete or archive left this row ("Couldn't move it to the Trash."), and the host's own words. */
export type RowFailureText = { text: string; detail: string } | undefined;

interface TaskRowProps {
  task: Task;
  /** The title as the row shows it (a daily note without one: its date); default `task.title`. */
  title?: string | undefined;
  /** Shown checked: done on disk, or ticked and waiting for the write (a recurring item: while its done is acknowledged). */
  done: boolean;
  hints: readonly Hint[];
  reason?: string | undefined;
  /** The label of the row's project (or "No project") when it isn't the context's own — a mixed-in or All row. */
  source?: string | undefined;
  onToggle: (done: boolean) => void;
  /** A click on the title, or Enter on it; `direct`: with ⌘ (or Ctrl) held — straight to the editor tab. */
  onOpen: (direct: boolean) => void;
  /** The item is the one open in the compact view. */
  open?: boolean | undefined;
  /** The row's actions besides pinning, in order (a recurring item's Skip, a note's Archive, a thought's Resolve). */
  actions?: readonly RowAction[] | undefined;
  /** Pinned on this view (a pin glyph by the title), and how to toggle it; absent: no pin action. */
  pin?: { pinned: boolean; onToggle: () => void } | undefined;
  /** The description excerpt (the full tab). */
  excerpt?: string | null | undefined;
  /** The checkbox can't be used (a recurring rule that can't be read, an ended item, a write under way); its title says why. */
  locked?: string | undefined;
  /** Select mode: the row selects instead of ticking and opening; no actions, no menu. */
  select?: RowSelect | undefined;
  /** Opens the row's menu (a right-click, Shift+F10); absent: no menu. */
  menu?: RowMenuTrigger | undefined;
  /** The row's menu is open. */
  menuOpen?: boolean | undefined;
  failure?: RowFailureText;
  /** The delayed tooltip of the title (`OPEN_HINT_PANEL` or `OPEN_HINT_TAB`: what a click, a ⌘-click and a right-click do); none while the row's menu is open or the row selects. */
  openHint?: string | undefined;
}

function CheckGlyph() {
  return (
    <svg className="task-check__glyph" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.5 6.3l2.3 2.3L9.5 3.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The circling arrows before a recurring item's rule. */
function RepeatGlyph() {
  return (
    <svg className="hint__glyph" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M8.2 4.1A3.3 3.3 0 0 0 2.3 2.8M1.8 5.9a3.3 3.3 0 0 0 5.9 1.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M2.1 1.1v1.9H4M7.9 8.9V7H6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PinGlyph({ filled = false, size = 12 }: { filled?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M4.4 1.6h3.2M5 1.6v2.6L3 6.6h6L7 4.2V1.6M6 6.6v3.8"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
}

/** The glyph in the checkbox's place for the types without one: a page (note), a cloud of thought, a calendar page (daily note). */
const KIND_GLYPHS: Partial<Record<PlannerType, ReactNode>> = {
  note: (
    <>
      <path d="M3 1.8h4.2L9.5 4v6.2H3z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M7 1.8V4.2h2.4M4.6 6.2h3M4.6 8.2h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  thought: (
    <>
      <path d="M3.6 7.6a2.4 2.4 0 0 1-.3-4.4 2.6 2.6 0 0 1 4.9-.2 2.2 2.2 0 0 1 .4 4.3z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <circle cx="3.6" cy="9.4" r=".8" fill="currentColor" />
      <circle cx="2.2" cy="10.8" r=".5" fill="currentColor" />
    </>
  ),
  "daily-note": (
    <>
      <rect x="1.8" y="2.4" width="8.4" height="8" rx="1.4" stroke="currentColor" strokeWidth="1.1" />
      <path d="M1.8 4.8h8.4M4.2 1.3v2M7.8 1.3v2M4 7h1M6 7h2M4 8.8h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </>
  ),
};

const KIND_NAMES: Partial<Record<PlannerType, string>> = { note: "Note", thought: "Thought", "daily-note": "Daily note" };

/** The selection checkbox: Space toggles, Shift+Space or Shift-click selects the range from the anchor; its slow tip says so. */
export function SelectCheck({ select, label }: { select: RowSelect; label: string }) {
  return (
    <label className="task-check task-check--select" data-tip={SELECT_ROW_HINT} data-tip-slow="">
      <input
        type="checkbox"
        checked={select.selected}
        readOnly
        data-testid="select-row"
        aria-label={`Select: ${label}`}
        onClick={(e: MouseEvent<HTMLInputElement>) => {
          e.stopPropagation();
          select.onToggle(e.shiftKey);
        }}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key !== " ") return;
          e.preventDefault();
          if (!e.repeat) select.onToggle(e.shiftKey);
        }}
      />
      <span className="task-check__box">
        <CheckGlyph />
      </span>
    </label>
  );
}

/**
 * A click on a selectable row's body: toggle it, Shift extending the range (no text selected on
 * the way); the focus goes to the row's box, so the keys (↑ ↓, Space, Esc) go on from there.
 */
export const selectClick = (select: RowSelect) => ({
  onMouseDown: (e: MouseEvent) => {
    if (e.shiftKey) e.preventDefault();
  },
  onClick: (e: MouseEvent<HTMLElement>) => {
    select.onToggle(e.shiftKey);
    e.currentTarget.parentElement?.querySelector<HTMLInputElement>('[data-testid="select-row"]')?.focus({ preventScroll: true });
  },
});

export function Failure({ failure }: { failure: RowFailureText }) {
  if (failure === undefined) return null;
  return (
    <span className="task-row__failure" role="alert" data-testid="row-failure" title={failure.detail || undefined}>
      {failure.text}
    </span>
  );
}

/** One item: its checkbox (a note's, thought's or daily note's glyph instead), then title and hints as one button that opens the item; its actions and pin on hover. */
export function TaskRow({ task, title = task.title, done, hints, reason, source, onToggle, onOpen, open = false, actions = [], pin, excerpt, locked, select, menu, menuOpen = false, failure, openHint }: TaskRowProps) {
  const main = useRef<HTMLButtonElement>(null);
  const importance = importanceText(task.importance);
  const recurring = task.repeat !== null;
  const checkable = isTaskType(task.type) && !task.archived;
  const hasActions = select === undefined && (actions.length > 0 || pin !== undefined);
  const line = (
    <>
      <span className="task-row__line">
        <span className="task-row__title" data-testid="task-title">
          {title}
        </span>
        {pin?.pinned ? (
          <span className="task-row__pin" data-testid="pinned-mark" title="Pinned on this view">
            <PinGlyph filled size={10} />
          </span>
        ) : null}
        {importance !== null ? (
          <span className="task-row__importance" data-testid="hint-importance" title={`Importance ${String(task.importance)}`}>
            {importance}
          </span>
        ) : null}
      </span>
      {hints.length > 0 || source !== undefined ? (
        <span className="task-row__hints">
          {hints.map((h) => (
            <span key={h.kind + h.text} className={`hint hint--${h.tone}${h.kind === "reason" || h.kind === "ack" ? " hint--chip" : ""} hint--${h.kind}`} data-testid={`hint-${h.kind}`} title={h.kind === "repeat" || h.kind === "problem" ? h.text : undefined}>
              {h.kind === "repeat" ? <RepeatGlyph /> : null}
              {h.text}
            </span>
          ))}
          {source !== undefined ? (
            <span className="hint hint--source" data-testid="hint-source" title={`From ${source}`}>
              {source}
            </span>
          ) : null}
        </span>
      ) : null}
      {excerpt ? (
        <span className="task-row__excerpt" data-testid="task-excerpt">
          {excerpt}
        </span>
      ) : null}
    </>
  );
  return (
    <li
      className={`task-row${done && !recurring ? " task-row--done" : ""}${hasActions ? " task-row--actions" : ""}${task.archived ? " task-row--archived" : ""}${pin?.pinned ? " task-row--pinned" : ""}${select !== undefined ? " task-row--selectable" : ""}${select?.selected ? " task-row--selected" : ""}${open ? " task-row--open" : ""}${menuOpen ? " task-row--menu" : ""}`}
      data-testid="task-row"
      data-path={task.path}
      data-done={done}
      data-reason={reason}
      data-source={source}
      data-type={task.type}
      data-pinned={pin?.pinned ? "true" : undefined}
      data-open={open ? "true" : undefined}
      data-selected={select === undefined ? undefined : String(select.selected)}
      {...rowMenuHandlers(menu, () => main.current?.focus())}
    >
      {select !== undefined ? (
        <SelectCheck select={select} label={title} />
      ) : checkable ? (
      <label className={`task-check${locked !== undefined ? " task-check--locked" : ""}`} data-tip={locked}>
        <input
          type="checkbox"
          checked={done}
          disabled={locked !== undefined}
          data-testid="task-check"
          aria-label={recurring ? `Done this time: ${task.title}` : `Done: ${task.title}`}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className={`task-check__box${recurring ? " task-check__box--recurring" : ""}`}>
          <CheckGlyph />
        </span>
      </label>
      ) : (
        <span className={`task-kind task-kind--${task.type}${done ? " task-kind--done" : ""}`} data-testid="task-kind" title={KIND_NAMES[task.type]}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            {KIND_GLYPHS[task.type]}
          </svg>
        </span>
      )}
      {select !== undefined ? (
        <div className="task-row__main" data-testid="task-open" title={task.path} {...selectClick(select)}>
          {line}
          <Failure failure={failure} />
        </div>
      ) : (
        <button ref={main} type="button" className="task-row__main" data-testid="task-open" data-tip={menuOpen ? undefined : openHint} data-tip-slow="" aria-current={open ? "true" : undefined} onClick={(e) => onOpen(e.metaKey || e.ctrlKey)}>
          {line}
          <Failure failure={failure} />
        </button>
      )}
      {hasActions ? (
        <span className="task-row__actions">
          {actions.map((a) => (
            <button key={a.id} type="button" className="task-row__action" data-testid={`task-${a.id}`} aria-label={`${a.ariaLabel ?? a.label}: ${title}`} data-tip={a.title} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
          {pin !== undefined ? (
            <button
              type="button"
              className={`task-row__action task-row__action--icon${pin.pinned ? " task-row__action--on" : ""}`}
              data-testid="task-pin"
              aria-pressed={pin.pinned}
              aria-label={`${pin.pinned ? "Unpin" : "Pin"}: ${title}`}
              data-tip={pin.pinned ? "Unpin from this view" : "Pin to the top of this view"}
              onClick={pin.onToggle}
            >
              <PinGlyph filled={pin.pinned} />
            </button>
          ) : null}
        </span>
      ) : null}
    </li>
  );
}

/** A file of a Planner type whose frontmatter can't be read: greyed, opens the file to fix it. */
export function UnreadableRow({ item, onOpen, select, menu, menuOpen = false, failure }: { item: UnreadableItem; onOpen: () => void; select?: RowSelect | undefined; menu?: RowMenuTrigger | undefined; menuOpen?: boolean; failure?: RowFailureText }) {
  const main = useRef<HTMLButtonElement>(null);
  const body = (
    <>
      <span className="task-row__title">{item.name}</span>
      <span className="task-row__hints">
        <span className="hint hint--muted">can&apos;t read — open to fix</span>
      </span>
    </>
  );
  return (
    <li
      className={`task-row task-row--unreadable${select !== undefined ? " task-row--selectable" : ""}${select?.selected ? " task-row--selected" : ""}${menuOpen ? " task-row--menu" : ""}`}
      data-testid="unreadable-row"
      data-path={item.path}
      data-selected={select === undefined ? undefined : String(select.selected)}
      {...rowMenuHandlers(menu, () => main.current?.focus())}
    >
      {select !== undefined ? (
        <>
          <SelectCheck select={select} label={item.name} />
          <div className="task-row__main" title={`${item.path}\n${item.reason}`} {...selectClick(select)}>
            {body}
            <Failure failure={failure} />
          </div>
        </>
      ) : (
        <>
          <span className="task-check task-check--blank" aria-hidden="true">
            <span className="task-check__box" />
          </span>
          <button ref={main} type="button" className="task-row__main" data-tip={`${item.path} — ${item.reason}`} onClick={onOpen}>
            {body}
            <Failure failure={failure} />
          </button>
        </>
      )}
    </li>
  );
}
