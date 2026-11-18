import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";

import type { BoardColumn } from "./model/areas";

interface ColumnProps {
  column: BoardColumn;
  collapsed: boolean;
  /** A card is being dragged that this column can't take: the column is dimmed. */
  refused: boolean;
  onExpand: () => void;
  onCollapse: (() => void) | null;
  /** The header's **+**: opens the create form under it. */
  onCreate: (button: HTMLButtonElement) => void;
  /** "New task", "New epic or task". */
  createLabel: string;
  children: ReactNode;
}

function PlusGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CollapseGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** One status column; a drop target. Collapsed, it is a narrow strip with its label and count that expands on click. */
export function Column({ column, collapsed, refused, onExpand, onCollapse, onCreate, createLabel, children }: ColumnProps) {
  const { def, cards } = column;
  const { setNodeRef, isOver } = useDroppable({ id: `column:${def.status}`, data: { column: def } });
  const state = `${refused ? " column--refused" : ""}${isOver && !refused ? " column--over" : ""}`;
  const common = {
    ref: setNodeRef,
    "data-testid": "column",
    "data-status": def.status,
    "data-collapsed": collapsed,
    "data-refused": refused,
    "data-over": isOver,
  };

  if (collapsed) {
    return (
      <section {...common} className={`column column--collapsed column--${def.placement}${state}`} aria-label={`${def.label}, ${cards.length}`}>
        <button type="button" className="column__expand" onClick={onExpand} data-testid="column-expand" aria-expanded="false" data-tip={`Show ${def.label}`}>
          <span className="column__count" data-testid="column-count">
            {cards.length}
          </span>
          <span className="column__label column__label--vertical" data-testid="column-label">
            {def.label}
          </span>
        </button>
      </section>
    );
  }

  return (
    <section {...common} className={`column${state}`} aria-label={def.label}>
      <header className="column__header">
        <span className="column__label" data-testid="column-label">
          {def.label}
        </span>
        <span className="column__count" data-testid="column-count">
          {cards.length}
        </span>
        <button
          type="button"
          className="icon-btn column__add"
          onClick={(e) => onCreate(e.currentTarget)}
          data-testid="column-add"
          aria-label={`${createLabel} in ${def.label}`}
          data-tip={`${createLabel} in ${def.label}`}
        >
          <PlusGlyph />
        </button>
        {onCollapse ? (
          <button type="button" className="icon-btn column__collapse" onClick={onCollapse} data-testid="column-collapse" aria-expanded="true" aria-label={`Collapse ${def.label}`} data-tip={`Collapse ${def.label}`}>
            <CollapseGlyph />
          </button>
        ) : null}
      </header>
      <div className="column__cards" data-testid="column-cards">
        {children}
      </div>
    </section>
  );
}
