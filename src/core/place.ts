// Where a popover goes (the Board's create form, card popover and triage picker; the Planner's
// quick add): next to its anchor, below it when it fits, else above, else on the side with more
// room with its height capped — and always inside the frame, so it never clips at its edges or in
// a narrow tab or panel.

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Placement {
  left: number;
  top: number;
  /** The popover's height may not exceed this (it scrolls inside). */
  maxHeight: number;
  /** Its width may not exceed this (a frame narrower than the popover). */
  maxWidth: number;
  side: "below" | "above";
}

/** Gap between anchor and popover; margin kept to the frame's edges. */
export const GAP = 4;
export const MARGIN = 8;

/**
 * Place a `size` popover at `anchor` inside a `frame`-sized viewport. `align: "start"` lines its
 * left edge up with the anchor's, `"end"` its right edge with the anchor's right edge.
 */
export function placePopover(anchor: Rect, size: Size, frame: Size, align: "start" | "end" = "start"): Placement {
  const maxWidth = Math.max(0, frame.width - 2 * MARGIN);
  const width = Math.min(size.width, maxWidth);
  const wanted = align === "start" ? anchor.left : anchor.left + anchor.width - width;
  const left = Math.min(Math.max(wanted, MARGIN), Math.max(MARGIN, frame.width - MARGIN - width));

  const below = frame.height - MARGIN - (anchor.top + anchor.height + GAP);
  const above = anchor.top - GAP - MARGIN;
  const side: Placement["side"] = size.height <= below || below >= above ? "below" : "above";
  const room = Math.max(0, side === "below" ? below : above);
  const height = Math.min(size.height, room);
  const top = side === "below" ? anchor.top + anchor.height + GAP : anchor.top - GAP - height;
  return { left, top: Math.max(MARGIN, Math.min(top, frame.height - MARGIN - height)), maxHeight: room, maxWidth, side };
}

/** Gap between a control and its tooltip. */
export const TIP_GAP = 6;

export interface TipPlacement {
  left: number;
  top: number;
  side: "below" | "above";
}

/**
 * Place a `size` tooltip at `anchor` inside a `frame`-sized viewport: centred under the control,
 * slid off the left and right edges, above the control when it does not fit below — and when it
 * fits on neither side, on the side with more room, held inside the frame. Whole pixels, rounded
 * down, so a tip of a fractional size never crosses the far margin.
 */
export function placeTip(anchor: Rect, size: Size, frame: Size): TipPlacement {
  const centred = anchor.left + anchor.width / 2 - size.width / 2;
  const left = Math.floor(Math.max(MARGIN, Math.min(centred, frame.width - MARGIN - size.width)));
  const below = anchor.top + anchor.height + TIP_GAP;
  const above = anchor.top - TIP_GAP - size.height;
  const fitsBelow = below + size.height <= frame.height - MARGIN;
  const fitsAbove = above >= MARGIN;
  const side: TipPlacement["side"] = fitsBelow || (!fitsAbove && frame.height - below >= anchor.top) ? "below" : "above";
  const top = side === "below" ? below : above;
  return { left, top: Math.floor(Math.max(MARGIN, Math.min(top, frame.height - MARGIN - size.height))), side };
}
