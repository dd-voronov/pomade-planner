import { describe, expect, it } from "vitest";

import { GAP, MARGIN, TIP_GAP, placePopover, placeTip } from "./place";

const FRAME = { width: 1200, height: 800 };
const SIZE = { width: 320, height: 300 };
const at = (left: number, top: number, width = 24, height = 24) => ({ left, top, width, height });

describe("placePopover", () => {
  it("below the anchor, left edges lined up, when it fits", () => {
    expect(placePopover(at(100, 50), SIZE, FRAME)).toEqual({ left: 100, top: 50 + 24 + GAP, maxHeight: 800 - MARGIN - (74 + GAP), maxWidth: 1200 - 2 * MARGIN, side: "below" });
  });

  it("right edges lined up with align end", () => {
    expect(placePopover(at(500, 50), SIZE, FRAME, "end").left).toBe(500 + 24 - 320);
  });

  it("near the right edge it shifts left to stay inside", () => {
    expect(placePopover(at(1180, 50), SIZE, FRAME).left).toBe(1200 - MARGIN - 320);
  });

  it("near the left edge it shifts right to stay inside", () => {
    expect(placePopover(at(2, 50), SIZE, FRAME).left).toBe(MARGIN);
    expect(placePopover(at(100, 50), SIZE, FRAME, "end").left).toBe(MARGIN);
  });

  it("above the anchor when there is no room below", () => {
    const p = placePopover(at(100, 700), SIZE, FRAME);
    expect(p.side).toBe("above");
    expect(p.top).toBe(700 - GAP - 300);
    expect(p.top + 300).toBeLessThanOrEqual(700 - GAP);
  });

  it("on the roomier side, height capped, when it fits neither", () => {
    const short = { width: 1200, height: 400 };
    const low = placePopover(at(100, 100), SIZE, short);
    expect([low.side, low.maxHeight]).toEqual(["below", 400 - MARGIN - 128]);
    const high = placePopover(at(100, 300), SIZE, short);
    expect([high.side, high.maxHeight, high.top]).toEqual(["above", 300 - GAP - MARGIN, MARGIN]);
  });

  it("a frame narrower than the popover caps its width and keeps the margin", () => {
    const p = placePopover(at(100, 50), SIZE, { width: 240, height: 800 });
    expect([p.left, p.maxWidth]).toEqual([MARGIN, 240 - 2 * MARGIN]);
  });

  it("a point anchor (a right-click) works like a rect", () => {
    const p = placePopover(at(600, 400, 0, 0), SIZE, FRAME);
    expect([p.left, p.top, p.side]).toEqual([600, 400 + GAP, "below"]);
  });

  it("every placement stays inside the frame", () => {
    for (const frame of [FRAME, { width: 360, height: 320 }, { width: 240, height: 600 }]) {
      for (let x = 0; x <= frame.width; x += 40) {
        for (let y = 0; y <= frame.height; y += 40) {
          const p = placePopover(at(x, y), SIZE, frame);
          const width = Math.min(SIZE.width, p.maxWidth);
          const height = Math.min(SIZE.height, p.maxHeight);
          expect(p.left).toBeGreaterThanOrEqual(MARGIN);
          expect(p.left + width).toBeLessThanOrEqual(frame.width - MARGIN);
          expect(p.top).toBeGreaterThanOrEqual(MARGIN);
          expect(p.top + height).toBeLessThanOrEqual(frame.height - MARGIN);
        }
      }
    }
  });
});

describe("placeTip", () => {
  const TIP = { width: 80, height: 28 };

  it("centred under the control when it fits", () => {
    expect(placeTip(at(100, 50), TIP, FRAME)).toEqual({ left: 100 + 12 - 40, top: 50 + 24 + TIP_GAP, side: "below" });
  });

  it("slides off the left and the right edge, keeping the margin", () => {
    expect(placeTip(at(4, 50), TIP, FRAME).left).toBe(MARGIN);
    expect(placeTip(at(1172, 50), TIP, FRAME).left).toBe(1200 - MARGIN - 80);
  });

  it("the 160px panel: a tip as wide as the frame allows sits margin to margin", () => {
    const panel = { width: 160, height: 600 };
    expect(placeTip(at(132, 6), { width: 144, height: 44 }, panel)).toEqual({ left: MARGIN, top: 6 + 24 + TIP_GAP, side: "below" });
  });

  it("above the control when there is no room below", () => {
    expect(placeTip(at(100, 770), TIP, FRAME)).toEqual({ left: 72, top: 770 - TIP_GAP - 28, side: "above" });
  });

  it("the last line that still fits below stays below", () => {
    const top = 800 - MARGIN - 28 - TIP_GAP - 24;
    expect(placeTip(at(100, top), TIP, FRAME).side).toBe("below");
    expect(placeTip(at(100, top + 1), TIP, FRAME).side).toBe("above");
  });

  it("fitting on neither side, it takes the side with more room and stays inside the frame", () => {
    const low = { width: 420, height: 60 };
    expect(placeTip(at(100, 4, 24, 24), TIP, low)).toEqual({ left: 72, top: 60 - MARGIN - 28, side: "below" });
    expect(placeTip(at(100, 32, 24, 24), TIP, low)).toEqual({ left: 72, top: MARGIN, side: "above" });
  });

  it("whole pixels for a control at a fractional position", () => {
    const placed = placeTip({ left: 100.5, top: 50.25, width: 23, height: 24 }, { width: 81, height: 28 }, FRAME);
    expect(Number.isInteger(placed.left) && Number.isInteger(placed.top)).toBe(true);
  });

  it("a tip of a fractional size keeps the far margins", () => {
    const size = { width: 80.4, height: 30.2 };
    const right = placeTip(at(1172, 50), size, FRAME);
    expect(right.left + size.width).toBeLessThanOrEqual(1200 - MARGIN);
    const low = placeTip(at(100, 4, 24, 24), size, { width: 420, height: 60 });
    expect(low.top + size.height).toBeLessThanOrEqual(60 - MARGIN);
  });
});
