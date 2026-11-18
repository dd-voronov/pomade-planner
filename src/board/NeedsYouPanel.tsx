import { useMemo } from "react";
import type { HostClient } from "pomade-kit/sdk";
import type { ProjectRef } from "pomade-kit/protocol";

import { EmptyState } from "../core/EmptyState";
import { useActiveProject } from "../core/host";
import { Groups, needsYouGlyph as glyph } from "./NeedsYouGroups";
import { NeedsYouWorkspace } from "./NeedsYouWorkspace";
import { needsYou, needsYouCount } from "./model/needs-you";
import { useBacklog, useProjectBoard } from "./useBoardData";

/** Inside a project: its review tickets and new signals. */
function ProjectNeedsYou({ host, project }: { host: HostClient; project: ProjectRef }) {
  const { state } = useProjectBoard(host, project);
  const { state: backlog } = useBacklog(host, state.status === "ready" ? state.location.path : null);
  const items = useMemo(() => (backlog.status === "ready" ? needsYou(backlog.backlog.tickets) : null), [backlog]);

  let body;
  if (state.status === "error" || backlog.status === "error") {
    body = (
      <EmptyState tag="div" testId="needs-you-error" glyph={glyph} title="Can't read the backlog">
        {state.status === "error" ? state.message : backlog.status === "error" ? backlog.message : null}
      </EmptyState>
    );
  } else if (backlog.status === "missing") {
    body = (
      <EmptyState tag="div" testId="needs-you-no-backlog" glyph={glyph} title="No backlog found">
        {project.name} has no backlog folder yet. Choose one on its Board.
      </EmptyState>
    );
  } else if (items && needsYouCount(items) === 0) {
    body = (
      <EmptyState tag="div" testId="needs-you-empty" glyph={glyph} title="Nothing needs you">
        No tickets in review and no new signals in {project.name}.
      </EmptyState>
    );
  } else if (items) {
    body = <Groups host={host} projectId={project.id} items={items} />;
  }
  return (
    <main className="needs-you" data-testid="view-needs-you-panel" data-project={project.id} aria-busy={body === undefined}>
      {body}
    </main>
  );
}

/** The Board icon's side panel (DESIGN §4.5): what waits on you — for the active project, or the workspace's projects at Workspace. */
export function NeedsYouPanel({ host }: { host: HostClient }) {
  const project = useActiveProject(host);
  if (project.kind === "workspace") return <NeedsYouWorkspace host={host} />;
  return <ProjectNeedsYou key={project.id} host={host} project={project} />;
}
