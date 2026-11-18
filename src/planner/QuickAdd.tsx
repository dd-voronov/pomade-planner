import type { HostClient } from "pomade-kit/sdk";

import { EmptyState } from "../core/EmptyState";
import { errorText, useActiveProject } from "../core/host";
import { parseQuickAddRoute, ROUTES } from "../core/views";
import { useClock } from "./clock";
import { AddForm } from "./AddForm";
import { usePlannerSettings } from "./usePlannerData";
import { useProjectList } from "./useProjects";

/**
 * The quick-add overlay (DESIGN §3.7): the frame Pomade opens over the active tab on the
 * Pomade-wide shortcut, whether or not the Planner was ever opened, and on the Planner panel's
 * **+** and Add button (`overlay.open`, the view's pre-fills in the route). Adding closes it
 * (⇧⌘↵ also opens the new file); Escape (forwarded to Pomade) closes it. Focus then returns where
 * it was.
 */
export function QuickAdd({ host, route }: { host: HostClient; route: string }) {
  const clock = useClock(host);
  const { state } = usePlannerSettings(host);
  const projects = useProjectList(host);
  const active = useActiveProject(host);
  const close = () => host.overlay.close().catch(() => undefined);
  const prefill = parseQuickAddRoute(route) ?? { doOn: "", kind: "task" as const };

  if (state.status === "loading" || clock === null) return <main className="quick-add" data-testid="view-quick-add" aria-busy="true" />;
  if (state.status === "error") {
    return (
      <EmptyState testId="view-quick-add" title="Can't read the Planner's settings">
        {state.message}
      </EmptyState>
    );
  }
  const { tasksRoot, dayBoundary, projectFolders, dailyNoteTemplate } = state.parsed.settings;
  if (tasksRoot === null) {
    return (
      <EmptyState
        testId="view-quick-add"
        title="Choose a tasks folder first"
        action={
          <button
            type="button"
            className="btn btn--primary"
            data-testid="quick-add-open-planner"
            autoFocus
            onClick={() => void host.tabs.openApp({ route: ROUTES.planner }).then(close, close)}
          >
            Open the Planner
          </button>
        }
      >
        <span data-testid="quick-add-no-root">The Planner asks where your tasks live the first time you open it.</span>
      </EmptyState>
    );
  }
  return (
    <main className="quick-add" data-testid="view-quick-add">
      <AddForm
        host={host}
        clock={clock}
        root={tasksRoot}
        boundary={dayBoundary}
        projects={projects}
        folders={projectFolders}
        template={dailyNoteTemplate}
        placement="overlay"
        initialProject={active.kind === "project" ? { id: active.id, name: active.name } : null}
        initialKind={prefill.kind}
        initialDoOn={prefill.doOn}
        testId="quick-add-form"
        onAdded={async ({ path }, open) => {
          if (open) await host.tabs.openFile({ path }).catch((e: unknown) => console.error(`Couldn't open ${path}: ${errorText(e)}`));
          await close();
        }}
      />
    </main>
  );
}
