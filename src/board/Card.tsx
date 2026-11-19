import { useDraggable } from "@dnd-kit/core";

import type { Rect } from "../core/place";
import { Reporter } from "./Reporter";
import type { Kind, Ticket } from "./model/ticket";

const KIND_LETTER: Record<Kind, string> = { problem: "P", epic: "E", task: "T", signal: "S" };
const KIND_NAME: Record<Kind, string> = { problem: "Problem", epic: "Epic", task: "Task", signal: "Signal" };

interface CardFaceProps {
  ticket: Ticket;
  /** Solutions: an epic card is wider and tinted; a task card is inset and carries its parent epic. */
  solutions: boolean;
  error?: string | undefined;
  onDismissError?: () => void;
}

/** What a card shows: kind badge, ID, reporter, priority, title; on Solutions a task's parent-epic chip; a signal's problem chip and source. */
function CardFace({ ticket, solutions, error, onDismissError }: CardFaceProps) {
  const priority = ticket.priority;
  return (
    <>
      <div className="card__meta">
        <span className={`kind-badge kind-badge--${ticket.kind}`} title={KIND_NAME[ticket.kind]} data-testid="card-kind">
          {KIND_LETTER[ticket.kind]}
        </span>
        <span className="card__id" data-testid="card-id">
          {ticket.id}
        </span>
        {ticket.reporter !== null ? <Reporter handle={ticket.reporter} testId="card-reporter" /> : null}
        {priority !== null ? (
          <span className={`priority priority--${/^P[0-3]$/.test(priority) ? priority.toLowerCase() : "other"}`} data-testid="card-priority">
            {priority}
          </span>
        ) : null}
      </div>
      <div className="card__title" data-testid="card-title">
        {ticket.title}
      </div>
      {solutions && ticket.kind === "task" && ticket.parent !== null ? (
        <div className="card__chips">
          <span className="parent-chip" data-testid="card-parent">
            {ticket.parent}
          </span>
        </div>
      ) : null}
      {ticket.kind === "signal" && (ticket.parent !== null || ticket.source !== null) ? (
        <div className="card__chips">
          {ticket.parent !== null ? (
            <span className="parent-chip parent-chip--problem" data-testid="card-parent" title={`Problem ${ticket.parent}`}>
              {ticket.parent}
            </span>
          ) : null}
          {ticket.source !== null ? (
            <span className="card__source" data-testid="card-source" title={`Source: ${ticket.source}`}>
              {ticket.source}
            </span>
          ) : null}
        </div>
      ) : null}
      {error !== undefined ? (
        <div className="card__error" role="alert" data-testid="card-error">
          <span className="card__error-text">{error}</span>
          {onDismissError ? (
            <button
              type="button"
              className="card__error-dismiss"
              aria-label="Dismiss"
              data-tip="Dismiss"
              data-testid="card-error-dismiss"
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDismissError();
              }}
            >
              ×
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function cardClass(ticket: Ticket, solutions: boolean, extra: string): string {
  const kind = solutions ? ` card--${ticket.kind}` : "";
  return `card${kind}${extra}`;
}

/** The card under the pointer while dragging (dnd-kit `DragOverlay`); over a column that refuses it, it says why. */
export function CardOverlay({ ticket, solutions, refusal }: { ticket: Ticket; solutions: boolean; refusal: string | null }) {
  return (
    <div className={cardClass(ticket, solutions, ` card--overlay${refusal !== null ? " card--refused" : ""}`)} data-testid="card-overlay">
      <CardFace ticket={ticket} solutions={solutions} />
      {refusal !== null ? (
        <div className="card__refusal" data-testid="drop-refusal">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <circle cx="6" cy="6" r="4.75" stroke="currentColor" strokeWidth="1.3" />
            <path d="M2.7 9.3l6.6-6.6" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          {refusal}
        </div>
      ) : null}
    </div>
  );
}

interface CardProps {
  ticket: Ticket;
  solutions: boolean;
  /** A drop of this card is being written. */
  saving: boolean;
  error: string | undefined;
  onOpen: (ticket: Ticket) => void;
  onDismissError: (ticket: Ticket) => void;
  /** Right-click, the context-menu key or Shift+F10: the popover at that point (or under the card). */
  onEdit: (ticket: Ticket, anchor: Rect) => void;
}

/**
 * A ticket card: drag it to another column to change its status; click or Enter opens its file. (A
 * drop is never a click: dnd-kit swallows the click that ends a drag.)
 */
export function Card({ ticket, solutions, saving, error, onOpen, onDismissError, onEdit }: CardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: ticket.path, data: { ticket } });

  const extra = `${isDragging ? " card--placeholder" : ""}${saving ? " card--saving" : ""}${error !== undefined ? " card--error" : ""}`;
  return (
    <div
      ref={setNodeRef}
      className={cardClass(ticket, solutions, extra)}
      data-testid="card"
      data-id={ticket.id}
      data-path={ticket.path}
      {...attributes}
      {...listeners}
      aria-roledescription="ticket card"
      aria-label={`${ticket.id} ${ticket.title}`}
      onClick={() => onOpen(ticket)}
      onContextMenu={(e) => {
        e.preventDefault();
        onEdit(ticket, { left: e.clientX, top: e.clientY, width: 0, height: 0 });
      }}
      onKeyDown={(e) => {
        if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          onEdit(ticket, { left: r.left, top: r.top, width: r.width, height: r.height });
          return;
        }
        listeners?.onKeyDown?.(e);
        if (!e.defaultPrevented && e.key === "Enter") {
          e.preventDefault();
          onOpen(ticket);
        }
      }}
    >
      <CardFace ticket={ticket} solutions={solutions} error={error} onDismissError={() => onDismissError(ticket)} />
    </div>
  );
}
