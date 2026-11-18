import { useCallback, useEffect, useMemo, useState } from "react";
import type { HostClient } from "pomade-kit/sdk";

import { EmptyState } from "../core/EmptyState";
import { ROUTES } from "../core/views";
import { BoardGlyph } from "./BoardGlyph";
import { countOpen, type AreaDef } from "./model/areas";
import { needsYou, needsYouCounts, needsYouParts } from "./model/needs-you";
import { useBacklog, useCandidates, type Candidate } from "./useBoardData";

interface RowProps {
  host: HostClient;
  candidate: Candidate;
  areas: readonly AreaDef[];
  onShown: (projectId: string, shown: boolean) => void;
}

/** One project whose backlog resolves, with its open-item count and what needs you there, live; nothing while its backlog is missing. */
function ProjectRow({ host, candidate, areas, onShown }: RowProps) {
  const { project, path } = candidate;
  const { state } = useBacklog(host, path);
  const shown = state.status === "ready";
  useEffect(() => onShown(project.id, shown), [onShown, project.id, shown]);
  if (state.status !== "ready") return null;
  const open = countOpen(areas, state.backlog.tickets);
  const needs = needsYouParts(needsYouCounts([needsYou(state.backlog.tickets)]));
  return (
    <li>
      <button
        type="button"
        className="chooser__row"
        data-testid="chooser-project"
        data-project={project.id}
        onClick={() => void host.tabs.openApp({ route: ROUTES.board, projectId: project.id })}
      >
        <span className="chooser__name">{project.name}</span>
        {project.groupPath.length > 0 ? <span className="chooser__group">{project.groupPath.join(" › ")}</span> : null}
        <span className="chooser__stats">
          <span className="chooser__count" data-testid="chooser-count">
            {open} open
          </span>
          {needs.length > 0 ? (
            <span className="chooser__needs" data-testid="chooser-needs-you">
              {needs.join(" · ")}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

/** The Workspace's Board tab: every project whose backlog resolves; a click opens that project's board. */
export function ProjectChooser({ host, areas }: { host: HostClient; areas: readonly AreaDef[] }) {
  const state = useCandidates(host);
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const onShown = useCallback((id: string, isShown: boolean) => setShown((s) => (s[id] === isShown ? s : { ...s, [id]: isShown })), []);
  const candidates = useMemo(() => (state.status === "ready" ? state.candidates : []), [state]);
  const settled = candidates.every((c) => shown[c.project.id] !== undefined);
  const anyShown = candidates.some((c) => shown[c.project.id] === true);

  if (state.status === "error") {
    return (
      <EmptyState testId="chooser-error" glyph={<BoardGlyph size={32} />} title="Can't list the projects">
        {state.message}
      </EmptyState>
    );
  }

  return (
    <main className="chooser" data-testid="project-chooser" aria-busy={state.status === "loading" || !settled}>
      <div className="chooser__inner">
        <h1 className="chooser__title" data-testid="view-title">
          Choose a project
        </h1>
        <p className="chooser__text">Projects with a backlog. Open one to see its board.</p>
        <ul className="chooser__list" data-testid="chooser-list">
          {candidates.map((c) => (
            <ProjectRow key={c.project.id} host={host} candidate={c} areas={areas} onShown={onShown} />
          ))}
        </ul>
        {state.status === "ready" && settled && !anyShown ? (
          <p className="chooser__empty" data-testid="chooser-empty">
            No project has a backlog yet. Open a project and click the Board icon to choose its backlog folder.
          </p>
        ) : null}
      </div>
    </main>
  );
}
