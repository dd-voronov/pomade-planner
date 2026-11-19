import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { groupLabel, initialActive, stepOneOptions, stepTwoOptions, type PickerGroup, type PickerOption, type PickerProject } from "./model/picker";

interface ProjectPickerProps {
  groups: readonly PickerGroup[];
  /** The project chosen now (`null`: no project). */
  value: string | null;
  /** Offer "No project" first. */
  withNone: boolean;
  /** What a typed query starts as (the key that opened the picker). */
  initialQuery?: string;
  onPick: (project: PickerProject | null) => void;
  /** Escape, or the back button on step one. */
  onCancel: () => void;
  /** "Project", "Mix in". */
  label: string;
}

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.5 6.5l2.2 2.2L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const optionKey = (o: PickerOption): string => (o.kind === "none" ? "none" : o.kind === "group" ? `g:${o.group.id}` : `p:${o.project.id}`);

/**
 * The two-step project picker ([[quick-add]] "Project picker"): a search field over a listbox. Step one: "No project",
 * the group paths, and — once something is typed — the matching projects straight away; step two:
 * one group's projects. ↑ ↓ highlight, Enter picks a project or opens a group, Backspace in an
 * empty field goes back a step, Escape cancels. Keys it handles never reach the form or Pomade.
 */
export function ProjectPicker({ groups, value, withNone, initialQuery = "", onPick, onCancel, label }: ProjectPickerProps) {
  const base = useId();
  const [group, setGroup] = useState<PickerGroup | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const options = useMemo(() => {
    const list = group === null ? stepOneOptions(groups, query) : stepTwoOptions(group, query);
    return withNone ? list : list.filter((o) => o.kind !== "none");
  }, [groups, group, query, withNone]);
  const preferred = (o: PickerOption) =>
    o.kind === "project" ? o.project.id === value : o.kind === "group" ? o.group.projects.some((p) => p.id === value) : value === null;
  const [active, setActive] = useState(() => initialActive(options, query, preferred));
  const activeIndex = Math.max(0, Math.min(active, options.length - 1));
  const list = useRef<HTMLUListElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [group]);

  const show = (nextGroup: PickerGroup | null, nextQuery: string) => {
    setGroup(nextGroup);
    setQuery(nextQuery);
    const raw = nextGroup === null ? stepOneOptions(groups, nextQuery) : stepTwoOptions(nextGroup, nextQuery);
    const next = withNone ? raw : raw.filter((o) => o.kind !== "none");
    setActive(initialActive(next, nextQuery, preferred));
  };

  const choose = (option: PickerOption | undefined) => {
    if (option === undefined) return;
    if (option.kind === "group") show(option.group, "");
    else onPick(option.kind === "project" ? option.project : null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      handled();
      if (options.length > 0) setActive((activeIndex + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      handled();
      choose(options[activeIndex]);
    } else if (e.key === "Escape") {
      handled();
      onCancel();
    } else if (e.key === "Backspace" && query === "" && group !== null) {
      handled();
      show(null, "");
    } else if (e.key === "ArrowRight" && options[activeIndex]?.kind === "group" && input.current?.selectionStart === query.length) {
      handled();
      choose(options[activeIndex]);
    } else if (e.key === "ArrowLeft" && group !== null && input.current?.selectionStart === 0) {
      handled();
      show(null, "");
    }
  };

  const optionId = (i: number) => `${base}-opt-${i}`;
  return (
    <div className="project-picker" data-testid="project-picker" data-step={group === null ? "group" : "project"}>
      <div className="project-picker__bar">
        {group !== null ? (
          <button type="button" className="project-picker__back" data-testid="picker-back" aria-label="Back to groups" data-tip="Back to groups" onMouseDown={(e) => e.preventDefault()} onClick={() => show(null, "")}>
            <span aria-hidden="true">‹</span>
            <span className="project-picker__crumb" data-testid="picker-group">
              {group.label}
            </span>
          </button>
        ) : null}
        <input
          ref={input}
          className="project-picker__filter"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${base}-list`}
          {...(options.length > 0 ? { "aria-activedescendant": optionId(activeIndex) } : {})}
          aria-autocomplete="list"
          aria-label={`${label}: type to filter`}
          placeholder={group === null ? "Search projects and groups" : `Search ${group.label}`}
          autoComplete="off"
          spellCheck={false}
          data-testid="picker-filter"
          data-autofocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            const raw = group === null ? stepOneOptions(groups, e.target.value) : stepTwoOptions(group, e.target.value);
            setActive(initialActive(withNone ? raw : raw.filter((o) => o.kind !== "none"), e.target.value, preferred));
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <ul ref={list} className="project-picker__options" role="listbox" id={`${base}-list`} aria-label={label} data-testid="picker-options">
        {options.map((option, i) => {
          const chosen = preferred(option) && option.kind !== "group";
          return (
            <li
              key={optionKey(option)}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeIndex}
              data-index={i}
              data-kind={option.kind}
              data-chosen={chosen}
              data-testid="picker-option"
              className={`picker-option${i === activeIndex ? " picker-option--active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => i !== activeIndex && setActive(i)}
              onClick={() => choose(option)}
            >
              <span className="picker-option__check" aria-hidden="true">
                {chosen ? <Check /> : null}
              </span>
              {option.kind === "none" ? (
                <span className="picker-option__none">No project</span>
              ) : option.kind === "group" ? (
                <>
                  <span className="picker-option__name" data-testid="picker-option-name">
                    {option.group.label}
                  </span>
                  <span className="picker-option__meta">{option.group.projects.length}</span>
                  <span className="picker-option__chevron">
                    <Chevron />
                  </span>
                </>
              ) : (
                <>
                  <span className="picker-option__name" data-testid="picker-option-name">
                    {option.project.name}
                  </span>
                  {group === null ? <span className="picker-option__meta picker-option__meta--group">{groupLabel(option.project.groupPath)}</span> : null}
                </>
              )}
            </li>
          );
        })}
        {options.every((o) => o.kind === "none") && query.trim() !== "" ? (
          <li className="project-picker__empty" role="presentation" data-testid="picker-empty">
            Nothing matches “{query.trim()}”
          </li>
        ) : null}
      </ul>
    </div>
  );
}
