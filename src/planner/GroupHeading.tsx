import type { KeyboardEvent } from "react";

export interface GroupHeadingProps {
  /** The group's key (`folds.ts` `groupKey`): what its fold is stored under. */
  groupKey: string;
  /** 1: a group of the list; 2: a group inside one — lighter, and indented under an outer group (`nested`). */
  level: 1 | 2;
  /** A level-2 group stands inside a level-1 group (indented); without one it starts at the list's edge. */
  nested?: boolean;
  name: string;
  /** Muted text after the name (a project's group path when two share the name). */
  qualifier?: string | undefined;
  /** The group's open items, folded or not. */
  count: number;
  folded: boolean;
  onFold: (folded: boolean) => void;
  /** The source the group is of (`data-source`), for a project's group. */
  source?: string | undefined;
}

function FoldChevron() {
  return (
    <svg className="fold-chev" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M2.5 3.8 5 6.3l2.5-2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A list's group heading that folds ([[views]] "Groups"): a chevron before its name, its count at
 * the end. A click on it, or Enter or Space, folds and unfolds; ← folds and → unfolds the focused
 * heading. Folded, its rows (and a level-1 group's inner groups) leave the list; the count stays.
 */
export function GroupHeading({ groupKey, level, nested = false, name, qualifier, count, folded, onFold, source }: GroupHeadingProps) {
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    onFold(e.key === "ArrowLeft");
  };
  return (
    <li
      className={`task-section task-section--fold${level === 2 ? " task-section--sub" : ""}${level === 2 && nested ? " task-section--nested" : ""}`}
      data-testid="task-section"
      data-source={source}
      data-group={groupKey}
      data-level={level}
      data-folded={folded}
    >
      <button type="button" className="task-section__toggle" aria-expanded={!folded} data-tip={folded ? "Unfold (→)" : "Fold (←)"} data-tip-slow="" data-testid="task-section-toggle" onClick={() => onFold(!folded)} onKeyDown={onKeyDown}>
        <FoldChevron />
        <span className="task-section__name" data-testid="task-section-name">
          {name}
        </span>
        {qualifier ? <span className="task-section__qualifier">{qualifier}</span> : null}
      </button>
      <span className="task-section__count" data-testid="task-section-count">
        {count}
      </span>
    </li>
  );
}
