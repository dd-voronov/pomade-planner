import { useEffect, useMemo, useState } from "react";

import { ParentList } from "./ParentList";
import { Popover } from "../core/Popover";
import { PrioritySelect } from "./PrioritySelect";
import { KIND_NAME } from "./model/create";
import type { EditableField } from "./model/drop";
import { parentCandidates } from "./model/parents";
import type { Rect } from "../core/place";
import { PARENT_KIND, type Ticket } from "./model/ticket";

interface CardPopoverProps {
  anchor: Rect;
  /** The ticket as the board shows it now. */
  ticket: Ticket;
  tickets: readonly Ticket[];
  /** A write is in flight: the controls wait. */
  busy: boolean;
  error: string | null;
  onEdit: (field: EditableField, value: string | null) => void;
  onClose: () => void;
  restoreFocus: () => void;
}

/** A card's right-click popover: its priority and its parent, each change written at once. */
export function CardPopover({ anchor, ticket, tickets, busy, error, onEdit, onClose, restoreFocus }: CardPopoverProps) {
  const parentKind = PARENT_KIND[ticket.kind];
  const candidates = useMemo(() => parentCandidates(tickets, ticket.kind), [tickets, ticket.kind]);
  // The value just picked shows at once; the file read back after the write takes over.
  const [picked, setPicked] = useState<{ field: EditableField; value: string | null } | null>(null);
  useEffect(() => {
    if (!busy) setPicked(null);
  }, [busy, ticket]);
  const shown = (field: EditableField, fromFile: string | null) => (picked?.field === field ? picked.value : fromFile);
  // While a write is in flight a new pick waits for the next one; the controls stay focusable.
  const change = (field: EditableField, value: string | null) => {
    if (busy) return;
    setPicked({ field, value });
    onEdit(field, value);
  };
  return (
    <Popover anchor={anchor} label={`Edit ${ticket.id}`} testId="card-popover" className="popover--form" onClose={onClose} restoreFocus={restoreFocus}>
      <div className="pop-form" aria-busy={busy}>
        <header className="pop-form__head">
          <span className="pop-form__id">{ticket.id}</span>
          <span className="pop-form__subject" title={ticket.title}>
            {ticket.title}
          </span>
        </header>
        <div className="pop-field">
          <span className="pop-field__label">Priority</span>
          <PrioritySelect value={shown("priority", ticket.priority)} onChange={(p) => change("priority", p)} />
        </div>
        {parentKind !== null ? (
          <div className="pop-field">
            <span className="pop-field__label">{KIND_NAME[parentKind]}</span>
            <ParentList candidates={candidates} value={shown("parent", ticket.parent)} mode="pick" onChange={(p) => change("parent", p)} label={KIND_NAME[parentKind]} />
          </div>
        ) : null}
        {error !== null ? (
          <p className="pop-form__error" role="alert" data-testid="popover-error">
            {error}
          </p>
        ) : null}
      </div>
    </Popover>
  );
}
