import { useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { LocalDate } from "pomade-kit/schedule";

import type { DateField } from "./model/create";
import { hasDetails, ITEM_KINDS, stepKind, type DraftCheck, type ItemDraft, type ItemKind } from "./model/item-draft";
import { longDate } from "./model/labels";
import { groupLabel, type PickerGroup, type PickerProject } from "./model/picker";
import { ProjectPicker } from "./ProjectPicker";
import { RepeatEditor } from "./RepeatEditor";

interface KindMeta {
  label: string;
  title: string;
  /** The form's heading for a new item of the type. */
  heading: string;
  placeholder: string;
  glyph: ReactNode;
}

/** The types of the switch: each a glyph, its name, and the words of a form that adds one. */
export const KIND_META: Record<ItemKind, KindMeta> = {
  task: {
    label: "Task",
    title: "Task — something to do",
    heading: "New task",
    placeholder: "What needs doing?",
    glyph: <path d="M2.6 6.2l2.2 2.2 4.6-4.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />,
  },
  recurring: {
    label: "Recurring",
    title: "Recurring — a task that comes back",
    heading: "New recurring task",
    placeholder: "What comes back?",
    glyph: (
      <>
        <path d="M9.8 4.9A4 4 0 0 0 2.8 3.4M2.2 7.1a4 4 0 0 0 7 1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M2.5 1.3v2.3h2.3M9.5 10.7V8.4H7.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  note: {
    label: "Note",
    title: "Note — a quick drop, not a task",
    heading: "New note",
    placeholder: "What's worth keeping?",
    glyph: (
      <>
        <path d="M3 1.8h4.2L9.5 4v6.2H3z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M7 1.8V4.2h2.4M4.6 6.2h3M4.6 8.2h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  thought: {
    label: "Thought",
    title: "Thought — something to think about later",
    heading: "New thought",
    placeholder: "What's on your mind?",
    glyph: (
      <>
        <path d="M3.6 7.6a2.4 2.4 0 0 1-.3-4.4 2.6 2.6 0 0 1 4.9-.2 2.2 2.2 0 0 1 .4 4.3z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
        <circle cx="3.6" cy="9.4" r=".8" fill="currentColor" />
        <circle cx="2.2" cy="10.8" r=".5" fill="currentColor" />
      </>
    ),
  },
  "daily-note": {
    label: "Daily",
    title: "Daily note — open today's, making it first when it isn't there",
    heading: "Today's daily note",
    placeholder: "Today's daily note",
    glyph: (
      <>
        <rect x="1.8" y="2.4" width="8.4" height="8" rx="1.4" stroke="currentColor" strokeWidth="1.1" />
        <path d="M1.8 4.8h8.4M4.2 1.3v2M7.8 1.3v2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </>
    ),
  },
};

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3 4.5L6 7.5l3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Whether a key types a character (it opens the picker with that character as the query). */
const isTyping = (e: KeyboardEvent): boolean => e.key.length === 1 && e.key !== " " && !e.metaKey && !e.ctrlKey && !e.altKey;

/** A field with its label and, on the label's line, what the typed text comes to (a date, or why it isn't one). */
function NotedInput({ id, label, value, onChange, note, error, testId, noteTestId, placeholder, inputMode }: { id: string; label: string; value: string; onChange: (v: string) => void; note: string; error: boolean; testId: string; noteTestId: string; placeholder: string; inputMode?: "decimal" }) {
  return (
    <div className="qa-field">
      <div className="qa-field__top">
        <label className="qa-field__label" htmlFor={id}>
          {label}
        </label>
        <span id={`${id}-note`} className={`qa-field__note${error ? " qa-field__note--error" : ""}`} data-testid={noteTestId} title={note}>
          {note}
        </span>
      </div>
      <input
        id={id}
        className="field-input qa-field__input"
        data-testid={`qa-${testId}`}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={error}
        aria-describedby={`${id}-note`}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

const dateNote = (result: DateField, day: LocalDate): string => (result.kind === "date" ? longDate(result.date, day) : result.kind === "error" ? result.message : "");

/**
 * Details: one line tall when empty, growing with its text up to the cap its surface gives it
 * (planner.css), then scrolling inside. Enter is a new line.
 */
function Details({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const el = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const area = el.current;
    if (!area) return;
    // Measuring collapses the field for a moment; what scrolls around it stays where it was.
    const scrolled: [Element, number][] = [];
    for (let up = area.parentElement; up !== null; up = up.parentElement) if (up.scrollTop !== 0) scrolled.push([up, up.scrollTop]);
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight + area.offsetHeight - area.clientHeight}px`;
    for (const [node, top] of scrolled) node.scrollTop = top;
  };
  useLayoutEffect(fit, [value]);
  // A narrower or wider field wraps its lines anew.
  useLayoutEffect(() => {
    const area = el.current;
    if (!area) return;
    let width = area.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (area.offsetWidth === width) return;
      width = area.offsetWidth;
      fit();
    });
    observer.observe(area);
    return () => observer.disconnect();
  }, []);
  return (
    <textarea
      ref={el}
      className="field-input qa__details"
      data-fit-scroll
      data-testid="qa-details"
      rows={1}
      value={value}
      placeholder="Details"
      aria-label="Details"
      data-tip="Details — the file's text under its fields, markdown as typed"
      autoComplete="off"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** What Tab stops at inside `root`, in order: the fields that show and take input, a radio group as its checked option. */
function tabStops(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("input, select, textarea, button")].filter(
    (el) => !(el as HTMLInputElement).disabled && el.tabIndex >= 0 && el.offsetParent !== null && !(el instanceof HTMLInputElement && el.type === "radio" && !el.checked),
  );
}

export interface ItemFieldsProps {
  draft: ItemDraft;
  onChange: (draft: ItemDraft) => void;
  /** What the typed fields come to now (`checkDraft`). */
  check: DraftCheck;
  /** Pomade's projects for the picker (`pickerGroups`). */
  groups: readonly PickerGroup[];
  /** `draft.project` as a project; `null`: none. */
  chosen: PickerProject | null;
  /** The project picker stands in the fields' place, its query starting as `query`. */
  picking: { query: string } | null;
  onPicking: (picking: { query: string } | null) => void;
  /** The title is marked: it was refused empty. */
  titleInvalid: boolean;
  /**
   * The fields edit an item that is there: its type and project stand (no switch, no picker), the
   * title shows `titlePlaceholder` while the file has none, every type has Details, and Tab leaves
   * the fields as it does any others. `repeatText`: a recurring item's rule the repeat editor
   * can't hold, in words, in the editor's place. `beforeTitle`: what stands on the title's line
   * before it (the item's checkbox).
   */
  edit?: { titlePlaceholder: string; repeatText: string | null; beforeTitle: ReactNode };
}

/**
 * An item's fields ([[quick-add]] "Fields"), values in and changes out — what the form that adds an item
 * shows, and what the compact view that edits one shows (`edit`): the title; the project (the two-step picker
 * opens on ↓, Space, a click or typing in the field and takes the fields' place while open); the
 * type switch after it in the Tab order, so "title, Tab, qui" still picks a project; then the
 * type's own fields — a task's `do-on`, deadline (date phrases, resolved on the label's line
 * against the planner day) and importance, a recurring item's repeat editor, a line about a note,
 * thought or daily note — and Details for every type but the daily note.
 *
 * Keys: ⌥Tab and ⌥⇧Tab walk the type from any field, focus staying where it is (on the title when
 * its field left with the type). Tab and Shift+Tab go round the fields and never leave them — in a
 * frame, the next stop outside would be Pomade's own panes.
 */
export function ItemFields({ draft, onChange, check, groups, chosen, picking, onPicking, titleInvalid, edit }: ItemFieldsProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLInputElement>(null);
  const projectButton = useRef<HTMLButtonElement>(null);
  const set = (patch: Partial<ItemDraft>) => onChange({ ...draft, ...patch });
  const { kind } = draft;
  const daily = kind === "daily-note" && edit === undefined;
  const meta = KIND_META[kind];

  // Focus goes back to the project field once the picker has closed and the field shows again.
  const refocus = useRef(false);
  const closePicker = () => {
    refocus.current = true;
    onPicking(null);
  };
  useLayoutEffect(() => {
    if (picking !== null || !refocus.current) return;
    refocus.current = false;
    projectButton.current?.focus();
  }, [picking]);

  // The type walked from the keyboard: focus stays in the fields — on the switch's chosen option
  // when it was on the switch, on the title when its field belonged to the type that left. The
  // title's caret stays where it was through the daily note, whose title shows no text.
  const walked = useRef(false);
  const caret = useRef<[number, number] | null>(null);
  useLayoutEffect(() => {
    if (!walked.current) return;
    walked.current = false;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active.type === "radio" && root.current?.contains(active)) root.current.querySelector<HTMLInputElement>("input[type=radio]:checked")?.focus();
    else if (!root.current?.contains(active)) title.current?.focus();
    if (kind !== "daily-note" && caret.current !== null && document.activeElement === title.current) title.current?.setSelectionRange(...caret.current);
  }, [kind]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (edit !== undefined || e.key !== "Tab" || e.metaKey || e.ctrlKey) return;
    if (e.altKey) {
      e.preventDefault();
      if (picking !== null) return;
      walked.current = true;
      if (kind !== "daily-note") caret.current = document.activeElement === title.current && title.current !== null ? [title.current.selectionStart ?? 0, title.current.selectionEnd ?? 0] : null;
      set({ kind: stepKind(kind, e.shiftKey ? -1 : 1) });
      return;
    }
    const stops = tabStops(e.currentTarget);
    const edge = e.shiftKey ? stops[0] : stops[stops.length - 1];
    if (e.target !== edge && stops.includes(e.target as HTMLElement)) return;
    e.preventDefault();
    (e.shiftKey ? stops[stops.length - 1] : stops[0])?.focus();
  };

  return (
    <div ref={root} className="qa__main" onKeyDown={onKeyDown}>
      {picking !== null ? (
        <ProjectPicker
          groups={groups}
          value={draft.project}
          withNone
          initialQuery={picking.query}
          label="Project"
          onPick={(p) => {
            set({ project: p?.id ?? null });
            closePicker();
          }}
          onCancel={closePicker}
        />
      ) : null}
      <div className="qa__body" data-fit-scroll hidden={picking !== null}>
        <div className="qa__title-line">
          {edit?.beforeTitle}
          <input
            ref={title}
            className="field-input qa__name"
            data-testid="qa-title"
            data-autofocus={edit === undefined ? true : undefined}
            autoFocus={edit === undefined}
            value={daily ? "" : draft.title}
            readOnly={daily}
            aria-disabled={daily}
            placeholder={edit?.titlePlaceholder ?? meta.placeholder}
            aria-label="Title"
            aria-invalid={titleInvalid}
            autoComplete="off"
            onChange={(e) => set({ title: e.target.value })}
          />
        </div>
        {edit !== undefined ? null : (
          <div className="qa-project">
            <label className="qa-field__label qa-project__label" htmlFor={`${id}-project`}>
              Project
            </label>
            <button
              ref={projectButton}
              id={`${id}-project`}
              type="button"
              disabled={daily}
              className="field-input qa-project__button"
              data-testid="qa-project"
              data-project={draft.project ?? ""}
              aria-haspopup="listbox"
              data-tip="Change the project: type its name, or press ↓"
              onClick={() => onPicking({ query: "" })}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === " ") {
                  e.preventDefault();
                  onPicking({ query: "" });
                } else if (isTyping(e)) {
                  e.preventDefault();
                  onPicking({ query: e.key });
                }
              }}
            >
              {chosen === null || daily ? (
                <span className="qa-project__none" data-testid="qa-project-name">
                  {daily ? "Workspace" : "No project"}
                </span>
              ) : (
                <>
                  <span className="qa-project__name" data-testid="qa-project-name">
                    {chosen.name}
                  </span>
                  <span className="qa-project__group">{groupLabel(chosen.groupPath)}</span>
                </>
              )}
              <span className="qa-project__chevron">
                <Chevron />
              </span>
            </button>
            <div className="qa-kind" role="radiogroup" aria-label="Type" data-testid="qa-type">
              {ITEM_KINDS.map((k) => (
                <label key={k} className={`qa-kind__option${kind === k ? " qa-kind__option--on" : ""}`} data-tip={KIND_META[k].title}>
                  <input type="radio" name={`${id}-type`} value={k} checked={kind === k} aria-label={KIND_META[k].label} data-testid={`qa-type-${k}`} onChange={() => set({ kind: k })} />
                  <svg className="qa-kind__glyph" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    {KIND_META[k].glyph}
                  </svg>
                  <span className="qa-kind__label">{KIND_META[k].label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        {edit !== undefined && kind !== "task" && kind !== "recurring" ? null : kind === "note" || kind === "thought" || daily ? (
          <p className="qa__about" data-testid="qa-about">
            {kind === "note"
              ? "A note has no dates: it lives in All, never in Today. Archive it when it's done with."
              : kind === "thought"
                ? "A thought has no dates: it lives in All, never in Today, until you resolve it."
                : "Opens today's daily note in an editor tab — made from your template when it isn't there yet."}
          </p>
        ) : kind === "recurring" && edit !== undefined && edit.repeatText !== null ? (
          <p className="qa__about" data-testid="qa-repeat-text">
            {edit.repeatText}
          </p>
        ) : kind === "recurring" ? (
          <RepeatEditor draft={draft.repeat} onChange={(repeat) => set({ repeat })} result={check.repeat} anchor={check.repeatAnchor} />
        ) : (
          <div className="qa__fields">
            <NotedInput id={`${id}-do-on`} label="Do on" value={draft.doOn} onChange={(doOn) => set({ doOn })} note={dateNote(check.doOn, check.day)} error={check.doOn.kind === "error"} testId="do-on" noteTestId="qa-do-on-resolved" placeholder="today, fri" />
            <NotedInput id={`${id}-deadline`} label="Deadline" value={draft.deadline} onChange={(deadline) => set({ deadline })} note={dateNote(check.deadline, check.day)} error={check.deadline.kind === "error"} testId="deadline" noteTestId="qa-deadline-resolved" placeholder="nov 20, +3d" />
            <NotedInput
              id={`${id}-importance`}
              label="Importance"
              value={draft.importance}
              onChange={(importance) => set({ importance })}
              note={check.importance.kind === "error" ? "A number" : ""}
              error={check.importance.kind === "error"}
              testId="importance"
              noteTestId="qa-importance-note"
              placeholder="1–9"
              inputMode="decimal"
            />
          </div>
        )}
        {edit !== undefined || hasDetails(kind) ? <Details value={draft.details} onChange={(details) => set({ details })} /> : null}
      </div>
    </div>
  );
}
