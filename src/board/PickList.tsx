import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

interface PickListProps<T> {
  /** What the list offers, in its order. */
  items: readonly T[];
  /** The items a typed query keeps (stable: a module-level function). */
  filter: (items: readonly T[], query: string) => T[];
  idOf: (item: T) => string;
  /** The item chosen now; `null` = none. */
  value: string | null;
  /**
   * `follow`: the highlighted option is the value (a form field — typing picks the first match,
   * ↑ ↓ move, Enter submits the form). `pick`: ↑ ↓ only highlight; Enter or a click picks.
   */
  mode: "follow" | "pick";
  onChange: (id: string | null) => void;
  /** What it lists, as its accessible name: "Problem", "Project". */
  label: string;
  placeholder: string;
  /** The first option, for choosing nothing ("No epic"); absent where the list has no such option. */
  noneLabel?: string;
  /** What the list says when a query matches nothing. */
  emptyText: (query: string) => string;
  /** An option's content (`pick-option__…` spans). */
  renderOption: (item: T) => ReactNode;
  /** A modifier class an option carries. */
  optionClass?: (item: T) => string;
  /** The stem of its test ids: `parent` → `parent-list`, `parent-filter`, `parent-options`, `parent-option`, `parent-empty`. */
  testId: string;
  /** Focus the filter when the popover opens. */
  autoFocus?: boolean;
  disabled?: boolean;
}

const NONE = "__none__";

/** A filterable list in a form or a popover: a search field over a short listbox. */
export function PickList<T>({ items, filter, idOf, value, mode, onChange, label, placeholder, noneLabel, emptyText, renderOption, optionClass, testId, autoFocus = false, disabled = false }: PickListProps<T>) {
  const base = useId();
  const [query, setQuery] = useState("");
  const matches = useMemo(() => filter(items, query), [filter, items, query]);
  const head: null[] = useMemo(() => (noneLabel === undefined ? [] : [null]), [noneLabel]);
  const options: (T | null)[] = useMemo(() => [...head, ...matches], [head, matches]);
  const idAt = (option: T | null | undefined): string | null => (option === null || option === undefined ? null : idOf(option));
  const indexOf = (list: readonly (T | null)[], id: string | null) => Math.max(0, list.findIndex((o) => idAt(o) === id));
  const [active, setActive] = useState(() => indexOf(options, value));
  const list = useRef<HTMLUListElement>(null);

  // Typing highlights the first match (or the "none" option when nothing matches); a cleared query goes back to the value.
  const changeQuery = (next: string) => {
    setQuery(next);
    const nextMatches = filter(items, next);
    const first = next.trim() === "" ? null : idAt(nextMatches[0]);
    setActive(indexOf([...head, ...nextMatches], next.trim() === "" ? value : first));
    if (mode === "follow" && next.trim() !== "") onChange(first);
  };

  const activeIndex = Math.min(active, options.length - 1);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const move = (to: number) => {
    const next = Math.max(0, Math.min(options.length - 1, to));
    setActive(next);
    if (mode === "follow" && options.length > 0) onChange(idAt(options[next]));
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
      if (options.length > 0) onChange(idAt(options[activeIndex]));
    }
  };

  const optionId = (i: number) => `${base}-opt-${i}`;
  return (
    <div className="pick-list" data-testid={`${testId}-list`}>
      <input
        className="field-input pick-list__filter"
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls={`${base}-list`}
        {...(options.length > 0 ? { "aria-activedescendant": optionId(activeIndex) } : {})}
        aria-autocomplete="list"
        aria-label={`${label}: type to filter`}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        data-testid={`${testId}-filter`}
        {...(autoFocus ? { "data-autofocus": "" } : {})}
        value={query}
        disabled={disabled}
        onChange={(e) => changeQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <ul ref={list} className="pick-list__options" role="listbox" id={`${base}-list`} aria-label={label} data-testid={`${testId}-options`}>
        {options.map((option, i) => {
          const id = idAt(option);
          const chosen = id === value;
          const modifier = option === null ? "" : (optionClass?.(option) ?? "");
          return (
            <li
              key={id ?? NONE}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeIndex}
              data-index={i}
              data-id={id ?? ""}
              data-chosen={chosen}
              data-testid={`${testId}-option`}
              className={`pick-option${i === activeIndex ? " pick-option--active" : ""}${modifier === "" ? "" : ` ${modifier}`}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (disabled) return;
                setActive(i);
                onChange(id);
              }}
            >
              <span className="pick-option__check" aria-hidden="true">
                {chosen ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6.5l2.2 2.2L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </span>
              {option === null ? <span className="pick-option__none">{noneLabel}</span> : renderOption(option)}
            </li>
          );
        })}
        {matches.length === 0 && query.trim() !== "" ? (
          <li className="pick-list__empty" role="presentation" data-testid={`${testId}-empty`}>
            {emptyText(query.trim())}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
