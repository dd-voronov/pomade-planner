import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { isOpen } from "./model/areas";
import { filterParents } from "./model/parents";
import type { Ticket } from "./model/ticket";

interface ParentListProps {
  /** In picker order (`parentCandidates`). */
  candidates: readonly Ticket[];
  /** The parent chosen now; `null` = none. */
  value: string | null;
  /**
   * `follow`: the highlighted option is the value (a form field — typing picks the first match,
   * ↑ ↓ move, Enter submits the form). `pick`: ↑ ↓ only highlight; Enter or a click picks.
   */
  mode: "follow" | "pick";
  onChange: (parent: string | null) => void;
  /** "Problem", "Epic". */
  label: string;
  /** Focus the filter when the popover opens. */
  autoFocus?: boolean;
  /** Offer "No <parent>" as the first option (off where a separate button says it). */
  withNone?: boolean;
  disabled?: boolean;
}

const NONE = "__none__";

/** A filterable parent list: a search field over a listbox whose first option is "No parent". */
export function ParentList({ candidates, value, mode, onChange, label, autoFocus = false, withNone = true, disabled = false }: ParentListProps) {
  const base = useId();
  const [query, setQuery] = useState("");
  const matches = useMemo(() => filterParents(candidates, query), [candidates, query]);
  const head: null[] = useMemo(() => (withNone ? [null] : []), [withNone]);
  const options: (Ticket | null)[] = useMemo(() => [...head, ...matches], [head, matches]);
  const indexOf = (id: string | null) => Math.max(0, options.findIndex((o) => (o?.id ?? null) === id));
  const [active, setActive] = useState(() => indexOf(value));
  const list = useRef<HTMLUListElement>(null);

  // Typing highlights the first match (or "No parent" when nothing matches); a cleared query goes back to the value.
  const changeQuery = (next: string) => {
    setQuery(next);
    const nextMatches = filterParents(candidates, next);
    const first = next.trim() === "" ? null : (nextMatches[0] ?? null);
    const target = next.trim() === "" ? value : (first?.id ?? null);
    const nextOptions = [...head, ...nextMatches];
    setActive(Math.max(0, nextOptions.findIndex((o) => (o?.id ?? null) === target)));
    if (mode === "follow" && next.trim() !== "") onChange(first?.id ?? null);
  };

  const activeIndex = Math.min(active, options.length - 1);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const move = (to: number) => {
    const next = Math.max(0, Math.min(options.length - 1, to));
    setActive(next);
    if (mode === "follow" && options.length > 0) onChange(options[next]?.id ?? null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      move(activeIndex + (e.key === "ArrowDown" ? 1 : -1));
    } else if ((e.key === "PageDown" || e.key === "PageUp") && options.length > 1) {
      e.preventDefault();
      move(e.key === "PageDown" ? options.length - 1 : 0);
    } else if (e.key === "Enter" && mode === "pick") {
      e.preventDefault();
      if (options.length > 0) onChange(options[activeIndex]?.id ?? null);
    }
  };

  const optionId = (i: number) => `${base}-opt-${i}`;
  return (
    <div className="parent-list" data-testid="parent-list">
      <input
        className="field-input parent-list__filter"
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls={`${base}-list`}
        {...(options.length > 0 ? { "aria-activedescendant": optionId(activeIndex) } : {})}
        aria-autocomplete="list"
        aria-label={`${label}: type to filter`}
        placeholder={`Search ${label.toLowerCase()}s by ID or title`}
        autoComplete="off"
        spellCheck={false}
        data-testid="parent-filter"
        {...(autoFocus ? { "data-autofocus": "" } : {})}
        value={query}
        disabled={disabled}
        onChange={(e) => changeQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <ul ref={list} className="parent-list__options" role="listbox" id={`${base}-list`} aria-label={label} data-testid="parent-options">
        {options.map((option, i) => {
          const id = option?.id ?? null;
          const chosen = id === value;
          return (
            <li
              key={id ?? NONE}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeIndex}
              data-index={i}
              data-id={id ?? ""}
              data-chosen={chosen}
              data-testid="parent-option"
              className={`parent-option${i === activeIndex ? " parent-option--active" : ""}${option && !isOpen(option) ? " parent-option--closed" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (disabled) return;
                setActive(i);
                onChange(id);
              }}
            >
              <span className="parent-option__check" aria-hidden="true">
                {chosen ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6.5l2.2 2.2L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </span>
              {option ? (
                <>
                  <span className="parent-option__id">{option.id}</span>
                  <span className="parent-option__title">{option.title}</span>
                  {!isOpen(option) && option.status !== null ? <span className="parent-option__status">{option.status}</span> : null}
                </>
              ) : (
                <span className="parent-option__none">No {label.toLowerCase()}</span>
              )}
            </li>
          );
        })}
        {matches.length === 0 && query.trim() !== "" ? (
          <li className="parent-list__empty" role="presentation" data-testid="parent-empty">
            No {label.toLowerCase()} matches “{query.trim()}”
          </li>
        ) : null}
      </ul>
    </div>
  );
}
