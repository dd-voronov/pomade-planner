import { useEffect, useId, useRef, type KeyboardEvent } from "react";

import { deleteHeading, type SelectableRow } from "./model/selection";

interface DeleteConfirmProps {
  rows: readonly SelectableRow[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * All's delete confirmation ([[trimming]] "Delete"): a modal over the Planner listing every file
 * the delete takes — title and path — and saying where they go. Cancel has the focus, so Enter
 * never deletes by accident; Escape cancels; Tab stays inside.
 */
export function DeleteConfirm({ rows, busy, onCancel, onConfirm }: DeleteConfirmProps) {
  const id = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => cancel.current?.focus(), []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (!busy) onCancel();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), [tabindex='0']") ?? [])];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="dialog-scrim" data-testid="delete-confirm-scrim" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div ref={dialog} className="dialog" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-text`} data-testid="delete-confirm" onKeyDown={onKeyDown}>
        <h2 id={`${id}-title`} className="dialog__title" data-testid="delete-confirm-title">
          {deleteHeading(rows)}
        </h2>
        <p id={`${id}-text`} className="dialog__text">
          {rows.length === 1 ? "It goes" : "They go"} to the macOS Trash — Finder can put {rows.length === 1 ? "it" : "them"} back.
        </p>
        <ul className="dialog__files" data-testid="delete-files" tabIndex={0} aria-label="Files to delete">
          {rows.map((r) => (
            <li key={r.path} className="dialog__file" data-testid="delete-file" data-path={r.path} title={r.path}>
              <span className="dialog__file-title">{r.title}</span>
              <span className="dialog__file-path">
                <bdi>{r.path}</bdi>
              </span>
            </li>
          ))}
        </ul>
        <div className="dialog__buttons">
          <button ref={cancel} type="button" className="btn btn--ghost" data-testid="delete-cancel" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn--danger" data-testid="delete-confirm-button" disabled={busy} onClick={onConfirm}>
            {busy ? "Moving…" : "Move to Trash"}
          </button>
        </div>
      </div>
    </div>
  );
}
