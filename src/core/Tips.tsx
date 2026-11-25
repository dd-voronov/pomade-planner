import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { placeTip, type TipPlacement } from "./place";

/** How long the pointer rests on a control before its tip shows; keyboard focus shows it at once. */
export const TIP_DELAY_MS = 350;

/** The wait of a control marked `data-tip-slow` (a hint that is only there for who lingers, like a row's click and ⌘-click). */
export const SLOW_TIP_DELAY_MS = 1000;

interface Tip {
  el: HTMLElement;
  text: string;
}

const isSlow = (el: HTMLElement): boolean => el.hasAttribute("data-tip-slow");

/**
 * The control under `node` that has a tip to show now: the nearest `data-tip` element, unless the
 * name it marks with `data-tip-label` is on screen (a view tab that still shows its word).
 */
function tipOf(node: EventTarget | null): Tip | null {
  const el = node instanceof Element ? node.closest<HTMLElement>("[data-tip]") : null;
  const text = el?.dataset.tip ?? "";
  if (el === null || text === "" || !el.isConnected) return null;
  const label = el.querySelector("[data-tip-label]");
  if (label !== null && label.getBoundingClientRect().width > 1) return null;
  return { el, text };
}

/**
 * The tooltips of the frame's controls, mounted once beside the app. A control names itself with
 * `data-tip="New task (⌘⇧A)"`; the tip shows after the pointer rests on it — at once when a tip is
 * already showing — and on keyboard focus, placed inside the frame (`placeTip`) and following its
 * control through a scroll. A press, Escape, the pointer or the focus leaving, and the control
 * going away or scrolling out of the frame all hide it. A control marked `data-tip-slow` always
 * waits `SLOW_TIP_DELAY_MS`, on hover and on focus alike. While it shows, a tip that says more than
 * the control's accessible name is the description of the control it names (a label's input).
 */
export function Tips() {
  const id = useId();
  const [tip, setTip] = useState<Tip | null>(null);
  const [place, setPlace] = useState<TipPlacement | null>(null);
  /** Bumped when the page moves under a showing tip, to place it again. */
  const [moved, setMoved] = useState(0);
  const bubble = useRef<HTMLDivElement>(null);
  const shown = useRef<Tip | null>(null);
  useLayoutEffect(() => {
    shown.current = tip;
  }, [tip]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    /** The control the pointer is on, and whether a press has put its tip away until the pointer comes back. */
    let hovered: HTMLElement | null = null;
    let pressed = false;
    const show = (next: Tip | null) => {
      clearTimeout(timer);
      setTip((current) => (current?.el === next?.el && current?.text === next?.text ? current : next));
    };
    const onOver = (e: MouseEvent) => {
      const next = tipOf(e.target);
      if (next?.el === hovered) return;
      hovered = next?.el ?? null;
      pressed = false;
      if (next === null || (shown.current !== null && !isSlow(next.el))) show(next);
      else {
        show(null);
        timer = setTimeout(() => show(tipOf(next.el)), isSlow(next.el) ? SLOW_TIP_DELAY_MS : TIP_DELAY_MS);
      }
    };
    const onLeave = () => {
      hovered = null;
      show(null);
    };
    const onPress = () => {
      pressed = true;
      show(null);
    };
    const onFocus = (e: FocusEvent) => {
      const next = tipOf(e.target);
      if (pressed || next === null || !(e.target instanceof Element) || !e.target.matches(":focus-visible")) return;
      if (!isSlow(next.el)) show(next);
      else {
        show(null);
        timer = setTimeout(() => show(tipOf(next.el)), SLOW_TIP_DELAY_MS);
      }
    };
    const onBlur = () => show(hovered !== null && !pressed ? tipOf(hovered) : null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onPress();
      else pressed = false;
    };
    const onMove = () => setMoved((n) => n + 1);
    document.addEventListener("mouseover", onOver);
    document.documentElement.addEventListener("mouseleave", onLeave);
    document.addEventListener("mousedown", onPress, true);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    window.addEventListener("blur", onLeave);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mouseover", onOver);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mousedown", onPress, true);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("blur", onLeave);
    };
  }, []);

  // The control can leave the page under its tip (a pinned row moving up), or stop being what the tip says.
  useEffect(() => {
    if (tip === null) return;
    const observer = new MutationObserver(() => {
      if (!tip.el.isConnected || tip.el.dataset.tip !== tip.text) setTip(null);
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-tip"] });
    return () => observer.disconnect();
  }, [tip]);

  useLayoutEffect(() => {
    const el = bubble.current;
    if (tip === null || el === null) {
      setPlace(null);
      return;
    }
    const anchor = tip.el.getBoundingClientRect();
    const frame = { width: window.innerWidth, height: window.innerHeight };
    if (anchor.bottom <= 0 || anchor.top >= frame.height || anchor.right <= 0 || anchor.left >= frame.width) {
      setTip(null);
      return;
    }
    const size = el.getBoundingClientRect();
    setPlace(placeTip(anchor, { width: size.width, height: size.height }, frame));
  }, [tip, moved]);

  useEffect(() => {
    if (tip === null) return;
    const named = tip.el instanceof HTMLLabelElement ? (tip.el.control ?? tip.el) : tip.el;
    if (tip.text === named.getAttribute("aria-label") || named.hasAttribute("aria-describedby")) return;
    named.setAttribute("aria-describedby", id);
    return () => named.removeAttribute("aria-describedby");
  }, [tip, id]);

  if (tip === null) return null;
  return (
    <div ref={bubble} id={id} className="tip" role="tooltip" data-testid="tip" data-side={place?.side} style={place ? { left: place.left, top: place.top } : { left: 0, top: 0, visibility: "hidden" }}>
      {tip.text}
    </div>
  );
}
