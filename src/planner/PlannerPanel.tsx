import type { HostClient } from "pomade-kit/sdk";

import { Planner } from "./Planner";
import { useAddedRoute } from "./useAddedItem";

/** The Planner icon's side panel: the Planner, compact; at an added route, on the item just added from the overlay. */
export function PlannerPanel({ host, route }: { host: HostClient; route: string }) {
  const addedAsk = useAddedRoute(host, route);
  return <Planner host={host} surface="panel" addedAsk={addedAsk} />;
}
