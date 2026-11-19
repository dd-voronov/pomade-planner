// Quick add's overlay frame sized to its form ([[quick-add]] "The overlay", HOST-API §4 `overlay`): the form keeps
// its own height and asks Pomade for a frame that tall as it grows and shrinks. Pomade clamps the
// height (120 px to 60% of the pane area); a form taller than the cap fills the frame instead, and
// what it holds back scrolls inside it — Details first.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { HostClient } from "pomade-kit/sdk";

/** The height `form` needs: its own, plus what its scrolling parts hold back (`[data-fit-scroll]`). */
export function neededHeight(form: HTMLElement): number {
  let hidden = 0;
  for (const el of form.querySelectorAll<HTMLElement>("[data-fit-scroll]")) hidden += el.scrollHeight - el.clientHeight;
  return Math.ceil(form.getBoundingClientRect().height) + hidden;
}

/**
 * Keep the overlay frame as tall as `form` needs, measured after every render and whenever the
 * form's box changes. `hold`: keep the frame as it is (the project picker stands in the form's
 * place). `host` null: not in an overlay, nothing to fit. Returns whether the form is capped —
 * Pomade gave the frame less than it asked for, so the form fills the frame rather than its
 * content's height.
 */
export function useOverlayFit(host: HostClient | null, form: RefObject<HTMLElement | null>, hold: boolean): boolean {
  const [capped, setCapped] = useState(false);
  /** The height last asked for; the frame's own until the first ask. */
  const asked = useRef(window.innerHeight);
  /** Asks not answered yet: the frame may still change. */
  const pending = useRef(0);

  /** With every ask answered and drawn: capped when the frame stayed shorter than the ask. */
  const settle = useCallback(() => {
    if (pending.current === 0) setCapped(asked.current > window.innerHeight);
  }, []);

  const fit = useCallback(() => {
    const el = form.current;
    if (host === null || el === null || hold) return;
    const need = neededHeight(el);
    if (need <= window.innerHeight) setCapped(false);
    if (need === asked.current) return;
    asked.current = need;
    pending.current += 1;
    host.overlay
      .resize({ height: need })
      .catch((e: unknown) => console.error(`Couldn't size quick add's overlay: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => {
        pending.current -= 1;
        // The frame takes its new height once Pomade has drawn it.
        requestAnimationFrame(() => requestAnimationFrame(settle));
      });
  }, [host, form, hold, settle]);

  useLayoutEffect(fit);
  useEffect(() => {
    const el = form.current;
    if (host === null || el === null) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(el);
    window.addEventListener("resize", settle);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", settle);
    };
  }, [host, form, fit, settle]);
  return capped;
}
