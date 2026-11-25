import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { HostClient } from "pomade-kit/sdk";
import type { Time } from "pomade-kit/schedule";

import { errorText } from "../core/host";
import type { QuickAddPrefill } from "../core/views";
import { AddForm, type Added } from "./AddForm";
import type { Clock } from "./clock";
import type { FolderMap } from "./model/projects";
import type { PlannerViewId } from "./model/view-state";
import type { ProjectList } from "./useProjects";

/**
 * Adding in place in the Planner tab ([[quick-add]] "One form, two placements"): one form, opened by the header's **+** or the
 * list's Add button, closed by Escape — focus then returns to what opened it — or by the add itself.
 */
export function useAddInPlace() {
  const [open, setOpen] = useState(false);
  /** What opened the form; gone from the page when it was the Add button the form stands in for. */
  const opener = useRef<HTMLElement | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  /** The Add button held the focus when its foot left the page (an empty view got its first row): the next foot's button takes it. */
  const carried = useRef(false);
  const [refocus, setRefocus] = useState(false);
  useEffect(() => {
    if (!refocus) return;
    setRefocus(false);
    (opener.current?.isConnected ? opener.current : button.current)?.focus();
  }, [refocus]);
  const close = useCallback((focusOpener: boolean) => {
    setOpen(false);
    if (focusOpener) setRefocus(true);
  }, []);
  return {
    isOpen: open,
    button,
    carried,
    open: (from: HTMLElement) => {
      opener.current = from;
      setOpen(true);
    },
    close,
  };
}

export type AddInPlace = ReturnType<typeof useAddInPlace>;

function PlusGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6 2.5v7M2.5 6h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** The Add button of a list's foot: a dashed row under the rows, a centred button under an empty view's text. */
function AddButton({ buttonRef, label, empty, onOpen }: { buttonRef: RefObject<HTMLButtonElement>; label: string; empty: boolean; onOpen: (from: HTMLElement) => void }) {
  return (
    <button ref={buttonRef} type="button" className={empty ? "btn btn--ghost add-foot__button" : "add-foot__row"} data-testid="add-item" onClick={(e) => onOpen(e.currentTarget)}>
      <PlusGlyph />
      {label}
    </button>
  );
}

interface AddFootProps {
  add: AddInPlace;
  host: HostClient;
  clock: Clock;
  root: string;
  boundary: Time;
  projects: ProjectList;
  folders: FolderMap;
  template: string | null;
  /** The context's project; `null` at Workspace. */
  project: { id: string; name: string } | null;
  /** The view the foot stands in. */
  view: PlannerViewId;
  /** What an add from this view starts with. */
  prefill: QuickAddPrefill;
  /** The Add button was pressed: the form opens in place (`add.open`), or elsewhere — the panel's opens the overlay. */
  onOpen: (from: HTMLElement) => void;
  /** Under an empty view's text (a centred button) rather than under a list's rows. */
  empty: boolean;
  /** No Add button (select mode; a surface that adds from its **+** alone); an open form stays. */
  quiet: boolean;
  /** The form added an item (not the day's note): the Planner closes the form and shows the item — `open` (⇧⌘↵): also in its compact view. */
  onAdded: (added: Added, open: boolean) => Promise<void>;
  onError: (message: string) => void;
}

/**
 * The foot of a Planner list: the **Add** button, named for what the view adds, and — in the tab —
 * the add form in its place once it or the header's **+** opened it, scrolled into view and kept there while
 * Details grows. An add closes the form; the Planner then shows the item (`onAdded`).
 */
export function AddFoot({ add, host, clock, root, boundary, projects, folders, template, project, view, prefill, onOpen, empty, quiet, onAdded, onError }: AddFootProps) {
  const foot = useRef<HTMLDivElement>(null);
  const open = add.isOpen;

  useLayoutEffect(() => {
    const form = foot.current?.querySelector("form");
    if (!open || !form) return;
    // A form taller than the list's own height shows the end that is being typed in: Details and the keys under it, else its top.
    const reveal = () => {
      const fits = form.offsetHeight <= (form.closest(".planner__body")?.clientHeight ?? Infinity);
      form.scrollIntoView({ block: fits ? "nearest" : document.activeElement instanceof HTMLTextAreaElement ? "end" : "start" });
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(form);
    return () => observer.disconnect();
  }, [open]);

  // The button under an empty view's text and the one under a list are two: the focus follows from one to the other.
  const { button, carried } = add;
  useLayoutEffect(() => {
    if (carried.current) button.current?.focus();
    carried.current = false;
    // Read as the foot leaves: the button is the one on the page then, not the one it mounted with.
    const focused = () => button.current !== null && document.activeElement === button.current;
    return () => {
      carried.current = focused();
    };
  }, [button, carried]);

  return (
    <div ref={foot} className={`add-foot${empty ? " add-foot--empty" : ""}`} data-testid="add-foot">
      {open ? (
        <AddForm
          host={host}
          clock={clock}
          root={root}
          boundary={boundary}
          projects={projects}
          folders={folders}
          template={template}
          placement="inline"
          initialProject={project}
          initialKind={prefill.kind}
          initialDoOn={prefill.doOn}
          testId="add-form"
          onCancel={() => add.close(true)}
          onAdded={async (item, openIt) => {
            // The day's note opens in an editor tab; any other item asked to open, in its compact view.
            if (item.kind === "daily-note") {
              await host.tabs.openFile({ path: item.path }).catch((e: unknown) => onError(`Couldn't open ${item.path}: ${errorText(e)}`));
              add.close(true);
              return;
            }
            await onAdded(item, openIt);
          }}
        />
      ) : quiet ? null : (
        <AddButton buttonRef={add.button} label={view === "recurring" ? "Add recurring task" : "Add task"} empty={empty} onOpen={onOpen} />
      )}
    </div>
  );
}
