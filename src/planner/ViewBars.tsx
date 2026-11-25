import { useMemo, useRef, useState, type ReactNode } from "react";

import { Popover } from "../core/Popover";
import type { Rect } from "../core/place";
import { matchesQuery, pickerGroups, type PickerGroupInfo, type PickerProject } from "./model/picker";
import { NO_PROJECT } from "./model/projects";
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

/**
 * Today's bar inside a project ([[views]] "Context"): one chip, the project filter "Only <project>".
 * Off, Today is the whole day; on, it lists the project's items alone and the chip carries its ×.
 */
export function OnlyProjectBar({ name, on, onToggle }: { name: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="chip-bar" role="toolbar" aria-label="Filter" data-testid="today-bar">
      <button
        type="button"
        className={`chip${on ? " chip--on" : ""}`}
        aria-pressed={on}
        data-tip={on ? "Show the whole day again" : `Show ${name}'s items alone`}
        data-testid="only-project"
        onClick={onToggle}
      >
        <span className="chip__label">Only {name}</span>
        {on ? (
          <span className="chip__x">
            <Cross />
          </span>
        ) : null}
      </button>
    </div>
  );
}

export interface MixedSource {
  /** Its source key (`none` = the no-project items). */
  key: string;
  label: string;
}

interface MixBarProps {
  /** The context project: its own items are always shown, so the picker leaves it out. */
  ownId: string;
  /** The sources mixed in, in the order added. */
  mixed: readonly MixedSource[];
  groups: readonly PickerGroupInfo[];
  projects: readonly PickerProject[];
  onAdd: (key: string) => void;
  onRemove: (key: string) => void;
  /** Chips standing first in the bar (Project's "Due today"). */
  children?: ReactNode;
}

/**
 * The bar of a project context's Project and Recurring ([[views]] "Context"): each mixed-in source
 * is a chip × removes, then "+ Add from…", the two-step picker with "No project" first — every
 * source not mixed in yet, the project itself aside.
 */
export function MixBar({ ownId, mixed, groups, projects, onAdd, onRemove, children }: MixBarProps) {
  const [picking, setPicking] = useState<Rect | null>(null);
  const add = useRef<HTMLButtonElement>(null);
  const takenKeys = mixed.map((m) => m.key).join("\n");
  const taken = useMemo(() => new Set(takenKeys.split("\n")), [takenKeys]);
  const offered = useMemo(() => pickerGroups(groups, projects.filter((p) => p.id !== ownId && !taken.has(p.id))), [groups, projects, ownId, taken]);
  const noneOffered = !taken.has(NO_PROJECT);
  return (
    <div className="chip-bar" role="toolbar" aria-label="Mix in" data-testid="mix-bar">
      {children}
      {mixed.map((m) => (
        <button key={m.key} type="button" className="chip chip--on" data-testid="mix-chip" data-source={m.key} aria-label={`Stop mixing in ${m.label}`} data-tip={`Stop mixing in ${m.label}`} onClick={() => onRemove(m.key)}>
          <span className="chip__label">{m.label}</span>
          <span className="chip__x">
            <Cross />
          </span>
        </button>
      ))}
      {noneOffered || offered.length > 0 ? (
        <button
          ref={add}
          type="button"
          className="chip"
          aria-expanded={picking !== null}
          data-tip="Mix in another project's items, or the items of no project"
          data-testid="mix-add"
          onClick={(e) => setPicking(rectOf(e.currentTarget))}
        >
          <span className="chip__label">+ Add from…</span>
        </button>
      ) : null}
      {picking !== null ? (
        <Popover anchor={picking} label="Add from" testId="mix-popover" className="popover--picker" onClose={() => setPicking(null)} restoreFocus={() => add.current?.focus()}>
          <ProjectPicker
            groups={offered}
            value={undefined}
            withNone={noneOffered}
            label="Add from"
            onPick={(p) => {
              onAdd(p === null ? NO_PROJECT : p.id);
              setPicking(null);
            }}
            onCancel={() => setPicking(null)}
          />
        </Popover>
      ) : null}
    </div>
  );
}

/** Project's "Due today" inside a project ([[views]] "Context"): on, the list is the project's Today items alone, and the chip carries its ×. */
export function DueTodayChip({ name, on, onToggle }: { name: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`chip${on ? " chip--on" : ""}`}
      aria-pressed={on}
      data-tip={on ? `Show everything of ${name} again` : `Show ${name}'s Today items alone`}
      data-testid="due-today"
      onClick={onToggle}
    >
      <span className="chip__label">Due today</span>
      {on ? (
        <span className="chip__x">
          <Cross />
        </span>
      ) : null}
    </button>
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
