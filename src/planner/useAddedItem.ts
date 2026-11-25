import { useEffect, useState } from "react";
import type { HostClient } from "pomade-kit/sdk";
import type { JsonValue } from "pomade-kit/protocol";

import { addedRoute, parseAddedRoute, ROUTES } from "../core/views";

/** An item added from the overlay that a Planner view shows: its path, the context it was added in, and what tells one ask from the next. */
export interface AddedAsk {
  path: string;
  /** The active project's id when it was added (`__workspace__` at Workspace): only a view of that context follows it; `null`: the view's own. */
  contextId: string | null;
  n: number;
}

/**
 * Tell the app's other frames that the overlay added the item at `path` in `contextId`: the tabs
 * hear the Planner's own event `item.added` (`{ path, contextId }`, declared in the manifest); the
 * side panel comes forward on the Planner at the item (`addedRoute`). Keyboard focus stays
 * where it is (HOST-API §4 `panel`). Neither failing stops the add.
 */
export async function announceAdded(host: HostClient, path: string, contextId: string): Promise<void> {
  const payload: JsonValue = { path, contextId };
  await Promise.all([
    host.events.publish("item.added", payload).catch((e: unknown) => console.error("Couldn't tell the Planner tabs about the new item:", e)),
    host.panel.show({ route: addedRoute(path) }).catch((e: unknown) => console.error("Couldn't bring the Planner panel forward:", e)),
  ]);
}

function parsePayload(value: JsonValue): { path: string; contextId: string } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { path, contextId } = value;
  return typeof path === "string" && path !== "" && typeof contextId === "string" ? { path, contextId } : null;
}

/** A Planner tab: the items the overlay adds, as asks (`undefined` until the first). */
export function useAddedEvents(host: HostClient): AddedAsk | undefined {
  const [ask, setAsk] = useState<AddedAsk>();
  useEffect(() => {
    const sub = host.events
      .subscribe("pomade-planner:item.added", (value) => {
        const added = parsePayload(value);
        if (added !== null) setAsk((a) => ({ ...added, n: (a?.n ?? 0) + 1 }));
      })
      .catch(() => null);
    return () => void sub.then((s) => s?.close());
  }, [host]);
  return ask;
}

/**
 * The Planner panel: the item its added route names, as an ask (the panel shows the context it was
 * added in: both are the active project). The route is left for `planner` as soon as it is taken —
 * Pomade sends no change for the route it last sent, so the next add, even of the same path,
 * reaches the panel again.
 */
export function useAddedRoute(host: HostClient, route: string): AddedAsk | undefined {
  const [ask, setAsk] = useState<AddedAsk>();
  const path = parseAddedRoute(route);
  useEffect(() => {
    if (path === null) return;
    setAsk((a) => ({ path, contextId: null, n: (a?.n ?? 0) + 1 }));
    void host.panel.show({ route: ROUTES.planner }).catch(() => undefined);
  }, [host, path]);
  return ask;
}
