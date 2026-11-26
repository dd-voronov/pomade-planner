import { useCallback, useState } from "react";
import type { HostClient } from "pomade-kit/sdk";
import type { ProjectRef } from "pomade-kit/protocol";

import { EmptyState } from "../core/EmptyState";
import { errorText, useActiveProject } from "../core/host";
import { Board } from "./Board";
import { BoardGlyph } from "./BoardGlyph";
import { BoardSettingsPage } from "./BoardSettingsPage";
import { ProjectChooser } from "./ProjectChooser";
import { DEFAULT_AREAS } from "./model/areas";
import { PROJECT_KEYS } from "./model/settings";
import { useBacklog, useProjectBoard } from "./useBoardData";
import { chooseBacklogFolder } from "./write";

/**
 * The Board tab: the active project's board; at Workspace, the project chooser; and, from either,
 * the settings page — the same whichever project is active, until **← Board** leaves it.
 */
export function BoardTab({ host }: { host: HostClient }) {
  const project = useActiveProject(host);
  const [showSettings, setShowSettings] = useState(false);
  const openSettings = useCallback(() => setShowSettings(true), []);
  if (showSettings) return <BoardSettingsPage host={host} onBack={() => setShowSettings(false)} />;
  if (project.kind === "workspace") return <ProjectChooser host={host} areas={DEFAULT_AREAS} onShowSettings={openSettings} />;
  return <ProjectBoard key={project.id} host={host} project={project} onShowSettings={openSettings} />;
}

function ProjectBoard({ host, project, onShowSettings }: { host: HostClient; project: ProjectRef; onShowSettings: () => void }) {
  const { state, reload } = useProjectBoard(host, project);
  const location = state.status === "ready" ? state.location : null;
  const { state: backlog, reload: reloadBacklog } = useBacklog(host, location?.path ?? null);
  const [actionError, setActionError] = useState<string | null>(null);

  const chooseFolder = useCallback(async () => {
    setActionError(null);
    const choice = await chooseBacklogFolder(host, project);
    if (choice.kind === "refused") setActionError(choice.message);
    if (choice.kind === "chosen") await reload();
  }, [host, project, reload]);

  const moveDone = state.status === "ready" ? state.settings.moveDoneToDoneFolder : true;
  const toggleMoveDone = useCallback(async () => {
    setActionError(null);
    try {
      await host.project.setSettings({ projectId: project.id, settings: { [PROJECT_KEYS.moveDone]: !moveDone } });
      await reload();
    } catch (error) {
      setActionError(`Couldn't change the setting: ${errorText(error)}`);
    }
  }, [host, project.id, moveDone, reload]);

  if (state.status === "error") {
    return (
      <EmptyState testId="board-error" glyph={<BoardGlyph size={32} />} title="Can't load the board">
        {state.message}
      </EmptyState>
    );
  }
  if (state.status === "loading" || backlog.status === "loading") {
    return <main className="board board--loading" data-testid="board-loading" aria-busy="true" />;
  }

  const chooseButton = (
    <button type="button" className="btn btn--primary" data-testid="choose-backlog" onClick={() => void chooseFolder()}>
      Choose backlog folder
    </button>
  );

  if (backlog.status === "missing" || backlog.status === "error") {
    const { relative, source } = state.location;
    const where = relative === "" ? "the project folder" : `${relative}/`;
    const text =
      backlog.status === "error"
        ? `Can't read ${where}: ${backlog.message}`
        : source === "chosen"
          ? `The backlog folder chosen for ${project.name}, ${where}, isn't there any more.`
          : `${project.name} has no ${where} folder.`;
    return (
      <EmptyState
        testId="choose-backlog-state"
        glyph={<BoardGlyph size={32} />}
        title="No backlog found"
        action={chooseButton}
        error={actionError ?? (state.synced.problem === null ? null : `${state.synced.problem} — using the defaults.`)}
      >
        {text} Choose the folder that holds its tickets.
      </EmptyState>
    );
  }

  return (
    <>
      <Board
        host={host}
        project={project}
        areas={DEFAULT_AREAS}
        location={state.location}
        settings={state.settings}
        settingsProblem={state.synced.problem}
        backlog={backlog.backlog}
        nextIds={backlog.nextIds}
        reload={reloadBacklog}
        onToggleMoveDone={() => void toggleMoveDone()}
        onChangeFolder={() => void chooseFolder()}
        onShowSettings={onShowSettings}
      />
      {actionError !== null ? (
        <div className="toast" role="alert" data-testid="board-action-error">
          <span>{actionError}</span>
          <button type="button" className="icon-btn toast__close" aria-label="Dismiss" data-tip="Dismiss" onClick={() => setActionError(null)}>
            ×
          </button>
        </div>
      ) : null}
    </>
  );
}
