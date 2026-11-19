import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { HostClient } from "pomade-kit/sdk";

import type { Items } from "./model/items";

/** A request from outside the views to open an item (the tab's item route); `n` tells one request from the next. */
export interface ItemAsk {
  path: string;
  n: number;
}

interface OpenItem {
  path: string;
  /** One per opening: a view opened anew starts from the file. */
  id: number;
  /** Bumped when the open item is asked for again: its view takes the focus. */
  asks: number;
  /** The file just moved here: folder reads still to come that may be from before the move. */
  settling: number;
}

/** Where `path` is after `from` (a file, or a folder above it) became `to`; `null`: it didn't move. */
export function movedPath(path: string, from: string, to: string): string | null {
  if (path === from) return to;
  return path.startsWith(`${from}/`) ? `${to}${path.slice(from.length)}` : null;
}

/**
 * The item open in the Planner tab's compact view ([[item-in-place]]): one at
 * a time, by its path (`open`; a path no folder read lists shows nothing). It follows its file — a move this frame made (`moved`) or a rename the
 * watcher reports, of the file or a folder above it — and closes when the file is gone, and when
 * the context changes. Closing gives the focus back to the item's row (`split` is the element the
 * rows are looked up in).
 */
export function useOpenItem(host: HostClient, root: string, items: Items, contextId: string, ask: ItemAsk | undefined, split: RefObject<HTMLElement | null>) {
  const [open, setOpen] = useState<OpenItem | null>(null);
  const ids = useRef(0);
  const paths = useRef(items.tasks);
  useEffect(() => {
    paths.current = items.tasks;
  }, [items]);

  /** Open `path`'s view, or give it the focus again. A file the last folder read doesn't list yet (just added) gets one more read to show up. */
  const show = useCallback((path: string) => {
    const listed = paths.current.some((t) => t.path === path);
    setOpen((o) => (o?.path === path ? { ...o, asks: o.asks + 1 } : { path, id: ++ids.current, asks: 0, settling: listed ? 0 : 1 }));
  }, []);

  const moved = useCallback((from: string, to: string) => {
    setOpen((o) => {
      const next = o === null ? null : movedPath(o.path, from, to);
      return o === null || next === null ? o : { ...o, path: next, settling: 1 };
    });
  }, []);

  const [refocus, setRefocus] = useState<string | null>(null);
  const close = (focusRow: boolean) => {
    if (open !== null && focusRow) setRefocus(open.path);
    setOpen(null);
  };
  useEffect(() => {
    if (refocus === null) return;
    setRefocus(null);
    split.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(refocus)}"] :is(.task-row__main, .daily-card__main)`)?.focus();
  }, [refocus, split]);

  // An ask from outside: opened once.
  const asked = useRef(0);
  useEffect(() => {
    if (ask === undefined || ask.n === asked.current) return;
    asked.current = ask.n;
    show(ask.path);
  }, [ask, show]);

  const context = useRef(contextId);
  useEffect(() => {
    if (context.current === contextId) return;
    context.current = contextId;
    setOpen(null);
  }, [contextId]);

  // Each folder read: a file that is no longer there closes its view — once the read can't be one from before a move.
  useEffect(() => {
    setOpen((o) => {
      if (o === null) return o;
      if (items.tasks.some((t) => t.path === o.path)) return o.settling === 0 ? o : { ...o, settling: 0 };
      return o.settling > 0 ? { ...o, settling: o.settling - 1 } : null;
    });
  }, [items]);

  const isOpen = open !== null;
  useEffect(() => {
    if (!isOpen) return;
    let closed = false;
    let stop: (() => void) | undefined;
    void host.files
      .watch({ path: root, recursive: root !== "" }, (changes) => {
        for (const c of changes) if (c.kind === "rename" && c.oldPath !== undefined) moved(c.oldPath, c.path);
      })
      .then(
        (w) => {
          if (closed) void w.close();
          else stop = () => void w.close();
        },
        () => undefined,
      );
    return () => {
      closed = true;
      stop?.();
    };
  }, [host, root, isOpen, moved]);

  return { open, show, close, moved };
}

export type OpenItemHandle = ReturnType<typeof useOpenItem>;
