import { useEffect, useMemo, useRef, useState, type FocusEvent, type FormEvent, type KeyboardEvent } from "react";
import type { HostClient } from "pomade-kit/sdk";
import type { Time } from "pomade-kit/schedule";

import type { Clock } from "./clock";
import { dailyNotePath } from "./model/daily";
import { checkDraft, draftItem, newDraft, type ItemDraft, type ItemKind } from "./model/item-draft";
import { longDate } from "./model/labels";
import { pickerGroups, type PickerProject } from "./model/picker";
import { folderForNew, type FolderMap } from "./model/projects";
import { plannerDay } from "./model/today";
import { ItemFields, KIND_META } from "./ItemFields";
import type { ProjectList } from "./useProjects";
import { createDailyNote, createTask, saveProjectFolders, WriteError } from "./write";

/** What the form made: the file, and the item as it was typed. */
export interface Added {
  path: string;
  kind: ItemKind;
  title: string;
}

interface AddFormProps {
  host: HostClient;
  clock: Clock;
  root: string;
  boundary: Time;
  /** Pomade's projects, for the project field. */
  projects: ProjectList;
  /** The project-id → folder map. */
  folders: FolderMap;
  /** The daily-note template (settings); `null`: the built-in one. */
  template: string | null;
  /** Where the form stands: Pomade's overlay frame, which it fills, or in a list, as tall as its fields. */
  placement: "overlay" | "inline";
  /** The project the form starts on — the active one; `null` at Workspace. Followed until the field is changed. */
  initialProject: { id: string; name: string } | null;
  /** The type the form starts on. */
  initialKind: ItemKind;
  /** `do-on` as the form opens: "today" from a Today view, else empty. */
  initialDoOn: string;
  /** The item was added; `open`: it was asked to be opened (a daily note always is). */
  onAdded: (added: Added, open: boolean) => Promise<void> | void;
  /** Escape in a form that closes itself (in a list); the overlay's Escape is Pomade's. */
  onCancel?: () => void;
  testId: string;
}

/**
 * The form that adds an item (DESIGN §3.7): in the overlay of the Pomade-wide shortcut, and in
 * place at the foot of a Planner list. A head naming the type and the folder the item goes into,
 * the item's fields (`ItemFields`), and a foot: what stops the add or a recurring item's rule, and
 * the keys (in the overlay's one line the first takes the place of the second). Enter adds the item
 * into the project's folder (in Details, where Enter is a new line, ⌘↵ does); ⇧⌘↵ adds it and
 * opens it.
 */
export function AddForm({ host, clock, root, boundary, projects, folders, template, placement, initialProject, initialKind, initialDoOn, onAdded, onCancel, testId }: AddFormProps) {
  const initialId = initialProject?.id ?? null;
  const [draft, setDraft] = useState<ItemDraft>(() => newDraft({ kind: initialKind, project: initialId, doOn: initialDoOn }));
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) setDraft((d) => (d.project === initialId ? d : { ...d, project: initialId }));
  }, [initialId]);
  const [picking, setPicking] = useState<{ query: string } | null>(null);
  const [error, setError] = useState<{ field: "title" | "fields" | "write"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [inDetails, setInDetails] = useState(false);

  // Phrases resolve against the planner day as they are typed (every keystroke renders).
  const now = clock.now();
  const check = checkDraft(draft, now, boundary);
  const { kind } = draft;
  const recurring = kind === "recurring";
  const daily = kind === "daily-note";
  const repeat = check.repeat;

  const list = projects.status === "ready" ? projects.projects : [];
  const groups = useMemo(() => (projects.status === "ready" ? pickerGroups(projects.groups, projects.projects) : []), [projects]);
  const chosen: PickerProject | null =
    draft.project === null ? null : (list.find((p) => p.id === draft.project) ?? (initialProject?.id === draft.project ? { id: draft.project, name: initialProject.name, groupId: null, groupPath: [] } : null));
  const target = chosen === null ? null : folderForNew(chosen, folders);
  const where = daily ? dailyNotePath(root, check.day) : `${root === "" ? "" : `${root}/`}${target === null ? "" : `${target.folder}/`}`;

  const change = (next: ItemDraft) => {
    if (next.project !== draft.project) touched.current = true;
    setDraft(next);
    setError(null);
  };

  const submit = async (open: boolean) => {
    if (busy) return;
    const created = plannerDay(clock.now(), boundary);
    if (daily) {
      setBusy(true);
      setError(null);
      try {
        const { path } = await createDailyNote(host, root, created, template);
        await onAdded({ path, kind, title: "" }, true);
      } catch (e) {
        setError({ field: "write", message: e instanceof WriteError ? e.message : `Couldn't open it: ${e instanceof Error ? e.message : String(e)}.` });
        setBusy(false);
      }
      return;
    }
    const made = draftItem(draft, check, created);
    if (made.kind === "error") {
      setError(made);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const path = await createTask(host, root, target?.folder ?? null, made.item);
      // A project's first item made its folder: the map now names it (a failed save is caught up by the next reconciliation).
      if (chosen !== null && target?.isNew) await saveProjectFolders(host, { [chosen.id]: target.entry }).catch(() => undefined);
      await onAdded({ path, kind, title: made.item.title }, open);
    } catch (e) {
      setError({ field: "write", message: e instanceof WriteError ? e.message : `Couldn't add it: ${e instanceof Error ? e.message : String(e)}.` });
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(false);
  };
  // Enter adds from any field but Details (a form of several fields has no implicit submission
  // without a submit button), ⌘↵ from Details too; ⇧⌘↵ adds and opens. Not while an input method
  // is composing. Escape closes a form that closes itself.
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (picking !== null || e.nativeEvent.isComposing || e.altKey) return;
    if (e.key === "Escape" && onCancel !== undefined) {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key !== "Enter") return;
    const command = e.metaKey || e.ctrlKey;
    if (!command && (e.shiftKey || e.target instanceof HTMLTextAreaElement)) return;
    e.preventDefault();
    void submit(command && e.shiftKey);
  };
  const onFocus = (e: FocusEvent<HTMLFormElement>) => setInDetails(e.target instanceof HTMLTextAreaElement);

  /** What stops the add, or a recurring item's rule in the kit's words with its first date. */
  const status =
    error !== null && !(recurring && repeat.kind === "error") ? (
      <span className="qa__error" role="alert" data-testid="qa-error">
        {error.message}
      </span>
    ) : !recurring ? null : repeat.kind === "ok" ? (
      <span className="qa__repeat" data-testid="qa-repeat-description" title={`${repeat.description} · first ${longDate(repeat.doOn, check.day)}`}>
        <span className="qa__repeat-rule">{repeat.description}</span>
        <span className="qa__repeat-first" data-testid="qa-repeat-first">
          {`\u00a0· first ${longDate(repeat.doOn, check.day)}`}
        </span>
      </span>
    ) : (
      <span className="qa__error qa__error--line" role={error !== null ? "alert" : undefined} data-testid="qa-repeat-error" title={repeat.message}>
        {repeat.message}
      </span>
    );
  const keys =
    picking !== null ? (
      <span className="qa__keys">
        <span>
          <kbd>↵</kbd> choose
        </span>
        <span>
          <kbd>⌫</kbd> back
        </span>
        <span>
          <kbd>esc</kbd> keep {chosen === null ? "no project" : chosen.name}
        </span>
      </span>
    ) : (
      <span className="qa__keys" data-testid="qa-keys">
        {daily ? (
          <span>
            <kbd>↵</kbd> open today&apos;s note
          </span>
        ) : (
          <>
            <span>
              <kbd>{inDetails ? "⌘↵" : "↵"}</kbd> add
            </span>
            <span>
              <kbd>⇧⌘↵</kbd> add and open
            </span>
          </>
        )}
        <span>
          <kbd>⌥⇥</kbd> type
        </span>
        <span>
          <kbd>esc</kbd> cancel
        </span>
      </span>
    );
  return (
    <form className={`qa qa--${placement}`} data-testid={testId} data-kind={kind} onSubmit={onSubmit} onKeyDown={onKeyDown} onFocus={onFocus} noValidate aria-busy={busy} aria-label={KIND_META[kind].heading}>
      <div className="qa__head">
        <span className="qa__title">{picking !== null ? "Project" : KIND_META[kind].heading}</span>
        <span className="qa__root" title={where || "the workspace root"} data-testid="qa-where">
          {daily ? where : `in ${where === "" ? "the workspace root" : where}`}
        </span>
      </div>
      <ItemFields draft={draft} onChange={change} check={check} groups={groups} chosen={chosen} picking={picking} onPicking={setPicking} titleInvalid={error?.field === "title"} />
      <div className="qa__foot">
        {status !== null && (placement === "inline" || picking === null) ? status : null}
        {status === null || placement === "inline" || picking !== null ? keys : null}
      </div>
    </form>
  );
}
