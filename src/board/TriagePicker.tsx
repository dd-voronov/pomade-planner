import { useMemo } from "react";

import { ParentList } from "./ParentList";
import { Popover } from "../core/Popover";
import { parentCandidates } from "./model/parents";
import type { Rect } from "../core/place";
import type { Ticket } from "./model/ticket";

interface TriagePickerProps {
  anchor: Rect;
  signal: Ticket;
  tickets: readonly Ticket[];
  /** The chosen problem, or `null` to triage it without one. */
  onPick: (problem: string | null) => void;
  /** Escape or a click outside: the drop is cancelled, nothing is written. */
  onCancel: () => void;
  restoreFocus: () => void;
}

/** Dropping a signal on Triaged without a `problem:` asks for its problem first; Skip triages it without one. */
export function TriagePicker({ anchor, signal, tickets, onPick, onCancel, restoreFocus }: TriagePickerProps) {
  const candidates = useMemo(() => parentCandidates(tickets, "signal"), [tickets]);
  return (
    <Popover anchor={anchor} label={`Problem for ${signal.id}`} testId="triage-picker" className="popover--form" onClose={onCancel} restoreFocus={restoreFocus}>
      <div className="pop-form">
        <header className="pop-form__head pop-form__head--stack">
          <span className="pop-form__title">Which problem is it evidence for?</span>
          <span className="pop-form__meta">
            <span className="pop-form__id">{signal.id}</span> {signal.title}
          </span>
        </header>
        <ParentList candidates={candidates} value={null} mode="pick" onChange={onPick} label="Problem" autoFocus withNone={false} />
        <footer className="pop-form__actions">
          <button type="button" className="btn btn--ghost" data-testid="triage-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn--ghost" data-testid="triage-skip" onClick={() => onPick(null)}>
            Skip — triage without one
          </button>
        </footer>
      </div>
    </Popover>
  );
}
