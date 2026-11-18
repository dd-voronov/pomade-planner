import { useId } from "react";
import type { LocalDate } from "pomade-kit/schedule";

import { defaultOn, type DraftField, type DraftResult, type RepeatDraft, type RepeatMode, type RepeatUnit } from "./model/repeat-draft";

interface RepeatEditorProps {
  draft: RepeatDraft;
  onChange: (draft: RepeatDraft) => void;
  result: DraftResult;
  /** The day "On" falls back to: the start date, else today. */
  anchor: LocalDate;
}

const UNITS: RepeatUnit[] = ["day", "week", "month"];

/**
 * Quick add's repeat editor (DESIGN §3.7), two compact rows: "Repeat [every] [1] [month] on [5]"
 * (or "[after done] [3] [months]"), then days early, start and end. What it makes of them — the kit's words,
 * or the problem — shows in the form's foot.
 */
export function RepeatEditor({ draft, onChange, result, anchor }: RepeatEditorProps) {
  const id = useId();
  const set = (patch: Partial<RepeatDraft>) => onChange({ ...draft, ...patch });
  const bad = (field: DraftField): boolean => result.kind === "error" && result.field === field;
  const plural = draft.count.trim() !== "1";
  const showOn = draft.mode === "every" && draft.unit !== "day";
  return (
    <div className="qa-repeat" data-testid="qa-repeat">
      <div className="qa-repeat__row">
        <div className="qa-repeat__group">
          <label className="qa-field__label qa-repeat__label" htmlFor={`${id}-mode`}>
            Repeat
          </label>
          <select id={`${id}-mode`} className="field-input qa-repeat__select" data-testid="qa-repeat-mode" value={draft.mode} onChange={(e) => set({ mode: e.target.value as RepeatMode })}>
            <option value="every">every</option>
            <option value="after">after done</option>
          </select>
        </div>
        <div className="qa-repeat__group qa-repeat__group--grow">
          <input
            className="field-input qa-repeat__count"
            data-testid="qa-repeat-count"
            aria-label="How many"
            inputMode="numeric"
            autoComplete="off"
            value={draft.count}
            aria-invalid={bad("count")}
            onChange={(e) => set({ count: e.target.value })}
          />
          <select className="field-input qa-repeat__select" data-testid="qa-repeat-unit" aria-label="Unit" value={draft.unit} onChange={(e) => set({ unit: e.target.value as RepeatUnit, on: "" })}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {plural ? `${u}s` : u}
              </option>
            ))}
          </select>
          {showOn ? (
            <span className="qa-repeat__on">
              <label className="qa-field__label qa-repeat__inline-label" htmlFor={`${id}-on`}>
                on
              </label>
              <input
                id={`${id}-on`}
                className="field-input qa-repeat__text"
                data-testid="qa-repeat-on"
                autoComplete="off"
                spellCheck={false}
                placeholder={defaultOn(draft.unit, anchor)}
                title={draft.unit === "month" ? "Days of the month: 5 · 1, 15 · last · first mon" : "Weekdays: mon · mon, thu"}
                value={draft.on}
                aria-invalid={bad("on")}
                onChange={(e) => set({ on: e.target.value })}
              />
            </span>
          ) : null}
        </div>
      </div>
      <div className="qa-repeat__row">
        <div className="qa-repeat__group">
          <label className="qa-field__label qa-repeat__label" htmlFor={`${id}-lead`}>
            Early
          </label>
          <input
            id={`${id}-lead`}
            className="field-input qa-repeat__count"
            data-testid="qa-repeat-lead"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            title="Days early it shows in Today"
            value={draft.lead}
            aria-invalid={bad("lead")}
            onChange={(e) => set({ lead: e.target.value })}
          />
          <span className="qa-repeat__unit">days</span>
        </div>
        <div className="qa-repeat__group qa-repeat__group--grow">
          <label className="qa-field__label qa-repeat__inline-label" htmlFor={`${id}-start`}>
            Start
          </label>
          <input
            id={`${id}-start`}
            className="field-input qa-repeat__text"
            data-testid="qa-repeat-start"
            autoComplete="off"
            spellCheck={false}
            placeholder="today"
            value={draft.start}
            aria-invalid={bad("start")}
            onChange={(e) => set({ start: e.target.value })}
          />
        </div>
        <div className="qa-repeat__group qa-repeat__group--grow">
          <label className="qa-field__label qa-repeat__inline-label" htmlFor={`${id}-end`}>
            End
          </label>
          <input
            id={`${id}-end`}
            className="field-input qa-repeat__text"
            data-testid="qa-repeat-end"
            autoComplete="off"
            spellCheck={false}
            placeholder="never"
            value={draft.end}
            aria-invalid={bad("end")}
            onChange={(e) => set({ end: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
