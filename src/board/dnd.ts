// Drag-and-drop wiring for dnd-kit: which column a drag is over, and keyboard moves that jump
// a whole column at a time (Space picks a card up, ← → move it, Space or Enter drops, Esc cancels).

import { closestCenter, pointerWithin, type CollisionDetection, type KeyboardCoordinateGetter, type KeyboardCodes } from "@dnd-kit/core";

/** Pointer drags: the column under the pointer. Keyboard drags (no pointer): the column nearest the card's centre. */
export const columnCollision: CollisionDetection = (args) => {
  if (args.pointerCoordinates) return pointerWithin(args);
  return closestCenter(args);
};

/** Enter opens the focused card; only Space picks it up. */
export const KEYBOARD_CODES: KeyboardCodes = {
  start: ["Space"],
  cancel: ["Escape"],
  end: ["Space", "Enter"],
};

/** ← and → centre the dragged card on the previous or next column. */
export const columnKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const { collisionRect, droppableRects, droppableContainers } = context;
  if (!collisionRect) return undefined;
  const direction = event.code === "ArrowRight" ? 1 : event.code === "ArrowLeft" ? -1 : 0;
  if (direction === 0) return undefined;
  event.preventDefault();
  const centre = collisionRect.left + collisionRect.width / 2;
  let best: { left: number; width: number } | null = null;
  for (const container of droppableContainers.getEnabled()) {
    const rect = droppableRects.get(container.id);
    if (!rect) continue;
    const c = rect.left + rect.width / 2;
    const ahead = direction > 0 ? c > centre + 1 : c < centre - 1;
    if (!ahead) continue;
    if (best === null || Math.abs(c - centre) < Math.abs(best.left + best.width / 2 - centre)) best = rect;
  }
  if (best === null) return undefined;
  return { x: best.left + best.width / 2 - collisionRect.width / 2, y: collisionRect.top };
};
