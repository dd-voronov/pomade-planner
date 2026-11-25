import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { getBody } from "pomade-kit/frontmatter";
import type { HostClient } from "pomade-kit/sdk";
import type { LocalDate, Time } from "pomade-kit/schedule";

import type { Clock } from "./clock";
import { ItemFields, KIND_META } from "./ItemFields";
import { checkDraft, type ItemDraft } from "./model/item-draft";
import { bodyWith, detailsChanged, isDirty, isEmptyEdit, itemEdit, itemFile, logEntries, settleDraft, type ItemFile } from "./model/item-edit";
import type { PlannerType, Task } from "./model/items";
import { displayTitle, longDate, shortDate } from "./model/labels";
import { recurringState, type LogWord } from "./model/recurring";
import { OpenInTabGlyph } from "./OpenInTabGlyph";
import { PinGlyph } from "./TaskRow";
import { useItemFile, type ItemVersion, type WriteOutcome } from "./useItemFile";
import { archiveItem, completeRecurring, resolveThought, restoreItem, saveBody, saveItemEdit, tickTask } from "./write";
import "./item-pane.css";

/** How long after the last keystroke in Details its text is written. */
export const DETAILS_SAVE_MS = 600;

const TYPE_NAMES: Record<PlannerType, string> = { task: "Task", recurring: "Recurring task", note: "Note", thought: "Thought", "daily-note": "Daily note" };

const CHANGED = "The file changed on disk — nothing was written over it. This is the file as it is now.";

/** The draft typed over `version`: the version as the file's form, and what the draft's fields come to now. */
function typedOver(version: ItemVersion, typed: ItemDraft | null, clock: Clock, boundary: Time) {
  if (typed === null) return null;
  const at = clock.now();
  return { typed, file: itemFile(version.task, getBody(version.content), at, boundary), check: checkDraft(typed, at, boundary) };
}

function CloseGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function BackGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M9.5 3.5L5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg className="task-check__glyph" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.5 6.3l2.3 2.3L9.5 3.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The Planner tab with an item's compact view beside its lists: the lists keep the room the view
 * leaves; in a tab too narrow for both, the view takes the lists' place (item-pane.css).
 */
export function ItemSplit({ splitRef, pane, children }: { splitRef: RefObject<HTMLDivElement>; pane: ReactNode; children: ReactNode }) {
  return (
    <div ref={splitRef} className="planner-split">
      {children}
      {pane}
    </div>
  );
}

interface ItemPaneProps {
  host: HostClient;
  clock: Clock;
  boundary: Time;
  day: LocalDate;
  root: string;
  /** The open item as the Planner's folder read lists it; `null` while no read does (its file just moved, or is gone). */
  task: Task | null;
  /** Bumped when the open item is asked for again: the view takes the focus. */
  asks: number;
  /** The item's pin on the view that lists it; absent: the view doesn't. */
  pin: { pinned: boolean; onToggle: () => void; label: string } | undefined;
  reload: () => Promise<void>;
  /** Close the view; the focus goes back to the item's row. */
  onClose: () => void;
  onOpenInTab: (path: string) => void;
  /** This view moved the file (Archive, Restore). */
  onMoved: (from: string, to: string) => void;
  /** A write that failed after the view closed. */
  onError: (message: string) => void;
}

/**
 * An item's compact view in the Planner tab ([[item-in-place]]): its type, the
 * row's own actions, **Open in tab**, then the title, the type's fields and Details (the add
 * form's `ItemFields`, editing), a recurring item's log, and a foot naming the file and what was
 * saved. Nothing has a save button: a field is written when it is committed (Enter, or the focus
 * leaving it), Details shortly after typing stops, and both when the view closes — each a
 * field-only or body-only write over the version the view read (`useItemFile`). A file that
 * changed elsewhere shows as it is; what was typed over the older version is not written, and the
 * view says so.
 */
export function ItemPane({ host, clock, boundary, day, root, task, asks, pin, reload, onClose, onOpenInTab, onMoved, onError }: ItemPaneProps) {
  const file = useItemFile(host, task, reload);
  const now = clock.now();
  /** The file version the form shows, and the draft typed over it. */
  const [shown, setShown] = useState<{ version: ItemVersion; file: ItemFile } | null>(null);
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; tone: "muted" | "accent" | "danger" } | null>(null);
  /** A tick shown before its write lands. */
  const [ticked, setTicked] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(0);

  // A new version of the file: after this view's own write what is being typed stays; a change made elsewhere shows as it is.
  if (file.version !== null && file.version !== shown?.version) {
    const next = itemFile(file.version.task, getBody(file.version.content), now, boundary);
    if (shown === null || draft === null) setDraft(next.draft);
    else if (file.version.own) setDraft(settleDraft(draft, next, now, boundary));
    else {
      if (isDirty(draft, shown.file)) setNotice(CHANGED);
      setDraft(next.draft);
    }
    setShown({ version: file.version, file: next });
    setTicked(null);
  }

  const latest = useRef({ draft, clock, boundary, onError, onMoved });
  useLayoutEffect(() => {
    latest.current = { draft, clock, boundary, onError, onMoved };
  });
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const { write } = file;
  /** Run a write in the view's queue and say how it went — in the view, or once it has closed through `onError`. */
  const run = useCallback(
    (op: (version: ItemVersion) => Promise<void> | null, saved: string | null = "Saved"): Promise<WriteOutcome> => {
      let writing = false;
      const counted = (version: ItemVersion) => {
        const started = op(version);
        if (started !== null && mounted.current) {
          writing = true;
          setBusy((n) => n + 1);
        }
        return started;
      };
      return write(counted).then((outcome) => {
        if (!mounted.current) {
          if (outcome.kind === "error") latest.current.onError(outcome.message);
          else if (outcome.kind === "stale") latest.current.onError("The file changed on disk — what was typed in its view was not saved.");
          return outcome;
        }
        if (writing) setBusy((n) => n - 1);
        if (outcome.kind === "stale") setNotice(CHANGED);
        else if (outcome.kind === "error") setStatus({ text: outcome.message, tone: "danger" });
        else if (outcome.kind === "saved" && saved !== null) setStatus({ text: saved, tone: "muted" });
        return outcome;
      });
    },
    [write],
  );

  const saveFields = useCallback(
    () =>
      run((version) => {
        const over = typedOver(version, latest.current.draft, latest.current.clock, latest.current.boundary);
        if (over === null) return null;
        const edit = itemEdit(over.file, over.typed, over.check);
        return isEmptyEdit(edit) ? null : saveItemEdit(host, version.task, edit);
      }),
    [run, host],
  );
  const saveDetails = useCallback(
    () =>
      run((version) => {
        const over = typedOver(version, latest.current.draft, latest.current.clock, latest.current.boundary);
        return over === null || !detailsChanged(over.typed, over.file) ? null : saveBody(host, version.task, bodyWith(over.file.parts, over.typed.details));
      }),
    [run, host],
  );

  // Details is written shortly after typing stops.
  const details = draft?.details;
  const detailsTimer = useRef<ReturnType<typeof setTimeout>>();
  const typing = useRef(false);
  useEffect(() => {
    if (!typing.current) return;
    typing.current = false;
    detailsTimer.current = setTimeout(() => void saveDetails(), DETAILS_SAVE_MS);
    return () => clearTimeout(detailsTimer.current);
  }, [details, saveDetails]);

  /** Write what is typed and not yet written, fields then Details. */
  const flush = useCallback(() => {
    clearTimeout(detailsTimer.current);
    void saveFields();
    return saveDetails();
  }, [saveFields, saveDetails]);
  // The view closes: what is typed is written.
  useEffect(() => () => void flush(), [flush]);

  // A select's choice is a commit of its own.
  const [commits, setCommits] = useState(0);
  useEffect(() => {
    if (commits > 0) void saveFields();
  }, [commits, saveFields]);

  const pane = useRef<HTMLElement>(null);
  const ready = shown !== null;
  useEffect(() => {
    if (ready) pane.current?.focus();
  }, [ready, asks]);
  // A control that leaves the view while it holds the focus (the pin of a card just unpinned) hands the focus to the view.
  const holdsFocus = useRef(false);
  useEffect(() => {
    if (holdsFocus.current && document.activeElement === document.body) pane.current?.focus();
  });

  if (shown === null || draft === null) {
    return file.error === null ? null : (
      <aside className="item-pane" data-testid="item-pane" aria-label="Item">
        <p className="item-pane__notice" role="alert" data-testid="item-error">
          {file.error}
        </p>
      </aside>
    );
  }

  const item = shown.file.task;
  const check = checkDraft(draft, now, boundary);
  const recurring = item.type === "recurring";
  const state = recurring ? recurringState(item, day) : null;
  const saving = busy > 0;
  const locked = !recurring || item.archived ? undefined : item.repeat?.kind !== "ok" ? "Fix the repeat rule first — open the file" : state?.phase === "ended" ? "Ended — change end or do-on in the file to bring it back" : undefined;
  const done = ticked ?? item.done;
  const title = displayTitle(item, day);
  const entries = logEntries(shown.file.parts);

  const change = (next: ItemDraft) => {
    if (next.details !== draft.details) typing.current = true;
    setDraft(next);
    setNotice(null);
    setStatus(null);
  };

  /** One of the row's own actions: what is typed is written first, then the action, over the version that leaves. */
  const act = (op: (version: ItemVersion) => Promise<void>, saved: string | null = null) => {
    void flush();
    return run(op, saved);
  };
  const tick = (to: boolean) => {
    setTicked(to);
    void act((v) => (v.task.type === "thought" ? resolveThought(host, v.task, to, day) : tickTask(host, v.task, to, day))).then((o) => o.kind !== "saved" && setTicked(null));
  };
  const complete = (word: LogWord) => {
    const label = word === "done" ? "Done" : "Skipped";
    void act(async (v) => {
      const next = await completeRecurring(host, v.task, word, day);
      const end = v.task.repeat?.kind === "ok" ? v.task.repeat.schedule.end : null;
      const ended = next === null || (end !== null && next > end);
      if (mounted.current) setStatus({ text: `${label} · ${ended ? "ended" : `next ${shortDate(next, day)}`}`, tone: "accent" });
    });
  };
  const move = () => {
    void act(async (v) => {
      const to = await (v.task.archived ? restoreItem(host, root, v.task) : archiveItem(host, root, v.task));
      latest.current.onMoved(v.task.path, to);
    });
  };

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLTextAreaElement) {
      clearTimeout(detailsTimer.current);
      void saveDetails();
    } else if (e.target instanceof HTMLInputElement) void saveFields();
  };
  const onFieldKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement) || e.nativeEvent.isComposing || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    void saveFields();
  };
  const onFieldChange = (e: FormEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLSelectElement) setCommits((n) => n + 1);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    e.preventDefault();
    onClose();
  };

  const checkable = (item.type === "task" || recurring) && !item.archived;
  const tickBox = checkable ? (
    <label className={`task-check item-pane__check${locked !== undefined ? " task-check--locked" : ""}`} data-tip={locked}>
      <input
        type="checkbox"
        checked={recurring ? false : done}
        disabled={locked !== undefined || (recurring && saving)}
        data-testid="item-check"
        aria-label={recurring ? "Done this time" : "Done"}
        onChange={(e) => (recurring ? complete("done") : tick(e.target.checked))}
      />
      <span className={`task-check__box${recurring ? " task-check__box--recurring" : ""}`}>
        <CheckGlyph />
      </span>
    </label>
  ) : null;

  const repeat = check.repeat;
  const info =
    recurring && shown.file.repeatEditable ? (
      repeat.kind === "ok" ? (
        <span className="qa__repeat" data-testid="item-repeat" title={repeat.description}>
          <span className="qa__repeat-rule">{repeat.description}</span>
          {state?.next != null ? <span className="qa__repeat-first">{` · next ${longDate(state.next, day)}`}</span> : null}
        </span>
      ) : (
        <span className="qa__error qa__error--line" role="alert" data-testid="item-repeat-error" title={repeat.message}>
          {repeat.message}
        </span>
      )
    ) : item.problems.length > 0 ? (
      <span className="item-pane__problems" data-testid="item-problems">
        {item.problems.join("; ")}
      </span>
    ) : null;

  return (
    <aside
      ref={pane}
      className="item-pane"
      data-testid="item-pane"
      data-path={item.path}
      data-type={item.type}
      tabIndex={-1}
      aria-label={`${TYPE_NAMES[item.type]}: ${title}`}
      aria-busy={saving}
      onKeyDown={onKeyDown}
      onFocus={() => {
        holdsFocus.current = true;
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) holdsFocus.current = false;
      }}
    >
      <header className="item-pane__head">
        <button type="button" className="icon-btn item-pane__back" aria-label="Back to the list" data-tip="Back to the list (Esc)" data-testid="item-back" onClick={onClose}>
          <BackGlyph />
        </button>
        <span className="item-pane__type" data-testid="item-type">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            {KIND_META[item.type].glyph}
          </svg>
          <span className="item-pane__type-name">{TYPE_NAMES[item.type]}</span>
          {item.archived ? <span className="hint hint--chip hint--muted">archived</span> : item.done ? <span className="hint hint--chip hint--muted">{item.type === "thought" ? "resolved" : "done"}</span> : null}
        </span>
        <span className="item-pane__actions">
          {item.archived ? (
            <button type="button" className="btn btn--sm btn--ghost" data-testid="item-restore" data-tip="Move it back out of _archive/" onClick={move}>
              Restore
            </button>
          ) : item.type === "note" ? (
            <button type="button" className="btn btn--sm btn--ghost" data-testid="item-archive" data-tip="Move it into _archive/ — All shows it with “Show archived”" onClick={move}>
              Archive
            </button>
          ) : item.type === "thought" ? (
            <button type="button" className="btn btn--sm btn--ghost" data-testid={done ? "item-reopen" : "item-resolve"} data-tip={done ? "Set it open again" : "Mark it resolved — status: resolved, done-on today"} onClick={() => tick(!done)}>
              {done ? "Reopen" : "Resolve"}
            </button>
          ) : recurring ? (
            <button type="button" className="btn btn--sm btn--ghost" data-testid="item-skip" aria-label="Skip this time" data-tip="Skip this time — logs “skipped” and moves to the next date" disabled={locked !== undefined || saving} onClick={() => complete("skipped")}>
              Skip
            </button>
          ) : null}
          {pin !== undefined ? (
            <button type="button" className="icon-btn" data-testid="item-pin" aria-pressed={pin.pinned} aria-label={pin.pinned ? "Unpin" : "Pin"} data-tip={pin.label} onClick={pin.onToggle}>
              <PinGlyph filled={pin.pinned} size={14} />
            </button>
          ) : null}
          <button type="button" className="btn btn--sm btn--ghost item-pane__open" data-testid="item-open-tab" onClick={() => onOpenInTab(item.path)}>
            <OpenInTabGlyph size={14} />
            Open in tab
          </button>
          <button type="button" className="icon-btn item-pane__close" aria-label="Close" data-tip="Close (Esc)" data-testid="item-close" onClick={onClose}>
            <CloseGlyph />
          </button>
        </span>
      </header>
      {notice !== null ? (
        <p className="item-pane__notice" role="status" data-testid="item-notice">
          <span>{notice}</span>
          <button type="button" className="icon-btn" aria-label="Dismiss" data-tip="Dismiss" onClick={() => setNotice(null)}>
            <CloseGlyph />
          </button>
        </p>
      ) : null}
      <div className="item-pane__body">
        <div className="qa item-pane__form" data-testid="item-form" data-kind={item.type} onBlur={onBlur} onKeyDown={onFieldKeys} onChange={onFieldChange}>
          <ItemFields
            draft={draft}
            onChange={change}
            check={check}
            groups={[]}
            chosen={null}
            picking={null}
            onPicking={() => undefined}
            titleInvalid={false}
            edit={{ titlePlaceholder: title, repeatText: recurring && !shown.file.repeatEditable ? repeatText(item) : null, beforeTitle: tickBox }}
          />
        </div>
        {entries.length > 0 ? (
          <section className="item-pane__log" aria-label="Log" data-testid="item-log">
            <h3 className="item-pane__log-title">Log</h3>
            <ul className="item-pane__log-list">
              {entries.map((entry, i) => (
                <li key={`${entry.date}:${String(i)}`} data-testid="item-log-entry">
                  <span className="item-pane__log-date">{shortDate(entry.date, day)}</span>
                  {entry.text}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      <footer className="item-pane__foot">
        {info}
        <span className="item-pane__where">
          <bdi className="item-pane__path" title={item.path} data-testid="item-path">
            {item.path}
          </bdi>
          {status !== null || saving ? (
            <span className={`item-pane__status item-pane__status--${saving ? "muted" : (status?.tone ?? "muted")}`} role="status" data-testid="item-status">
              {saving ? "Saving…" : status?.text}
            </span>
          ) : null}
        </span>
      </footer>
    </aside>
  );
}

/** A recurring item's rule the repeat editor can't hold: the kit's words (or why it can't be read), and where to change it. */
function repeatText(item: Task): string {
  if (item.repeat === null) return "";
  return item.repeat.kind === "ok" ? `Repeats ${item.repeat.description}. Change this rule in the file — Open in tab.` : `${item.repeat.message}. Fix the rule in the file — Open in tab.`;
}
