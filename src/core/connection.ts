// The frame's link to Pomade: one handshake per page load (pomade-kit `connect()`), then the route
// the host shows the frame at.

import { useEffect, useState } from "react";
import type { ConnectResult, HostClient } from "pomade-kit/sdk";
import type { RejectReason } from "pomade-kit/protocol";

export type Connection =
  | { status: "connecting" }
  | { status: "connected"; host: HostClient }
  | { status: "no-host" }
  | { status: "rejected"; reason: RejectReason };

/**
 * Follows the page's one handshake. `pending` is `connect()`'s promise, started once per page load
 * (a frame that says `hello` twice starts two handshakes); it never rejects and answers `no-host`
 * after 1500 ms without a host.
 */
export function useConnection(pending: Promise<ConnectResult>): Connection {
  const [connection, setConnection] = useState<Connection>({ status: "connecting" });
  useEffect(() => {
    let live = true;
    void pending.then((result) => {
      if (!live) return;
      if (result.status === "connected") setConnection({ status: "connected", host: result.host });
      else if (result.status === "rejected") setConnection({ status: "rejected", reason: result.reason });
      else setConnection({ status: "no-host" });
    });
    return () => {
      live = false;
    };
  }, [pending]);
  return connection;
}

/** The route the frame renders: `welcome.route`, then every `route.changed` Pomade sends. */
export function useRoute(host: HostClient): string {
  const [route, setRoute] = useState(host.welcome.route);
  useEffect(() => host.onRouteChange(setRoute), [host]);
  return route;
}
