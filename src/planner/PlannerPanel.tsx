import type { HostClient } from "pomade-kit/sdk";

import { Planner } from "./Planner";

/** The Planner icon's side panel: the Planner, compact. */
export function PlannerPanel({ host }: { host: HostClient }) {
  return <Planner host={host} surface="panel" />;
}
