import { useEffect, type ReactNode } from "react";
import type { ConnectResult, HostClient } from "pomade-kit/sdk";
import type { RejectReason, Surface } from "pomade-kit/protocol";

import { EmptyState } from "./EmptyState";
import { useConnection, useRoute } from "./connection";

/** What an app gives the shell: its name, and its views. */
export interface AppShell {
  /** The app's name as Pomade shows it: "Planner", "Board". */
  name: string;
  /** The view for the frame's surface (`host.welcome.surface`) at `route`; `null` when the app has none there. */
  view(host: HostClient, route: string): ReactNode | null;
}

/** The page background follows the surface it lives on: `data-surface` on `<html>` (app.css). */
function useSurface(surface: Surface | "standalone"): void {
  useEffect(() => {
    document.documentElement.dataset.surface = surface;
  }, [surface]);
}

function rejected(reason: RejectReason, name: string): string {
  switch (reason) {
    case "needs-newer-pomade":
      return `This version of the ${name} needs a newer Pomade. Update Pomade, then reopen it.`;
    case "app-too-old":
      return `This Pomade needs a newer ${name}. Reinstall the app from its repository.`;
    case "unauthorized":
      return `Pomade refused the ${name}'s connection.`;
  }
}

function Hosted({ host, shell }: { host: HostClient; shell: AppShell }) {
  const route = useRoute(host);
  return (
    shell.view(host, route) ?? (
      <EmptyState testId="view-unknown" title="Nothing here">
        The {shell.name} has no view for <code data-testid="unknown-route">{route || "(default)"}</code> on this surface.
      </EmptyState>
    )
  );
}

/** An app's page: waits for the handshake, then renders the view of `shell` its surface and route ask for. */
export function App({ pending, shell }: { pending: Promise<ConnectResult>; shell: AppShell }) {
  const connection = useConnection(pending);
  useSurface(connection.status === "connected" ? connection.host.welcome.surface : "standalone");
  switch (connection.status) {
    case "connecting":
      return <main className="connecting" data-testid="connecting" aria-busy="true" />;
    case "connected":
      return <Hosted host={connection.host} shell={shell} />;
    case "no-host":
      return (
        <EmptyState testId="no-host" title="No Pomade host">
          The {shell.name} runs inside Pomade. Open it from the {shell.name} icon in Pomade&apos;s left strip.
        </EmptyState>
      );
    case "rejected":
      return (
        <EmptyState testId="rejected" title="Can't connect to Pomade">
          {rejected(connection.reason, shell.name)}
        </EmptyState>
      );
  }
}
