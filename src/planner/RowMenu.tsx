import { Fragment, useEffect, useState, type KeyboardEvent, type MouseEvent } from "react";

import { Popover } from "../core/Popover";
import type { Rect } from "../core/place";
import { ROW_MENU_LABELS, type RowMenuEntry } from "./model/row-menu";
import type { RowFailure, SelectableRow } from "./model/selection";

/** Open a row's menu at `anchor` (the pointer, or the row); `focusRow` gives the focus back to the row. */
export type RowMenuTrigger = (anchor: Rect, focusRow: () => void) => void;

/** A row's menu as it opens: where, for which row, and each entry with what picking it does. */
export interface RowMenuAsk {
  anchor: Rect;
  /** The row's file. */
  path: string;
  title: string;
  items: readonly { entry: RowMenuEntry; onPick: () => void }[];
  focusRow: () => void;
}

/**
 * What opens a row's menu: a right-click (at the pointer), and the context-menu key or Shift+F10
 * on the focused row (under the row). Nothing without a trigger (select mode).
 */
export function rowMenuHandlers(menu: RowMenuTrigger | undefined, focusRow: () => void) {
  if (menu === undefined) return {};
  return {
    onContextMenu: (e: MouseEvent<HTMLElement>) => {
      e.preventDefault();
      menu({ left: e.clientX, top: e.clientY, width: 0, height: 0 }, focusRow);
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key !== "ContextMenu" && !(e.key === "F10" && e.shiftKey)) return;
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      menu({ left: r.left, top: r.top, width: r.width, height: r.height }, focusRow);
    },
  };
}

/** ↑ ↓ move between the items (round), Home and End go to the first and the last. */
function onItemKey(e: KeyboardEvent<HTMLButtonElement>) {
  const items = [...(e.currentTarget.closest('[role="menu"]')?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
  const at = items.indexOf(e.currentTarget);
  const to = e.key === "ArrowDown" ? (at + 1) % items.length : e.key === "ArrowUp" ? (at - 1 + items.length) % items.length : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : null;
  if (to === null) return;
  e.preventDefault();
  items[to]?.focus();
}

/**
 * A row's right-click menu ([[views]] "Rows"): the shared popover as a menu, in Pomade's menu
 * look — Open in tab, the pin, the row's actions, a separator, then Delete… in the danger colour.
 * A pick closes it and the focus goes back to the row.
 */
export function RowMenu({ ask, onClose }: { ask: RowMenuAsk; onClose: () => void }) {
  return (
    <Popover anchor={ask.anchor} role="menu" label={ask.title} testId="row-menu" className="popover--menu" onClose={onClose} restoreFocus={ask.focusRow}>
      {ask.items.map(({ entry, onPick }) => (
        <Fragment key={entry}>
          {entry === "delete" ? <div className="menu__separator" role="separator" /> : null}
          <button
            type="button"
            role="menuitem"
            className={`menu__item${entry === "delete" ? " menu__item--danger" : ""}`}
            data-testid={`row-menu-${entry}`}
            onKeyDown={onItemKey}
            onClick={() => {
              onClose();
              onPick();
            }}
          >
            {ROW_MENU_LABELS[entry]}
          </button>
        </Fragment>
      ))}
    </Popover>
  );
}

/** The delete a row's menu asked for: the row, and where the focus goes back. */
interface RowDelete {
  row: SelectableRow;
  focusRow: () => void;
  busy: boolean;
}

/**
 * A row's menu and its Delete…: the menu open, the question asked (select mode's `DeleteConfirm`
 * for one row), a delete under way, and the row a failed delete left with its reason. A context
 * switch drops them all.
 */
export function useRowMenu(contextId: string) {
  const [menu, setMenu] = useState<RowMenuAsk | null>(null);
  const [deleting, setDeleting] = useState<RowDelete | null>(null);
  const [failures, setFailures] = useState<ReadonlyMap<string, RowFailure>>(new Map());
  useEffect(() => {
    setMenu(null);
    setDeleting(null);
    setFailures(new Map());
  }, [contextId]);
  return {
    menu,
    open: setMenu,
    close: () => setMenu(null),
    deleting,
    failures,
    askDelete: (row: SelectableRow, focusRow: () => void) => {
      setFailures(new Map());
      setDeleting({ row, focusRow, busy: false });
    },
    cancel: () => {
      deleting?.focusRow();
      setDeleting(null);
    },
    start: () => setDeleting((d) => (d === null ? d : { ...d, busy: true })),
    /** The delete is done: the question closes; a file that stayed says why on its row, which takes the focus. */
    settle: (failed: readonly RowFailure[]) => {
      if (failed.length > 0) deleting?.focusRow();
      setDeleting(null);
      setFailures(new Map(failed.map((f) => [f.path, f])));
    },
  };
}
