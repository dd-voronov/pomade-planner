import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { ParentList } from "./ParentList";
import { Popover } from "../core/Popover";
import { PrioritySelect } from "./PrioritySelect";
import type { ColumnDef } from "./model/areas";
import { normalizeTitle } from "../core/text";
import { DEFAULT_PRIORITY, DEFAULT_SOURCE, KIND_NAME } from "./model/create";
import { parentCandidates } from "./model/parents";
import type { Rect } from "../core/place";
import { PARENT_KIND, type Kind, type Ticket } from "./model/ticket";

export interface CreateValues {
  kind: Kind;
  title: string;
  parent: string | null;
  priority: string;
  source: string;
}

interface CreateFormProps {
  anchor: Rect;
  align: "start" | "end";
  column: ColumnDef;
  /** What may be created here (`creatableKinds`); the first is preselected unless `initialKind` says otherwise. */
  kinds: readonly Kind[];
  initialKind?: Kind | undefined;
  /** The backlog's tickets, for the parent picker. */
  tickets: readonly Ticket[];
  /** The ID each kind would get now; the create re-checks it. */
  nextIds: Record<Kind, string>;
  /** Resolves to an error text, or `null` once the ticket is created. */
  onSubmit: (values: CreateValues) => Promise<string | null>;
  onClose: () => void;
  restoreFocus: () => void;
}

/** The **+** form ([[editing-drag-create]] "Create"): kind, title, parent, priority, and on Signals the source. */
export function CreateForm({ anchor, align, column, kinds, initialKind, tickets, nextIds, onSubmit, onClose, restoreFocus }: CreateFormProps) {
  const [kind, setKind] = useState<Kind>(initialKind !== undefined && kinds.includes(initialKind) ? initialKind : (kinds[0] ?? "task"));
  const [title, setTitle] = useState("");
  const [parent, setParent] = useState<string | null>(null);
  const [priority, setPriority] = useState(DEFAULT_PRIORITY);
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);

  const parentKind = PARENT_KIND[kind];
  const candidates = useMemo(() => parentCandidates(tickets, kind), [tickets, kind]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    const clean = normalizeTitle(title);
    if (clean === "") {
      setError("Give it a title.");
      titleInput.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const failed = await onSubmit({ kind, title: clean, parent, priority, source });
    if (failed !== null) {
      setBusy(false);
      setError(failed);
    }
  };

  // Enter submits from any field, radios included; a button keeps its own Enter.
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Enter" || e.defaultPrevented || e.nativeEvent.isComposing) return;
    if (e.target instanceof HTMLButtonElement) return;
    e.preventDefault();
    void submit();
  };

  const name = KIND_NAME[kind].toLowerCase();
  return (
    <Popover anchor={anchor} align={align} label={`New ${name}`} testId="create-form" className="popover--form" onClose={onClose} restoreFocus={restoreFocus}>
      <form ref={form} className="pop-form" onSubmit={(e) => void submit(e)} onKeyDown={onKeyDown} noValidate>
        <header className="pop-form__head">
          <span className="pop-form__title">New {name}</span>
          <span className="pop-form__meta" data-testid="create-preview">
            <span className="pop-form__id">{nextIds[kind]}</span> · {column.label}
          </span>
        </header>

        {kinds.length > 1 ? (
          <div className="pop-field">
            <span className="pop-field__label" id="create-kind-label">
              Kind
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby="create-kind-label" data-testid="kind-select">
              {kinds.map((k) => (
                <label key={k} className="segmented__option">
                  <input
                    type="radio"
                    name="create-kind"
                    value={k}
                    checked={kind === k}
                    disabled={busy}
                    data-testid={`kind-${k}`}
                    onChange={() => {
                      setKind(k);
                      setParent(null);
                    }}
                  />
                  <span>{KIND_NAME[k]}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <label className="pop-field">
          <span className="pop-field__label">Title</span>
          <input
            ref={titleInput}
            className="field-input"
            type="text"
            data-autofocus=""
            data-testid="create-title"
            placeholder={kind === "signal" ? "What was observed" : `What the ${name} is about`}
            value={title}
            disabled={busy}
            aria-invalid={error !== null && normalizeTitle(title) === ""}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error !== null) setError(null);
            }}
          />
        </label>

        {parentKind !== null ? (
          <div className="pop-field" data-testid="create-parent">
            <span className="pop-field__label">
              {KIND_NAME[parentKind]} <span className="pop-field__hint">optional</span>
            </span>
            <ParentList key={kind} candidates={candidates} value={parent} mode="follow" onChange={setParent} label={KIND_NAME[parentKind]} disabled={busy} />
          </div>
        ) : null}

        <div className="pop-field">
          <span className="pop-field__label">Priority</span>
          <PrioritySelect value={priority} onChange={setPriority} disabled={busy} />
        </div>

        {kind === "signal" ? (
          <label className="pop-field">
            <span className="pop-field__label">Source</span>
            <input
              className="field-input"
              type="text"
              data-testid="create-source"
              placeholder={DEFAULT_SOURCE}
              value={source}
              disabled={busy}
              onChange={(e) => setSource(e.target.value)}
            />
          </label>
        ) : null}

        {error !== null ? (
          <p className="pop-form__error" role="alert" data-testid="create-error">
            {error}
          </p>
        ) : null}

        <footer className="pop-form__actions">
          <button type="button" className="btn btn--ghost" data-testid="create-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" data-testid="create-submit" disabled={busy}>
            {busy ? "Creating…" : `Create ${name}`}
          </button>
        </footer>
      </form>
    </Popover>
  );
}
