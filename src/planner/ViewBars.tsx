import { useMemo, useRef, useState } from "react";

import { Popover } from "../core/Popover";
import type { Rect } from "../core/place";
import { matchesQuery, pickerGroups, type PickerGroupInfo, type PickerProject } from "./model/picker";
import { ProjectPicker } from "./ProjectPicker";

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

function Cross() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function Caret() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M2.5 4l2.5 2.5L7.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface MixedSource {
  key: string;
  label: string;
}

interface MixBarProps {
  /** The context project: its own items are always shown, so the picker leaves it out. */
  ownId: string;
  noProject: boolean;
  mixed: readonly MixedSource[];
  groups: readonly PickerGroupInfo[];
  projects: readonly PickerProject[];
  onToggleNoProject: () => void;
  onAdd: (key: string) => void;
  onRemove: (key: string) => void;
}

/**
 * The mix-in chips of a project context ([[views]] "Context"): "No-project items" toggles the
 * workspace-level items in; "+ Project" picks another project (the two-step picker); each mixed-in
 * project is a chip that × removes.
 */
export function MixBar({ ownId, noProject, mixed, groups, projects, onToggleNoProject, onAdd, onRemove }: MixBarProps) {
  const [picking, setPicking] = useState<Rect | null>(null);
  const add = useRef<HTMLButtonElement>(null);
  const takenKeys = mixed.map((m) => m.key).join("\n");
  const offered = useMemo(() => {
    const taken = new Set(takenKeys.split("\n"));
    return pickerGroups(
      groups,
      projects.filter((p) => p.id !== ownId && !taken.has(p.id)),
    );
  }, [groups, projects, ownId, takenKeys]);
  return (
    <div className="chip-bar" role="toolbar" aria-label="Mix in" data-testid="mix-bar">
      <button
        type="button"
        className={`chip${noProject ? " chip--on" : ""}`}
        aria-pressed={noProject}
        data-tip={noProject ? "Stop mixing in the no-project items" : "Mix in the items that belong to no project"}
        data-testid="mix-no-project"
        onClick={onToggleNoProject}
      >
        {noProject ? "No project" : "+ No-project items"}
        {noProject ? (
          <span className="chip__x">
            <Cross />
          </span>
        ) : null}
      </button>
      {mixed.map((m) => (
        <button key={m.key} type="button" className="chip chip--on" data-testid="mix-chip" data-source={m.key} aria-label={`Stop mixing in ${m.label}`} data-tip={`Stop mixing in ${m.label}`} onClick={() => onRemove(m.key)}>
          <span className="chip__label">{m.label}</span>
          <span className="chip__x">
            <Cross />
          </span>
        </button>
      ))}
      {offered.length > 0 ? (
        <button ref={add} type="button" className="chip" aria-expanded={picking !== null} data-testid="mix-add" onClick={(e) => setPicking(rectOf(e.currentTarget))}>
          + Project
        </button>
      ) : null}
      {picking !== null ? (
        <Popover anchor={picking} label="Mix in a project" testId="mix-popover" className="popover--picker" onClose={() => setPicking(null)} restoreFocus={() => add.current?.focus()}>
          <ProjectPicker
            groups={offered}
            value={null}
            withNone={false}
            label="Mix in"
            onPick={(p) => {
              if (p !== null) onAdd(p.id);
              setPicking(null);
            }}
            onCancel={() => setPicking(null)}
          />
        </Popover>
      ) : null}
    </div>
  );
}

export interface FilterOption {
  key: string;
  label: string;
  /** Muted text after the label (a group path). */
  meta?: string;
}

interface FilterMenuProps {
  /** "Projects", "Types". */
  label: string;
  /** "All projects", "All types". */
  allLabel: string;
  options: readonly FilterOption[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  testId: string;
  /** Show a search field (a long list). */
  searchable?: boolean;
}

/** One All filter: a chip naming what passes ("All projects", "QuizLab", "2 projects"), opening a checklist; nothing ticked = everything. */
export function FilterMenu({ label, allLabel, options, selected, onChange, testId, searchable = false }: FilterMenuProps) {
  const [open, setOpen] = useState<Rect | null>(null);
  const [query, setQuery] = useState("");
  const button = useRef<HTMLButtonElement>(null);
  const live = selected.filter((k) => options.some((o) => o.key === k));
  const summary = live.length === 0 ? allLabel : live.length === 1 ? (options.find((o) => o.key === live[0])?.label ?? allLabel) : `${live.length} ${label.toLowerCase()}`;
  const shown = options.filter((o) => matchesQuery(query, o.label, o.meta ?? ""));
  const toggle = (key: string) => onChange(live.includes(key) ? live.filter((k) => k !== key) : [...live, key]);
  return (
    <>
      <button
        ref={button}
        type="button"
        className={`chip chip--menu${live.length > 0 ? " chip--on" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open !== null}
        aria-label={`${label}: ${summary}`}
        data-testid={testId}
        onClick={(e) => {
          setQuery("");
          setOpen(rectOf(e.currentTarget));
        }}
      >
        <span className="chip__label">{summary}</span>
        <Caret />
      </button>
      {open !== null ? (
        <Popover anchor={open} label={label} testId={`${testId}-menu`} className="popover--filter" onClose={() => setOpen(null)} restoreFocus={() => button.current?.focus()}>
          <div className="filter-menu">
            {searchable ? (
              <input
                className="field-input filter-menu__search"
                type="text"
                placeholder={`Search ${label.toLowerCase()}`}
                aria-label={`Search ${label.toLowerCase()}`}
                data-testid={`${testId}-search`}
                data-autofocus
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            ) : null}
            <div className="filter-menu__options" role="menu" aria-label={label}>
              {shown.map((o) => (
                <label key={o.key} className="filter-option" data-testid="filter-option" data-key={o.key}>
                  <input type="checkbox" role="menuitemcheckbox" aria-checked={live.includes(o.key)} checked={live.includes(o.key)} onChange={() => toggle(o.key)} />
                  <span className="filter-option__label">{o.label}</span>
                  {o.meta !== undefined ? <span className="filter-option__meta">{o.meta}</span> : null}
                </label>
              ))}
              {shown.length === 0 ? <span className="filter-menu__empty">Nothing matches “{query.trim()}”</span> : null}
            </div>
            <div className="filter-menu__foot">
              <button type="button" className="btn btn--ghost btn--sm" data-testid={`${testId}-clear`} disabled={live.length === 0} onClick={() => onChange([])}>
                {allLabel}
              </button>
            </div>
          </div>
        </Popover>
      ) : null}
    </>
  );
}
