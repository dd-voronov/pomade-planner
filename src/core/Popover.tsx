import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { placePopover, type Placement, type Rect } from "./place";

interface PopoverProps {
  /** What it hangs off: an element's rect, or a point (a right-click) as a 0×0 rect. */
  anchor: Rect;
  align?: "start" | "end";
  /** `menu`: a right-click menu, its items `menuitem`s; default a dialog. */
  role?: "dialog" | "menu";
  /** Its accessible name. */
  label: string;
  testId: string;
  className?: string;
  /** Close it: Escape, a click outside, the frame losing the focus, or the caller's own buttons. */
  onClose: () => void;
  /** Where focus goes when it closes (the card, the column's +, the row). */
  restoreFocus: () => void;
  children: ReactNode;
}

const FOCUSABLE = 'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A small dialog or menu anchored to a card, a row or a column header, after Pomade's anchored
 * popovers: a transparent scrim that closes it on a click outside, the panel placed inside the frame
 * (`placePopover`), Tab kept inside, Escape closing it, and focus back where it came from — except
 * when it closes because the frame lost the focus (the window's `blur`), which leaves the focus alone.
 */
export function Popover({ anchor, align = "start", role = "dialog", label, testId, className, onClose, restoreFocus, children }: PopoverProps) {
  const panel = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Placement | null>(null);
  const restore = useRef(restoreFocus);
  const close = useRef(onClose);
  const takeFocusBack = useRef(true);
  useLayoutEffect(() => {
    restore.current = restoreFocus;
    close.current = onClose;
  });

  // Escape closes it wherever focus is in the frame (a field that just lost focus included).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const measure = () => {
      const size = { width: el.offsetWidth, height: el.scrollHeight };
      setPlace(placePopover(anchor, size, { width: window.innerWidth, height: window.innerHeight }, align));
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const child of Array.from(el.children)) observer.observe(child);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [anchor, align]);

  // The frame losing the focus to another frame, another app or the editor closes it — those
  // clicks never reach this frame's scrim — and the focus stays where the user sent it.
  useEffect(() => {
    const onBlur = () => {
      takeFocusBack.current = false;
      close.current();
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, []);

  // Give focus back when it closes.
  useLayoutEffect(
    () => () => {
      if (takeFocusBack.current) restore.current();
    },
    [],
  );

  // Focus the first field once it is placed (a hidden panel can't take focus).
  const placed = place !== null;
  useLayoutEffect(() => {
    if (!placed) return;
    const first = panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
  }, [placed]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <div
        className="popover-scrim"
        data-testid={`${testId}-scrim`}
        onMouseDown={(e) => {
          e.preventDefault();
          onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={panel}
        role={role}
        aria-label={label}
        data-testid={testId}
        data-side={place?.side}
        className={`popover${className ? ` ${className}` : ""}`}
        style={place ? { left: place.left, top: place.top, maxHeight: place.maxHeight, maxWidth: place.maxWidth } : { visibility: "hidden", left: 0, top: 0 }}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </>
  );
}
