import { useRef } from "react";

import { progressText } from "./model/body";
import type { Task } from "./model/items";
import { displayTitle, longDate } from "./model/labels";
import { rowMenuHandlers, type RowMenuTrigger } from "./RowMenu";
import { Failure, PinGlyph, SelectCheck, selectClick, type RowFailureText, type RowSelect } from "./TaskRow";

interface DailyCardProps {
  note: Task;
  day: string;
  open: boolean;
  onOpen: (direct: boolean) => void;
  onUnpin: () => void;
  /** Opens its menu (a right-click, Shift+F10). */
  menu?: RowMenuTrigger | undefined;
  menuOpen?: boolean;
  failure?: RowFailureText;
  /** The delayed tooltip of the card's body (what a click and a ⌘-click open); none while its menu is open. */
  openHint?: string | undefined;
  /** Select mode: the card selects as a row does — its box in the glyph's place, no unpin, no menu. */
  select?: RowSelect | undefined;
}

/**
 * Today's daily note, pinned on Today ([[daily-notes]] "Pinned on Today"): its title, its date, its
 * checklist progress ("5/8") as text and a bar; a click opens it as a row's does (`direct`: with ⌘
 * or Ctrl held); the pin button unpins it for the rest of the planner day; a right-click opens its
 * menu. In select mode a click selects it instead.
 */
export function DailyCard({ note, day, open, onOpen, onUnpin, menu, menuOpen = false, failure, openHint, select }: DailyCardProps) {
  const main = useRef<HTMLButtonElement>(null);
  const title = displayTitle(note, day);
  const progress = progressText(note.progress);
  const ratio = note.progress !== null && note.progress.total > 0 ? note.progress.done / note.progress.total : 0;
  const complete = note.progress !== null && note.progress.total > 0 && note.progress.done === note.progress.total;
  const content = (
    <>
      <span className="daily-card__text">
        <span className="daily-card__title" data-testid="daily-card-title">
          {title}
        </span>
        <span className="daily-card__meta">
          <span className="daily-card__label">Daily note</span>
          {note.titled ? (
            <span className="daily-card__date" data-testid="daily-card-date">
              {longDate(note.date ?? day, day)}
            </span>
          ) : null}
        </span>
        <Failure failure={failure} />
      </span>
      {progress !== null ? (
        <span className={`daily-card__progress${complete ? " daily-card__progress--complete" : ""}`} title={`${progress} checklist lines ticked`}>
          <span className="daily-card__count" data-testid="daily-card-progress">
            {progress}
          </span>
          <span className="daily-card__bar" aria-hidden="true">
            <span className="daily-card__fill" style={{ width: `${Math.round(ratio * 100)}%` }} />
          </span>
        </span>
      ) : null}
    </>
  );
  return (
    <li
      className={`daily-card${open ? " daily-card--open" : ""}${menuOpen ? " daily-card--menu" : ""}${select !== undefined ? " daily-card--selectable" : ""}${select?.selected ? " daily-card--selected" : ""}`}
      data-testid="daily-card"
      data-path={note.path}
      data-open={open ? "true" : undefined}
      data-selected={select === undefined ? undefined : String(select.selected)}
      {...rowMenuHandlers(menu, () => main.current?.focus())}
    >
      {select !== undefined ? (
        <>
          <SelectCheck select={select} label={title} />
          <div className="daily-card__main" data-testid="daily-card-open" title={note.path} {...selectClick(select)}>
            {content}
          </div>
        </>
      ) : (
        <>
          <button ref={main} type="button" className="daily-card__main" data-testid="daily-card-open" data-tip={menuOpen ? undefined : openHint} data-tip-slow="" aria-current={open ? "true" : undefined} onClick={(e) => onOpen(e.metaKey || e.ctrlKey)}>
            <span className="daily-card__glyph" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                <rect x="1.8" y="2.4" width="8.4" height="8" rx="1.4" stroke="currentColor" strokeWidth="1" />
                <path d="M1.8 4.8h8.4M4.2 1.3v2M7.8 1.3v2M4 7h1M6 7h2M4 8.8h2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
              </svg>
            </span>
            {content}
          </button>
          <button type="button" className="daily-card__unpin" data-testid="daily-card-unpin" aria-label="Unpin today's daily note" data-tip="Unpin for today — it is pinned again tomorrow" onClick={onUnpin}>
            <PinGlyph filled />
          </button>
        </>
      )}
    </li>
  );
}
