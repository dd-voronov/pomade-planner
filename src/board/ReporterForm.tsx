import { useState, type FormEvent } from "react";

import { Popover } from "../core/Popover";
import type { Rect } from "../core/place";
import { DEFAULT_REPORTER } from "./model/settings";

interface ReporterFormProps {
  anchor: Rect;
  /** The handle the settings file holds now. */
  initial: string;
  /** Saves the typed handle; resolves to an error text, or `null` once it is saved. */
  onSave: (typed: string) => Promise<string | null>;
  onClose: () => void;
  restoreFocus: () => void;
}

/** ⋯ → "Reporter for new tickets…" ([[editing-drag-create]] "Create"): the handle the Board writes as `reporter:`. */
export function ReporterForm({ anchor, initial, onSave, onClose, restoreFocus }: ReporterFormProps) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const failed = await onSave(value);
    if (failed !== null) {
      setBusy(false);
      setError(failed);
    }
  };

  return (
    <Popover anchor={anchor} align="end" label="Reporter for new tickets" testId="reporter-form" className="popover--form" onClose={onClose} restoreFocus={restoreFocus}>
      <form className="pop-form" onSubmit={(e) => void submit(e)} noValidate>
        <header className="pop-form__head">
          <span className="pop-form__title">Reporter for new tickets</span>
        </header>
        <label className="pop-field">
          <span className="pop-field__label">Handle</span>
          <input
            className="field-input"
            type="text"
            data-autofocus=""
            data-testid="reporter-input"
            placeholder={DEFAULT_REPORTER}
            spellCheck={false}
            autoComplete="off"
            value={value}
            disabled={busy}
            aria-invalid={error !== null}
            onChange={(e) => {
              setValue(e.target.value);
              if (error !== null) setError(null);
            }}
          />
          <span className="pop-field__hint">
            Written as <code>reporter:</code> on each ticket the Board creates. Left empty, it is {DEFAULT_REPORTER}.
          </span>
        </label>
        {error !== null ? (
          <p className="pop-form__error" role="alert" data-testid="reporter-error">
            {error}
          </p>
        ) : null}
        <footer className="pop-form__actions">
          <button type="button" className="btn btn--ghost" data-testid="reporter-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" data-testid="reporter-save" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </footer>
      </form>
    </Popover>
  );
}
